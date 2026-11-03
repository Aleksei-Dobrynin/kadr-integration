# Спецификации Kadr — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. This task changes documentation and its validation only.

**Goal:** Полная система L0 + L1–L3 по согласованному образцу BGA и проверенный baseline среды.

**Architecture:** Независимые markdown-пакеты с единым контрактом, проверкой графа и трассировкой в код. Централизованная миграция AGENTS/Serena и интеграция результатов после независимых проверок.

**Tech Stack:** Markdown/YAML-frontmatter; Node.js (встроенные модули для проверок); npm lockfile.

## Задачи

- [x] Прочитать BGA-образец и согласовать L0 + L1–L3.
- [x] Сохранить исторический снимок AGENTS без потери содержимого.
- [x] Создать L0/meta/PROCESS и L1/shared (координатор).
- [x] Создать desktop core/architecture и пять L2 layers (агент A).
- [x] Создать шесть L2 patterns (агент B).
- [x] Создать семь L3 модулей монтажа/графики (агент C).
- [x] Создать семь L3 модулей внешних механизмов/ассистента/аудио (агент D).
- [x] Создать автономный линтер спецификаций и его тесты (агент E; сначала failing tests).
- [x] Проверить отсутствие потерянных норм исходной карты и заполнить coverage.
- [x] Прогнать тесты линтера, проверку Specs и проверку diff; исправить противоречия (78/78 tests, 37 docs, 1106/1106 anchors, 0 errors/warnings).
- [x] AGENTS/Serena направить на Specs; сохранить README/FEATURES как пользовательские руководства.
- [x] Зафиксировать фактические результаты npm ci/typecheck/build/checks и неподготовленные возможности.
- [x] Подготовить передачу оператору входа Specs/README.md, результатов проверки и native-install blocker; без автоматического коммита.

## Приёмка

`node --test tools/check-specs.test.mjs` — проверяет ошибки на синтетических деревьях.
`node tools/check-specs.mjs` — RESULT: PASS, все документы достижимы, ссылки и anchors валидны.
`git diff --check` — без whitespace errors; package.json/lockfile не меняются подготовкой среды.
Число документов не служит доказательством полноты: coverage ссылается на все предметные срезы и их тестовые механизмы.
