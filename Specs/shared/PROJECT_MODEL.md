---
title: "Модель проекта и межпроцессные контракты"
level: L1
type: architecture
stack: shared
parent: ../README.md
related: [./SECURITY.md, ../desktop/layers/SHARED.md, ../desktop/layers/PRELOAD.md, ../desktop/patterns/UNDO_AND_STATE.md, ../desktop/modules/PROJECT_IO.md, ../desktop/modules/VOICEOVER.md]
sources: [shared/types.ts, src/state/store.ts, electron/preload.ts, electron/main.ts]
status: draft
updated: 2026-11-03
---

# PROJECT_MODEL — данные и границы контракта

> **Когда читать:** При изменении project JSON, времени, ссылок на ассеты или IPC. Родитель: [README](../README.md) · стек: shared.

## Контур данных

`Project` (`version: 1`) содержит размеры/FPS/background, `tracks`, `assets`, опциональные `texts`, `markers`, `voiceRuns`, `defects`. Это файловая модель редактора, не схема внешней БД. Клип ссылается на asset по id; пути медиа живут в asset. `KadrApi` — TypeScript-поверхность preload для renderer, а не серверный REST API.

| Сущность | Назначение / система координат | Эталон |
|---|---|---|
| `MediaAsset` | Исходный path, probe metadata, previews, optional proxy/reverse provenance | `shared/types.ts:14` |
| `Keyframe`, `Anim` | Скаляр + optional keys; clip keyframe time относительно начала клипа на timeline | `shared/types.ts:50` |
| `Clip` | media/text/remotion, timeline start/duration, source inPoint, speed, links/effects | `shared/types.ts:138` |
| `Track` | video/audio, locked/muted/gain, clips; track motion — project seconds | `shared/types.ts:193` |
| `TimelineMarker` | Метка project seconds; kind beat/section/pause — ownership музыки | `shared/types.ts:206` |
| `Project` | JSON-корень, version:1; optional наборы для совместимости | `shared/types.ts:237` |
| `KadrApi` | preload методы, progress callbacks с dispose-функциями | `shared/types.ts:1101` |

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Время выражать секундами и указывать frame↔second conversion явно | FPS/скорость/обрезка создают разные координаты | ✅ `frame / fps`; ❌ хранить frame number как start seconds | `shared/types.ts:2` |
| Clip-local keys не превращать в source offsets | Скорость клипа и source inPoint независимы от timeline key time | ✅ интерполировать clip-local; ❌ использовать source seconds для transform | `shared/types.ts:51` |
| Track motion считать в project time | Это движение всей дорожки, а не клипа | ✅ сравнивать с playhead; ❌ обнулять на каждом клипе | `shared/types.ts:77` |
| Разделять media/text/remotion | Text не обязан иметь assetId, Remotion использует fragmentId/meta | ✅ проверять kind; ❌ non-null assertion assetId для каждого клипа | `shared/types.ts:138` |
| Proxy — только preview; export читает source | Иначе качество экспорта зависит от лёгкой копии | ✅ source `path`; ❌ экспортировать `proxyPath` как оригинал | `shared/types.ts:42` |
| Не мутировать разделяемые большие поля ассета | Undo shares waveform/thumbnail blobs | ✅ заменить поле целиком; ❌ править waveform.max/rms через старую ссылку | `shared/types.ts:24` |
| Пользовательские маркеры не удалять при переанализе музыки | Music owns только свои kind | ✅ `isMusicMarker`; ❌ очистить весь markers | `shared/types.ts:234` |
| Изменение IPC проводить через type + preload + handler + consumer | Typecheck не проверяет строковые каналы и runtime payload автоматически | ✅ синхронная правка всех границ; ❌ только интерфейс KadrApi | `shared/types.ts:1101` |
| Progress-подписки освобождать | Иначе повторные mounts копят handlers | ✅ вызвать возвращённый disposer; ❌ подписываться при каждом render | `shared/types.ts:1142` |

Санитизация чужого JSON, undo ownership и порядок tracks — [UNDO_AND_STATE](../desktop/patterns/UNDO_AND_STATE.md), сохранение — [PROJECT_IO](../desktop/modules/PROJECT_IO.md). `tracks[0]` — верхняя видео-дорожка; draw order следует проверять по player/compositor, не по порядку DOM.

## Переиспользуемое

- Типы из `shared/types.ts`, не параллельные интерфейсы «почти Project».
- Санитизация и команды `src/state/store.ts` для load/изменений.
- `shared/paths.ts` для separator-tolerant обработки; URL через preload `fileUrl`, не ручная строка без токена.
- `shared/voiceMap.ts` для переноса времени после voice-splice; voice defect provenance — не timeline позиция.

## Текущее состояние / долг

TypeScript-типы сами по себе не валидируют прочитанный JSON или внешние MCP eval. Есть legacy `maskShape` наряду с `maskShapes`. Не объявлять это новой миграцией схемы: любое изменение совместимости отдельно согласуется и покрывается старым fixture + roundtrip/undo.

Нет требования добавлять SQL/ORM/серверный API. Проектные .kadr с абсолютными путями и внешний fragment workspace требуют аккуратной переносимости; исходный JSON не означает наличие всех файлов.

## Open Questions

Стратегия будущих версий Project, portable packaging медиа и formal runtime schema не утверждены. Добавление поля не является автоматически обратносовместимым: проверить sanitize, clone/undo, read/write, MCP state и экспорт.

## Навигация

⬆ [README](../README.md) · ↔ [Shared layer](../desktop/layers/SHARED.md), [Preload](../desktop/layers/PRELOAD.md), [Undo](../desktop/patterns/UNDO_AND_STATE.md), [Project IO](../desktop/modules/PROJECT_IO.md), [Voiceover](../desktop/modules/VOICEOVER.md), [Security](SECURITY.md).
