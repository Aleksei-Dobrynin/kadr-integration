---
title: "Ядро desktop Kadr"
level: L1
type: architecture
stack: desktop
parent: ../README.md
related: [./DESKTOP_ARCHITECTURE.md, ./layers/MAIN_PROCESS.md, ./layers/PRELOAD.md, ./layers/RENDERER.md, ./layers/SHARED.md, ./layers/PYTHON.md]
sources: [docs/reference/AGENTS-before-specs.md, electron.vite.config.ts, electron/main.ts, electron/preload.ts, src/main.tsx, shared/types.ts]
status: draft
updated: 2026-11-03
---

# Ядро desktop Kadr

> **Когда читать:** Перед изменением desktop-функции или выбором места для кода. Родитель: [Specs](../README.md). Граф процессов: [архитектура](DESKTOP_ARCHITECTURE.md).

Kadr — локальный многодорожечный видеоредактор: Electron main управляет ОС,
React/Zustand renderer владеет редактированием, WebGL2 собирает изображение.
Это не сервер с БД и не предписание внедрить Clean Architecture.
Ниже — карта существующих границ, а не новая реорганизация каталогов.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Выбирать слой по владельцу ресурса | Файлы, DOM и модель имеют разный жизненный цикл | ✅ ОС через main/preload; ❌ импорт main в UI | `electron.vite.config.ts:16`, `electron/preload.ts:21` |
| Контракт проекта и IPC держать в shared | UI и main должны понимать одинаковые данные | ✅ `Project`/`KadrApi`; ❌ локальная альтернативная модель | `shared/types.ts:237`, `shared/types.ts:1101` |
| Сохранять общий путь композиции preview/export | WYSIWYG ломается при двух независимых реализациях | ✅ общий `drawFrame`; ❌ особая геометрия только для экспорта | `src/engine/player.ts:354`, `src/engine/exporter.ts:349` |
| Не смешивать API ОС и scripting surface | У поверхностей разные владельцы и привилегии | ✅ `window.kadr` для IPC, `kadrEditor` для операций; ❌ считать их одним API | `electron/preload.ts:245`, `src/main.tsx:71` |
| Загруженный проект пропускать через нормализацию | Файлы и AI-скрипты могут содержать неполные данные | ✅ `setProject`; ❌ предполагать, что JSON уже валиден | `src/state/store.ts:693`, `src/state/store.ts:85` |
| Нормы concern читать у его владельца | Копии правил быстро расходятся | ✅ слой → паттерн → модуль; ❌ новый полный реестр инвариантов в каждом модуле | `src/state/store.ts:621`, `src/engine/exporter.ts:125` |

## Точки входа

| Вход | Назначение | Код |
|---|---|---|
| Main | Протокол, регистрация IPC, окно | `electron/main.ts:251` |
| Preload | Типизированная поверхность `KadrApi`, прямой encoder | `electron/preload.ts:21` |
| Renderer | Wiring сервисов, scripting surface, React root | `src/main.tsx:45`, `src/main.tsx:100` |
| Модель | Сериализуемый проект и интерфейсы взаимодействий | `shared/types.ts:237`, `shared/types.ts:1101` |
| Python STT / QC | Внешние исполняемые драйверы, не часть renderer | `scripts/transcribe.py:29`, `scripts/ttsqc_run.py:61` |

## Переиспользуемое

| Задача | Куда спуститься |
|---|---|
| ОС, окна, IPC, фоновые процессы | [MAIN_PROCESS](layers/MAIN_PROCESS.md) |
| Мост в страницу, транспорт кадров | [PRELOAD](layers/PRELOAD.md) |
| UI, состояние, воспроизведение, offline orchestration | [RENDERER](layers/RENDERER.md) |
| Типы, DSP, математика, переносимые преобразования | [SHARED](layers/SHARED.md) |
| STT, анализ дефектов и границ фраз | [PYTHON](layers/PYTHON.md) |

### Сквозные паттерны L2

- [UNDO_AND_STATE](patterns/UNDO_AND_STATE.md) — история и неизменяемые blobs.
- [RENDER_PIPELINE](patterns/RENDER_PIPELINE.md) — пиксели, декод, контекст GPU.
- [CACHE_AND_STORAGE](patterns/CACHE_AND_STORAGE.md) — rebuildable и referenced.
- [PROCESS_LIFECYCLE](patterns/PROCESS_LIFECYCLE.md) — отмена и владение процессами.
- [UI_CONVENTIONS](patterns/UI_CONVENTIONS.md) — tokens, модальные окна, иконки.
- [TESTING](patterns/TESTING.md) — безопасные проверки и защита данных пользователя.

### Предметные модули L3

| Область | Документы |
|---|---|
| Монтаж и проект | [PROJECT_IO](modules/PROJECT_IO.md), [TIMELINE](modules/TIMELINE.md), [ANIMATION_AND_EFFECTS](modules/ANIMATION_AND_EFFECTS.md) |
| Изображение и источники | [PREVIEW_AND_GPU](modules/PREVIEW_AND_GPU.md), [MEDIA_IMPORT](modules/MEDIA_IMPORT.md), [EXPORT](modules/EXPORT.md) |
| Композиции и автоматизация | [FRAGMENTS](modules/FRAGMENTS.md), [AI_BRIDGE](modules/AI_BRIDGE.md), [MODELS_3D](modules/MODELS_3D.md) |
| Звук и текст | [TRANSCRIPTION](modules/TRANSCRIPTION.md), [VOICEOVER](modules/VOICEOVER.md), [MUSIC_AND_SOUNDS](modules/MUSIC_AND_SOUNDS.md), [SUBTITLES](modules/SUBTITLES.md) |
| Наблюдаемость | [DIAGNOSTICS](modules/DIAGNOSTICS.md) |

## Эталонные реализации

- Wiring без копирования предметной логики: `src/main.tsx:45`.
- Типизированный bridge с отпиской: `electron/preload.ts:230`.
- Нормализация внешнего состояния на входе: `src/state/store.ts:693`.

## Текущее состояние / долг

- Main и preload собраны отдельно, но preload исполняется в процессе renderer.
- `contextIsolation: false` и `sandbox: false` — существующий компромисс прямого encode, не универсальная рекомендация (`electron/main.ts:94`).
- Основной export encoder — ffmpeg, обычно libx264; WebCodecs encoder выбирается явно (`src/engine/exporter.ts:206`). WebCodecs decode — другая стадия.
- Генерируемый `~/kadr-fragments` не является `src/` этого репозитория (`electron/fragments.ts:23`).
- Windows-пути поддержаны местами; POSIX-запуск CLI остаётся отдельным долгом (`electron/claude.ts:194`, `electron/claude.ts:322`).

## Open Questions

- Как безопасно усилить изоляцию страницы, не потеряв прямой транспорт кадров?
- Какая платформенная матрица обязательна для CLI, Python и fragment tooling?

## Навигация

⬆ [Specs](../README.md) · ↔ [Архитектура](DESKTOP_ARCHITECTURE.md).
Сквозные L1: [PROJECT_MODEL](../shared/PROJECT_MODEL.md), [INTEGRATIONS](../shared/INTEGRATIONS.md), [DEPENDENCIES](../shared/DEPENDENCIES.md), [SECURITY](../shared/SECURITY.md).
