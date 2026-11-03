# newsession.md — точка входа для следующих сессий

> Handoff-документ между сессиями. Заполняется в момент паузы (обязательно — перед паузой длиннее суток); следующая сессия читает первым делом (порядок — `AGENTS.md` § «Сетап сессии»).
> Прежние handoff-блоки — история: `git log -- newsession.md`. Устаревшие блоки зачёркиваются `~~…~~`, не удаляются.

---

## 🚀 СТАРТ ОТСЮДА

> **2026-11-03 — онбординг форка завершён: Specs L0+L1–L3, ADR-0001, первый форк-коммит `769dcc6` запушен; среда частично готова (блокер MSVC); утверждена трасса B→C ИИ-интеграции.**
>
> **Закрыто в сессии:**
> - **Онбординг в инфраструктуру оператора:** LLMWiki slug `kadr-integration` (index / architecture / recon-заметка / ADR-0001, 6 записей в `_meta/log.md`); Serena-проект `kadr-integration` + onboarding-память; хуки Claude (`.claude/settings.local.json`) и OpenCode-плагин (`.opencode/plugins/obsidian-logger.js`) — оба gitignored.
> - **Консолидация доков (ADR-0001):** `AGENTS.md` — основной вход/роутер; прежняя карта (~700 строк) сохранена байт-в-байт в `docs/reference/AGENTS-before-specs.md` (SHA256 `EDDB8F34…C7114`); `CLAUDE.md` — тонкий указатель; README RU/EN указывают на Specs, Node-минимум исправлен на ≥22.12 (факт lockfile).
> - **Рекогносцировка:** 4 параллельных исследовательских агента (структура, состояние/история, 76 решений, зависимости/интеграции); находки сверены по коду; часть «фактов» сырых отчётов опровергнута и не переносилась (реестр оговорок — `Specs/_meta/sources-and-references.md`).
> - **Система спецификаций:** `Specs/` — 37 документов (L0=5 / L1=7 / L2=11 / L3=14), 1106/1106 code-anchors резолвятся; валидатор `tools/check-specs.mjs` + 78/78 тестов; два независимых ревью (доки, валидатор) — находки исправлены (popup name-only, общий флаг отмены фрагментов, onion/reverse контракты, нормализация/presets). Формат — по образцу BGA, адаптирован, без переноса .NET-правил.
> - **Коммит `769dcc6`** (51 файл, +5236/−701) запушен в `origin/main`. Приложение, зависимости и lockfile не менялись (lock SHA `D6AAC769…F13` до/после установки совпадает).
>
> **Среда (READ-ONLY проверки, детали `Specs/_meta/verification.md`):** Node 24.8.0 / ffmpeg 8.1.2 / Python 3.10.6. `npm ci` **FAIL — MSB8040**: нет MSVC Spectre-libs (нужна для сборки `node-pty` → встроенная TUI-панель Claude; устанавливается компонент `Microsoft.VisualStudio.Component.VC.14.29.Spectre` в VS2019 BuildTools, ~300 МБ, по согласию оператора). На частичной установке прошли: typecheck, build (3 контура), 8 чистых check-скриптов. НЕ проверено: запуск Electron (бинарник докачается при первом запуске), панель Claude, GUI/E2E, ML/STT (нужен Python ≥3.11), Remotion-workspace. Логи: `C:/Users/doale/AppData/Local/Temp/opencode/kadr-env-20261103/`.
>
> **Решение оператора (2026-11-03):** ИИ-интеграция — **B сейчас → C позже** (цель: встраивание в SaaS-ассистента оператора, React/браузер). Обязательно к чтению перед работой по теме: `mem:ai_harness_evolution` (Serena; там источники, 7 вопросов проработки, рамки). Реализация B — кандидат **ADR-0002**, старт только по явному запросу оператора.
>
> **Варианты следующей сессии:**
> 1. **Вариант B** — ADR-0002 + реализация: мост на app-ready, внешний claude с тем же `kadr-mcp.json`, деградация xterm-панели, node-pty опционален. Вход: `mem:ai_harness_evolution` § «Принятые рамки».
> 2. **Снятие блокера среды** — согласовать установку Spectre-компонента VS, повторный `npm ci`, первый запуск приложения с одноразовым `KADR_USER_DATA`. Вход: `Specs/_meta/verification.md` § «Блокеры».
> 3. **Hygiene-пакет** — `esbuild` в direct devDeps (сейчас phantom), `ws` → devDependencies, `engines` в package.json, права 0600 на `kadr-mcp.json`, `python/requirements.txt`. Вход: `Specs/shared/DEPENDENCIES.md` / `SECURITY.md` § Open Questions + `Specs/_meta/sources-and-references.md`.
>
> **Prompt следующей сессии (примеры):** «Сетап сессии — и хочу вариант B: начни с ADR-0002, вопросы по одному» · «Сетап сессии — ставим Spectre-компонент и доводим окружение до запуска приложения» · «Сетап сессии — сделаем hygiene-пакет одним коммитом».

## Хвосты (вне текущего направления)

- **MSVC Spectre-блокер** — касается только TUI-панели Claude; варианты снятия и обходные пути (`--ignore-scripts` с оговорками) — `Specs/_meta/verification.md`.
- **Python 3.10.6 < 3.11** — ttsqc-детектор дефектов озвучки деградирует до обычного TTS; ML-окружение и веса не готовятся без отдельного согласия.
- **Upstream-канал** — `HelpFreedom/kadr` не добавлен как git remote; при будущем мердже конфликты `CLAUDE.md` решаются в пользу `AGENTS.md` (ADR-0001).
- **LLMWiki-гейты** — ADR-0001 accepted; architecture/recon-заметки в `draft` — промоушен в `active/stable` только человеком (правила вики).
- **Известные долги кода** (задокументированы в Specs, не срочные): отсутствие runtime force-guard у e2e51; POSIX-допущения PTY/watchdog/scratch-cleanup на Windows; `kadr-mcp.json` с токеном моста без 0600; отсутствие манифеста Python-зависимостей.
