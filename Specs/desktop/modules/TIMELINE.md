---
title: "Таймлайн, дорожки и редактирование клипов"
level: L3
type: module
stack: renderer
parent: ../layers/RENDERER.md
related: [../patterns/UNDO_AND_STATE.md, ../patterns/UI_CONVENTIONS.md, ../patterns/TESTING.md, ../../shared/PROJECT_MODEL.md, ./PROJECT_IO.md, ./PREVIEW_AND_GPU.md, ./ANIMATION_AND_EFFECTS.md, ./MUSIC_AND_SOUNDS.md]
sources: [src/components/Timeline.tsx, src/engine/timelineMath.ts, src/state/store.ts, src/engine/player.ts, shared/types.ts, scripts/check-timeline.mjs, scripts/e2e6.mjs, scripts/e2e10.mjs, scripts/e2e51.mjs, FEATURES.md]
status: draft
updated: 2026-11-03
---

# Таймлайн, дорожки и редактирование клипов

> **Когда читать:** При изменении drag/trim/speed, дорожек, маркеров, zoom, waveforms или производительности большого монтажа. Родитель: [Renderer](../layers/RENDERER.md).

## Назначение и границы

Таймлайн отображает модель проекта и переводит жесты в store actions.
`Timeline.tsx` владеет интеракцией и видимой геометрией; `timelineMath.ts` — чистыми вычислениями.
`store.ts` владеет изменением клипов, связями и историей; player использует тот же порядок дорожек.
Входы: `Project`, selection, playhead, range, zoom, scroll-пиксели и pointer/wheel/drop.
Выходы: новая модель, история, выбранный диапазон и позиция воспроизведения.
Таймлайн не является отдельной сохраняемой моделью и не декодирует медиа для экспорта.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Считать время в секундах, а не display-пикселях | Zoom не должен менять монтаж | ✅ переводить координаты на границе UI; ❌ хранить clip.start в px | `shared/types.ts:2`, `src/components/Timeline.tsx:189` |
| `tracks[0]` — верхний видеослой | Player рисует дорожки с конца массива | ✅ добавлять верхнюю дорожку с учётом порядка; ❌ считать индекс 0 фоном | `src/engine/player.ts:67` |
| Одна дискретная операция — одна запись истории | Pointermove не должен заполнить 50 шагов одним drag | ✅ history до жеста; ❌ push на каждую мутацию | `src/state/store.ts:700`, `src/components/Timeline.tsx:985` |
| Менять скорость связанных клипов совместно и не трогать locked | AV-пара и её анимация должны остаться синхронны | ✅ `setClipSpeed`; ❌ менять только `clip.speed` | `src/state/store.ts:1284` |
| Сохранять якорь противоположного края speed-drag | Левый край меняет start, правый сохраняет начало | ✅ optional start и пересчёт длительности; ❌ скачок обоих краёв | `src/state/store.ts:1293`, `src/components/Timeline.tsx:1833` |
| Culling сохраняет selection вне окна | Перетаскиваемый клип нельзя размонтировать под pointer | ✅ view с запасом плюс selected; ❌ фильтр только по viewport | `src/components/Timeline.tsx:956` |
| Zoom-жест сначала растягивает, потом коммитит | Полный raster на каждом wheel тормозит большие проекты | ✅ commit с сохранением anchor time; ❌ повторно вычислять якорь из округлённого scroll | `src/components/Timeline.tsx:233`, `src/components/Timeline.tsx:271` |
| Waveform и overlap должны совпадать с прежней математикой | Ускорение не должно расширять щелчки или терять зоны | ✅ exact maxima и sweep; ❌ грубая merged-bin pyramid | `src/engine/timelineMath.ts:12`, `src/engine/timelineMath.ts:97` |

## Поток редактирования

1. Позиция pointer переводится через scroll и zoom в секунды проекта.
2. Snap использует края клипов, playhead и маркеры; исключения предотвращают snap на самого себя.
3. Начало операции фиксирует undo; дальнейшие движения вызывают низкоуровневые mutations.
4. Связанные AV-клипы изменяются через общий `linkId`; locked-дорожки исключаются.
5. Новая ссылка project обновляет timeline, preview и dirty-индикатор.
6. При отпускании pointer заканчивается жест; сериализация выполняется Project IO, не UI таймлайна.

Скорость UI ограничена ×0.02–×100: `src/components/Timeline.tsx:937`.
Это не диапазон HTMLMediaElement: preview отдельно ограничивает playbackRate и корректирует seek.
`setClipSpeed` масштабирует анимацию через `rescaleClipAnims`, меняет duration и при необходимости start.
Вставка нескольких ассетов идёт встык одним действием `insertClipsFromAssets`; аудио направляется на аудиодорожку.
Маркер хранится в `project.markers`, а не внутри дорожки: `shared/types.ts:206`.

## Отрисовка и хранение

- Видимые секунды выводятся из scroll-пикселей в render, а не удерживаются старым диапазоном при zoom.
- Для короткого контента culling отключён; порог — четыре экрана: `src/components/Timeline.tsx:966`.
- Запас culling — половина экрана, минимум две секунды; выбранные клипы всегда остаются.
- `ClipView` memoized; получает видимый срез клипа: `src/components/Timeline.tsx:1527`.
- Клип уже 6 px сокращается до одного элемента: `src/components/Timeline.tsx:1913`.
- Wheel commit — через 150 ms тишины, при выходе масштаба за 0.5–2× либо перед pointerdown: `src/components/Timeline.tsx:288`.
- `waveWindow` держит максимум три окна вычислений, не изменяя сохранённый waveform: `src/engine/timelineMath.ts:23`.
- Клипы, дорожки, ключи и маркеры сохраняются в `.kadr`; DOM-culling и текущий жест — transient.

## Ошибки и отмена

Undo/redo отменяет результат законченного редактирования; не является отменой внешнего ffmpeg-процесса.
Locked-дорожка запрещает редактирование связанных партнёров в `setClipSpeed`: `src/state/store.ts:1290`.
Range/selection/playhead не должны переживать загрузку другого проекта: `src/state/store.ts:693`.
Жест zoom при unmount не вызывает commit через `flushSync`: `src/components/Timeline.tsx:311`.
Ошибки media intake обрабатывает [Media import](MEDIA_IMPORT.md), а не геометрия таймлайна.

## Переиспользуемое

| Задача | Использовать | Причина |
|---|---|---|
| Найти клип и дорожку | `findClip`, `src/state/store.ts:71` | Единый поиск по проекту |
| Учитывать AV-связи | `withLinked`, `src/state/store.ts:244` | Не дублировать обход linkId |
| Получить snap-цели | `snapPoints`, `src/state/store.ts:262` | Общие края, playhead и маркеры |
| Изменить speed | `setClipSpeed`, `src/state/store.ts:1284` | Ключи, fades, linked и lock |
| Построить waveform | `waveColumns`, `src/engine/timelineMath.ts:53` | Exact per-pixel maxima |
| Зоны переходов | `trackOverlaps`, `src/engine/timelineMath.ts:97` | Один sweep по сортировке |

## Эталонные реализации

- Отбор near+selection: `src/components/Timeline.tsx:968`.
- Linked speed и пересчёт clip-local анимации: `src/state/store.ts:1284`.
- Порядок слоёв: `videoLayersAt`, `src/engine/player.ts:67`.

## Проверки

- `node scripts/check-timeline.mjs` сравнивает оптимизированные waveform/overlap с медленным эталоном; приложение не требуется.
- `scripts/e2e6.mjs:1`, `scripts/e2e10.mjs:1` — linked AV, speed/trim, snapping и track motion.
- `scripts/e2e51.mjs:1` — pool, culling и zoom; **не запускать поверх пользовательского проекта**, см. долг ниже.
- Тесты при подготовке документа не запускались; prerequisites — [Testing](../patterns/TESTING.md).

## Текущее состояние / долг

- Историческая карта обещает guard e2e51, но `scripts/e2e51.mjs:94` лишь читает `clipsOpen`; затем `scripts/e2e51.mjs:106` без проверки вызывает `setProject`.
- Упоминание `KADR_E2E_FORCE` в комментарии этого suite не является действующей защитой.
- Пороговые оптимизации — текущее поведение, не разрешение менять видимую математику ради скорости.

## Open Questions

- Исправление отсутствующего guard e2e51 требует отдельной правки кода; здесь оно только зарегистрировано.
- Нужны ли отдельные измерения порогов culling/zoom на Windows? Числа исходной карты не являются новым benchmark.

## Навигация

⬆ [Renderer](../layers/RENDERER.md) · ↔ [Project IO](PROJECT_IO.md), [Preview/GPU](PREVIEW_AND_GPU.md), [Animation](ANIMATION_AND_EFFECTS.md), [Музыка](MUSIC_AND_SOUNDS.md).
Паттерны: [Undo/state](../patterns/UNDO_AND_STATE.md), [UI](../patterns/UI_CONVENTIONS.md), [Testing](../patterns/TESTING.md).
