---
title: "Архитектура desktop: процессы и границы доверия"
level: L1
type: architecture
stack: desktop
parent: ../README.md
related: [./DESKTOP_CORE.md, ./layers/MAIN_PROCESS.md, ./layers/PRELOAD.md, ./layers/RENDERER.md, ./layers/SHARED.md, ./layers/PYTHON.md]
sources: [docs/reference/AGENTS-before-specs.md, electron/main.ts, electron/preload.ts, electron/claude.ts, electron/fragments.ts, src/engine/exporter.ts]
status: draft
updated: 2026-11-03
---

# Архитектура desktop: процессы и границы доверия

> **Когда читать:** При изменении IPC, export, AI bridge, workspace или владельца ресурса. Родитель: [Specs](../README.md); маршрут задач: [DESKTOP_CORE](DESKTOP_CORE.md).

## Граф зависимостей и исполнения

```text
shared/types + переносимые функции
       ↑             ↑                    ↑
renderer src/     preload.ts          main electron/
React/Zustand  →  window.kadr  → IPC → ОС, файлы, userData
engine + GL       [тот же процесс]       │
   │                  │                 ├─ ffmpeg/ffprobe, Python
   │                  └─ ffmpeg stdin   ├─ Vite/Remotion workspace
   ├─ fragment iframe / capture ←───────┘
   └─ window.kadrEditor ← executeJavaScript ← /eval ← MCP ← Claude CLI
```

Стрелка к shared означает импорт, к IPC/HTTP — вызов, а не общий heap.
Preload — отдельная сборка, но не самостоятельный процесс.
Main не импортирует React store: AI bridge вызывает операции в живой странице.
Проверяемые точки: `electron.vite.config.ts:16`, `electron/preload.ts:21`,
`src/main.tsx:71`, `electron/claude.ts:174`.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Сохранять зависимости shared → без ОС/UI | Иначе общие алгоритмы нельзя независимо исполнять | ✅ builder аргументов без spawn; ❌ Electron import в DSP | `shared/rawEncode.ts:19`, `shared/ttsText.ts:1` |
| Не обходить capability-токен `kadr://` | CORS-привилегии дают доступ к локальным файлам | ✅ `fileUrl`; ❌ URL без токена | `electron/preload.ts:76`, `electron/main.ts:254` |
| Не ослаблять защиту `/eval` | Выполнение JS в editor открывает привилегированный API | ✅ token header и отказ Origin; ❌ доверять только localhost | `electron/claude.ts:165` |
| Preview и export используют общий compositor | Различаться должны режим исполнения и encode, не смысл монтажа | ✅ `drawFrame`; ❌ отдельная геометрия рендера | `src/engine/player.ts:354`, `src/engine/exporter.ts:363` |
| Различать generated workspace и исходники редактора | Исправление только сгенерированного файла не переживёт sync | ✅ правка шаблона; ❌ искать repo `src/_kadr` | `electron/fragments.ts:15`, `electron/fragments.ts:339` |
| Отмена принадлежит владельцу внешнего процесса | Promise страницы сам по себе не останавливает работу ОС | ✅ явный cancel IPC; ❌ только скрыть progress | `src/engine/exporter.ts:115`, `electron/main.ts:296` |

## Границы процессов и доверия

| Участник | Ресурсы / полномочия | Граница |
|---|---|---|
| Editor renderer | DOM, WebGL, WebAudio, store, `window.kadr` | Привилегированная локальная страница, не обычный сайт |
| Preload | Node spawn прямого encoder, Electron IPC | Общий JS context в текущей конфигурации |
| Main | ОС, диалоги, протокол, настройки, внешние сервисы | IPC и файловые операции |
| Fragment page | Код пользовательской композиции | Другой origin; не равен доверенному editor |
| Capture BrowserWindow | Offscreen-отрисовка/inspect/collision | Создаётся и уничтожается main |
| CLI/MCP | Команды автоматизации и вызовы `/eval` | Сессионный token, loopback HTTP |
| Python / ffmpeg | CPU/ML/медиапреобразования | Дочерние процессы, stdout/stderr, exit code |

Fragment page — код из проекта, потенциально чужой; localhost не является
доказательством доверия. Отдельный origin не отменяет capability-защиту файлов.
`setWindowOpenHandler` разрешает только окно с предусмотренным `frameName`
(`electron/main.ts:121`), но **не проверяет caller origin или destination URL**.
Это name-only фильтр, не доказанный запрет окон для fragment-origin; отсутствие
sandbox у fragment iframe не усиливает эту границу (`src/components/FragmentOverlays.tsx:327`).
Ключи и политики секретов принадлежат [SECURITY](../shared/SECURITY.md).

## Путь изображения и звука

1. Renderer читает `Project`, вычисляет видимые слои и время источников.
2. Preview использует GL и, где допустимо, iframe overlay; export материализует фрагменты в медиа (`src/engine/exporter.ts:143`).
3. Offline decode использует WebCodecs, если поддержан источник, иначе fallback (`src/engine/exporter.ts:193`).
4. `drawFrame` рисует в размерах проекта; масштабирование до preset выполняется далее (`src/engine/exporter.ts:171`).
5. По умолчанию raw RGBA идёт в preload-spawned ffmpeg; обычный H.264 — libx264 (`src/engine/exporter.ts:238`, `shared/rawEncode.ts:35`).
6. Опциональный encoder `webcodecs` использует VideoEncoder и mp4-muxer; это не основной путь (`src/engine/exporter.ts:206`).
7. Main выполняет финальный audio mix/mux; для STT применяется тот же mixdown-механизм (`electron/transcribe.ts:24`).

## Переиспользуемое

| Concern | Владелец нормы / реализации |
|---|---|
| Модель и единицы времени | [PROJECT_MODEL](../shared/PROJECT_MODEL.md), `shared/types.ts:2` |
| Zero-copy и готовность буфера | [PRELOAD](layers/PRELOAD.md), `electron/preload.ts:45` |
| Общая композиция и GPU | [RENDER_PIPELINE](patterns/RENDER_PIPELINE.md), `src/engine/player.ts:354` |
| Завершение процессов | [PROCESS_LIFECYCLE](patterns/PROCESS_LIFECYCLE.md), `electron/main.ts:296` |
| Внешние зависимости | [DEPENDENCIES](../shared/DEPENDENCIES.md), [INTEGRATIONS](../shared/INTEGRATIONS.md) |

## Эталонные реализации

- Сборочные границы main/preload/renderer: `electron.vite.config.ts:16`.
- Токенизированный файл с Windows-normalization: `electron/main.ts:252`.
- Контракт Python через NDJSON: `electron/voice.ts:58`.
- Workspace entry `src/_entries/current.tsx` генерируется: `electron/fragments.ts:724`.

## Текущее состояние / долг

- Изоляция editor отключена ради прямого encode: это технический компромисс, не security best practice (`electron/main.ts:100`).
- В exporter остались вводные комментарии про старые encode/IPC маршруты; действующий выбор виден в `src/engine/exporter.ts:206` и `src/engine/exporter.ts:240`.
- Сохранение проекта обычной командой — прямой write; атомарный autosave реализован отдельно (`electron/main.ts:815`, `electron/main.ts:822`). Не объявлять все записи атомарными.
- CLI использует `/bin/sh` и `/bin/bash`; `/proc` sweep вне Linux возвращает 0 (`electron/claude.ts:80`, `electron/claude.ts:194`, `electron/claude.ts:322`).
- У fragment cancel уже есть ветка `taskkill`; наличие этой ветки не доказывает переносимость всех подсистем (`electron/fragments.ts:838`).

## Open Questions

- Какой trust model требуется для открытия чужих проектов и fragment-кода?
- Какой контракт восстановления после renderer crash должен быть гарантирован на каждой ОС?

## Навигация

⬆ [Specs](../README.md) · ↔ [DESKTOP_CORE](DESKTOP_CORE.md).
⬇ [MAIN_PROCESS](layers/MAIN_PROCESS.md), [PRELOAD](layers/PRELOAD.md), [RENDERER](layers/RENDERER.md), [SHARED](layers/SHARED.md), [PYTHON](layers/PYTHON.md).
