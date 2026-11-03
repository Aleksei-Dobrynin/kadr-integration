---
title: "Превью, часы воспроизведения и GPU"
level: L3
type: module
stack: renderer
parent: ../layers/RENDERER.md
related: [../patterns/RENDER_PIPELINE.md, ../patterns/PROCESS_LIFECYCLE.md, ../patterns/TESTING.md, ./TIMELINE.md, ./EXPORT.md, ./FRAGMENTS.md, ./ANIMATION_AND_EFFECTS.md, ./DIAGNOSTICS.md]
sources: [src/engine/player.ts, src/engine/audio.ts, src/engine/popout.ts, src/engine/onion.ts, src/components/OnionSkin.tsx, src/components/Preview.tsx, src/components/AudioMeter.tsx, src/gl/compositor.ts, src/engine/exporter.ts, electron/gpu.ts, scripts/e2e35.mjs, scripts/e2e43.mjs, scripts/e2e51.mjs, FEATURES.md]
status: draft
updated: 2026-11-03
---

# Превью, часы воспроизведения и GPU

> **Когда читать:** При изменении playback, MediaPool, WebGL-контекста, snapshots или отдельного окна превью. Родитель: [Renderer](../layers/RENDERER.md).

## Назначение и границы

`Player` связывает store, rAF-часы, media elements, WebAudio и `Compositor`.
`drawFrame` используется превью и offline export; общий контракт — [Render pipeline](../patterns/RENDER_PIPELINE.md).
Входы: project, playhead, playing, canvas, decoded/captured источники.
Выходы: пиксели canvas, звук, новый playhead, loading/GPU-lost и диагностические счётчики.
Remotion overlay/capture принадлежит [Fragments](FRAGMENTS.md); offline encoding — [Export](EXPORT.md).

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Проецировать время из фиксированного якоря | Сумма frame deltas накапливает дрожание таймера | ✅ anchor time + elapsed; ❌ каждый кадр прибавлять измеренный dt | `src/engine/player.ts:730` |
| Ошибка кадра не останавливает rAF | Один повреждённый клип не должен сломать всю сессию | ✅ catch с повторным schedule; ❌ выход из цикла после исключения | `src/engine/player.ts:679` |
| Ограничивать MediaPool окрестностью playhead | Старые elements и audio nodes увеличивают нагрузку до конца проекта | ✅ `evictExcept(clipsAround(...))`; ❌ хранить всё когда-либо проигранное | `src/engine/player.ts:127`, `src/engine/player.ts:773` |
| При release отключать WebAudio | Удалённый media element сам по себе не разрывает аудиограф | ✅ `detachAudio`; ❌ только убрать элемент из Map | `src/engine/player.ts:235` |
| Не reseek во время seek; ограничивать playbackRate | Иначе декодер штормит, а Chromium бросает исключение | ✅ clamp 0.0625–16 и `!seeking`; ❌ прямое присваивание ×100 | `src/engine/player.ts:801` |
| Не dispose preview compositor при detach | Canvas повторно выдаёт тот же контекст, который dispose теряет | ✅ оставить контекст canvas; ❌ `loseContext` при remount | `src/engine/player.ts:714`, `src/gl/compositor.ts:984` |
| Export-контекст освобождать, потерю проверять явно | Потерянный GL молча возвращает старые/чёрные пиксели | ✅ `contextLost` и throw; ❌ считать readPixels доказательством успеха | `src/gl/compositor.ts:967`, `src/engine/exporter.ts:327` |
| Popout переносит один host, не пересоздаёт preview | Иначе теряются canvas, GL и iframe-состояние | ✅ adopt `previewHost`; ❌ второй React preview с новым canvas | `src/engine/popout.ts:34`, `src/engine/popout.ts:140` |
| Часы и наблюдатели следуют document canvas | Окно редактора может быть свёрнуто, пока popup виден | ✅ ownerDocument/defaultView; ❌ всегда исходный window.rAF | `src/engine/player.ts:698`, `src/components/AudioMeter.tsx:100` |

## Поток данных

1. `attach` создаёт compositor и подписки на потерю/возврат контекста: `src/engine/player.ts:641`.
2. Tick читает store, пересоздаёт anchor при внешнем scrub и вычисляет project seconds.
3. `syncMedia` выбирает визуальные и audible клипы; получает элементы из pool и применяет gain/fades.
4. `clipSourceTime` определяет source time с учётом inPoint/speed/loop; playback корректируется относительно master clock.
5. `drawFrame` вычисляет слои и передаёт текстуры/захваченные пиксели в GL.
6. Каждые 30 ticks pool оставляет клипы из окна; каждые 120 ticks compositor собирает неиспользуемые ресурсы.

`clipsAround` держит клипы, начинающиеся в ближайшие 8 секунд или закончившиеся не более 3 секунд назад.
Это окно **клипов**, не лимит числом elements и не максимальная длина активного клипа.
Во время паузы неизменный кадр рисуется реже после стабилизации: `src/engine/player.ts:756`.
`drawNow` существует для snapshots, которым нельзя ждать rAF скрытого окна: `src/engine/player.ts:633`.

## Владение ресурсами, хранение и ошибки

- Pool и GL textures — оперативные ресурсы; в `.kadr` не сериализуются.
- Геометрия popout хранится в localStorage `kadr.previewWindow`: `src/engine/popout.ts:24`.
- Popout — same-origin `about:blank`; один host переносится обратно до разрушения документа.
- Стили зеркалируются и обновляются; shutdown редактора закрывает popup: `src/engine/popout.ts:82`, `src/engine/popout.ts:106`.
- Ошибка открытия popup логируется и возвращает `false`, основной preview не заменяется: `src/engine/popout.ts:114`.
- Context loss вызывает `preventDefault`, UI-флаг и deferred restore с заранее взятым extension handle: `src/engine/player.ts:651`.
- Context restored пересоздаёт программы/буферы compositor; это восстановление ресурсов, не замена живого canvas.
- Остановка playback/`detach` снимает цикл и pool; это не отмена offline export.
- Выбор GPU находится в `electron/gpu.ts`; renderer не должен обещать, что discrete всегда быстрее.

## Onion skin — только ориентир превью

- **Правило:** onion — UI-наложение footage в preview, не слой Project/drawFrame. **Почему:** это ориентир для совмещения 3D с видео, а не часть итогового монтажа. ✅ overlay в `OnionSkin`; ❌ включить guide в snapshot/export или compositor. Эталон: `src/engine/onion.ts:7`, `src/components/OnionSkin.tsx:1`.
- **Правило:** выбор fragment для изменения params не меняет закреплённую reference-footage. **Почему:** работа с фрагментом и просмотр guide идут одновременно. ✅ переключать ref только на выбранный `isFootage`; ❌ брать произвольный selection[0]. Эталон: `src/engine/onion.ts:94`.
- Initial pick: выбранное footage → footage под playhead → ближайшее footage. При удалении reference подобрать другое или выключить; source time вычисляется существующим `clipSourceTime` после clamp local времени: `src/engine/onion.ts:52`, `src/engine/onion.ts:83`.
- Onion не переносится в модель .kadr как rendered asset; opacity/difference — параметры отображения guide. Функциональная проверка — `scripts/e2e50.mjs`, здесь не запускалась.

## Переиспользуемое

| Задача | Использовать | Не дублировать |
|---|---|---|
| Получить порядок видимых слоёв | `videoLayersAt`, `src/engine/player.ts:67` | Отдельную трактовку верхней дорожки |
| Выбрать audible media | `audibleClipsAt`, `src/engine/player.ts:87` | Независимый фильтр mute/hasAudio |
| Удержать/освободить elements | `clipsAround` + `MediaPool.evictExcept`, `src/engine/player.ts:131` | Бесконечный cache clipId → element |
| Немедленный snapshot draw | `Player.drawNow`, `src/engine/player.ts:633` | Ожидание «нескольких кадров» |
| Открепить preview | `togglePreviewWindow`, `src/engine/popout.ts:187` | Вторую композицию React |

## Эталонные реализации

- `Player.attach/detach` — разная судьба pool и повторно используемого canvas: `src/engine/player.ts:641`.
- `Compositor.dispose` предназначен для throwaway export canvas: `src/gl/compositor.ts:971`.
- `dock` сначала выносит host из popup, потом закрывает окно: `src/engine/popout.ts:166`.

## Проверки

- `scripts/e2e35.mjs:1` — export освобождает контексты, потеря mid-export обнаруживается, preview восстанавливается.
- `scripts/e2e43.mjs:1` — тот же canvas/context после popout, часы, стили и возврат.
- `scripts/e2e51.mjs:5` — ограничение pool и отключение WebAudio; у suite отсутствует обещанный guard, см. [Timeline](TIMELINE.md).
- Для измерения используются `previewPoolStats`, audio stats и `scripts/preview-bench.mjs`; benchmark воспроизводит звук.
- В этой работе runtime и benchmark не запускались.

## Текущее состояние / долг

- Idle «около 4 fps» зависит от частоты rAF: реализация пропускает ticks, а не ставит отдельный таймер 250 ms.
- При невозможности восстановить GPU остаётся lost-баннер; автоматический новый renderer этим модулем не обещан.
- Показатели производительности исторической карты — прежние измерения, не проверка текущего Windows-окружения.

## Open Questions

- Какой recovery UX нужен при устойчивой потере контекста? Новая стратегия здесь не утверждается.
- Нужна ли отдельная проверка popout на нескольких мониторах и разных DPI под Windows?

## Навигация

⬆ [Renderer](../layers/RENDERER.md) · ↔ [Export](EXPORT.md), [Fragments](FRAGMENTS.md), [Animation/effects](ANIMATION_AND_EFFECTS.md), [Diagnostics](DIAGNOSTICS.md).
Паттерны: [Render](../patterns/RENDER_PIPELINE.md), [Lifecycle](../patterns/PROCESS_LIFECYCLE.md), [Testing](../patterns/TESTING.md).
