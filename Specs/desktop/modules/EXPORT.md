---
title: "Экспорт: кадры, декодирование и аудиомикс"
level: L3
type: module
stack: renderer
parent: ../layers/RENDERER.md
related: [../layers/MAIN_PROCESS.md, ../layers/PRELOAD.md, ../patterns/RENDER_PIPELINE.md, ../patterns/CACHE_AND_STORAGE.md, ../patterns/TESTING.md, ./FRAGMENTS.md, ./PREVIEW_AND_GPU.md, ./MEDIA_IMPORT.md, ../../shared/PROJECT_MODEL.md]
sources: [src/engine/exporter.ts, src/engine/demux.ts, electron/ffmpeg.ts, electron/preload.ts, electron/main.ts, electron/hdr.ts, shared/audioMaster.ts, shared/rawEncode.ts, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Экспорт: кадры, декодирование и аудиомикс

> **Когда читать:** изменение offline-render, энкодера, fragment materialization, mux или отмены. Родитель: [Renderer](../layers/RENDERER.md).

## Границы и контракт

Владелец orchestration — `startExport` (`src/engine/exporter.ts:104`).
Вход: снимок `Project`, preset, путь результата, диапазон и опции shutter/frame blending.
Выход: файл preset и события `ExportProgress`; запуск возвращает управление отменой и promise выполнения.
Renderer считает кадры; preload принимает RGBA по ссылке; main владеет mux и временным видео.
Фрагменты сначала превращаются в media только в экспортной копии проекта.
Обычный путь — ffmpeg x264; WebCodecs H.264 + mp4-muxer остаётся альтернативой fast encoder.
Audio-only preset пропускает картинку, но использует тот же сбор `AudioSegment`.

## Правила

1. **Один экспорт одновременно.** Глобальный raw encoder и main export state не допускают независимых конкурентов.
   Почему: два потока раньше записывали кадры в чужой encoder и падали в конце.
   ✅ отказ при `activity.exporting`; ❌ второй запуск из MCP параллельно диалогу.
   Эталон: `src/engine/exporter.ts:125` и `src/engine/exporter.ts:132`.
2. **Общий drawFrame, проверяемые пиксели.** Оптимизация не должна менять compositing относительно preview.
   Почему: x264-файлы недетерминированы, сравнение контейнеров не доказывает равенство картинки.
   ✅ `KADR_FRAME_HASH` до encode; ❌ принимать равенство размера MP4 за тест.
   Эталон: `src/engine/exporter.ts:378`; общий контракт — [Render pipeline](../patterns/RENDER_PIPELINE.md).
3. **Буфер нельзя переиспользовать до write callback.** `stdin.write() === true` не означает окончания чтения памяти.
   Почему: кадры передаются по ссылке; раннее заполнение буфера давало torn frames.
   ✅ await `rawEncodeFrame`; ❌ считать backpressure-флаг подтверждением записи.
   Эталон: `electron/preload.ts:45`, `electron/preload.ts:61`; текущая глубина ring — 2 (`src/engine/exporter.ts:244`).
4. **Потерянный GL context — ошибка, не чёрный успешный файл.**
   Почему: readPixels при context loss может оставить прежние байты без исключения.
   ✅ проверять каждый кадр и последний readback; ❌ полагаться только на throw WebGL.
   Эталон: `src/engine/exporter.ts:327`, `src/engine/exporter.ts:479`.
5. **Быстрый decode выбирается с учётом rotation/HDR/alpha.**
   Почему: декодируемый HDR/повёрнутый источник всё равно может дать неправильную картинку.
   ✅ full-resolution ffmpeg intermediate до fast decode для HDR/rotation; ❌ напрямую открыть его WebCodecs.
   Эталон: `src/engine/exporter.ts:538`, `src/engine/exporter.ts:694`.
6. **Альфа проходит lossless colour-over-matte packing, а не теряется.**
   Почему: VP9+alpha/ProRes/HEVC-alpha не покрыты обычным WebCodecs-путём; colour management меняет matte.
   ✅ packed H.264 высотой 2H, BT.709 CPU rewrap без цветовых тегов packing; ❌ трактовать matte как управляемый цвет.
   Эталон: `src/engine/exporter.ts:652`; full-range исключается планом (`electron/ffmpeg.ts:292`) и остаётся fallback; compositor — [Preview/GPU](./PREVIEW_AND_GPU.md).
7. **Частичные renders сохраняют абсолютные кадры композиции.**
   Почему: обнуление времени меняет анимацию, а слишком узкое окно обрезает shutter/blending.
   ✅ margin 0.5 s, объединение расширенных окон с gap ≤10 s, `--frames=f0-f1`; ❌ пересчитать fragment frame от нуля.
   Эталон: `src/engine/exporter.ts:719`, `src/engine/exporter.ts:731`, `electron/fragments.ts:888`.
8. **Много аудиосегментов — premix строго при N >64.**
   Почему: scheduler одного padded amix-графа рос примерно квадратично; отдельный decode и сумма линейны по длине клипов.
   ✅ общий `segmentChain` для двух путей и f32 sum; ❌ отдельная реализация gain/atempo/fades для premix.
   Эталон: `electron/ffmpeg.ts:662`, `electron/ffmpeg.ts:677`, `electron/ffmpeg.ts:692`, `electron/ffmpeg.ts:780`.
9. **Существующий filter graph передавать через script-файл.**
   Почему: Linux MAX_ARG_STRLEN (~128 KB на аргумент) давал E2BIG на большом миксе.
   ✅ `-filter_complex_script` и для малого графа; ❌ длинный inline `-filter_complex` в ExportMuxer.
   Эталон: `electron/ffmpeg.ts:769`, `electron/ffmpeg.ts:833`; при отсутствии аудиофильтров script не создаётся.
10. **Не терять готовое видео при неотменённом mux failure.**
    Почему: render мог занимать часы; ошибка аудио не оправдывает уничтожение картинки.
    ✅ сохранить temp MP4 и вернуть его путь в ошибке; ❌ безусловный unlink из finally.
    Эталон: `electron/main.ts:947`, `electron/main.ts:971`.

## Поток данных, хранение и отмена

- `collectAudioSegments` (`src/engine/exporter.ts:41`) переводит clip speed/inPoint/fades в source- и timeline-домены.
- `materializeFragments` flush-ит params, пытается rebake stale audio, создаёт экспортную копию (`src/engine/exporter.ts:765`).
- Range render отвечает `{path,cached,start,duration}`; inPoint уменьшается на start; duration берётся по картинке, не silent audio tail (`src/engine/exporter.ts:796`).
- Полный fragment render из cache приоритетнее partial; loop за концом композиции зажимается к её последнему кадру (`electron/fragments.ts:868`).
- Decoder хранит ограниченный набор VideoFrame; moov-at-end добирается tail fetch, seek сбрасывает недособранные samples mp4box (`src/engine/demux.ts`).
- Static shutter допускает один draw вместо восьми только при одинаковом frameSignature; alpha frame blending исключается (`src/engine/exporter.ts:342`).
- Main mux применяет segment gain/speed/fades, delay/pad/trim, компенсированный amix и master limiter (`electron/ffmpeg.ts:803`).
- Аналитический mixdown отключает limiter; экспортный использует −1 dBFS и компенсацию lookahead (`electron/ffmpeg.ts:822`, `shared/audioMaster.ts`).
- Premix держит весь stereo 48 kHz float buffer в RAM; промежуточный WAV и filter script очищаются после mux.
- UI cancel вызывает и handle.cancel (frame flag + fragment cancel), и exportCancel (raw/mux); один handle не прерывает уже ожидаемый mux (`src/components/ExportDialog.tsx:66`, `electron/main.ts:961`).
- Premix проверяет cancel между сегментами: уже запущенные worker-ffmpeg не принадлежат `ExportMuxer.child` (`electron/ffmpeg.ts:704`).

## Presets и форматы результата

`PRESETS` — единый каталог семи preset в `src/presets.ts:3`: 1080p, 4K, vertical, 720p, project-size H.264; WebM с re-encode VP9/Opus; MP3 audio-only.

**Правило:** preset выбирает итоговый контейнер/размер/битрейт и mux-pass, а не отменяет архитектуру промежуточного video stream. **Почему:** у WebM preset текущий `codec: avc` относится к исходному encode, `ffmpegVideo: libvpx-vp9` — к финальному преобразованию. ✅ читать оба поля и `audioOnly`; ❌ «исправить» codec только по расширению без проверки exporter/mux. Эталон: `src/presets.ts:71`, `src/presets.ts:84`.

`fps: project` и размеры `project` — специальные значения контракта, не числовые строки. Валидация нового preset включает разный размер project/preset и audio-only; не считать успешную сборку доказательством корректности кодека.

## Переиспользуемое

- `fragmentRenderJobs` — группировка только нужных composition ranges (`src/engine/exporter.ts:731`).
- `mixdownWav` — WYSIWYG-анализ для STT/envelope/beat detection (`electron/ffmpeg.ts:892`).
- `segmentChain`, `atempoChain`, `masterLimiterChain` — единые формулы аудиопрохода.
- `videoTraits`, `intermediateFallback`, `alphaPackedFallback` — не дублировать codec/HDR routing.
- Raw ffmpeg args живут в `shared/rawEncode.ts`; cache keys — в `electron/cacheKeys.ts`.

## Эталонные реализации

- `electron/main.ts:933` — завершение видео, mux, сохранение полезного результата при ошибке.
- `src/engine/exporter.ts:765` — materialization без подмены исходного проекта.
- `electron/ffmpeg.ts:692` — float summing с учётом невыравненных f32 chunks.
- `electron/hdr.ts` и `shared/hdr.ts` — LUT HDR→SDR и версия преобразования в cache key.

## Проверка

- `node scripts/check-limiter.mjs`, `node scripts/check-hdr.mjs` — ffmpeg и формулы.
- `scripts/e2e52.mjs` — partial renders покадрово, первый кадр и backward seek decoder.
- Для A/B: `KADR_DISABLE_FAST_DECODE`, `KADR_DISABLE_ALPHA_PACK`, `KADR_FORCE_FULL_SHUTTER` — диагностические выключатели, не presets.
- E2E требует отдельного безопасного проекта; факт наличия теста не означает его прохождения здесь.

## Текущее состояние / долг

- Метрики 80 min mux/19 min, ~23 MB RAM/min premix, ring 50.5/45.7/45.3 fps — унаследованные измерения из кода/снимка; не перезапускались.
- GPU RGBA→YUV не реализовано: float-аппроксимация swscale не bit-exact; новое ускорение требует доказательства пикселей, а не PSNR-обещания.
- Ошибка rebake сейчас предупреждает и оставляет старый bake, а не блокирует экспорт (`src/engine/exporter.ts:778`).
- KADR_FRAME_HASH семплирует байты с шагом 997, последний PBO flush не добавляет hash: hook полезен для регрессии, но не заменяет полный pixel oracle (`src/engine/exporter.ts:381`, `src/engine/exporter.ts:452`).
- Ошибки/отмена premix и платформенное поведение ffmpeg требуют отдельной проверки; Windows-поддержка здесь не заявляется как проверенная.

## Open Questions

- Как ограничить RAM premix на длинных проектах без изменения семплов и уровня?
- Нужно ли оператору более строгое поведение при failed rebake, чем текущий warning?

## Навигация

⬆ [Renderer](../layers/RENDERER.md) · ↔ [Fragments](./FRAGMENTS.md), [Music/Sounds](./MUSIC_AND_SOUNDS.md), [Diagnostics](./DIAGNOSTICS.md).
Сквозные нормы: [Render pipeline](../patterns/RENDER_PIPELINE.md), [Cache/storage](../patterns/CACHE_AND_STORAGE.md), [Testing](../patterns/TESTING.md).
