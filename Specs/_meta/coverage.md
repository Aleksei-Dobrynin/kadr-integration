---
title: "Покрытие слоёв, паттернов, фич и проверок"
level: L0
type: meta
stack: shared
parent: ../README.md
related: [./spec-authoring-guide.md, ./sources-and-references.md, ./verification.md, ../desktop/DESKTOP_CORE.md]
sources: [docs/reference/AGENTS-before-specs.md, FEATURES.md, shared/types.ts]
status: draft
updated: 2026-11-03
---

# Карта покрытия

> **Когда читать:** Перед заявлением полноты системы и при добавлении нового concern. Родитель: [README](../README.md) · стек: shared.

## Метод

Покрытие означает наличие предметного контракта, причин/инвариантов, источников кода, проверочного механизма и долга. Это **не** означает, что все тесты запущены или всё целевое поведение реализовано. Оставшийся runtime validation — [verification](verification.md).

## Слои и владельцы

| Срез | Владелец L1/L2 | Вход кода |
|---|---|---|
| Topology/build/process trust | [ARCHITECTURE](../desktop/DESKTOP_ARCHITECTURE.md) | electron.vite.config.ts, index.html, electron/main.ts |
| Main и IPC handlers | [MAIN_PROCESS](../desktop/layers/MAIN_PROCESS.md) | electron/main.ts и отдельные регистраторы |
| Preload, buffer ownership, API | [PRELOAD](../desktop/layers/PRELOAD.md) | electron/preload.ts, shared/types.ts |
| Renderer/React/state/render | [RENDERER](../desktop/layers/RENDERER.md) | src/main.tsx, App.tsx, state/, engine/, gl/ |
| Чистая модель/математика | [SHARED](../desktop/layers/SHARED.md), [PROJECT_MODEL](../shared/PROJECT_MODEL.md) | shared/ |
| Python subprocesses/models | [PYTHON](../desktop/layers/PYTHON.md) | scripts/transcribe.py, ttsqc_run.py, python/ |
| Dependencies/offline/licensing | [DEPENDENCIES](../shared/DEPENDENCIES.md) | package manifests, resources/CREDITS.md |
| External/local contracts | [INTEGRATIONS](../shared/INTEGRATIONS.md), [SECURITY](../shared/SECURITY.md) | claude, tts, media download, workspace |

## Сквозные инварианты

| Concern исходной карты | Спецификация-владелец | Ключевая проверка |
|---|---|---|
| Undo/cloneProject/immutable blobs/sanitize | [UNDO_AND_STATE](../desktop/patterns/UNDO_AND_STATE.md) | e2e28/29, roundtrip после undo |
| Preview/export compositor, context lifecycle, alpha/HDR/frame hashes | [RENDER_PIPELINE](../desktop/patterns/RENDER_PIPELINE.md) | e2e17/18/21/32/35/52; check-hdr |
| Sidecar/rename, rebuildable vs referenced, prune fail-closed | [CACHE_AND_STORAGE](../desktop/patterns/CACHE_AND_STORAGE.md) | e2e42 + cancel/cache fixtures |
| Singleton export, serialized PTY, timers, watchdog/cancel | [PROCESS_LIFECYCLE](../desktop/patterns/PROCESS_LIFECYCLE.md) | e2e34/43 + relevant fragment suites |
| CSS tokens/icons/modal/shortcuts/i18n | [UI_CONVENTIONS](../desktop/patterns/UI_CONVENTIONS.md) | e2e40, functional keyboard checks |
| CDP, resource safety, mocks, exact/near-lossless oracle | [TESTING](../desktop/patterns/TESTING.md) | actual command matrix, не blanket PASS |

## Модули L3 — продуктовые срезы

| Модуль | Спецификация | Код / характер проверки |
|---|---|---|
| Project read/write/autosave/presets | [PROJECT_IO](../desktop/modules/PROJECT_IO.md) | store/main/autosave, e2e26/28/29 |
| Timeline editing/AV links/markers/speed/culling | [TIMELINE](../desktop/modules/TIMELINE.md) | Timeline/store/timelineMath, e2e2–9/51 |
| Preview clock/audio pool/popout/onion/GPU | [PREVIEW_AND_GPU](../desktop/modules/PREVIEW_AND_GPU.md) | player/compositor/popout, e2e35/43/46/50/51 |
| File/URL/blob/clipboard/portal/proxy/reverse intake | [MEDIA_IMPORT](../desktop/modules/MEDIA_IMPORT.md) | mediaImport/reverse/main/ffmpeg, e2e16/27/31/32 |
| Anim/keyframes/track motion/masks/transitions/glow/blur | [ANIMATION_AND_EFFECTS](../desktop/modules/ANIMATION_AND_EFFECTS.md) | anim + GL + editors, e2e4–15/18–21/30 |
| Offline render/fast decode/mux/partial ranges/presets | [EXPORT](../desktop/modules/EXPORT.md) | exporter/demux/presets/ffmpeg/preload, e2e17/18/21/32/52 |
| Remotion workspace/kit/capture/params/inspect | [FRAGMENTS](../desktop/modules/FRAGMENTS.md) | fragments/fragment-kit/checks, e2e24/25/45–50/52 |
| PTY/MCP/tools/skills/auth bridge | [AI_BRIDGE](../desktop/modules/AI_BRIDGE.md) | claude/mcp-bridge/skills, e2e22/34 |
| Local speech recognition/NDJSON/VAD | [TRANSCRIPTION](../desktop/modules/TRANSCRIPTION.md) | transcribe.ts/transcribe.py, e2e23 |
| Text/SRT/animated word captions | [SUBTITLES](../desktop/modules/SUBTITLES.md) | subtitles/captions/TextTools, e2e26 |
| TTS/defects/phrase splice/time map/corpus | [VOICEOVER](../desktop/modules/VOICEOVER.md) | tts/voice/ttsqc, e2e36–39; checks text/voiceMap/phrases |
| Librosa grid/attacks/rhythm/audio bake/neon/SFX/normalize | [MUSIC_AND_SOUNDS](../desktop/modules/MUSIC_AND_SOUNDS.md) | audioAnalysis/rhythm/audioReact/sounds/normalize, e2e33/44 |
| 3D formats/units/decimation/kit/collision | [MODELS_3D](../desktop/modules/MODELS_3D.md) | models/three kit, e2e49; check-models |
| Session log/storage scan/prune/operational failures | [DIAGNOSTICS](../desktop/modules/DIAGNOSTICS.md) | log/DebugPanel/StoragePanel, e2e41/42 |

## Анти-потери при миграции

Все существенные группы исходной карты распределены выше; метрики исходного автора сохранены в reference и маркируются как inherited, не повторно измеренные. Generated workspace paths направлены на реальные generators/templates. Пользовательские руководства и языковые версии не удаляются.

Не документированы как «сделано»: native rebuild на текущем Windows, GUI/e2e, STT weights/inference, paid TTS, запуск managed Chrome, полноценный security audit, performance bench исходного автора. Это границы доказательства, а не пропущенные feature sections.

## Open Questions

Функциональные связи в таблице тестов — маршруты к проверкам, не новый агрегатор тестов. При росте модуля добавлять semantic child и обновлять таблицу; не дробить по номеру релиза.

## Навигация

⬆ [README](../README.md) · ↔ [CORE](../desktop/DESKTOP_CORE.md), [Формат](spec-authoring-guide.md), [Источники](sources-and-references.md), [Проверка](verification.md).
