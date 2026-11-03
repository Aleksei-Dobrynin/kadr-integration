---
title: "Слой main process"
level: L2
type: layer
stack: main
parent: ../DESKTOP_CORE.md
related: [../DESKTOP_ARCHITECTURE.md, ./PRELOAD.md, ./PYTHON.md]
sources: [docs/reference/AGENTS-before-specs.md, electron/main.ts, electron/claude.ts, electron/fragments.ts, electron/transcribe.ts, electron/voice.ts]
status: draft
updated: 2026-11-03
---

# Слой main process

> **Когда читать:** При работе с IPC handlers, файлами, окнами и внешними процессами. Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md).

## Граница слоя

`electron/main.ts` собирает приложение и регистрирует подсистемы.
`electron/ffmpeg.ts`, `fragments.ts`, `claude.ts`, `tts.ts`, `voice.ts`,
`transcribe.ts`, `storage.ts`, `models.ts` выполняют предметную работу ОС.
Файл `electron/preload.ts` находится рядом физически, но имеет другой runtime.
Store и отрисовка остаются в renderer; main получает сериализуемые запросы.
Модель IPC — `shared/types.ts:1101`, wiring — `electron/main.ts:267`.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Регистрировать handler у владельца подсистемы | Main entry не должен дублировать её реализацию | ✅ `registerTranscribeIpc`; ❌ второй STT runner в entry | `electron/main.ts:271`, `electron/transcribe.ts:81` |
| Сохранять capability и CORS протокола совместно | Нужны и доступ к пикселям, и защита локальных файлов | ✅ token check + CORS; ❌ «исправить» taint снятием авторизации | `electron/main.ts:32`, `electron/main.ts:254` |
| Останавливать принадлежащую окну работу при смене страницы | Старые capture windows иначе продолжают рендерить | ✅ cleanup top-level navigation; ❌ держать потерянные captures | `electron/main.ts:111` |
| Отмена должна доходить до muxer/дочернего процесса | UI-флаг не освобождает ОС-ресурсы | ✅ `cancel` и kill; ❌ только reject внешнего Promise | `electron/main.ts:296`, `electron/transcribe.ts:87` |
| Передавать ошибку процесса через stderr/exit | Иначе отсутствие результата выглядит успехом | ✅ reject с диагностикой; ❌ code≠0 как пустой результат | `electron/transcribe.ts:64`, `electron/voice.ts:78` |
| Не считать localhost авторизацией | AI bridge исполняет код в editor | ✅ token + запрет Origin; ❌ открытый `/eval` | `electron/claude.ts:165` |

## Жизненный цикл и ошибки

До ready выбираются userData, GPU и привилегии схемы; затем регистрируются IPC
и создаётся окно (`electron/main.ts:43`, `electron/main.ts:251`).
Renderer crash завершает main с ошибкой, а не оставляет пустое вечное окно
(`electron/main.ts:148`). Закрытие всех окон вне macOS вызывает quit с failsafe
(`electron/main.ts:286`). Это наблюдаемая политика, не модель hot recovery.

У transcribe один активный job с muxer и Python, временный WAV удаляется в finally
(`electron/transcribe.ts:15`, `electron/transcribe.ts:75`).
Глобальный uncaught handler пишет в console; он не превращает ошибку в успешный
ответ IPC и не заменяет предметную диагностику (`electron/main.ts:78`).

## Переиспользуемое

| Работа | Использовать | Владелец подробностей |
|---|---|---|
| Probe, proxy, mix/mux | `electron/ffmpeg.ts` | [EXPORT](../modules/EXPORT.md), [MEDIA_IMPORT](../modules/MEDIA_IMPORT.md) |
| Workspace и captures | `electron/fragments.ts:23` | [FRAGMENTS](../modules/FRAGMENTS.md) |
| CLI и bridge | `electron/claude.ts:155` | [AI_BRIDGE](../modules/AI_BRIDGE.md) |
| ML runner | `electron/voice.ts:58` | [PYTHON](PYTHON.md) |
| Запись и очистка данных | существующие project/storage handlers | [CACHE_AND_STORAGE](../patterns/CACHE_AND_STORAGE.md) |

## Эталонные реализации

- Композиция IPC-подсистем до создания окна: `electron/main.ts:267`.
- Atomic autosave с tmp+rename: `electron/main.ts:822`.
- Python adapter, различающий недоступное окружение и отчёт selftest: `electron/voice.ts:89`.

## Текущее состояние / долг

- Обычный `project:write` не атомарен; не приписывать ему контракт autosave (`electron/main.ts:815`).
- Не все ошибки main видны в renderer session log: console — текущая последняя защита, не единый error bus.
- `contextIsolation: false` / `sandbox: false` — существующий encode-компромисс; не распространять его на новые окна (`electron/main.ts:94`).
- Linux portal/DBus и POSIX CLI нельзя объявлять универсальными механизмами Windows (`electron/main.ts:54`, `electron/claude.ts:322`).

## Open Questions

- Нужна ли единая доставка системных ошибок main в пользовательскую диагностику?
- Какие фоновые операции должны переживать закрытие панели, но не приложения?

## Навигация

⬆ [DESKTOP_CORE](../DESKTOP_CORE.md) · ↔ [PRELOAD](PRELOAD.md), [PYTHON](PYTHON.md).
⬇ [PROCESS_LIFECYCLE](../patterns/PROCESS_LIFECYCLE.md), [PROJECT_IO](../modules/PROJECT_IO.md), [SECURITY](../../shared/SECURITY.md).
