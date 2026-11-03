---
title: "Анимация, маски, эффекты и переходы"
level: L3
type: module
stack: renderer
parent: ../layers/RENDERER.md
related: [../layers/SHARED.md, ../patterns/UNDO_AND_STATE.md, ../patterns/RENDER_PIPELINE.md, ../patterns/UI_CONVENTIONS.md, ../patterns/TESTING.md, ../../shared/PROJECT_MODEL.md, ./TIMELINE.md, ./PREVIEW_AND_GPU.md, ./EXPORT.md, ./FRAGMENTS.md]
sources: [shared/types.ts, src/engine/anim.ts, src/components/animUtils.ts, src/components/AnimEditor.tsx, src/components/TrackMotionEditor.tsx, src/components/Inspector.tsx, src/state/store.ts, src/engine/player.ts, src/engine/exporter.ts, src/gl/compositor.ts, src/gl/transitions.ts, src/gl/edges.ts, src/gl/glow.ts, FEATURES.md]
status: draft
updated: 2026-11-03
---

# Анимация, маски, эффекты и переходы

> **Когда читать:** При изменении Anim/keyframes, Inspector/AnimEditor, crop/shapes, GLSL-эффектов и времени переходов. Родитель: [Renderer](../layers/RENDERER.md).

## Назначение и границы

Модуль превращает сохраняемые параметры клипа/дорожки в значения для общего GL compositor.
Входы: `Anim`, keyframes, локальное/проектное время, transforms, masks, effects и transitions.
Выходы: численные параметры слоя, FBO-проходы и изменённые store-данные после UI-жестов.
`AnimEditor` редактирует ключи и stage; `Inspector` — численные свойства и стек эффектов.
3D-наклон слоя не равен mesh import из [Models 3D](MODELS_3D.md).
Общий pipeline preview/export описан в [Render pipeline](../patterns/RENDER_PIPELINE.md).

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Хранить параметр как `Anim {value,keyframes?}` | Одна форма нужна статике и анимации; scalar допускается только защитой входа | ✅ нормализовать scalar; ❌ вводить другой тип для каждого UI | `shared/types.ts:58`, `src/engine/anim.ts:12` |
| Ключи клипа считать clip-local seconds | Перемещение клипа не должно сдвигать его внутреннюю анимацию | ✅ `t - clip.start`; ❌ абсолютное project time в ключах клипа | `shared/types.ts:50`, `src/engine/player.ts:437` |
| Motion дорожки считать в project seconds | Общий пролёт должен быть независим от начала каждого клипа | ✅ `evalAnim(motion.x,t)`; ❌ локальное время одного клипа | `shared/types.ts:77`, `src/engine/player.ts:452` |
| Вычислять анимацию общим `evalAnim` | Easing, hold и smooth должны совпадать в preview/export | ✅ единая evaluator-функция; ❌ CSS-анимация как источник экспортного движения | `src/engine/anim.ts:12`, `src/engine/player.ts:445` |
| Сохранять auto-key semantics через helpers | Keyframed параметр записывает текущее состояние, static не обязан создавать ключ | ✅ `applyValue/upsertKf`; ❌ потерять easing существующего ключа | `src/components/animUtils.ts:11`, `src/components/animUtils.ts:24` |
| Маски укладывать в лимит compositor | Shader принимает не более восьми фигур | ✅ `MAX_SHAPES`, crop 0–0.5; ❌ обещать произвольное число видимых масок | `src/gl/compositor.ts:240`, `src/gl/compositor.ts:514`, `src/engine/player.ts:441` |
| Эффекты вычислять в общем layer pass и clip-local time | Smoke/fades должны повторяться при offline render | ✅ `drawLayerFx(...,rel)`; ❌ время wall clock для glow | `src/engine/player.ts:482`, `src/gl/compositor.ts:648` |
| Отличать overlap transition от edge tip по duration | Одинаковое поле обслуживает два механизма | ✅ duration ≤0.001 — overlap selector; ❌ считать любой transitionIn торцом | `src/engine/player.ts:390` |
| Учитывать undo в начале UI-редактирования | Низкоуровневое изменение не обязано само делать snapshot | ✅ onFocus/onPointerDown один раз; ❌ история на каждый tick слайдера | `src/components/Inspector.tsx:31`, `src/components/Inspector.tsx:317` |

## Вычисление и поток данных

1. UI получает клип из store и редактирует `Anim` либо `Effect.params`.
2. `upsertKf` заменяет близкий ключ с `KF_EPS = 0.02`, сортирует и сохраняет его easing.
3. `evalAnim` ограничивает время крайними ключами; между ними использует easing первого ключа интервала.
4. Smooth-ветка применяет собственное сглаживание, включая Catmull-Rom при нескольких ключах: `src/engine/anim.ts:28`.
5. `drawClipLayer` оценивает transform/crop/shapes в `rel`, motion дорожки в `t`.
6. Opacity умножается на fades и прозрачность track: `src/engine/player.ts:464`.
7. Enabled glow и первый enabled blur идут через `drawLayerFx`; blur нормализован на высоту проекта.
8. При overlap два верхних активных клипа дорожки рисуются в отдельные FBO и смешиваются.

Crop работает вместе с фигурами; старое одиночное `maskShape` читается как fallback массива.
Обычные фигуры объединяются, inverted вычитаются; shader ограничивает загрузку первыми восемью фигурами.
Реестры GLSL находятся в `src/gl/transitions.ts`, `src/gl/edges.ts`, `src/gl/glow.ts`, не в UI.
Число пунктов меню вместе с `none` не равно числу overlap shaders; не закреплять счётчик из FEATURES как API.

## Motion blur и frame blending

Offline motion blur использует восемь sub-samples для 180° shutter: `src/engine/exporter.ts:191`.
Статичная сигнатура может схлопнуть их в один draw; `KADR_FORCE_FULL_SHUTTER` отключает оптимизацию: `src/engine/exporter.ts:342`.
`holdSources(true)` удерживает уже декодированные текстуры между samples: `src/gl/compositor.ts:560`.
Transforms/masks/motion продолжают оцениваться в каждом sub-sample; blur не равен размазыванию итогового PNG.
Frame blending интерполирует source frames отдельно; alpha sources исключены из-за неверного результата alpha stacking: `src/engine/exporter.ts:586`.
Опции offline shutter не означают постоянный motion blur в real-time preview.

## Хранение, ошибки и отмена

- Anim, masks, effects и transitions принадлежат клипу в `.kadr`; motion принадлежит track.
- Presets поз/эффектов — отдельные пользовательские stores, не embedded project policy; см. [Undo/state](../patterns/UNDO_AND_STATE.md).
- Speed-изменение масштабирует clip-local keys/fades, trim использует общие helpers: `src/state/store.ts:1284`.
- Scalar/нечисленные значения защищаются `evalAnim`; healing входного проекта выполняет `sanitizeProject`.
- Эта защита не заменяет валидацию порядка/формы произвольного массива keyframes.
- Отмена правки — история редактора; отмена тяжёлого offline render принадлежит Export.
- Ошибка кадра логируется Player и не убивает playback: `src/engine/player.ts:679`.

## Переиспользуемое

| Задача | Использовать | Где |
|---|---|---|
| Оценить параметр | `evalAnim` | `src/engine/anim.ts:12` |
| Создать/заменить ключ | `upsertKf`, `applyValue`, `resetValue` | `src/components/animUtils.ts:11` |
| Обойти все Anim клипа | `forEachAnim` | `src/state/store.ts:185` |
| Перепривязать ключи при trim/speed | `shiftClipAnims/rescaleClipAnims` | `src/state/store.ts:220`, `src/state/store.ts:233` |
| Сменить speed с rebinding | `setClipSpeed` | `src/state/store.ts:1284` |
| Нарисовать эффекты слоя | `drawLayerFx` | `src/gl/compositor.ts:648` |

## Эталонные реализации

- `drawClipLayer` — единицы, clocks и общий path для разных clip kinds: `src/engine/player.ts:423`.
- Overlap pair, progress и FBO-порядок: `src/engine/player.ts:390`.
- `applyValue` — единая auto-key семантика clip/track editor: `src/components/animUtils.ts:24`.

## Проверки

- `scripts/e2e6.mjs:1`, `scripts/e2e7.mjs:1`, `scripts/e2e8.mjs:1` — rebinding, masks, easing, auto-key.
- `scripts/e2e11.mjs:1`, `scripts/e2e12.mjs:1` — track motion и perspective-correct layer transform.
- `scripts/e2e13.mjs:1`, `scripts/e2e14.mjs:1` — overlap/edge transitions; `scripts/e2e18.mjs:1` — shutter blur.
- `scripts/e2e19.mjs:1`, `scripts/e2e30.mjs:1`, `scripts/e2e21.mjs:1` — glow, Gaussian blur, frame blending.
- Preset suites трогают реальное user data: backup/restore обязателен по [Testing](../patterns/TESTING.md).
- Перечень проверен по файлам; тесты не запускались.

## Текущее состояние / долг

- При ≥3 overlapping clips transition строится только для двух верхних; остальное рисуется обычными слоями.
- Effect params здесь не являются универсальным Anim-графом: нельзя обещать keyframes для любого параметра эффекта.
- `evalAnim` ожидает упорядоченные ключи; редактор сортирует их, sanitize фильтрует broken numbers, но не строит новый evaluator.

## Open Questions

- Нужна ли явная нормализация сортировки/дубликатов ключей чужих проектов на входе?
- Нужна ли единая спецификация порядка нескольких blur/glow? Расширение стека требует отдельного решения.

## Навигация

⬆ [Renderer](../layers/RENDERER.md) · ↔ [Модель](../../shared/PROJECT_MODEL.md), [Timeline](TIMELINE.md), [Preview](PREVIEW_AND_GPU.md), [Export](EXPORT.md), [Fragments](FRAGMENTS.md).
Паттерны: [Undo/state](../patterns/UNDO_AND_STATE.md), [Render](../patterns/RENDER_PIPELINE.md), [UI](../patterns/UI_CONVENTIONS.md), [Testing](../patterns/TESTING.md).
