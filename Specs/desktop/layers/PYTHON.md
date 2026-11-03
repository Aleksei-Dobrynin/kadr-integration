---
title: "Слой Python: STT и контроль озвучки"
level: L2
type: layer
stack: python
parent: ../DESKTOP_CORE.md
related: [./MAIN_PROCESS.md, ./SHARED.md]
sources: [docs/reference/AGENTS-before-specs.md, electron/transcribe.ts, electron/voice.ts, scripts/transcribe.py, scripts/ttsqc_run.py, python/kadr_phrases.py, python/ttsqc/config.py]
status: draft
updated: 2026-11-03
---

# Слой Python: STT и контроль озвучки

> **Когда читать:** При изменении запуска Python, NDJSON, моделей, selftest или phrase cuts. Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md).

## Граница слоя

Python — внешний процесс, вызываемый main, а не встроенный renderer runtime.
STT: `electron/transcribe.ts` → `scripts/transcribe.py` → faster-whisper.
QC: `electron/voice.ts` → `scripts/ttsqc_run.py` → vendored `python/ttsqc`.
`python/kadr_phrases.py` вынесен отдельно от ttsqc для численных проверок;
он всё же требует NumPy (`python/kadr_phrases.py:1`, `python/kadr_phrases.py:15`).
TTS ElevenLabs сам по себе не является Python-подсистемой.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Сохранять NDJSON в stdout, ошибки в stderr + exit | Main разбирает поток построчно | ✅ emit + flush; ❌ human log в протокольном stdout | `scripts/transcribe.py:24`, `scripts/ttsqc_run.py:8`, `scripts/ttsqc_run.py:44` |
| Отменять владельцем job в main | UI не владеет Python PID | ✅ kill текущего процесса; ❌ оставить inference после Cancel | `electron/transcribe.ts:87`, `electron/voice.ts:64` |
| Различать STT и QC interpreter selection | У них сейчас разные механизмы запуска | ✅ QC setting/env/default; ❌ обещать, что QC setting меняет STT | `electron/voice.ts:34`, `electron/transcribe.ts:35` |
| Готовность QC определять selftest, не наличием python.exe | Нужны модули, файлы и внешние binaries | ✅ показать problems; ❌ наличие интерпретатора считать готовой ML средой | `scripts/ttsqc_run.py:61`, `electron/voice.ts:89` |
| Не требовать CUDA для готовности QC | CPU медленнее, но отсутствие GPU не фатально | ✅ отдельное поле cuda; ❌ смешать отсутствие CUDA и модуля | `scripts/ttsqc_run.py:64`, `scripts/ttsqc_run.py:104` |
| Интеграционную склейку держать в driver | Vendored пакет должен оставаться пересинхронизируемым | ✅ adapter `ttsqc_run.py`; ❌ разнести editor glue по ttsqc | `scripts/ttsqc_run.py:2` |

## Проверенные требования и версии

| Подсистема | Что действительно задано кодом | Что не доказано |
|---|---|---|
| STT | `spawn('python3')`, default model `large-v3`, CPU/int8 (`electron/transcribe.ts:35`, `scripts/transcribe.py:32`, `scripts/transcribe.py:40`) | Минимальная версия Python отдельной проверкой не закреплена |
| QC | Интерпретатор: request setting → `KADR_TTSQC_PYTHON` → `python3.11` (`electron/voice.ts:34`) | Один общий interpreter selector для всех Python-задач отсутствует |
| QC Python | Selftest требует ≥3.11; config импортирует tomllib (`scripts/ttsqc_run.py:72`, `python/ttsqc/config.py:4`) | Это не pin конкретного patch release |
| QC модули | Selftest импортирует numpy, torch, transformers, faster_whisper, onnxruntime, sklearn (`scripts/ttsqc_run.py:95`) | Установленные версии и совместимость среды здесь не проверялись |
| QC файлы | Проверяются config/calibration; scorer необязателен (`scripts/ttsqc_run.py:80`) | Наличие файла не доказывает качество модели |

Отчёт о Python 3.10.6 — исторический снимок окружения, не текущий замер и не
допустимая минимальная версия QC. Версии Python-библиотек не pinned:
в исходном дереве не найден requirements/pyproject/setup manifest.
Добавление манифеста и выбор pins требуют отдельного решения.

## Жизненный цикл и ошибки

STT сначала получает WAV через `mixdownWav`, затем собирает segments из потока;
временный WAV очищается в finally (`electron/transcribe.ts:24`, `electron/transcribe.ts:75`).
QC parser игнорирует не-JSON строки; это текущая терпимость reader, не разрешение
засорять stdout (`electron/voice.ts:67`). Selftest возвращает код 2 при неготовой
среде, а adapter сохраняет подробный отчёт (`scripts/ttsqc_run.py:123`, `electron/voice.ts:95`).
При недоступном QC не следует объявлять доступной проверку дефектов; базовая
озвучка имеет другой runtime и отдельный жизненный цикл.

## Переиспользуемое

| Работа | Реализация | Владелец подробностей |
|---|---|---|
| Поток распознавания | `scripts/transcribe.py:29` | [TRANSCRIPTION](../modules/TRANSCRIPTION.md) |
| QC adapter/selftest | `electron/voice.ts:58`, `scripts/ttsqc_run.py:61` | [VOICEOVER](../modules/VOICEOVER.md) |
| Границы фраз без моделей | `python/kadr_phrases.py:26` | [VOICEOVER](../modules/VOICEOVER.md) |
| Запуск проверки окружения из UI | `src/engine/voiceCheck.ts:225` | [DIAGNOSTICS](../modules/DIAGNOSTICS.md) |

## Эталонные реализации

- NDJSON emit с немедленным flush: `scripts/ttsqc_run.py:44`.
- Выбор QC interpreter без shell-конкатенации: `electron/voice.ts:34`, `electron/voice.ts:60`.
- Чистая от ML-моделей математика phrase boundaries: `python/kadr_phrases.py:1`.

## Текущее состояние / долг

- Нет воспроизводимого Python lock/manifest; список selftest не является полным dependency lock.
- STT жёстко вызывает `python3`, QC по умолчанию `python3.11`: Windows launcher/PATH остаются отдельной проверкой.
- Selftest импортирует тяжёлые модули; это не pure безмодельная проверка.
- Установка библиотек, загрузка моделей и inference не выполнялись в рамках документации.

## Open Questions

- Нужен ли единый конфиг interpreter для STT/QC и какие версии библиотек поддерживать?
- Какие веса/кэши должны поставляться offline, а какие загружаться с явным согласием?

## Навигация

⬆ [DESKTOP_CORE](../DESKTOP_CORE.md) · ↔ [MAIN_PROCESS](MAIN_PROCESS.md), [SHARED](SHARED.md).
⬇ [TRANSCRIPTION](../modules/TRANSCRIPTION.md), [VOICEOVER](../modules/VOICEOVER.md), [DEPENDENCIES](../../shared/DEPENDENCIES.md), [TESTING](../patterns/TESTING.md).
