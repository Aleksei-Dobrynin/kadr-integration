---
title: "Specs — система спецификаций Kadr"
level: L0
type: index
stack: desktop
related: [./PROCESS.md, ./desktop/DESKTOP_CORE.md, ./desktop/DESKTOP_ARCHITECTURE.md, ./shared/PROJECT_MODEL.md, ./shared/INTEGRATIONS.md, ./shared/DEPENDENCIES.md, ./shared/SECURITY.md, ./_meta/spec-authoring-guide.md, ./_meta/sources-and-references.md, ./_meta/coverage.md, ./_meta/verification.md]
sources: [package.json, docs/specs/2026-11-03-spec-system-design.md, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Specs — читай первым

> **Когда читать:** В начале работы над Kadr, до изменений кода. L0-вход; далее три содержательных уровня L1–L3. Устройство системы согласовано оператором 2026-11-03 по образцу BGA.

## Проект и границы

Kadr — desktop-видеоредактор: Electron main/preload, React/Zustand renderer, WebGL2-композитор, системный ffmpeg, опциональные Python STT/детектор и встроенный Claude Code. Рабочий форк — `Aleksei-Dobrynin/kadr-integration`; источник унаследованной реализации — `HelpFreedom/kadr`, baseline `f86b85d`, package version 0.7.1. Приложение не является .NET/БД-проектом: правила DB-First/Clean Architecture из BGA неприменимы.

Стек и версии: [DEPENDENCIES](shared/DEPENDENCIES.md). Картинка preview/export использует общий compositor, но кодирование и sampling не тождественны: визуальные проверки должны учитывать заданный путь и допуск. Источник описания реализации — код; Specs фиксирует проверяемые правила работы с ним, не создаёт новую реализацию самим фактом текста.

## Спуск по уровням

| Уровень | Смысл | Вход |
|---|---|---|
| L0 | Навигация, формат, источники, покрытие | Этот файл и `_meta/` |
| L1 | Ядро, архитектура, процесс, сквозные контракты | [CORE](desktop/DESKTOP_CORE.md), [ARCHITECTURE](desktop/DESKTOP_ARCHITECTURE.md), [PROCESS](PROCESS.md), `shared/` |
| L2 | Правила конкретного слоя или паттерна | `desktop/layers/`, `desktop/patterns/` |
| L3 | Предметный модуль: поток, контракты, ошибки, тесты | `desktop/modules/` |

**Рабочая цепочка:** README → CORE → нужный layer/pattern → module. Прочитать также относящиеся shared-контракты. Отсутствующий/противоречивый контракт — зафиксировать gap и согласовать решение, а не изобретать поведение. Формат: [authoring-guide](_meta/spec-authoring-guide.md).

## Золотые правила

1. **Не смешивать координаты времени.** Timeline seconds, clip-local keyframes, source seconds дефектов и Remotion frames — разные системы. → [PROJECT_MODEL](shared/PROJECT_MODEL.md).
2. **Не ломать историю.** Одна дискретная правка — одна запись undo; общие waveform/thumbnail не мутировать in-place. → [UNDO_AND_STATE](desktop/patterns/UNDO_AND_STATE.md).
3. **Не ослаблять capability-границы.** Сохранять токены `kadr://` и `/eval`, ключ ElevenLabs не возвращать renderer. → [SECURITY](shared/SECURITY.md).
4. **Не выдавать кеш за исходник.** Rebuildable и referenced файлы имеют разный жизненный цикл; финальный cache-файл публикуется атомарно. → [CACHE_AND_STORAGE](desktop/patterns/CACHE_AND_STORAGE.md).
5. **Preview и exporter делят draw-путь**, но preview-контекст нельзя уничтожать как одноразовый export-контекст. Пиксельные оптимизации проверять на соответствующем oracle. → [RENDER_PIPELINE](desktop/patterns/RENDER_PIPELINE.md).
6. **Не запускать платные/разрушительные проверки молча.** Мок TTS, snapshot/restore user stores, disposable projects и явный контроль force-переключателей. → [TESTING](desktop/patterns/TESTING.md).
7. **Прежде чем «готово» — вывод проверок.** Статика/сборка не доказывают запуск приложения, ASR, TTS или E2E. → [PROCESS](PROCESS.md), [verification](_meta/verification.md).

## Навигация по L1

| Документ | Содержимое |
|---|---|
| [PROCESS](PROCESS.md) | Команды, установка, гейты, согласование, секреты, Wiki/Serena |
| [DESKTOP_CORE](desktop/DESKTOP_CORE.md) | Карта спуска к слоям, паттернам и всем модулям |
| [DESKTOP_ARCHITECTURE](desktop/DESKTOP_ARCHITECTURE.md) | Процессы, сборки, потоки данных и доверия |
| [PROJECT_MODEL](shared/PROJECT_MODEL.md) | Project/Track/Clip/Anim, единицы и IPC-поверхность |
| [INTEGRATIONS](shared/INTEGRATIONS.md) | Сетевые и локальные подключения, auth, offline и конфигурация |
| [DEPENDENCIES](shared/DEPENDENCIES.md) | npm/Python/workspace/binary зависимости, лицензии и долг |
| [SECURITY](shared/SECURITY.md) | Capability-токены, секреты, privileged renderer, остающиеся риски |

## Владение информацией

- `Specs/` — нормы и актуальные указатели на реализацию. Все новые документы пока `draft`; это статус рецензирования, не обещание runtime-проверки.
- `AGENTS.md` — основной вход для агентов, направляет сюда. `CLAUDE.md` — тонкий указатель на AGENTS.
- `README.md`, `README.en.md`, `FEATURES.md` — руководства пользователя, не конкурирующий свод норм для разработки.
- `docs/reference/AGENTS-before-specs.md` — сохранённая карта до миграции, **историческая справка**, не второй источник норм.
- LLMWiki — архитектурная дистилляция и принятые ADR по плейбукам вики, без копирования всех Specs.
- [Покрытие](_meta/coverage.md) — проверка полноты срезов. [Источники](_meta/sources-and-references.md) — происхождение и уровень доверия. [Проверка](_meta/verification.md) — наблюдаемые результаты среды.

## Навигация

⬇ [Формат](_meta/spec-authoring-guide.md), [Источники](_meta/sources-and-references.md), [Покрытие](_meta/coverage.md), [Проверка](_meta/verification.md), [PROCESS](PROCESS.md), [CORE](desktop/DESKTOP_CORE.md), [ARCHITECTURE](desktop/DESKTOP_ARCHITECTURE.md), [Модель](shared/PROJECT_MODEL.md), [Интеграции](shared/INTEGRATIONS.md), [Зависимости](shared/DEPENDENCIES.md), [Безопасность](shared/SECURITY.md).
