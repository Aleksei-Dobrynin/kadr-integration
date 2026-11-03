---
title: "Слой preload: мост и прямой encoder"
level: L2
type: layer
stack: desktop
parent: ../DESKTOP_CORE.md
related: [./MAIN_PROCESS.md, ./RENDERER.md, ./SHARED.md]
sources: [docs/reference/AGENTS-before-specs.md, electron/preload.ts, electron/main.ts, shared/types.ts, shared/rawEncode.ts, src/engine/exporter.ts]
status: draft
updated: 2026-11-03
---

# Слой preload: мост и прямой encoder

> **Когда читать:** При изменении `window.kadr`, IPC подписок, URL медиа или транспорта raw frames. Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md).

## Граница слоя

Preload — Node/Electron-адаптер внутри процесса renderer, не второй main.
Большинство методов делегируют ОС-операции main через IPC.
Исключение горячего пути: preload сам запускает ffmpeg и пишет raw RGBA в stdin.
Контракт объекта — `KadrApi`, а не свободный набор глобальных функций
(`electron/preload.ts:21`, `shared/types.ts:1101`).

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Согласовывать API с `KadrApi` и handler | Типизация одной стороны не создаёт IPC endpoint | ✅ метод + тип + handler; ❌ придуманный канал только в UI | `electron/preload.ts:95`, `electron/main.ts:811`, `shared/types.ts:1101` |
| Для media URL использовать `fileUrl` | Важны token, Windows drive и экранирование `?`/`#` | ✅ builder; ❌ ручная конкатенация `kadr://` | `electron/preload.ts:76` |
| Получать media token до первого обращения | Элементы медиа появляются с первого кадра UI | ✅ существующий sync handshake; ❌ асинхронная гонка начального URL | `electron/preload.ts:19`, `electron/main.ts:626` |
| Подписка возвращает точную отписку | Remount иначе накапливает callbacks | ✅ removeListener того же handler; ❌ снять все чужие listeners | `electron/preload.ts:230` |
| Буфер кадра освобождать только после write callback | Возвращённое `true` от write не означает, что память уже не нужна | ✅ await `rawEncodeFrame`; ❌ немедленно заполнить тот же view | `electron/preload.ts:45` |
| Переиспользовать builder raw encode | Preload и main fallback должны кодировать одинаково | ✅ `rawEncodeArgs`; ❌ вторая формула ffmpeg flags | `electron/preload.ts:24`, `shared/rawEncode.ts:19` |

## Жизненный цикл и ошибки

`rawEnc`, `rawEncErr`, `rawEncExit` описывают один процесс, а не pool encoder-ов
(`electron/preload.ts:13`). Start возвращает временный путь после spawn;
ошибки старта и ненулевой exit не скрываются (`electron/preload.ts:30`).
Frame проверяет доступность stdin, затем завершает Promise по callback записи.
End закрывает stdin и ждёт выхода; kill завершает процесс при отмене
(`electron/preload.ts:45`, `electron/preload.ts:63`).
Глобальный gate «один экспорт» расположен в orchestration renderer,
а не гарантируется независимым multi-job preload API (`src/engine/exporter.ts:125`).

## Переиспользуемое

| Потребность | Существующая поверхность | Код |
|---|---|---|
| Прямой encode | `rawEncodeStart/Frame/End/Kill` | `electron/preload.ts:22` |
| Безопасный URL локального файла | `fileUrl` | `electron/preload.ts:76` |
| Путь OS File | `pathForFile` через webUtils | `electron/preload.ts:86` |
| Проектные файлы | `readProject`, `writeProject`, `autosaveProject` | `electron/preload.ts:95` |
| Прогресс/терминал | wrappers с disposer | `electron/preload.ts:139`, `electron/preload.ts:230` |

## Эталонные реализации

- Thin IPC delegation без предметной логики: `electron/preload.ts:95`.
- Владение памятью кадра и объяснение torn-frame race: `electron/preload.ts:52`.
- Контекстно-зависимое выставление API: `electron/preload.ts:242`.

## Текущее состояние / долг

- Активен общий JS context: `api` записывается в globalThis; ветка contextBridge сохранена на случай включения isolation (`electron/preload.ts:245`).
- Наличие contextBridge branch не доказывает, что direct encode сохранит производительность или семантику при isolation.
- Отключённые isolation/sandbox — унаследованный tradeoff, не шаблон безопасного Electron приложения (`electron/main.ts:100`).
- Raw encoder singleton не предоставляет самостоятельной защиты от ошибочного параллельного вызова вне renderer gate.

## Open Questions

- Какая замена direct shared-context transport допустима по скорости и памяти?
- Нужен ли отдельный typed контракт для `window.kadrEditor`, сейчас выставленного через `any`?

## Навигация

⬆ [DESKTOP_CORE](../DESKTOP_CORE.md) · ↔ [MAIN_PROCESS](MAIN_PROCESS.md), [RENDERER](RENDERER.md), [SHARED](SHARED.md).
⬇ [EXPORT](../modules/EXPORT.md), [RENDER_PIPELINE](../patterns/RENDER_PIPELINE.md), [SECURITY](../../shared/SECURITY.md).
