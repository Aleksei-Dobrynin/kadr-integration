# Kadr — инструкции для агентов

Этот `AGENTS.md` — основной agent-agnostic вход для Claude Code, OpenCode и других агентов. `CLAUDE.md` — тонкий указатель. **Нормы, архитектура и контракты принадлежат `Specs/`**, а не копиям в файлах агентов/памяти.

## Спецификации — сначала

1. Прочитать [Specs/README.md](Specs/README.md) — L0-вход.
2. Прочитать [PROCESS](Specs/PROCESS.md) и [DESKTOP_CORE](Specs/desktop/DESKTOP_CORE.md).
3. Спуститься к нужному L2-слою/паттерну и L3-модулю. Уровни L1–L3 — три содержательных уровня; L0 — навигация, как в BGA.
4. Норма отсутствует/противоречит задаче — обозначить gap и согласовать решение, не менять поведение по догадке.

Формат: [authoring-guide](Specs/_meta/spec-authoring-guide.md). Покрытие: [coverage](Specs/_meta/coverage.md). Источники и точность: [sources](Specs/_meta/sources-and-references.md). Фактическая готовность среды: [verification](Specs/_meta/verification.md).

## Проект

Рабочий форк `Aleksei-Dobrynin/kadr-integration` от `HelpFreedom/kadr`. Electron + React + TypeScript, GPU/WebGL2-видеоредактор; ffmpeg, Remotion workspace, optional Python STT/TTSQC и встроенный Claude Code. Карта процессов — [DESKTOP_ARCHITECTURE](Specs/desktop/DESKTOP_ARCHITECTURE.md).

Пользовательские руководства: [README.md](README.md), [README.en.md](README.en.md), [FEATURES.md](FEATURES.md). Они не заменяют разработческие Specs.

## Операционный минимум

- Архитектурные/контрактные изменения — только после явного выбора оператора; не превращать рекомендации обследования в принятые решения.
- Команды установки/build/typecheck/test, защиту пользовательских данных и task-completion читать в [PROCESS](Specs/PROCESS.md). Не объявлять GUI готовым по одной успешной сборке.
- Навигация кода — Serena overview/find_symbol/references; при недоступном MCP явно отметить fallback и пользоваться целевыми чтениями/поиском.
- Коммит/публикация только по запросу, только относящиеся к задаче пути; чужой WIP не откатывать/не подметать.
- Не копировать из BGA .NET/DB-First/Gitignore-политику: перенесён формат спецификаций, не архитектура приложения.

## Память и LLMWiki

Serena-проект — `kadr-integration`; entrypoint `mem:core`. Память — указатели в `Specs/` и current-state, не дубли норм. После переподключения MCP при `No active project` повторно активировать путь этого репо.

LLMWiki slug — `kadr-integration`, vault `D:/Practice/LLMWiki`. Перед записью читать правила/плейбук в самой вики. Персональные hooks — `.claude/settings.local.json`, OpenCode logger — `.opencode/plugins/obsidian-logger.js`; tooling остаётся gitignored. `Specs/` — проектная документация; автоматически копировать ignore-политику BGA или менять текущую git-политику не нужно.

## История миграции

Прежняя подробная карта (~700 строк) сохранена **без потери текста** как [исторический reference](docs/reference/AGENTS-before-specs.md), описание статуса — [reference README](docs/reference/README.md). Это не нормативный конкурент Specs. Согласование и границы миграции: [журнал](docs/specs/2026-11-03-spec-system-brainstorm.md).
