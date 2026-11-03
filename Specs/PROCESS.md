---
title: "PROCESS — работа и проверка Kadr"
level: L1
type: process
stack: desktop
parent: ./README.md
related: [./shared/DEPENDENCIES.md, ./shared/SECURITY.md, ./desktop/patterns/TESTING.md, ./_meta/verification.md]
sources: [package.json, docs/reference/AGENTS-before-specs.md, docs/specs/2026-11-03-spec-system-brainstorm.md]
status: draft
updated: 2026-11-03
---

# PROCESS — рабочий цикл

> **Когда читать:** Перед установкой, запуском, изменениями и заявлением «готово». Родитель: [README](README.md) · стек: desktop.

## Команды

Рабочая папка — корень репо; среда оператора Windows/PowerShell. Команды в отдельных строках; проверять exit code каждой, а не ориентироваться на последний успешный echo.

| Команда | Назначение / условие |
|---|---|
| `npm ci --foreground-scripts --no-audit --no-fund` | Установка lockfile; postinstall собирает node-pty под Electron; нужны native build tools |
| `npm run typecheck` | Оба tsconfig, renderer и main |
| `npm run build` | main/preload/renderer в `out/`; это не проверка запуска |
| `npm run dev` | Живое приложение; main/preload требуют полного рестарта после правки |
| `npm start` | Preview собранного приложения |
| `node --test tools/check-specs.test.mjs` | Тесты проверки спецификаций |
| `node tools/check-specs.mjs` | Frontmatter/граф/ссылки/anchors Specs |
| `node scripts/check-envelope.mjs` | Чистый контракт огибающей |
| `node scripts/check-ttstext.mjs` | Нормализация/без потерь разбиение текста |
| `node scripts/check-proxy.mjs` | Выбор и синтаксис прокси |
| `node scripts/check-voicemap.mjs` | Тайминг после замены фраз |
| `node scripts/check-timeline.mjs` | Волны/перекрытия против эталонного алгоритма |
| `node scripts/check-models.mjs` | Импорт 3D/единицы/децимация |
| `node scripts/check-hdr.mjs` | HDR-формула и ffmpeg-цепочка; нужен ffmpeg |
| `node scripts/check-limiter.mjs` | Мастер-лимитер; нужен ffmpeg |
| `node scripts/check-beats.mjs resources/music` | Биты на bundled музыке; условия и временные пути сначала проверить в скрипте |
| `node scripts/check-sfx-labels.mjs` | Разметка относительно эталона; нужен ffmpeg |
| `python scripts/check-phrases.py` | Только в подготовленном Python-окружении с необходимыми пакетами |

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Перед правкой спуститься L0→L3 | Нужны локальные инварианты и зависимости | ✅ прочитать связанные паттерны; ❌ гадать по названию файла | `docs/specs/2026-11-03-spec-system-design.md:5` |
| Архитектурную развилку согласовать | Обследование не даёт разрешение на изменение продукта | ✅ опции/плюсы/минусы; ❌ внедрить новый контракт из рекомендаций отчёта | `docs/specs/2026-11-03-spec-system-brainstorm.md:9` |
| Не менять lockfile ради прохождения установки | Воспроизводимость и scope | ✅ диагностировать native toolchain; ❌ `npm audit fix`/upgrade без согласия | `package.json:13` |
| Main/preload после изменения перезапускать полностью | Dev watcher не гарантирует актуальный main | ✅ завершить свой dev-run и стартовать снова; ❌ считать HMR renderer достаточным | `docs/reference/AGENTS-before-specs.md:725` |
| TTS-тесты только с моком и защитой stores | Иначе тратятся деньги и теряются реальные настройки | ✅ отдельный userData + `KADR_TTS_MOCK=1`; ❌ live-платёжный синтез в smoke | `electron/tts.ts:27` |
| Коммит только по запросу, только свои пути | Уже есть чужой/предыдущий WIP | ✅ `git add <пути>`; ❌ `git add -A`, reset/clean рабочего дерева | `docs/specs/2026-11-03-spec-system-brainstorm.md:20` |

Числовые anchors на локальные документы при миграции проверяются линтером; при переносе раздела менять ссылку вместе с ним.

## Безопасный dev/E2E

Пример из PowerShell **только для disposable-профиля**; пути выбирать в одобренной временной папке, не в личном userData:

```powershell
$env:KADR_USER_DATA = 'C:/Users/doale/AppData/Local/Temp/opencode/kadr-test-profile'
$env:KADR_TTS_MOCK = '1'
npx electron-vite dev -- --remote-debugging-port=9777
```

В другом терминале — конкретный `node scripts/e2eNN.mjs`. Предварительно прочитать сценарий: часть сьютов заменяет проект/меняет пресеты/требует ресурсы `/tmp/kadr-test`, дисплей, модели или дополнительный workspace. Не устанавливать `KADR_E2E_FORCE=1` глобально. Защита/мок не отменяют snapshot/restore user stores. CDP означает полный контроль, не выставлять порт наружу.

## Definition of Done

- Прочитаны chain и контракты; неутверждённые изменения архитектуры не внесены.
- Для кода: typecheck, build и затронутые checks выполнены; если невозможны — явно указан blocker, не «PASS».
- Для картинок/экспорта: нужный pixel oracle и допуск; для undo — откат и повторное сохранение; для IPC — main/preload/тип согласованы.
- Для Specs: тесты линтера и сам линтер, все relative links и code anchors разрешаются; смысл норм проверен вручную.
- Для запуска: статика не заменяет запуск Electron, загрузку native node-pty и E2E. Непроверенные возможности перечислены отдельно.
- `git diff --check`, контроль scoped diff; `package.json`/lockfile не меняются незаметно установкой.
- Затронутые Specs и references обновлены; факты верификации — в [_meta/verification.md](_meta/verification.md).
- Длинная пауза (больше суток) — датированный handoff-блок в корневом [newsession.md](../newsession.md): закрыто / осталось / prompt следующего окна / уроки (ритуал — AGENTS.md § «Сетап сессии»).

## Serena и Wiki

Старт — `mem:core` и [README](README.md). Для кода — Serena overview/find_symbol/references; если MCP недоступен, прямо отметить fallback, использовать целевой поиск и небольшие чтения. Память содержит указатели/current-state, не дублирует нормативные разделы Specs.

LLMWiki находится вне репо, `D:/Practice/LLMWiki`. Запись только по `_meta/triggers.md` и matching playbook, protected-блоки не изменять; не размножать каждую норму как ADR. Согласованная документационная иерархия не создаёт новый API/зависимость и не требует придумывать продуктовые ADR.

## Текущее состояние / долг

На baseline нет CI и npm-команд lint/format/test. Валидатор Specs — отдельная команда, а не замена typecheck/тестов приложения. Windows-native rebuild заблокирован MSB8040; [точный статус](_meta/verification.md). Установка Spectre libraries, Python ≥3.11, ML deps и моделей требует отдельного согласия.

## Навигация

⬆ [README](README.md) · ↔ [Dependencies](shared/DEPENDENCIES.md), [Security](shared/SECURITY.md), [Testing](desktop/patterns/TESTING.md), [Verification](_meta/verification.md).
