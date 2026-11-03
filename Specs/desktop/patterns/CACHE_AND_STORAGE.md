---
title: "Кеши, хранение и безопасная очистка"
level: L2
type: pattern
stack: main
parent: ../DESKTOP_CORE.md
related: [./PROCESS_LIFECYCLE.md, ./RENDER_PIPELINE.md, ./TESTING.md, ../layers/MAIN_PROCESS.md, ../modules/PROJECT_IO.md, ../modules/DIAGNOSTICS.md]
sources: [electron/cacheKeys.ts, electron/storage.ts, electron/main.ts, electron/fragments.ts, src/engine/autosave.ts, scripts/e2e42.mjs]
status: draft
updated: 2026-11-03
---

# Кеши, хранение и безопасная очистка

> **Когда читать:** перед добавлением промежуточного файла, сменой cache key, кнопки удаления, autosave или обработки неуспешного export.
> Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md) · стек: main.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Различать rebuildable и referenced по модели хранения, не по имени каталога или наличию hash. | Файл может иметь hash-имя, но быть единственным источником проекта. | ✅ reversed/imported/voiceRuns как referenced; ❌ «всё в userData — кеш». | `electron/storage.ts:34` |
| Формулу media key брать из `cacheKeys.ts`. | Другая формула атрибуции объявит живой cache orphaned и предложит его удалить. | ✅ `mediaCacheKey` и suffix helpers; ❌ копия sha1-формулы в панели. | `electron/cacheKeys.ts:18`, `electron/storage.ts:85` |
| Identity сохранённого проекта — путь, не отображаемое имя. | Несколько Untitled — разные владельцы файлов. | ✅ `Known.id = path`; ❌ объединение по `project.name`. | `electron/storage.ts:44`, `electron/storage.ts:62` |
| Media/render caches публиковать только после успешной сборки sidecar через rename. | Progressive WebM может читаться, но незаметно оказаться усечённым. | ✅ `<key>.part.<ext>` → final; ❌ render сразу в адрес cache hit. | `electron/fragments.ts:903`, `electron/fragments.ts:973` |
| Startup sweep удаляет только остатки `.part.` в известных cache dirs. | После старта сборок ещё нет, но произвольный каталог может содержать пользовательские файлы. | ✅ четыре перечисленных каталога и только files; ❌ рекурсивный sweep userData. | `electron/main.ts:485` |
| `storage:prune` без явного `confirm` лишь считает; `dryRun` не удаляет. | Незнакомые flags или старый caller должны ошибаться в сторону сохранения данных. | ✅ предварительный count; ❌ считать отсутствие флага согласием. | `electron/storage.ts:265` |
| Main заново вычисляет удаляемые entries, caller не передаёт свободный filesystem path. | Renderer не должен расширять область удаления за directory группы. | ✅ group/scope/only; ❌ удалить path из произвольного UI-поля. | `electron/storage.ts:243`, `electron/storage.ts:274` |
| Project/all pruning разрешён только rebuildable-группам. | Referenced files нельзя восстановить как производный cache. | ✅ отказ `not rebuildable`; ❌ общая кнопка wipe для reversed. | `electron/storage.ts:260` |
| Производные decode от rendered fragments учитывать при поиске владельцев. | Их источник не находится в обычном списке project assets. | ✅ проход fragment-renders по fragmentIds; ❌ объявить все packed alpha orphaned. | `electron/storage.ts:91` |
| При неотменённом mux failure сохранять уже отрендеренное видео и сообщать путь. | Дорогой video pass не должен пропасть из-за последующей audio/mux ошибки. | ✅ `cleanupExport(keep)`; ❌ unconditional unlink в finally. | `electron/main.ts:947`, `electron/main.ts:971` |
| Autosave публикуется tmp+rename отдельно от обычного save. | Частичная запись safety copy не должна заменить завершённую. | ✅ `<base>.autosave.kadr.tmp`; ❌ приписать атомарность всем save-вызовам. | `electron/main.ts:822` |

## Переиспользуемое

| Группа | Класс | Привязка |
|---|---|---|
| `proxies` | rebuildable | source key |
| `decoded` | rebuildable | source key, в том числе fragment render |
| `fragments` | rebuildable | prefix fragment id |
| `ttsqcCache` | rebuildable | без project matching |
| `reversed` | referenced | asset path |
| `imported` | referenced | asset path |
| `voiceRuns` | referenced | path run directory |

`mediaCacheKey` включает source path, size, округлённый mtime и suffix; возвращает 20 hex SHA-1.
`proxySuffix` различает alpha и HDR→SDR, `decodedSuffix` — packed/alpha/SDR.
`HDR_VERSION` участвует в SDR generation, поэтому старый результат не становится новым hit.
`reverseSuffix` учитывает start/duration; это не меняет referenced-классификацию результата.
`renderFragment` использует fragment hash, quality generation `q2`, alpha и optional frame range.
Полный cache hit берётся раньше partial; на partial возвращаются start и picture-duration.
Эти имена — наблюдаемый формат реализации, не разрешение строить их вручную в renderer.

## Эталонные реализации

- Proxy/decoded sidecars: `electron/main.ts:362`, `electron/main.ts:430`.
- Reverse sidecar: `electron/main.ts:528`.
- Sweep известных dirs: `electron/main.ts:486`.
- Fragment render success/failure: `electron/fragments.ts:973`, `electron/fragments.ts:975`.
- Owners и scope удаления: `electron/storage.ts:246`, `electron/storage.ts:253`.
- Fail-closed подтверждение: `electron/storage.ts:269`.
- Atomic autosave: `electron/main.ts:827`.
- Storage regression: `scripts/e2e42.mjs:1`.

## Текущее состояние / долг

- «Stale» значит «не принадлежит известным сейчас проектам», не «доказанно никому не нужен».
- В коде допускается stale-prune referenced-группы; blanket-запрета на любое их удаление нет.
- Перемещённый/неизвестный проект может отсутствовать в наборе атрибуции; это ограничение scan.
- `inside` — проверка resolve+separator, не отдельная доказанная политика symlink-hardening.
- Sweep не удаляет scratch directories reverse worker; комментарий явно оставляет их в стороне.
- Обычный project save пишет напрямую; tmp+rename доказан для autosave, не для всех файлов приложения.
- Кешировать production-результат можно только после завершения, но все user stores этим правилом не охвачены.
- Неотменённый mux failure оставляет temp video намеренно: это recovery artifact, не утечка по определению.
- В этой работе destructive pruning и live E2E не запускались.

## Open Questions

- Нужен ли дополнительный UX для referenced stale entries при неполном списке известных проектов?
- Как оператор хочет различать recovery video и обычный мусор в будущей панели хранения?
- Нужны ли новые гарантии atomic save и symlink-hardening? Сейчас они не утверждены этим документом.

## Навигация

- ⬆ [DESKTOP_CORE](../DESKTOP_CORE.md).
- ↔ [Main process](../layers/MAIN_PROCESS.md), [Lifecycle](PROCESS_LIFECYCLE.md).
- ↔ [Render](RENDER_PIPELINE.md), [Testing](TESTING.md).
- ↓ [Project IO](../modules/PROJECT_IO.md), [Diagnostics](../modules/DIAGNOSTICS.md).
