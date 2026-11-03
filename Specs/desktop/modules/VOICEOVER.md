---
title: "Озвучка, дефекты, регенерация и обучение"
level: L3
type: module
stack: desktop
parent: ../layers/MAIN_PROCESS.md
related: [../layers/PYTHON.md, ../patterns/UNDO_AND_STATE.md, ../patterns/CACHE_AND_STORAGE.md, ../patterns/TESTING.md, ./TRANSCRIPTION.md, ./TIMELINE.md, ./AI_BRIDGE.md, ../../shared/PROJECT_MODEL.md, ../../shared/SECURITY.md, ../../shared/INTEGRATIONS.md]
sources: [electron/tts.ts, electron/voice.ts, src/engine/tts.ts, src/engine/voiceRegen.ts, src/engine/voiceLearn.ts, src/state/store.ts, shared/ttsText.ts, shared/voiceMap.ts, shared/types.ts, scripts/ttsqc_run.py, python/kadr_phrases.py, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Озвучка, дефекты, регенерация и обучение

> **Когда читать:** ElevenLabs, TTSQC, адресация дефектов, phrase splice, ripple и training corpus. Родитель: [Main process](../layers/MAIN_PROCESS.md).

## Границы и контракт

Main TTS хранит ключ, вызывает API, собирает FLAC; renderer добавляет asset/run и запускает optional check.
Main voice запускает Python driver и ffmpeg splice; renderer связывает результат с Project/history.
`VoiceRun` хранит assetId, scriptPath/hash, параметры прогона/tempo и runDir (`shared/types.ts:534`).
`Project.defects` — находки и пользовательские отметки; `Project.voiceRuns` — версии анализируемой озвучки.
Дефекты адресуются **source seconds + assetId**, не номером clip или текущим timeline time (`shared/types.ts:596`).
TTS без detector допустим: отсутствие Python/ML не должно делать обычный синтез недоступным.

## Правила

1. **Ключ ElevenLabs не выдаётся renderer.**
   Почему: страница scriptable через eval и не является секретным хранилищем.
   ✅ main-only файл, has/set API, TtsParams без key; ❌ getter ключа или key в Project.
   Эталон: `electron/tts.ts:43`, `electron/tts.ts:52`, `shared/types.ts:502`.
2. **Normalize один раз, chunks соединяются в сохранённый script точно.**
   Почему: детектор адресует текст индексами; потеря пробела смещает все дальнейшие позиции.
   ✅ script.slice(from,to) и byte-roundtrip normalized script; ❌ trim каждого chunk.
   Эталон: `shared/ttsText.ts:13`, `shared/ttsText.ts:34`, `electron/tts.ts:443`.
3. **Разбиение предпочитает сильную границу под лимитом модели.**
   Почему: paragraph→sentence→clause→space сохраняет речь лучше, чем произвольный рез.
   ✅ chunkText с model cap и previous_text/next_text/request_ids; ❌ один запрос сверх лимита.
   Эталон: `shared/ttsText.ts:37`, `electron/tts.ts:172`, `electron/tts.ts:473`.
4. **Tempo принадлежит конкретному run; FLAC сохраняет исходный channel layout.**
   Почему: новые settings не должны менять скорость patch; навязанное stereo давало лишний канал и −3.01 dB в preview.
   ✅ decode+atempo одним pass, patch tempo=run.tempo; ❌ читать текущий tempo при regen.
   Эталон: `electron/tts.ts:392`, `src/engine/voiceRegen.ts:171`.
5. **Все выбранные исправления run выполняются одним splice-проходом.**
   Почему: последовательные edits меняют координаты ещё не исправленных фраз.
   ✅ merge близких units, один новый asset/undo; ❌ по одному исправлять исходные cut0/cut1 в уже сдвинутом файле.
   Эталон: `src/engine/voiceRegen.ts:43`, `src/engine/voiceRegen.ts:114`, `src/engine/voiceRegen.ts:210`.
6. **Новая длительность измеряется, не выводится из формулы.**
   Почему: decode, trim, atempo и crossfade имеют реальную sample/container length.
   ✅ probeDuration/spliced.duration и probeMedia перед apply; ❌ sum(patchDur−oldDur) как истина о файле.
   Эталон: `electron/voice.ts:243`, `electron/voice.ts:338`, `src/engine/voiceRegen.ts:245`.
7. **Не угадывать clip edge внутри заменяемой фразы.**
   Почему: точного соответствия старых и новых слов внутри patch нет.
   ✅ отказ с именем clip, ripple по unlocked tracks; ❌ линейно растянуть любой пересечённый край.
   Эталон: `src/state/store.ts:761`, `src/state/store.ts:787`.
8. **Корпус сохраняется до изменения координат, user marks отдельно.**
   Почему: matcher сопоставляет verdict с исходным detector candidate; unmatched rows могут обнулить весь файл.
   ✅ verdicts.json и user_marks.json; ❌ добавить ручные marks в verdicts как будто это detector ids.
   Эталон: `src/engine/voiceLearn.ts:25`, `src/engine/voiceRegen.ts:142`.
9. **Retrain только явно, с backup и достаточным корпусом.**
   Почему: fit выполняется заново и меняет общую с console ttsqc модель.
   ✅ dry status отдельно, ≥30 примеров по ≥2 файлам, cross-validation, backup; ❌ учить автоматически после каждого вердикта.
   Эталон: `src/engine/voiceLearn.ts:64`, `src/engine/voiceLearn.ts:74`, `scripts/ttsqc_run.py:502`, `scripts/ttsqc_run.py:517`.

## Поток данных и сохранение

- `speak` нормализует script, пишет `.script.txt` **до** аудио, вычисляет hash (`electron/tts.ts:440`, `electron/tts.ts:457`).
- Последовательные API chunks несут surrounding text и последние request IDs; assemble выдаёт FLAC/48 kHz без принудительного stereo.
- Длительность результата probe-ится, возвращаются scriptPath/hash, requestIds, chunks и tempo (`electron/tts.ts:496`).
- `KADR_TTS_MOCK=1` создаёт speech-shaped локальный сигнал с sentence gaps; это не проверка реального API (`electron/tts.ts:417`).
- Optional detector: interpreter setting → KADR_TTSQC_PYTHON → python3.11; driver работает в отдельном процессе (`electron/voice.ts:26`, `electron/voice.ts:58`).
- Python TTSQC и лёгкие веса vendored, но torch/faster-whisper/numpy/onnxruntime/huggingface_hub/sklearn устанавливаются отдельно; manifest отсутствует.
- Phrase boundary — середина самой длинной реальной тишины между предложениями; Silero speech probabilities уточняются 5 ms RMS (`python/kadr_phrases.py`).
- Regen берёт script substring по char offsets; текущая реализация trim-ит границы фразы и передаёт surrounding context (`src/engine/voiceRegen.ts:158`).
- Patch подгоняется по паузам, громкости/peak ceiling, швы — equal-power `acrossfade=c1=qsin:c2=qsin` (`electron/voice.ts:296`).
- `freeFixPath` не затирает прежний take; результат записывается отдельным `.fixN.flac` (`src/engine/voiceRegen.ts:105`).
- До нового mark analysis переносится через voice:reindex; reindex failure возвращается warning, не выдаётся за успех переноса (`src/engine/voiceRegen.ts:226`).
- Apply повторно проверяет существование run после долгого synth; `applyVoiceSplice` выполняет согласованную mutation/history.
- Reverify после regen только по явному opts.reverify; настройка check-after-speak не включает его автоматически (`src/engine/voiceRegen.ts:268`).

## Ошибки, отмена и сеть

- TTS singleton job имеет AbortController и ffmpeg child: cancel прерывает HTTP и убивает child (`electron/tts.ts:531`).
- Temp chunks удаляются в finally, job сбрасывается; уже записанный script/output не объявляется транзакционно откатанным (`electron/tts.ts:501`).
- Voice long-check имеет отдельный cancel; phrase helper и splice не обещают такую же сквозную отмену (`electron/voice.ts:50`, `electron/voice.ts:711`).
- API использует явную partitioned Chromium session/proxy; HTML от proxy отклоняется по content type (`electron/tts.ts:85`, `electron/tts.ts:120`).
- Нельзя заменять это на default net.fetch/Node fetch без повторной проверки proxy contract; общая граница — [Integrations](../../shared/INTEGRATIONS.md).
- Удаление ключа требует явной пустой строки; отсутствие аргумента ошибочно, а не «стереть секрет» (`electron/tts.ts:514`).
- Регенерация не стартует во время export/другого voice job; долгий synth может оставить файл, даже если последующий apply отказал.

## Переиспользуемое

- `normalizeScript`, `chunkText`, `sentenceEnds` — pure text contract (`shared/ttsText.ts`).
- `shared/voiceMap.ts` — перенос source/timeline координат после splice, не новая арифметика в UI.
- `flushVerdicts`, `learnStatus`, `retrain` — один корпусный funnel (`src/engine/voiceLearn.ts`).
- `mergeUnits`, `level`, `freeFixPath` — единые правила объединения, измерения и версионирования patches.
- `python/kadr_phrases.py` — числовая часть boundaries отдельно от загрузки ML models.

## Эталонные реализации

- `src/engine/voiceRegen.ts:114` — synth→match→splice→reindex→probe→apply, с повторной проверкой run.
- `scripts/ttsqc_run.py:467` — manual marks участвуют только при настоящем candidate overlap, не с нулевыми выдуманными features.
- `electron/voice.ts:508` — перенос phrase index на новую версию аудио.

## Проверка

- `node scripts/check-ttstext.mjs`, `node scripts/check-voicemap.mjs`; Python 3.11+ `scripts/check-phrases.py` — pure checks.
- Voice E2E только после проверки `tts:is-mock`; `has-key` не доказывает mock и может разрешить платный API (`electron/tts.ts:508`).
- При тестах snapshot/restore ElevenLabs key/settings/corpus, не затирать реальные пользовательские данные.
- Ни платный сервис, ни ML/E2E в этой документирующей работе не запускались.

## Текущее состояние / долг

- mode0600 при записи key — POSIX-мера, **не гарантия Windows ACL**; существующий файл и системные права требуют отдельного аудита.
- Chunk byte-roundtrip относится к normalized script, а не исходному пользовательскому CRLF/BOM/whitespace.
- Числа −3.01 dB и порог отбраковки корпуса — унаследованные измерения, не новый эксперимент.
- Python зависимости/модели не pin-нуты manifest; degraded mode и selftest нужно различать от успешного ML анализа.

## Open Questions

- Как зафиксировать воспроизводимое Python-окружение и права ключа на Windows без смены текущих контрактов?
- Нужна ли единая отмена regen/splice и уборка orphan output при failed apply?

## Навигация

⬆ [Main process](../layers/MAIN_PROCESS.md) · ↔ [Transcription](./TRANSCRIPTION.md), [Timeline](./TIMELINE.md), [AI bridge](./AI_BRIDGE.md).
Сквозные нормы: [Undo/state](../patterns/UNDO_AND_STATE.md), [Security](../../shared/SECURITY.md), [Testing](../patterns/TESTING.md).
