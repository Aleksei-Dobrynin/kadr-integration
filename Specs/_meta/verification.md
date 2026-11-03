---
title: "Проверка документации и окружения — baseline 2026-11-03"
level: L0
type: meta
stack: shared
parent: ../README.md
related: [./coverage.md, ./sources-and-references.md, ../PROCESS.md, ../shared/DEPENDENCIES.md]
sources: [package.json, package-lock.json, docs/specs/2026-11-03-spec-system-plan.md]
status: draft
updated: 2026-11-03
---

# Проверка baseline

> **Когда читать:** Перед запуском приложения или оценкой слова «готово». Родитель: [README](../README.md) · стек: shared. Датированный evidence, не вечная гарантия среды.

## Окружение

| Проверка | Наблюдение |
|---|---|
| Node / npm | 24.8.0 / 11.6.0; satisfies actual lockfile toolchain minimum 22.12.0 (upstream README ≥20 недостаточно точен) |
| ffmpeg / ffprobe | 8.1.2, доступны PATH |
| Python | Только 3.10.6 зарегистрирован; optional TTSQC требует ≥3.11 |
| Claude CLI / Git Bash | 2.1.284 / 5.2.26; auth и запуск из app не проверялись |
| npm ci | **FAIL** на node-pty rebuild: MSB8040, нет Spectre-mitigated libraries |
| Native compiler | VS2019/v142, x64 SDK 10.0.19041.0; VS2022 есть, проверенные Spectre libs отсутствуют и там |
| Electron | package 42.4.0 присутствует; runtime binary / запуск не подтверждены |
| Remotion / ASR | Внешний workspace, Chrome, ML-окружение/модели не готовились в этом проходе |

Install logs: `C:/Users/doale/AppData/Local/Temp/opencode/kadr-env-20261103/` (`npm-ci.log`, `runtime-inventory.txt`, `final-verification.txt`). Lockfile SHA256 до/после установки одинаков: `D6AAC769B25535E44074012587341CEFF50C41B710C13E3F1D8C6C147A332F13`; package.json не изменён. Native failure касался winpty-agent/winpty project files внутри node_modules. Пакеты частично установлены; это не успешно завершённая установка.

## Проверки на частичной установке

Координатор выполнил после возврата environment-агента:

| Команда | Результат / граница |
|---|---|
| `npm run typecheck` | **PASS**, оба tsconfig, exit 0 |
| `npm run build` | **PASS**, main/preload/renderer в out/, Vite 7.3.6, exit 0 |
| `node scripts/check-envelope.mjs` | **PASS**, attack/release, chunked equivalence, silence |
| `node scripts/check-ttstext.mjs` | **PASS**, normalize/chunks exact coverage |
| `node scripts/check-proxy.mjs` | **PASS**, proxy priority and Chromium syntax |
| `node scripts/check-voicemap.mjs` | **PASS**, forward/back mapping and splice chains |
| `node scripts/check-timeline.mjs` | **PASS**, 688773 waveform columns, 3000 random tracks без расхождений |
| `node scripts/check-models.mjs` | **PASS**, STL/3MF/GLB units/decimation/OBB |
| `node scripts/check-hdr.mjs` | **PASS**, HLG/PQ curve, LUT, ffmpeg chain с допустимой ошибкой |
| `node scripts/check-limiter.mjs` | **PASS**, ниже порога bit-identical, over-hot click ограничен |

Это статические/не-GUI доказательства. Они не грузили node-pty в Electron и не доказывают работу встроенного Claude. Приложение, E2E, paid API, model inference, реальный export media project не запускались.

## Проверка Specs

Финальный координаторский прогон 2026-11-03 после интеграции авторов и исправлений ревью:

| Команда | Наблюдаемый результат |
|---|---|
| `node --test tools/check-specs.test.mjs` | **78 passed, 0 failed, 0 skipped** |
| `node tools/check-specs.mjs` | **RESULT: PASS**, 37 документов: L0=5, L1=7, L2=11, L3=14; 1106/1106 anchors; 0 errors/warnings |
| `git diff --check` | **PASS**, exit 0; только предупреждения Git о будущем LF→CRLF |
| UTF-8 + входные ссылки | 39 markdown-файлов включая 2 шаблона; 0 encoding/entrypoint link errors |
| Scoped diff приложения | `electron/`, `src/`, `shared/`, `python/`, `scripts/`, package.json и lockfile без изменений |
| Reference integrity | Снимок прежнего AGENTS сохранил исходный SHA256 |

Линтер проверяет формат, связность, разрешение файлов/anchor line ranges. Не доказывает смысл нормы, причинность benchmark и безопасность реального API. Смысл проверяется в ревью кода и chain.

## Независимое ревью

Ревью документации проверило все 37 нормативных файлов, два шаблона, agent entrypoints и исторический снимок. Выявленные смысловые неточности исправлены по коду, без изменения приложения:

- Popup handler — фильтр frameName, не проверка origin/URL; архитектура больше не обещает недоказанную защиту fragment-origin.
- Shared cancellation фрагментов сбрасывается любым новым render request, не только началом следующего export; lifecycle/fragment module описывают ограничение.
- Onion guide и linked reverse оформлены как реальные contracts в Preview/Media Import, а не только названия строк coverage.
- Нормализация клипа (−14 LUFS / −1 dBTP defaults) и каталог presets дополнены проверенными flow/источниками.

Ревью валидатора потребовало regression-fixtures для Markdown fence/inline examples, reserved YAML scalars, endpoint false positives и canonical path confinement. Прогон должен подтверждать эти случаи отдельно от корректности реального графа Specs.

## Блокеры и дальнейшие действия

1. По отдельному согласию установить соответствующие MSVC Spectre libraries, затем повторить native rebuild/установку без смены версий.
2. Подтвердить Electron runtime и запуск с disposable `KADR_USER_DATA`.
3. Проверить POSIX paths/watchdog для Windows до заявления о готовности CLI панели.
4. Отдельно выбрать Python ≥3.11 и воспроизводимую ML-установку; не скачивать веса автоматически.
5. Remotion workspace + Chrome и E2E — отдельная подготовка с изолированными проектами.

## Навигация

⬆ [README](../README.md) · ↔ [Coverage](coverage.md), [Sources](sources-and-references.md), [Process](../PROCESS.md), [Dependencies](../shared/DEPENDENCIES.md).
