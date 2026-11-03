---
title: "Импорт медиа: файлы, drop, URL и clipboard"
level: L3
type: module
stack: renderer
parent: ../layers/RENDERER.md
related: [../layers/MAIN_PROCESS.md, ../layers/PRELOAD.md, ../patterns/CACHE_AND_STORAGE.md, ../patterns/TESTING.md, ../../shared/SECURITY.md, ./PROJECT_IO.md, ./TIMELINE.md, ./MODELS_3D.md, ./SUBTITLES.md]
sources: [src/engine/mediaImport.ts, src/engine/reverse.ts, src/App.tsx, electron/main.ts, electron/preload.ts, electron/ffmpeg.ts, shared/paths.ts, scripts/e2e31.mjs, FEATURES.md]
status: draft
updated: 2026-11-03
---

# Импорт медиа: файлы, drop, URL и clipboard

> **Когда читать:** При изменении приёма файлов из ОС/браузера, clipboard, probe или размещения импорта на таймлайне. Родитель: [Renderer](../layers/RENDERER.md).

## Назначение и границы

`mediaImport.ts` — единый renderer-поток приёма абсолютных путей и содержимого drop.
Main получает удалённые/безымянные данные и создаёт локальные файлы; ffprobe анализирует медиа.
Входы: список paths либо `DropPayload { paths, urls, blobs, portalKey }`, optional `{ trackId, at }`.
Выходы: ассеты в bin, TextDoc для SRT/TXT, модели проекта или клипы, размещённые встык.
Возвращаемые `importFiles` ID относятся к media assets, а не ко всем типам импортированных сущностей.
Новый путь загрузки должен переиспользовать поток, а не отдельно создавать клип и забывать ассет.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Читать DataTransfer синхронно внутри события | После await ОС/браузер может очистить текстовые данные переноса | ✅ сначала `dropPayload`, затем async import; ❌ await до getData | `src/engine/mediaImport.ts:83`, `src/App.tsx:142` |
| Сохранять приоритет paths → portal → URLs → blobs | Браузер может передать один объект сразу несколькими способами | ✅ URL выигрывает у blob; ❌ импортировать каждый вариант копией | `src/engine/mediaImport.ts:144` |
| Реиспользовать ассет по точному path | Повторный drop не должен размножать media assets | ✅ lookup перед probe; ❌ каждый раз новый asset ID | `src/engine/mediaImport.ts:51` |
| Разделять модели, тексты и timeline media | 3D — библиотека фрагментов, SRT/TXT — документы, не видео | ✅ маршрутизация по типу; ❌ ffprobe для STL/SRT | `src/engine/mediaImport.ts:37` |
| Располагать пакет через `insertClipsFromAssets` | Нужны один undo, правильные дорожки и AV-пары | ✅ один вызов после probe; ❌ отдельные низкоуровневые вставки | `src/engine/mediaImport.ts:65` |
| Снимать busy в finally и показывать ошибки по файлам | Частичный сбой не должен оставить бесконечное «импортируется» | ✅ продолжить остальные файлы; ❌ молча оборвать весь пакет | `src/engine/mediaImport.ts:18`, `src/engine/mediaImport.ts:56` |
| Использовать separator-tolerant helpers для имён/папок | Проекты и automation передают Windows и POSIX пути | ✅ `baseOf/dirOf`; ❌ имя через `split('/')` | `shared/paths.ts:5`, `src/engine/mediaImport.ts:45` |
| Читать локальные медиа через существующий fileUrl | kadr:// — capability, а не общедоступная схема чтения диска | ✅ preload URL с token и anonymous media; ❌ собирать голый URL вручную | `electron/preload.ts:19`, `electron/preload.ts:76`, `src/engine/player.ts:190` |

## Поток данных

1. Dialog/drop/clipboard получает пути или синхронно извлекает payload.
2. `importDrop` спрашивает portal только при отсутствии paths; URL скачивается main, data URL превращается в blob.
3. Если URL не дал ни одного пути, path-less `File` читается в `Uint8Array` и сохраняется main.
4. `importFilesInner` сначала отправляет 3D-файлы в models; SRT/TXT регистрирует как TextDoc.
5. Остальные пути дедуплицируются и проходят `probeMedia`; asset получает renderer ID.
6. Если передан `place`, успешные media assets размещаются подряд от `at`; без place остаются в bin.

`dropPayload` понимает Files, uri-list, x-moz-url, DownloadURL, text/plain fallback и portal key.
`dragHasMedia` определяет допустимость drag отдельно; text/plain сам по себе в список его типов не входит.
Clipboard вызывается глобальным shortcut, когда внутри редактора нечего вставлять: `src/App.tsx:192`.
Main отдаёт copied files раньше изображения; изображение сохраняет как PNG: `electron/main.ts:708`.

## Хранение и платформенные границы

- Локальные media paths не копируются автоматически; `.kadr` ссылается на них.
- URL и blobs становятся файлами в `userData/imported`; это referenced media, не безопасно удаляемый proxy-cache.
- URL-имя получает SHA1 от URL, blob/clipboard — от содержимого: `electron/main.ts:669`, `electron/main.ts:748`.
- Даже URL cache-hit сначала выполняет `net.fetch` и проверку HTTP-ответа: `electron/main.ts:670`.
- XDG FileTransfer — Linux-путь через `gdbus`, key валидируется, timeout 5 s: `electron/main.ts:687`.
- DBus normalization — платформенный startup-код, не обещание работы portal под Windows: `electron/main.ts:55`.
- `dropPayload` и clipboard пока декодируют file URI через `new URL(...).pathname`; это не доказательство корректной нормализации drive/UNC.

## Ошибки и отмена

- `probeMedia` failure логируется, пакет продолжает работу с другими файлами: `src/engine/mediaImport.ts:61`.
- Portal/URL/blob failure имеет отдельную запись в журнале; пустой payload даёт warning: `src/engine/mediaImport.ts:184`.
- HTTP download разрешает только http(s), отбрасывает non-OK, пустые и больше 512 MB ответы: `electron/main.ts:662`.
- Размер remote проверяется после `arrayBuffer`, поэтому лимит не является streaming memory guard.
- Blob отвергается при пустом содержимом или размере >512 MB: `electron/main.ts:743`.
- Публичного cancel для import-пакета в `importFiles/importDrop` нет; закрытие dialog до выбора не начинает импорт.
- Forensics: последние 20 drop в `window.__dragLog`, persist в `drop-log.jsonl`: `src/engine/mediaImport.ts:196`, `electron/main.ts:735`.

## Реверс связанного медиа

`reverseClip` — отдельный source-materialization flow: `src/engine/reverse.ts:34`.

- **Правило:** linked AV-группу переворачивать по объединённому используемому диапазону источника, `playedSpan = duration * speed`, не по timeline duration. **Почему:** скорость/обрезка меняют source span; рассинхронизация пары недопустима. ✅ общий диапазон и один history step; ❌ независимый reverse каждого twin. Эталон: `src/engine/reverse.ts:32`, `src/engine/reverse.ts:60`.
- **Правило:** повторное переключение reversed-asset при наличии оригинала возвращает original asset/inPoint без нового рендера. **Почему:** provenance `reverseOf` сохраняет диапазон. ✅ retarget; ❌ считать reversed-файл disposable proxy. Эталон: `src/engine/reverse.ts:44`.
- Progress фильтруется по path/start/duration; busy не позволяет очередь повторного клика; disposer вызывается в finally. После await проверяется наличие исходного clip, но это не доказательство полноты разрешения всех гонок проекта: `src/engine/reverse.ts:70`, `src/engine/reverse.ts:94`.
- Проверка пути реверса — `scripts/e2e27.mjs`; не запускался в этом проходе.

## Переиспользуемое

| Задача | Использовать | Где |
|---|---|---|
| Импорт путей с optional placement | `importFiles` | `src/engine/mediaImport.ts:18` |
| Извлечение drop | `dropPayload`, `dropUsable` | `src/engine/mediaImport.ts:89`, `src/engine/mediaImport.ts:134` |
| Материализация payload | `importDrop` | `src/engine/mediaImport.ts:144` |
| Показ активности | `useImportUi` | `src/engine/mediaImport.ts:9` |
| Имя и родительская папка | `baseOf/dirOf` | `shared/paths.ts:5` |

## Эталонные реализации

- `importFilesInner` — dedup → probe → asset → placement: `src/engine/mediaImport.ts:30`.
- `media:clipboard-paste` — files-first fallback на PNG: `electron/main.ts:708`.
- `wireDropDiagnostics` — capture-phase запись формы входа без изменения результата импорта: `src/engine/mediaImport.ts:196`.

## Проверки

- `scripts/e2e31.mjs:110` — path dedup, размещение, linked AV и пакетный undo.
- `scripts/e2e31.mjs:413` — browser-style URL drop; `scripts/e2e31.mjs:451` — clipboard image.
- Clipboard-часть использует Linux `xclip` и допускает SKIP: `scripts/e2e31.mjs:480`; это не Windows coverage.
- Runtime/E2E здесь не запускались; защиту живого проекта нужно проверять по коду конкретного suite.

## Текущее состояние / долг

- Дедуп по точной строке пути не канонизирует case, symlinks или разные представления одной ссылки.
- Models import требует сохранённого проекта; его ошибка не должна трактоваться как успешное добавление media asset.
- Широкая переносимость intake из FEATURES — пользовательское описание, а не проверка всех ОС/источников drag.

## Open Questions

- Нужны ли отдельные fixture-тесты file URI для Windows drives и UNC без живого clipboard?
- Нужны ли streaming download/cancel и канонизация пути? Это возможные изменения, не действующий контракт.

## Навигация

⬆ [Renderer](../layers/RENDERER.md) · ↔ [Main](../layers/MAIN_PROCESS.md), [Preload](../layers/PRELOAD.md), [Timeline](TIMELINE.md), [3D](MODELS_3D.md), [Subtitles](SUBTITLES.md).
Паттерны: [Storage](../patterns/CACHE_AND_STORAGE.md), [Testing](../patterns/TESTING.md); граница: [Security](../../shared/SECURITY.md).
