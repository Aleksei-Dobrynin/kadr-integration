---
title: "Транскрипция: WYSIWYG mixdown и Python ASR"
level: L3
type: module
stack: python
parent: ../layers/PYTHON.md
related: [../layers/MAIN_PROCESS.md, ../layers/RENDERER.md, ../patterns/PROCESS_LIFECYCLE.md, ../patterns/TESTING.md, ./EXPORT.md, ./SUBTITLES.md, ./VOICEOVER.md, ./AI_BRIDGE.md, ../../shared/PROJECT_MODEL.md, ../../shared/DEPENDENCIES.md]
sources: [electron/transcribe.ts, scripts/transcribe.py, src/engine/subtitles.ts, src/engine/captions.ts, src/components/TextTools.tsx, shared/types.ts, electron/ffmpeg.ts, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Транскрипция: WYSIWYG mixdown и Python ASR

> **Когда читать:** STT job, таймкоды transcript, faster-whisper runner, stream protocol и отмена. Родитель: [Python](../layers/PYTHON.md).

## Границы и контракт

Renderer `transcribeFlow` связывает цель asset/range с SRT/TXT и `TextDoc`.
Main `run` микширует audio segments в временный WAV и запускает Python.
Python отвечает NDJSON в stdout; stderr и exit code принадлежат ошибкам, не UI-тексту протокола.
Input `TranscribeRequest`: audioSegments, duration, model, language (`shared/types.ts:361`).
Output `TranscribeResult`: segments с optional word timestamps, language, duration (`shared/types.ts:355`).
Defaults orchestration: `large-v3`, language `auto`; runner CPU int8 (`src/engine/subtitles.ts:278`, `scripts/transcribe.py:40`).
STT не является TTSQC: у него свой launcher `python3`, не настройка KADR_TTSQC_PYTHON.

## Правила

1. **Анализировать слышимый mixdown, а не произвольный исходный звук.**
   Почему: speed, gain, fades и перекрытия таймлайна должны попасть в распознанный текст.
   ✅ `collectRangeAudio` → `mixdownWav`; ❌ передать dominant source целиком вместо диапазона.
   Эталон: `src/engine/subtitles.ts:305`, `electron/transcribe.ts:24`, `electron/ffmpeg.ts:892`.
2. **Один job одновременно, cancel на обеих фазах.**
   Почему: иначе глобальный current потеряет владельца временного WAV/child.
   ✅ отказ `transcription already running`, cancel muxer или Python; ❌ overwrite current вторым запросом.
   Эталон: `electron/transcribe.ts:15`, `electron/transcribe.ts:87`.
3. **Не смешивать source и project timecodes.**
   Почему: один asset может быть подрезан, ускорен и использован в разных местах таймлайна.
   ✅ asset-doc хранит assetId и source seconds; range-doc — offset или absolute cues; ❌ прибить asset cues к текущему clip.start.
   Эталон: `src/engine/subtitles.ts:289`, `src/engine/subtitles.ts:308`, `src/engine/subtitles.ts:345`.
4. **Сохранять VAD и anti-hallucination guards.**
   Почему: Whisper порождает текст на музыке/тишине, previous-text conditioning усиливает повторные петли.
   ✅ Silero VAD + condition_on_previous_text=false + confidence/threshold filters; ❌ бесконтрольный default transcribe.
   Эталон: `scripts/transcribe.py:42`, `scripts/transcribe.py:68`.
5. **NDJSON содержит только целые сообщения с явным type.**
   Почему: stdout приходит chunks, которые не совпадают с границами JSON/строк.
   ✅ emit JSON + newline + flush, на Node переносить остаток буфера; ❌ парсить каждый data chunk как JSON.
   Эталон: `scripts/transcribe.py:24`, `electron/transcribe.ts:43`.
6. **Не обрезать сведения о словах до формирования коротких cues.**
   Почему: punctuation/word timestamps нужны для точного дробления, а равномерное деление фразы даёт ложные времена.
   ✅ words `{start,end,word,probability}`; ❌ раздать секунды пропорционально числу символов при наличии word timing.
   Эталон: `scripts/transcribe.py:63`, `src/engine/subtitles.ts:322`; представление — [Subtitles](./SUBTITLES.md).
7. **Не затирать чужие transcript files.**
   Почему: похожее имя медиа не даёт права перезаписать соседний пользовательский SRT.
   ✅ freePath с числовым suffix, overwrite только known project doc; ❌ всегда `${name}.srt`.
   Эталон: `src/engine/subtitles.ts:261`, `src/engine/subtitles.ts:323`.
8. **Освободить job/temp при любом исходе.**
   Почему: исключение spawn/parse/mixdown не должно навсегда оставить «уже идёт».
   ✅ finally current=null и unlink WAV; ❌ очистка только после exit code 0.
   Эталон: `electron/transcribe.ts:75`.

## Поток данных

1. Цель asset: проверить asset и hasAudio; весь source с gain=1/speed=1, cueOffset=0 (`src/engine/subtitles.ts:289`).
2. Цель range: проверить end>start и наличие слышимого audio; segments локальны диапазону, duration=end−start.
3. Для range default absolute: cueOffset=start, doc.offset=0; relative: cueOffset=0, doc.offset=start.
4. Main создаёт WAV в os.tmpdir; `mixdownWav` использует экспортную segment chain без master limiter.
5. Spawn `python3 scripts/transcribe.py --audio ... --model ... --language ... --duration ...` (`electron/transcribe.ts:35`).
6. Runner отдаёт `segment`, `progress`, `done`; Node накапливает segments и liveText последней фразы.
7. Progress mixdown начинается с .01, Python progress ограничен .99, после успеха отправляется 1 (`electron/transcribe.ts:25`, `electron/transcribe.ts:57`).
8. `segmentsToCues` добавляет выбранный offset; SRT/TXT записываются рядом с dominant source.
9. Проект получает пути в `TextDoc`, не копию содержимого transcript (`src/engine/subtitles.ts:329`).
10. `docTimeToProject` разрешает source-time cue через подходящий clip с speed/inPoint; если clip отсутствует, возвращает null.

## Конкретные ASR guards

- CPU threads=max(4,cpu_count−2), beam_size=5, word_timestamps=true (`scripts/transcribe.py:39`).
- VAD: min_silence_duration_ms=500, speech_pad_ms=120 (`scripts/transcribe.py:46`).
- hallucination_silence_threshold=2.0, no_speech_threshold=.6, log_prob_threshold=−1, compression_ratio_threshold=2.4.
- Средняя word probability <.2 отбрасывает segment; пустые фразы не эмитятся (`scripts/transcribe.py:60`).
- Повторяющаяся строка допускается два раза подряд, третий и дальнейшие повторы подавляются (`scripts/transcribe.py:73`).
- Времена и confidence округляются до .001; это наблюдаемая дискретность протокола, не sample-accurate alignment.

## Сохранение, ошибки и отмена

- Временный mixdown WAV не является project asset; finally пытается удалить его независимо от исхода.
- Transcript SRT/TXT — referenced пользовательские файлы; регистрация docs происходит после обеих записей.
- Эти две записи не являются общей атомарной транзакцией: ошибка TXT может оставить уже записанный SRT.
- Неизвестная/непарсящаяся строка сейчас игнорируется; stderr ограничивается 800 символами при failed child (`electron/transcribe.ts:61`, `electron/transcribe.ts:70`).
- Отмена выставляет флаг, вызывает muxer.cancel и Python SIGKILL; после mixdown есть повторная проверка cancelled.
- Файл/модель/интерпретатор недоступны — ошибка, а не успешный пустой transcript; runtime проблемы нужно показывать через UI/log.

## Переиспользуемое

- `collectRangeAudio` и `mixdownWav` — общий WYSIWYG audio contract с [Export](./EXPORT.md).
- `segmentsToCues`/`segmentsToRichCues`, `docTimeToProject`, SRT serializer — `src/engine/subtitles.ts`.
- `transcribeFlow` используется UI и `kadr_transcribe`, не дублировать orchestration в MCP.
- Auto captions — потребитель результата, владелец animated fragment — `src/engine/captions.ts:151`.

## Эталонные реализации

- `electron/transcribe.ts:15` — job ownership, streaming decoder и cleanup.
- `scripts/transcribe.py:29` — CLI boundary без Electron/DOM зависимостей.
- `src/engine/subtitles.ts:275` — asset/range semantics и output registration.

## Проверка

- Проверить asset source timestamps, absolute/relative range offset и переход cue через speed/inPoint.
- Проверить silence/music, repeated text и low-confidence words на локальных fixtures, не ждать универсального отсутствия галлюцинаций.
- Проверить cancel во время mixdown и Python, failed spawn, отказ записи второго файла.
- Фактические ASR/ML/E2E запуски здесь не проводились; тестовая стратегия — [Testing](../patterns/TESTING.md).

## Текущее состояние / долг

- Python dependency manifest отсутствует: faster-whisper/его native dependencies устанавливаются пользователем; модель может скачиваться в cache.
- Launcher жёстко `python3`, в отличие от ttsqc interpreter settings; на Windows это отдельный непроверенный portability gap.
- Main не разбирает ненулевой остаток stdout без newline на close; штатный runner всегда делает newline/flush.
- Anti-hallucination пороги снижают ложный текст, но не гарантируют точность на любом языке/шуме.

## Open Questions

- Нужна ли общая настраиваемая Python-discovery для STT/TTSQC без изменения текущих defaults?
- Следует ли превращать malformed NDJSON в явную protocol error вместо текущего пропуска строки?

## Навигация

⬆ [Python](../layers/PYTHON.md) · ↔ [Subtitles](./SUBTITLES.md), [Voiceover](./VOICEOVER.md), [Export](./EXPORT.md).
Сквозные нормы: [Project model](../../shared/PROJECT_MODEL.md), [Dependencies](../../shared/DEPENDENCIES.md), [Lifecycle](../patterns/PROCESS_LIFECYCLE.md).
