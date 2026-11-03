---
title: "Внешние и локальные подключения Kadr"
level: L1
type: architecture
stack: shared
parent: ../README.md
related: [./SECURITY.md, ./DEPENDENCIES.md, ../desktop/modules/AI_BRIDGE.md, ../desktop/modules/FRAGMENTS.md, ../desktop/modules/TRANSCRIPTION.md, ../desktop/modules/VOICEOVER.md, ../desktop/modules/MEDIA_IMPORT.md]
sources: [electron/claude.ts, electron/fragments.ts, electron/main.ts, electron/tts.ts, electron/transcribe.ts, python/ttsqc/gigaam.py]
status: draft
updated: 2026-11-03
---

# INTEGRATIONS — границы взаимодействий

> **Когда читать:** При сетевой ошибке, настройке прокси, смене сервиса, IPC/MCP-контрактов или offline-сценария. Родитель: [README](../README.md) · стек: shared.

## Реестр

| Граница | Направление / протокол | Auth / конфиг | Offline / отказ | Эталон |
|---|---|---|---|---|
| UI ↔ main | `window.kadr` → preload → Electron IPC | `KadrApi`; trusted editor renderer | Локально; ошибки reject/result согласно методу | `shared/types.ts:1101` |
| Media file-read | Renderer → `kadr://media/...` → file stream с Range | Per-run `?t=`; CORS обязателен для canvas/audio | Локальные файлы должны существовать | `electron/main.ts:252` |
| Claude CLI | Main → node-pty → пользовательский CLI | CLI auth принадлежит пользователю; command/env/args из userData | Сам CLI требует провайдера; отсутствие native PTY не должно обрушать редактор | `electron/claude.ts:261` |
| MCP bridge | Claude → stdio `electron/mcp-bridge.cjs` → loopback HTTP `/eval` → renderer JS | Generated MCP config с port/token; `x-kadr-token` и no-Origin | Локально; dead bridge/ошибка eval возвращаются по контракту tool | `electron/claude.ts:279` |
| Additional MCP | CLI получает extra `mcpServers` из userData `claude-mcp.json` | Конфиг пользователя; built-in `kadr` дописывается отдельно | Зависит от стороннего MCP | `electron/claude.ts:280` |
| Fragment preview | Renderer/offscreen → локальный Vite workspace | Default port 5621; `KADR_FRAGMENTS_PORT`, per-slot hosts | После подготовки workspace локально | `electron/fragments.ts:379` |
| Remotion setup/render | Node → npm registry; Remotion → Chrome download при необходимости; render subprocess | `KADR_FRAGMENTS_DIR`; env из userData `claude-env.json` | Первая установка требует сеть; наличие npm deps не гарантирует наличие Chrome | `electron/fragments.ts:73` |
| ElevenLabs | Main session `kadr-tts` → HTTPS API voices/text-to-speech | `xi-api-key`, setting/env proxy, key только main | Без ключа явная ошибка; `KADR_TTS_MOCK=1` заменяет API локальным синтезом | `electron/tts.ts:97` |
| Whisper STT | Main → `python3 scripts/transcribe.py`; модель faster-whisper из кэша/HF | Выбранная модель, default large-v3 | Первый model load может скачивать; отсутствие Python/package/model — ошибка, не fake transcript | `electron/transcribe.ts:35` |
| TTSQC | Main → выбранный Python → `scripts/ttsqc_run.py` → optional HF models | Настройка Python → `KADR_TTSQC_PYTHON` → python3.11; HOME/CACHE/SCORER | Доступность детектора зависит от environment/model; обычный TTS — отдельная возможность | `electron/voice.ts:30` |
| GigaAM | Python → HF snapshot (русский ONNX CTC aligner) | `model_dir` или cache HF, public model | Offline только при наличии нужных files | `python/ttsqc/gigaam.py:91` |
| URL import | Main → `net.fetch(http/https)` → userData/imported | Системный Chromium network stack; нет отдельного browser login bridge | Даже при cached local path сначала выполняет fetch; 512 MiB после чтения response | `electron/main.ts:662` |
| XDG portal | Main → `gdbus` → session bus FileTransfer | Linux desktop portal | На Windows не обещать эквивалент gdbus | `electron/main.ts:687` |
| E2E CDP | Node scripts → WebSocket debugging endpoint | Полный контроль процесса, только explicit dev-test port | Требует живое приложение/дисплей | `scripts/e2e.mjs:1` |

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Различать три вида конфигурации | Agent tooling repo ≠ embedded CLI userData ≠ generated fragment workspace | ✅ выбрать нужный контур; ❌ менять глобальный OpenCode для поведения приложения | `electron/claude.ts:282` |
| Auth/token не хранить в Project | Project переносится и scriptable; нужен least exposure | ✅ secret only main userData; ❌ key в TtsParams/JSON .kadr | `electron/tts.ts:41` |
| TTS proxy задавать через явную API session | Default Chromium session может выбрать HTTP_PROXY и вернуть HTML | ✅ `apiSession`/content-type check; ❌ обход через произвольный fetch | `electron/tts.ts:85` |
| Сетевые prerequisites описывать отдельно от offline runtime | npm packages, Chrome и ML weights — разные загрузки | ✅ перечислить каждый cache; ❌ «после npm ci всё offline» | `electron/fragments.ts:73` |
| Не подменять /eval внешним HTTP API | Endpoint выполняет произвольный JS privileged renderer | ✅ сохранить loopback и два gate; ❌ public host/no-token | `electron/claude.ts:155` |

## Конфигурация и владельцы

| Переменная / файл | Контур |
|---|---|
| `KADR_USER_DATA` | Корень app userData для тестов/изолированных профилей |
| `KADR_FFMPEG`, `KADR_FFPROBE` | Пути системных бинарников |
| `KADR_CLAUDE_CMD`, `claude-env.json`, `claude-mcp.json` | Embedded CLI; env также читается для workspace networking |
| `KADR_FRAGMENTS_DIR`, `KADR_FRAGMENTS_PORT`, `KADR_VP9_ROW_MT` | Workspace, локальный сервер, render option |
| `KADR_TTS_MOCK`, `elevenlabs-key.json` | Платный API или тестовый мок; не глобальное переключение качества ASR |
| `KADR_TTSQC_PYTHON/HOME/CACHE/SCORER` | Интерпретатор, пакет, cache, scorer detector |
| `KADR_GPU` | Выбор GPU до запуска; см. модуль Preview |

Renderer debug globals (`KADR_DISABLE_FAST_DECODE`, `KADR_DISABLE_ALPHA_PACK`, `KADR_FORCE_FULL_SHUTTER`, `KADR_FRAME_HASH`) — не переменные shell по умолчанию, их читает соответствующий JS-путь. Не путать `process.env` и `globalThis`.

## Текущее состояние / долг

`which()` и PTY wrapper используют `/bin/sh` и `/bin/bash`; наличие Git Bash в Windows не доказывает доступность этих абсолютных путей из Electron. Детектор default `python3.11`, STT `python3` — разные resolvers. Не объявлять всю интеграцию работоспособной по `claude --version` или `python --version`.

Никаких прямых runtime-связей с BGA, LLMWiki или другими проектами в этой схеме не предполагается. LLMWiki — операционный документооборот, не API видеоредактора.

## Open Questions

Портирование POSIX launch/watchdog, воспроизводимая установка Python и streaming URL-download — отдельные согласуемые работы. Ошибки окружения не исправляются добавлением новых service contracts в Specs.

## Навигация

⬆ [README](../README.md) · ↔ [Security](SECURITY.md), [Dependencies](DEPENDENCIES.md), [AI bridge](../desktop/modules/AI_BRIDGE.md), [Fragments](../desktop/modules/FRAGMENTS.md), [STT](../desktop/modules/TRANSCRIPTION.md), [Voiceover](../desktop/modules/VOICEOVER.md), [Media import](../desktop/modules/MEDIA_IMPORT.md).
