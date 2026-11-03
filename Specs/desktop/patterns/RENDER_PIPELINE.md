---
title: "Общий render pipeline и точность"
level: L2
type: pattern
stack: desktop
parent: ../DESKTOP_CORE.md
related: [./PROCESS_LIFECYCLE.md, ./CACHE_AND_STORAGE.md, ./TESTING.md, ../modules/PREVIEW_AND_GPU.md, ../modules/EXPORT.md, ../modules/FRAGMENTS.md]
sources: [src/engine/player.ts, src/engine/exporter.ts, src/engine/demux.ts, src/engine/timelineMath.ts, src/gl/compositor.ts, electron/preload.ts, electron/fragments.ts, electron/ffmpeg.ts, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Общий render pipeline и точность

> **Когда читать:** перед оптимизацией preview/export, изменением decoder, readback, формы waveform или качества промежуточных файлов.
> Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md) · стек: desktop.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Preview и offline export используют общий `drawFrame` и compositor. | Расхождение двух реализаций нарушает WYSIWYG. | ✅ общий путь слоёв и эффектов; ❌ отдельный «почти такой же» shader для экспорта. | `src/engine/player.ts:764`, `src/engine/exporter.ts:363` |
| Рисовать в project-space, масштабировать к размеру preset на encode. | Чтение preset-sized буфера из project-sized framebuffer давало чёрный результат. | ✅ canvas размером проекта; ❌ подмена размеров readback размером preset. | `src/engine/exporter.ts:171` |
| `Compositor.dispose()` — только для одноразового canvas экспортера, не preview. | Dispose теряет context, а переиспользуемый canvas возвращает тот же объект. | ✅ exporter finally; ❌ вызов из `Player.detach`. | `src/gl/compositor.ts:984`, `src/engine/player.ts:714`, `src/engine/exporter.ts:495` |
| Потерю GPU context проверять в export на каждом кадре и после последнего. | GL silently no-op и не обновляет readback-буфер. | ✅ ошибка вместо «успешного» чёрного файла; ❌ доверять отсутствию GL exception. | `src/engine/exporter.ts:327`, `src/engine/exporter.ts:480` |
| Preview сохраняет restore extension заранее, восстанавливает context не внутри lost event и пересоздаёт ресурсы. | На потерянном context extension уже недоступно, старые программы и текстуры исчезли. | ✅ следующий turn и `onRestored`; ❌ синхронный restore в обработчике потери. | `src/engine/player.ts:649` |
| MediaPool preview ограничен окном вокруг playhead; eviction отсоединяет WebAudio. | Удаление только Map entry не освобождает routed source и decoder. | ✅ 8 s вперёд / 3 s назад, `release`; ❌ хранить всё когда-либо проигранное. | `src/engine/player.ts:127`, `src/engine/player.ts:235`, `src/engine/player.ts:773` |
| Raw frame buffer повторно используется только после write callback. | Возвращённое `true` у stream.write не значит, что память больше не нужна потоку. | ✅ await `rawEncodeFrame`; ❌ перезаписать принятый по ссылке буфер сразу. | `electron/preload.ts:45`, `src/engine/exporter.ts:375` |
| Exact fast paths не меняют пиксели; сравнивать кадры до x264, не бинарники MP4. | Унаследованное ограничение ffmpeg/x264: `b_deterministic` не включён, контейнер/encode не эталон равенства. | ✅ `KADR_FRAME_HASH` и проверка pixels; ❌ SHA файла как доказательство render-regression. | `src/engine/exporter.ts:378`, `docs/reference/AGENTS-before-specs.md:475` |
| Не распространять bit-exact на все промежуточные encode. | Fragment render явно near-lossless: PNG → VP9 CRF 12 или H.264 CRF 15; row-mt меняет encode. | ✅ отдельно оценивать качество VP9; ❌ требовать равенство байтов у row-mt A/B. | `electron/fragments.ts:776`, `electron/fragments.ts:913` |
| Static shutter сворачивается лишь при равной signature всех sub-samples. | Равный кадр можно усреднить одним draw, движение — нельзя. | ✅ сохранить accumulator/blit; ❌ отключить blur по одному наличию keyframes. | `src/engine/exporter.ts:335` |
| Waveform maxima и overlap sweep должны точно повторять старую математику. | Сглаженная пирамида расширяла одиночный click, общий k терял bin на отдельных pixels. | ✅ k на колонку, два sliding windows; ❌ приближённое уменьшение waveform. | `src/engine/timelineMath.ts:53`, `src/engine/timelineMath.ts:97` |
| Alpha-источники не смешивать обычным двухпроходным frame blending. | Over-композиция полупрозрачных кадров не равна lerp. | ✅ пропуск blending для alpha; ❌ применять opaque-формулу ко всем. | `src/engine/exporter.ts:586` |
| После seek очищать half-collected samples mp4box. | Иначе первая пачка принадлежит прежней позиции и decoder получает не тот keyframe. | ✅ очистка в `jump`; ❌ только `file.seek`. | `src/engine/demux.ts:377` |
| Fragment iframe переводить в capture, если выше по треку перекрывает GL-слой. | DOM iframe всегда поверх canvas, независимо от глубины клипа в модели. | ✅ `fragmentNeedsCapture` с project; ❌ проверять только собственные эффекты fragment. | `src/engine/fragmentCapture.ts:114` |

## Переиспользуемое

- `MediaPool`, `drawFrame`, `frameSignature` — общий набор подготовки и отрисовки.
- `Mp4FrameSource` — последовательное decode; `pumpTail` извлекает moov с конца файла.
- Alpha packed intermediate хранит colour над matte; packer не пишет colour tags, CPU нормализует frames как BT.709.
- Нельзя вернуть managed upload, который меняет mid-tones/matte; этот нюанс находится на границе decode→GL.
- HDR/rotation требуют intermediate до выбора fast decode; код не должен обходить `videoTraits`.
- `fragmentRenderJobs` объединяет используемые интервалы композиции, а не рендерит её целиком.
- Margin 0.5 s и gap 10 s — существующие константы группировки, не универсальные playback-таймауты.
- `waveWindow` кеширует до трёх окон на waveform; `waveColumns` работает по видимой части.
- `segmentChain` используется и обычным mix, и `premixSegments` после порога 64 segments.
- Большой audio graph передаётся через `-filter_complex_script`, не огромный argv argument.

## Эталонные реализации

- Цвет packed frames: `src/engine/demux.ts:508`; выбор HDR/rotation: `src/engine/exporter.ts:686`.
- Полный render-cache приоритетнее partial: `electron/fragments.ts:872`.
- Absolute frame range и picture-duration: `electron/fragments.ts:886`.
- Диапазоны используемых fragment frames: `src/engine/exporter.ts:719`, `src/engine/exporter.ts:731`.
- Общая цепочка audio и порог premix: `electron/ffmpeg.ts:662`, `electron/ffmpeg.ts:677`.
- Filter script: `electron/ffmpeg.ts:835`.
- Exact math: `scripts/check-timeline.mjs:1`; GPU lifecycle: `scripts/e2e35.mjs:1`.
- Exact fast paths: `scripts/e2e32.mjs:1`; окна fragments и backward seek: `scripts/e2e52.mjs:1`.

## Текущее состояние / долг

- Hash hook выбирает байты с шагом 997: это быстрый индикатор, не полное побайтовое доказательство.
- Для нового exact пути сохранять тесты реальных pixels, а не полагаться только на sampled hash.
- Near-lossless fragment render и exact оптимизация композиции — разные границы гарантии.
- VP9 `-row-mt 1` включён managed config; `KADR_VP9_ROW_MT=0` отключает его для сравнений.
- Два raw buffers оставлены по унаследованному измерению; это не воспроизведённый benchmark Windows.
- Старые замеры readback и ускорения pool описывают конкретные проекты/машины, не SLA.
- GPU RGBA → YUV ещё не внедрён: приближение swscale на ±1 не считается exact заменой.
- Унаследованный вывод о GPU-конверсии не даёт разрешения менять цвета ради скорости.
- Здесь проверены source anchors; live E2E/профилирование не запускались.

## Open Questions

- Нужна ли дополнительная полная RGBA-проверка рядом с sampled hash для будущих оптимизаций?
- Как воспроизводимо сравнивать near-lossless VP9 на поддерживаемых системах без нового quality SLA?
- Когда появится bit-exact реализация swscale из исходников, а не подгонка измерений?

## Навигация

- ⬆ [DESKTOP_CORE](../DESKTOP_CORE.md).
- ↔ [Lifecycle](PROCESS_LIFECYCLE.md), [Cache/storage](CACHE_AND_STORAGE.md), [Testing](TESTING.md).
- ↓ [Preview/GPU](../modules/PREVIEW_AND_GPU.md), [Export](../modules/EXPORT.md).
- ↓ [Fragments](../modules/FRAGMENTS.md), [Timeline](../modules/TIMELINE.md).
