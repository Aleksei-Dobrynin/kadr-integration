---
title: "Жизненный цикл операций и дочерних процессов"
level: L2
type: pattern
stack: desktop
parent: ../DESKTOP_CORE.md
related: [./CACHE_AND_STORAGE.md, ./RENDER_PIPELINE.md, ./UNDO_AND_STATE.md, ../modules/AI_BRIDGE.md, ../modules/EXPORT.md, ../modules/FRAGMENTS.md]
sources: [src/engine/autosave.ts, src/engine/exporter.ts, src/engine/player.ts, src/engine/popout.ts, electron/main.ts, electron/claude.ts, electron/fragments.ts, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Жизненный цикл операций и дочерних процессов

> **Когда читать:** перед изменением start/cancel, закрытия окна, PTY, background timers, fragment server или переносом preview между окнами.
> Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md) · стек: desktop.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Export — singleton; повторный start отклоняется до выполнения работы. | Raw encoder, main export state и fragment queue общие. | ✅ `activity.exporting` с освобождением в finally; ❌ одновременный export из UI и скрипта. | `src/engine/exporter.ts:125` |
| PTY open/close сериализованы общей цепочкой и поколением запроса. | Close может обогнать async config/import/spawn и оставить orphan. | ✅ `sessionChain` + `sessionGen`; ❌ один null-check перед async spawn. | `electron/claude.ts:382`, `electron/claude.ts:398` |
| PTY data/exit проверяют identity своей session. | Старый PTY не должен писать в новый терминал или закрывать его bridge. | ✅ `session === mine`; ❌ глобальный handler без владельца. | `electron/claude.ts:329` |
| Завершать дерево вспомогательной операции, не только оболочку запуска. | Remotion запускает Chrome в другой process group; один npx kill оставлял детей. | ✅ snapshot descendants / Windows taskkill tree; ❌ только graceful TERM родителю. | `electron/fragments.ts:821`, `electron/fragments.ts:833` |
| Перед spawn queued fragment job проверять общий `renderCancelled`; отмена действует, пока флаг не сброшен новым render request. | Cancel должен блокировать ожидающую работу, но текущий flag не изолирован по job/export. | ✅ проверка cancellation; ❌ обещать изоляцию отменённой очереди до следующего export. | `electron/fragments.ts:830`, `electron/fragments.ts:930`, `electron/fragments.ts:1236` |
| Shared render entry/config писать внутри render queue. | Параллельная перезапись меняет композицию уже запущенного job. | ✅ `renderChain` и `writeRenderEntry`; ❌ общая entry вне очереди. | `electron/fragments.ts:924` |
| Fragment dev-server имеет один in-flight start и может принять уже живой сервер. | Повторное открытие/рестарт иначе создаёт гонку за порт. | ✅ `starting` promise, `awaitExisting`; ❌ spawn после единственного мгновенного probe. | `electron/fragments.ts:422`, `electron/fragments.ts:470` |
| Autosave tick каждые пять минут пропускается при export, Claude и voiceCheck. | Snapshot и диск не должны конкурировать с тяжёлой/составной операцией. | ✅ activity flags; ❌ только проверка открытого export dialog. | `src/engine/autosave.ts:10`, `src/engine/autosave.ts:21` |
| Неизменившийся или пустой без texts проект не autosave-ится; неуспех не обновляет lastSnapshot. | Иначе timer создаёт лишние записи или считает неудачу сохранением. | ✅ identity после успешного await; ❌ mark-saved до записи. | `src/engine/autosave.ts:24` |
| Player loop переживает ошибку кадра и планирует следующий rAF. | Один corrupt clip не должен навсегда остановить playback. | ✅ try/catch вокруг tick, schedule снаружи; ❌ оборвать loop исключением. | `src/engine/player.ts:679` |
| Popout переносит один host с canvas/iframes, не пересоздаёт preview. | Пересоздание копит GL contexts и перезагружает fragments. | ✅ `previewHost`; ❌ новый Player на каждом toggle. | `src/engine/popout.ts:10`, `src/engine/popout.ts:34` |
| Clock и observers привязаны к текущему document preview. | rAF свёрнутого исходного окна throttled, observer другого document не обслуживает новый. | ✅ `ownerDocument.defaultView`; ❌ постоянный global window для перенесённого canvas. | `src/engine/player.ts:693`, `src/components/FragmentOverlays.tsx:49` |
| При quit отменять export/mux и fragment jobs; у windowless процесса есть failsafe exit. | Зависшие handles мешают следующему запуску. | ✅ before-quit cleanup; ❌ ожидать только естественного завершения children. | `electron/main.ts:286`, `electron/main.ts:296` |

## Переиспользуемое

- `activity` — существующие flags для координации autosave; не новый общий job scheduler.
- `autosaveNow` вызывает тот же guarded tick, а не обходит паузы timer.
- `sweepStaleSessions` убирает хвосты hard-killed PTY при старте.
- PTY watchdog отслеживает жизнь Electron и завершает process group.
- `killSession` сначала снимает глобальную session, затем закрывает дерево и HTTP server.
- `ensureServer` сериализует только server start; render jobs имеют собственную очередь.
- `cancelFragmentRenders` связан с cancel export и before-quit.
- Файловое завершение/публикация результатов — [CACHE_AND_STORAGE](CACHE_AND_STORAGE.md).
- Context lifecycle preview/export — [RENDER_PIPELINE](RENDER_PIPELINE.md), без второй нормы dispose здесь.

## Эталонные реализации

- PTY watchdog и identity guards: `electron/claude.ts:314`, `electron/claude.ts:335`.
- HUP и delayed escalation: `electron/claude.ts:354`.
- Startup stale sessions: `electron/claude.ts:67`, `electron/claude.ts:458`.
- Autosave timer: `src/engine/autosave.ts:36`.
- Startup cache sidecar sweep: `electron/main.ts:269`.
- Fragment progress учитывает Rendered и Stitched/Encoded: `electron/fragments.ts:946`.
- Cancel tree и scratch dirs: `electron/fragments.ts:833`.
- Singleton export regression покрывается существующей guarded entry: `src/engine/exporter.ts:132`.
- PTY races: `scripts/e2e34.mjs:1`; popout identity: `scripts/e2e43.mjs:1`.

## Текущее состояние / долг

- Flags координации — mutable singleton, не lock между независимыми процессами приложения.
- Каждый IPC `fragment:render`, включая самостоятельный вне export, сбрасывает общий renderCancelled. Новый запрос может изменить условия выполнения ранее ожидающих jobs; «Cancel действует до следующего export» не является гарантией.
- Timer продолжает тикать во время activity: пропускается работа tick, не останавливается setInterval.
- `wireAutosave` не возвращает disposer; повторная регистрация не объявляется безопасной.
- PTY реализован через `/bin/bash`, Unix process groups и shell watchdog.
- Fragment server запускается через `sh`; наличие Windows-ветки cancel не доказывает portable start.
- В Windows-ветке cancel выполняется `taskkill /T /F` и ранний return; очистка scratch ниже — Unix-ветка.
- Поэтому утверждение «cancel всегда чистит frame dirs на всех ОС» здесь не делается.
- Shutdown macOS отличен: window-all-closed failsafe находится под `platform !== darwin`.
- Унаследованные истории orphan-процессов и замеры задержек не воспроизведены в этой задаче.
- Live Electron/E2E и принудительное завершение процессов не запускались.

## Open Questions

- Нужна ли оператору отдельная переносимая реализация PTY/server watchdog для Windows?
- Как управлять повторным `wireAutosave`, если появится перезапуск renderer service без reload?
- Следует ли выровнять cleanup scratch после Windows taskkill с Unix-веткой? Это ещё не изменение кода.

## Навигация

- ⬆ [DESKTOP_CORE](../DESKTOP_CORE.md).
- ↔ [Cache/storage](CACHE_AND_STORAGE.md), [Render](RENDER_PIPELINE.md), [State/undo](UNDO_AND_STATE.md).
- ↓ [AI bridge](../modules/AI_BRIDGE.md), [Export](../modules/EXPORT.md), [Fragments](../modules/FRAGMENTS.md).
