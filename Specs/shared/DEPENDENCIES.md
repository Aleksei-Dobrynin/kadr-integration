---
title: "Зависимости, установка и лицензии"
level: L1
type: architecture
stack: shared
parent: ../README.md
related: [./INTEGRATIONS.md, ../PROCESS.md, ../_meta/verification.md, ../desktop/layers/PYTHON.md, ../desktop/modules/FRAGMENTS.md]
sources: [package.json, package-lock.json, electron/fragments.ts, electron/voice.ts, resources/CREDITS.md, scripts/gen-icons.mjs]
status: draft
updated: 2026-11-03
---

# DEPENDENCIES — четыре независимых контура

> **Когда читать:** Перед установкой/обновлением, сборкой native-модулей, ASR или fragment-workspace. Родитель: [README](../README.md) · стек: shared.

## npm приложения

Манифест — [package.json](../../package.json), точные разрешённые версии — lockfile; constraint не равен installed version. Например baseline задаёт vite `^7.3.1`, а сборка 2026-11-03 использовала 7.3.6.

| Пакет / constraint | Назначение |
|---|---|
| `react`, `react-dom` ^18.3.1 | UI renderer |
| `zustand` ^4.5.5 | Центральный project/undo-store и вспомогательные stores |
| `@xterm/xterm` ^6.0.0, `@xterm/addon-fit` ^0.11.0 | Embedded CLI terminal |
| `node-pty` ^1.1.0 | Native PTY; ABI Electron, не просто Node runtime |
| `@modelcontextprotocol/sdk` ^1.29.0, `zod` ^4.4.3 | MCP stdio + схемы tool arguments |
| `mp4box` ^2.3.0, `mp4-muxer` ^5.1.5 | MP4 decode demux / optional WebCodecs output mux |
| `fflate` ^0.8.3 | ZIP/3MF unpack |
| `meshoptimizer` ^1.3.0, `occt-import-js` ^0.0.23 | Mesh simplification / STEP conversion |
| `ws` ^8.21.0 | CDP automation scripts (сейчас runtime dependency, usage test/tooling) |
| `electron` ^42.4.0, `electron-vite` ^5.0.0, `vite` ^7.3.1 | Desktop/runtime builds |
| `typescript` ^5.5.4, `@vitejs/plugin-react` ^5.2.0 | Static check / JSX build |
| `@electron/rebuild` ^4.0.4 | postinstall `electron-rebuild -f -w node-pty` |
| `@types/node` ^20.14.0, React/DOM types ^18.3.3/^18.3.0, ws ^8.18.1 | Dev type declarations |

Полное дерево с integrity — lockfile. Нет `engines` и npm-скриптов test/lint/format в baseline: не придумывать их наличие в runbook.

## Отдельный Remotion workspace

Генератор — `electron/fragments.ts:92`, каталог по умолчанию `~/kadr-fragments`, не `src/` приложения. Манифест приложения не должен автоматически пополняться этими пакетами ради исправления ошибки workspace.

| Workspace package | Pin в генераторе |
|---|---|
| remotion, @remotion/cli, @remotion/player, @remotion/three | 4.0.247 |
| react, react-dom | 18.3.1 |
| three, @types/three | 0.170.0 |
| @react-three/fiber | 8.17.14 |
| three-mesh-bvh | 0.8.3 |
| typescript | 5.5.4 |
| vite, @vitejs/plugin-react | 5.4.8 / 4.3.1 |
| @types/react | 18.3.3 |

Наличие версии в template не означает force-downgrade существующего workspace: поведение migration проверять по `migrateWorkspace`. Chrome render binary — отдельная загрузка после npm-пакетов. Managed-файлы берутся из `electron/fragment-kit/`; `src/_kadr`, `src/_entries` в описании workspace не являются missing source в репо приложения.

## Python и бинарники

| Компонент | Нужен для | Обслуживание |
|---|---|---|
| Node/npm | Dev build, check scripts, npm/npx workspace | Для полного lockfile toolchain минимум **22.12.0**; native ABI задаёт Electron |
| ffmpeg/ffprobe | Probe, proxy/reverse/HDR/alpha, encode/mix, TTS audio | PATH или `KADR_FFMPEG/FFPROBE` |
| claude CLI | Embedded agent | User-owned auth; node-pty не заменяет установленный CLI |
| MSVC C++ toolchain + Spectre libs | Windows node-pty rebuild | Это системные components, отдельно согласовать установку |
| Python `python3` + faster-whisper | STT | Модели могут скачиваться при первом использовании |
| Python ≥3.11 + numpy/torch/transformers/faster-whisper | TTSQC | Selftest проверяет imports; resolver setting → env → python3.11; stdlib tomllib требует 3.11 |
| onnxruntime/huggingface_hub, scikit-learn | GigaAM/CTC и train/calibration пути | Не утверждать одинаковую обязательность для каждого режима |
| whisperx, matplotlib | Optional alignment/report branches | Проверять конкретный путь исполнения |
| gdbus/session bus | Linux portal drop | Windows runtime prerequisite не объявлять |

Python requirements/pyproject отсутствуют, pin-набор и установка не воспроизводимы из одного repo command. Vendored `scorer.pkl`, `calibration.npz` — не полный пакет моделей. HF weights whisper/GigaAM — отдельные загрузки. TypeScript `beat_track` не требует Python librosa в runtime.

**Уточнение Node:** в исходном README заявлялось ≥20, но текущие lockfile Electron 42.4.0 и @electron/rebuild 4.0.4 требуют ≥22.12.0 (`package-lock.json:413`, `package-lock.json:1879`). Vite/electron-vite допускают ^20.19.0 или ≥22.12.0, однако это не снижает общий минимум полного install graph. Текущий Node 24.8.0 удовлетворяет. README RU/EN уточнены в этой миграции; package engines по-прежнему отсутствует, зависимости не обновлялись.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Для baseline использовать lockfile без upgrade | Диагностика установки не должна подменять версии | ✅ npm ci; ❌ audit fix «заодно» | `package.json:13` |
| Native модуль пересобирать для Electron | Установленный Node ABI не равен Electron ABI | ✅ electron-rebuild; ❌ проверить require в Node и объявить готовым Electron | `package.json:13` |
| Сохранять изоляцию app/workspace/Python | Разные runtimes и pin sets | ✅ менять нужный manifest/генератор; ❌ ставить remotion в root ради typecheck kit | `electron/fragments.ts:92` |
| Не скачивать ML weights/не тратить TTS кредиты без согласия | Сеть, ресурсы и деньги пользователя | ✅ проверка readiness без inference; ❌ запуск всего e2e с live API | `electron/tts.ts:27` |
| Сохранять credits при распространении ресурсов | Приложение и медиа имеют разные лицензии | ✅ передать credits/атрибуцию; ❌ считать всё GPL/CC0 | `resources/CREDITS.md:1` |

## Ресурсы и лицензии

Код приложения — GPL-3.0 (LICENSE). SFX: 260 файлов Kenney/unicaegames, CC0; анализ/derived data из `/brag` — MIT с attribution в credits. Музыка: пять треков ende.app, CC BY 4.0 — атрибуция обязательна; не переиздавать неизменённые треки как свою музыку/не регистрировать в Content ID согласно опубликованным credits. Lucide inline icons — ISC; генератор читает локальный unpack `lucide-static`, подготовка npm pack может требовать сеть. Нельзя подменять это заявлением о network-free supply chain.

## Текущее состояние / долг

- `esbuild` импортируется check/gen scripts, но не direct dependency — reliance на транзитивную установку Vite.
- `ws` в dependencies; `@types/ws` не делает .mjs типобезопасными; cleanup — предложение, не выполненный upgrade.
- Версия root lock metadata отличается от package version; само по себе это не доказательство несовместимости `npm ci`.
- Установка 2026-11-03 не завершена из-за MSB8040. Typecheck/build и восемь checks всё же прошли на частично установленном дереве. Это не подтверждает readiness native Electron runtime.

## Open Questions

Python lock/pins, npm engines/CI и direct esbuild declaration требуют отдельной задачи/решения. См. [verification](../_meta/verification.md).

## Навигация

⬆ [README](../README.md) · ↔ [Integrations](INTEGRATIONS.md), [Process](../PROCESS.md), [Verification](../_meta/verification.md), [Python](../desktop/layers/PYTHON.md), [Fragments](../desktop/modules/FRAGMENTS.md).
