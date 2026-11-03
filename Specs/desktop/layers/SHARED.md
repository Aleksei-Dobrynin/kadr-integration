---
title: "Слой shared: контракты и переносимые функции"
level: L2
type: layer
stack: shared
parent: ../DESKTOP_CORE.md
related: [./MAIN_PROCESS.md, ./PRELOAD.md, ./RENDERER.md]
sources: [docs/reference/AGENTS-before-specs.md, shared/types.ts, shared/rawEncode.ts, shared/paths.ts, shared/ttsText.ts, shared/voiceMap.ts]
status: draft
updated: 2026-11-03
---

# Слой shared: контракты и переносимые функции

> **Когда читать:** При изменении сериализуемых типов, IPC DTO и алгоритма, нужного нескольким runtime. Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md).

## Граница слоя

`shared/` не владеет окнами, store, диском, дочерними процессами или DOM.
Здесь находятся модель и контракты (`types.ts`), DSP/численные алгоритмы,
преобразования текста, времени, путей и аргументов внешнего encoder.
Возвращаемая строка ffmpeg-фильтра — данные, не запуск процесса.
Так builder из `shared/rawEncode.ts:19` используется и preload, и main fallback.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Не привязывать общую функцию к ОС/UI runtime | Её используют разные сборки и pure checks | ✅ входные данные → результат; ❌ Electron/DOM/store import | `shared/ttsText.ts:1`, `shared/rawEncode.ts:19` |
| Модель проекта и IPC описывать в `types.ts` | Дублирующие DTO расходятся по смыслу | ✅ расширить общий контракт; ❌ свой Project в UI или main | `shared/types.ts:237`, `shared/types.ts:1101` |
| Сохранять единицы времени и систему координат | Source, timeline и clip-local секунды не взаимозаменяемы | ✅ явное преобразование; ❌ source defect как timeline marker | `shared/types.ts:2`, `shared/types.ts:50`, `shared/types.ts:596` |
| Текст делить без потери символов | Адресация дефектов зависит от исходного script | ✅ offsets и slice; ❌ trim каждого chunk | `shared/ttsText.ts:25`, `shared/ttsText.ts:34` |
| Разбирать пути с обоими разделителями | Renderer работает без Node path, проекты приходят с Windows | ✅ `dirOf/baseOf`; ❌ split только по `/` | `shared/paths.ts:1`, `shared/paths.ts:5` |
| Общие encode flags собирать в одном месте | Fallback не должен менять цвет/масштабирование | ✅ `rawEncodeArgs`; ❌ похожая локальная копия | `shared/rawEncode.ts:19` |

Нормативный смысл модели описан в [PROJECT_MODEL](../../shared/PROJECT_MODEL.md).
Этот документ владеет границей переносимости, а не повторной схемой Project.
Алгоритмы DSP принадлежат соответствующим предметным модулям.

## Ошибки и жизненный цикл

Функция shared не показывает диалог, не пишет session log и не завершает процесс.
Ошибку входного контракта можно выразить исключением, которое обработает вызывающий
runtime: `chunkText` отказывает неположительному limit (`shared/ttsText.ts:35`).
Не каждый shared результат — JSON DTO: строки аргументов и численные буферы имеют
собственные контракты. Сериализуемость требуется там, где данные реально пересекают
IPC/проектный файл, а не всем возможным временным объектам алгоритма.

`Anim` описан в shared, но `evalAnim` сейчас расположен в renderer engine
(`shared/types.ts:58`, `src/engine/anim.ts:12`). Не придумывать его экспорт из shared.

## Переиспользуемое

| Потребность | Реализация | Назначение |
|---|---|---|
| Project / Track / Clip / Anim | `shared/types.ts:237`, `shared/types.ts:193`, `shared/types.ts:138`, `shared/types.ts:58` | Согласованная модель |
| IPC | `shared/types.ts:1101` | `KadrApi` |
| Raw encoder command | `shared/rawEncode.ts:19` | Конверсия RGBA, fit, codec flags |
| Пути в renderer | `shared/paths.ts:5` | Разделители Linux/macOS/Windows |
| Подготовка script | `shared/ttsText.ts:13`, `shared/ttsText.ts:34` | Нормализация один раз, lossless chunking |
| Перенос времени splice | `shared/voiceMap.ts:32` | Source-time mapping |

## Эталонные реализации

- Builder без запуска ffmpeg: `shared/rawEncode.ts:19`.
- Функция со строгим текстовым инвариантом: `shared/ttsText.ts:25`.
- Маленький переносимый helper вместо импорта ОС: `shared/paths.ts:5`.

## Текущее состояние / долг

- Типы TypeScript сами по себе не валидируют чужой JSON; загрузка проекта лечится renderer (`src/state/store.ts:85`).
- `shared/paths.ts` — helpers разбора, не канонизация/авторизация файловых путей.
- Имена `shared/` в коде и `Specs/shared/` различны: второе — сквозные L1 спецификации, не runtime пакет.
- Возможный перенос `evalAnim` — отдельное решение, не требование этой миграции.

## Open Questions

- Нужна ли отдельная runtime-валидация IPC DTO и на какой доверенной границе?
- Какие численные контракты требуют byte/pixel parity, а какие допускают tolerance?

## Навигация

⬆ [DESKTOP_CORE](../DESKTOP_CORE.md) · ↔ [MAIN_PROCESS](MAIN_PROCESS.md), [PRELOAD](PRELOAD.md), [RENDERER](RENDERER.md).
⬇ [PROJECT_MODEL](../../shared/PROJECT_MODEL.md), [MUSIC_AND_SOUNDS](../modules/MUSIC_AND_SOUNDS.md), [VOICEOVER](../modules/VOICEOVER.md), [TESTING](../patterns/TESTING.md).
