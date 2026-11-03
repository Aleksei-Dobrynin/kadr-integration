---
title: "Состояние проекта и undo"
level: L2
type: pattern
stack: renderer
parent: ../DESKTOP_CORE.md
related: [./PROCESS_LIFECYCLE.md, ./TESTING.md, ../../shared/PROJECT_MODEL.md, ../layers/RENDERER.md, ../modules/TIMELINE.md, ../modules/PROJECT_IO.md]
sources: [src/state/store.ts, src/engine/autosave.ts, scripts/e2e28.mjs, scripts/e2e29.mjs, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Состояние проекта и undo

> **Когда читать:** перед изменением store, жестов редактирования, загрузки чужого проекта или пакетной операции из scripting API.
> Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md) · стек: renderer.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Низкоуровневая мутация не создаёт историю автоматически; вызывающий код делает один `pushHistory(labelKey)` перед дискретным редактированием. | Жест содержит много обновлений, но должен отменяться одним шагом. | ✅ snapshot перед жестом; ❌ snapshot на каждом pointermove. | `src/state/store.ts:700`, `src/state/store.ts:1284` |
| Сначала проверить, владеет ли high-level action историей. | Общая фраза «мутации не push-ят» имеет явные исключения. | ✅ вызвать `removeAssets` без второго push; ❌ дублировать undo в UI. | `src/state/store.ts:732`, `src/state/store.ts:1229`, `src/state/store.ts:1312` |
| Для копии редактируемого проекта использовать существующий `cloneProject`. | И мутация, и история копируют проект; полное дублирование производных данных дорого. | ✅ общие blob-поля ассета; ❌ заменить на JSON round-trip всего проекта. | `src/state/store.ts:664` |
| `waveform`, `thumbnail`, `thumbnailEnd` после получения считаются immutable. | `cloneAsset` разделяет эти значения между live project и undo. | ✅ присвоение нового значения целиком при probe; ❌ изменение `waveform.max` внутри сохранённого объекта. | `src/state/store.ts:621`, `src/state/store.ts:640` |
| Копирование не должно временно менять live project и обязано сохранять JSON-представление. | Временное обнуление blobs ломает наблюдателей и сохранение после undo. | ✅ обход ключей; ❌ удалить waveform, сериализовать, вернуть обратно. | `src/state/store.ts:627`, `src/state/store.ts:657` |
| Входной проект проходит `sanitizeProject` через `setProject`. | Скрипты и старые файлы могут содержать scalar Anim, повреждённые keyframes и пропущенные поля. | ✅ загрузка через setter; ❌ считать внешний JSON валидным runtime-state. | `src/state/store.ts:85`, `src/state/store.ts:693` |
| Пакетная вставка ассетов — один undo и последовательное размещение, с AV-парами по существующим правилам. | Иначе отмена оставляет половину пользовательской операции. | ✅ `insertClipsFromAssets`; ❌ отдельный undo на каждый файл и аудиодвойник. | `src/state/store.ts:1235`, `src/state/store.ts:1260` |
| Удаление ассета каскадно удаляет использующие его клипы, voiceRuns и defects. | Записи связаны с источником, а не только с плиткой bin. | ✅ `removeAssets`; ❌ удалить только строку `assets`. | `src/state/store.ts:738` |
| Изменение скорости сохраняет связь AV и пересчитывает локальные анимации. | Duration, keyframes и fades относятся к одному изменившемуся темпу. | ✅ `setClipSpeed` с optional `start`; ❌ менять только `clip.speed`. | `src/state/store.ts:1284` |
| Изменение проекта должно давать новую ссылку на project. | Autosave отличает изменения по identity, не по глубокому сравнению. | ✅ copy-on-write; ❌ in-place edit с прежним корневым объектом. | `src/state/store.ts:1286`, `src/engine/autosave.ts:24` |

## Переиспользуемое

- `useEditor` — проект, selection, playhead, история и UI-состояние редактора.
- `pushHistory` очищает `future` и оставляет максимум 50 элементов `past`.
- `undo`/`redo` возвращают project из записи, переносят текущий snapshot и очищают selection.
- `cloneAsset` разделяет только три перечисленных производных поля; остальные копируются.
- `dropped` повторяет исключение `undefined`, функций и symbols из JSON object properties.
- Для некорректного `assets` у `cloneProject` предусмотрен fallback на обычную JSON-копию.
- `insertClipFromAsset` делегирует пакетному варианту: второй алгоритм вставки не нужен.
- `setTransition` и `setEdgeTransitions` — дополнительные примеры действий со своим undo.

### Граница операции

Перед вызовом action посмотреть его тело, а не делать вывод из имени метода.
`setClipSpeed` сам не вызывает `pushHistory`; `insertClipsFromAssets` вызывает.
У `removeAssets` проверка существования ассета предшествует созданию записи истории.
Исключения high-level actions не превращают каждую низкоуровневую мутацию в транзакцию.
Этот паттерн не вводит новый transaction API и не меняет семантику существующего store.

## Эталонные реализации

- Копирование и лимит undo: `src/state/store.ts:619`, `src/state/store.ts:700`.
- Восстановление snapshots: `src/state/store.ts:705`, `src/state/store.ts:717`.
- Healing на границе загрузки: `src/state/store.ts:85`, `src/state/store.ts:695`.
- AV-вставка и cursor следующего файла: `src/state/store.ts:1260`, `src/state/store.ts:1277`.
- Изменение темпа связанных клипов: `src/state/store.ts:1287`.
- Identity, JSON-равенство, 50 общих waveforms: `scripts/e2e28.mjs:153`.
- Сохранение waveform после undo: `scripts/e2e28.mjs:252`.
- Scalar Anim и непрерывность playback: `scripts/e2e29.mjs:1`.

## Текущее состояние / долг

- Sharing не обеспечен deep-freeze: инвариант поддерживается договорённостью и регрессией.
- Добавление writer для любого blob-поля требует пересмотра sharing, а не только теста нового writer.
- Исторический снимок приводит 0.58 ms / 18 MB, комментарий текущего кода — 0.8 ms / 5.9 MB.
- Это разные унаследованные измерения, не воспроизведённые в этой задаче и не целевой SLA.
- Доказуемая норма — сохранение содержимого и общей identity blobs, а не конкретный benchmark.
- История хранит весь project; замена на patch-based undo здесь не согласовывалась.
- `sanitizeProject` — healing, не доказательство безопасности произвольного внешнего кода.
- Проверка исходников выполнена; live E2E для этого документа не запускались.

## Open Questions

- Нужна ли отдельная автоматическая проверка новых in-place writers производных полей?
- Стоит ли формализовать список high-level actions со своей историей, если store будет разделён?
- Нужен ли новый benchmark на текущих больших проектах для сравнения памяти, без переноса старых чисел?

## Навигация

- ⬆ [DESKTOP_CORE](../DESKTOP_CORE.md).
- ↔ [Модель проекта](../../shared/PROJECT_MODEL.md), [Renderer](../layers/RENDERER.md).
- ↔ [Lifecycle](PROCESS_LIFECYCLE.md), [Проверки](TESTING.md).
- ↓ [Timeline](../modules/TIMELINE.md), [Project IO](../modules/PROJECT_IO.md).
