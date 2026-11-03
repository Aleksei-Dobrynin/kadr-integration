---
title: "Источники, границы точности и владение нормами"
level: L0
type: meta
stack: shared
parent: ../README.md
related: [./spec-authoring-guide.md, ./coverage.md, ./verification.md]
sources: [docs/specs/2026-11-03-spec-system-design.md, docs/reference/AGENTS-before-specs.md, README.md, README.en.md, FEATURES.md, package.json]
status: draft
updated: 2026-11-03
---

# Источники и references

> **Когда читать:** При конфликте отчёта с кодом, переносе норм или проверке происхождения решения. Родитель: [README](../README.md) · стек: shared.

## Приоритет доказательств

| Источник | Использование / ограничения |
|---|---|
| Прямой выбор оператора | Схема L0 + L1–L3 и перенос норм в Specs согласованы 2026-11-03; это не выбор новых библиотек/поведения |
| Исходный код baseline `f86b85d` + текущий diff | Факт реализации и точные имена/пороги. Код не всегда является желательной новой нормой: риски записывать в долг |
| Фактический вывод команды | Только реально проверенная возможность; typecheck не доказывает GUI, build не доказывает ASR |
| `docs/reference/AGENTS-before-specs.md` | Byte-identical снимок до миграции (SHA256 EDDB8F34912BE803935E8D3F0FA9B80CC2FFD92032F3F5498F1EF243546C7114); inherited rationale/измерения, не повторный benchmark |
| `README.md`, `README.en.md`, `FEATURES.md` | Пользовательские возможности/термины; могут расходиться с runtime на Windows |
| LLMWiki architecture/recon | Материалы первичного исследования; гипотезы и summaries требуют повторной сверки |
| BGA `Specs/` | Образец формы, навигации, authoring contract; не источник domain/runtime правил Kadr |

## Что не переносить буквально

1. **Число «76 решений».** Сырой инвентарь включал дубли, неуверенные пункты, опечатки и испорченный текст. Полноту оценивать по [coverage](coverage.md), не по этому числу. Не создавать 76 принятых ADR из неподтверждённого списка.
2. **«Ноль секретов».** Pattern scan не является полноценным security audit. Secrets не перепечатывать в Specs, даже если появились в выводе tooling.
3. **«Первичная установка всё готовит».** App npm, native rebuild, Electron binary, Remotion deps/Chrome и Python models — разные контуры. Фактическая среда — [verification](verification.md).
4. **«Есть каталог — функция работает».** Native ABI, ОС-команды `/bin/bash`, пути `/tmp`, наличие моделей, auth и network проверяются отдельно.
5. **«Оптимизация не меняет ни пикселя».** Для exact пути — строгий oracle; VP9 row-mt явно near-lossless, HDR имеет численный допуск. Не смешивать побитовую эквивалентность с одинаковым восприятием.
6. **«Каждое сохранение атомарно».** Проверять конкретный handler: autosave использует sidecar/rename; обычный writeProject — отдельный путь. Кэш-политика не доказывает атомарность любой записи.
7. **«512 МБ — cache capacity».** В `media:download` лимит применяется к одному response buffer; fetch происходит до fs.access локального файла. Нет гарантированного offline API-hit.
8. **«Форк внёс все измеренные оптимизации».** Эти решения наследованы baseline upstream. Новые Specs фиксируют их, не приписывают оператору.

## Адреса источников

- BGA read-only: `D:/Repos/bga-backend/Specs/README.md`, `_meta/spec-authoring-guide.md`, `PROCESS.md`.
- Wiki read-only для исследования: `D:/Practice/LLMWiki/projects/kadr-integration/architecture.md`, `notes/2026-11-03-onboarding-recon.md`.
- Согласование: [brainstorm](../../docs/specs/2026-11-03-spec-system-brainstorm.md), [design](../../docs/specs/2026-11-03-spec-system-design.md), [plan](../../docs/specs/2026-11-03-spec-system-plan.md).
- Native-install logs: `C:/Users/doale/AppData/Local/Temp/opencode/kadr-env-20261103/` (машинно-локальны; не нормативный source-файл репо).

## Владельцы и обновление

Specs — правила и навигация; source — реализация; `docs/reference/` — история; wiki — долговечные выводы/решения по плейбукам; Serena — pointers/current-state. Не переписывать исторический снимок при дальнейших изменениях. При исправлении неверного утверждения сохранять provenance и обозначать, что именно изменилось.

Каждый предметный документ перечисляет `sources` и проверенные `file:line`. Числовая валидность anchor не доказывает смысл: ревьюер обязан сверить соответствие нормы функции. Сплит/переименование требуют обновления parent/related и всех входящих ссылок в одной задаче.

## Навигация

⬆ [README](../README.md) · ↔ [Формат](spec-authoring-guide.md), [Покрытие](coverage.md), [Проверка](verification.md).
