---
title: "3D-модели проекта и библиотека фрагментов"
level: L3
type: module
stack: main
parent: ../layers/MAIN_PROCESS.md
related: [../layers/RENDERER.md, ../patterns/CACHE_AND_STORAGE.md, ../patterns/RENDER_PIPELINE.md, ../patterns/TESTING.md, ../../shared/DEPENDENCIES.md, ./MEDIA_IMPORT.md, ./FRAGMENTS.md, ./DIAGNOSTICS.md]
sources: [electron/models.ts, src/engine/models.ts, electron/fragment-kit/three.tsx, src/engine/mediaImport.ts, shared/types.ts, scripts/check-models.mjs, scripts/e2e49.mjs, FEATURES.md]
status: draft
updated: 2026-11-03
---

# 3D-модели проекта и библиотека фрагментов

> **Когда читать:** При изменении CAD/mesh import, единиц, геометрии, миниатюр или `useModel`. Родитель: [Main process](../layers/MAIN_PROCESS.md).

## Назначение и границы

Main превращает STL/3MF/OBJ/glTF/STEP в project-owned GLB, описание частей и PNG.
Renderer показывает библиотеку и создаёт стартовый Remotion-фрагмент; 3D-модель не становится media clip.
Входы: source path, project directory, optional name/budget/upAxis.
Выход: `ModelInfo`, файлы `kadr-lib/models/<name>.{glb,json,png}` и обновлённый список моделей.
Вставка в монтаж создаёт обычный fragment clip, использующий `@lib/models/<name>.glb`.
Движение 2D-слоя в перспективе — [Animation/effects](ANIMATION_AND_EFFECTS.md), не этот mesh pipeline.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Импортировать модели только в папку сохранённого проекта | `@lib` и фрагменты должны ссылаться на project-owned данные | ✅ требовать projectPath; ❌ складывать модели в случайную глобальную папку | `src/engine/models.ts:45`, `electron/models.ts:600` |
| Учитывать build items, components и unit у 3MF | Только vertices дают неверный размер/сборку | ✅ применять unit и все transforms; ❌ читать лишь первый mesh | `electron/models.ts:148`, `electron/models.ts:152` |
| Нормализовать up-axis по формату, с override | CAD обычно Z-up, glTF/OBJ здесь Y-up | ✅ `readModel(..., {upAxis})`; ❌ вращать все форматы одинаково | `electron/models.ts:575` |
| Различать mm processing, GLB metres и scene units | Иначе размер скачет в 10–1000 раз | ✅ GLB positions /1000; ❌ записывать mm как metres | `electron/models.ts:467`, `electron/models.ts:623`, `electron/fragment-kit/three.tsx:46` |
| Сохранять части и уменьшать геометрию meshoptimizer | Нужны разумный бюджет и семантика деталей | ✅ proportional budget per part; ❌ объединить всё и потерять parts | `electron/models.ts:388`, `electron/models.ts:627` |
| Не перезаписывать одноимённую модель чужого source | Совпавшее имя файла не означает тот же объект | ✅ суффикс имени; ❌ overwrite без проверки source | `electron/models.ts:608` |
| Публиковать описание после файлов модели и thumbnail | Library reader перечисляет JSON, а не незавершённые GLB | ✅ per-file temp+rename, JSON последним; ❌ ранний готовый manifest | `electron/models.ts:633` |
| Привязывать один delayRender к загрузке модели | React mount/unmount не должен оставить render без continue | ✅ load-level handle; ❌ новый handle на каждый Part/component | `electron/fragment-kit/three.tsx:64`, `electron/fragment-kit/three.tsx:73` |

## Поток геометрии

1. Intake распознаёт model extension до media probe: `src/engine/mediaImport.ts:37`.
2. `readModel` выбирает парсер; STL/3MF/STEP по умолчанию преобразуются Z-up → Y-up.
3. Парсеры получают индексированные части; welding соединяет одинаковые вершины.
4. `decimate` распределяет общий triangle budget пропорционально размерам частей.
5. На выходе вычисляются общие `sizeMm`, bbox/OBB каждой части и число треугольников.
6. `writeGlb` пишет metres, `thumbnail` строит изображение программно без окна GPU.
7. GLB → PNG → JSON публикуются по очереди; `listModels` перечисляет metadata newest-first.
8. `refreshModels` обновляет renderer store; `insertModelFragment` создаёт TSX с импортом через `@lib`.

3MF учитывает единицы каждого файла пакета, включая translation transforms.
glTF-позиции приводятся к внутренним mm: `electron/models.ts:352`.
STEP tessellation делегируется `occt-import-js`; ошибка чтения и отсутствие тел различаются: `electron/models.ts:371`.
Программная миниатюра реализована `thumbnail`, `electron/models.ts:511`; это не snapshot живого fragment preview.

## Хранение и потребление

- Файлы библиотеки принадлежат проекту, не proxy-cache и не полю `Project.assets`.
- `ModelInfo.source` сохраняет исходный path; `file/thumb` — имена соседних GLB/PNG.
- Default budget — 200000; минимум переданного budget — 1000: `electron/models.ts:603`.
- Упрощение использует error 1%, повторно 5% при недостижении цели; жёсткий точный предел не обещан.
- OBB, bbox и size описываются в mm, `ModelInfo.units` — `m` для GLB.
- Kit по умолчанию использует 10 units per metre, то есть 1 unit = 10 cm.
- Смена projectPath запускает refresh; у несохранённого проекта список пуст: `src/engine/models.ts:24`.
- Стартовый fragment длится 6 s, если duration не передан: `src/engine/models.ts:118`.

## Ошибки и отмена

- Неизвестное расширение и пустой projectDir дают явную ошибку: `electron/models.ts:587`, `electron/models.ts:600`.
- Одиночный неуспешный renderer import логируется и rethrow; пакет продолжает остальные paths: `src/engine/models.ts:51`.
- `busy` уменьшается в finally для каждого файла; refresh выполняется после всего пакета.
- Отсутствующий каталог library даёт `[]`; нечитабельный JSON пропускается: `electron/models.ts:645`.
- Публичного cancel у `model:import` нет; завершение геометрической операции не связано с export cancel.
- Per-file rename не делает три файла общей транзакцией: сбой может оставить сиротский GLB/PNG без metadata.

## Переиспользуемое

| Задача | Использовать | Где |
|---|---|---|
| Прочитать mesh без persistence | `readModel` | `electron/models.ts:575` |
| Импортировать в библиотеку | `importModel` | `electron/models.ts:599` |
| Перечислить модели | `listModels` / `refreshModels` | `electron/models.ts:645`, `src/engine/models.ts:24` |
| Создать turntable TSX | `modelFragmentTsx` | `src/engine/models.ts:70` |
| Вставить в монтаж | `insertModelFragment` | `src/engine/models.ts:118` |
| Загрузить GLB во фрагменте | `useModel` | `electron/fragment-kit/three.tsx:135` |

## Эталонные реализации

- `parse3MF` — единицы и сборка пакета: `electron/models.ts:148`.
- `importModel` — метаданные частей и порядок публикации: `electron/models.ts:599`.
- `parseSTEP` — boundary внешнего tessellator: `electron/models.ts:371`.

## Проверки

- `node scripts/check-models.mjs` — STL, OBJ, 3MF cross-file component/build/unit, GLB round-trip, decimation и OBB.
- Примеры входных 3D-файлов можно передать аргументами: `scripts/check-models.mjs:3`; STEP не объявляется покрытым synthetic fixture без проверки.
- `scripts/e2e49.mjs:1` — библиотека, kit и collision checks в приложении.
- Guard suite проверен: отказ при clipsOpen без `KADR_E2E_FORCE`, `scripts/e2e49.mjs:91`.
- Это описание тестов, не результат запуска; тесты здесь не выполнялись.

## Текущее состояние / долг

- Budget приблизительный: алгоритм допускает отклонение и минимум треугольников на часть.
- Зависимости STEP/meshoptimizer и платформенные свойства относятся к [Dependencies](../../shared/DEPENDENCIES.md).
- Данные библиотек и фрагментов не упаковываются внутрь `.kadr`; перенос одного JSON недостаточен.

## Open Questions

- Нужна ли явная очистка orphan GLB/PNG после сбоя импорта?
- Требуется ли отдельный набор STEP fixtures с известными единицами и исходными лицензиями?

## Навигация

⬆ [Main](../layers/MAIN_PROCESS.md) · ↔ [Media import](MEDIA_IMPORT.md), [Fragments](FRAGMENTS.md), [Diagnostics](DIAGNOSTICS.md).
Паттерны: [Storage](../patterns/CACHE_AND_STORAGE.md), [Render](../patterns/RENDER_PIPELINE.md), [Testing](../patterns/TESTING.md).
