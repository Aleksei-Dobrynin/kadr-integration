---
title: "Слой renderer: UI, состояние и движок"
level: L2
type: layer
stack: renderer
parent: ../DESKTOP_CORE.md
related: [./PRELOAD.md, ./SHARED.md, ../DESKTOP_ARCHITECTURE.md]
sources: [docs/reference/AGENTS-before-specs.md, src/main.tsx, src/state/store.ts, src/engine/player.ts, src/engine/exporter.ts, src/engine/log.ts]
status: draft
updated: 2026-11-03
---

# Слой renderer: UI, состояние и движок

> **Когда читать:** При изменении React-компонентов, store, timeline, preview и orchestration экспорта. Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md).

## Граница слоя

`src/components/` — взаимодействие и отображение; `src/state/store.ts` — состояние
редактора и действия; `src/engine/` — операции, playback и offline orchestration;
`src/gl/` — композитинг. Это существующая структура, не новые обязательные классы.
Прямые системные операции доступны через preload, а не импортом main.
`src/main.tsx` сначала подключает log, затем wiring и scripting surface, затем React
(`src/main.tsx:45`, `src/main.tsx:71`, `src/main.tsx:100`).

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Внешний проект устанавливать через `setProject` | Загруженные/AI данные требуют лечения и сброса transient state | ✅ sanitization; ❌ заменить project, оставив старую selection/history | `src/state/store.ts:693` |
| Историю и копирование брать из существующего store | Undo и большие waveforms чувствительны к лишним копиям | ✅ существующие действия; ❌ JSON clone в каждом UI handler | `src/state/store.ts:664`, `src/state/store.ts:700` |
| Пользовательские сбои направлять в session log | Console не объясняет пользователю, почему операция не сработала | ✅ `logWarn/logError`; ❌ только console.warn | `src/engine/log.ts:68` |
| Не создавать отдельный renderer экспорта | WYSIWYG требует общего вычисления изображения | ✅ `drawFrame`; ❌ копия layout/effects в export UI | `src/engine/player.ts:354`, `src/engine/exporter.ts:349` |
| Различать detach preview и dispose throwaway ресурсов | Canvas повторно выдаёт тот же GL context | ✅ сохранить preview compositor; ❌ убить его при React remount | `src/engine/player.ts:714` |
| Привязывать часы к окну canvas | Preview переносится в другой document | ✅ ownerDocument.defaultView; ❌ захваченный исходный window навсегда | `src/engine/player.ts:699` |

Подробная политика истории принадлежит [UNDO_AND_STATE](../patterns/UNDO_AND_STATE.md),
стилей и модальных окон — [UI_CONVENTIONS](../patterns/UI_CONVENTIONS.md).
Слой задаёт владельца, не повторяет все предметные алгоритмы этих документов.

## Жизненный цикл и ошибки

React root использует StrictMode: эффекты и подписки должны переносить remount
(`src/main.tsx:100`). Подписка preload возвращает disposer (`electron/preload.ts:230`).
Preview detach освобождает media pool, но не уничтожает контекст canvas
(`src/engine/player.ts:723`). Export создаёт отдельный canvas и проверяет потерю
контекста, чтобы не объявить чёрные кадры успехом (`src/engine/exporter.ts:179`, `src/engine/exporter.ts:327`).

Session log — ограниченное состояние памяти; закрытие окна его теряет,
INFO не поднимает unseen failures (`src/engine/log.ts:8`, `src/engine/log.ts:27`, `src/engine/log.ts:58`).
Это не аудит на диске и не серверный лог.

## Переиспользуемое

| Работа | Точка повторного использования | Код |
|---|---|---|
| Состояние проекта | `useEditor` | `src/state/store.ts:675` |
| Анимация | `evalAnim`, существующая семантика clip-local | `src/engine/anim.ts:12` |
| Кадр | `drawFrame`, `MediaPool` | `src/engine/player.ts:354`, `src/engine/exporter.ts:184` |
| Automation | `window.kadrEditor` с реальными engine operations | `src/main.tsx:71` |
| Пользовательская диагностика | `logInfo/logWarn/logError` | `src/engine/log.ts:68` |
| Файлы и ОС | `window.kadr` | `electron/preload.ts:21` |

## Эталонные реализации

- Composition root и порядок log-first wiring: `src/main.tsx:45`.
- Установка проекта с обнулением transient state: `src/state/store.ts:693`.
- Отказ второго export с finally-сбросом activity: `src/engine/exporter.ts:125`.

## Текущее состояние / долг

- Scripting surface выставлена через `any`, не равна строго типизированному IPC API (`src/main.tsx:71`).
- «Renderer» здесь не означает sandbox обычного сайта: preload и editor делят context (`electron/preload.ts:242`).
- Прямые пользовательские настройки и проект имеют разные persistence/undo режимы; не включать все Zustand stores в историю проекта.
- Совпадение preview/export ограничено общей монтажной семантикой: UI overlays и encode/масштабирование — отдельные стадии.

## Open Questions

- Как типизировать automation surface без создания второго набора engine API?
- Какие сбои main должны попадать в общий session log автоматически?

## Навигация

⬆ [DESKTOP_CORE](../DESKTOP_CORE.md) · ↔ [PRELOAD](PRELOAD.md), [SHARED](SHARED.md).
⬇ [TIMELINE](../modules/TIMELINE.md), [PREVIEW_AND_GPU](../modules/PREVIEW_AND_GPU.md), [DIAGNOSTICS](../modules/DIAGNOSTICS.md), [TESTING](../patterns/TESTING.md).
