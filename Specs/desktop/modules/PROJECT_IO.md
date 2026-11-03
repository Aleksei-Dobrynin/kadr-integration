---
title: "Проект: открытие, сохранение и восстановление"
level: L3
type: module
stack: main
parent: ../layers/MAIN_PROCESS.md
related: [../layers/RENDERER.md, ../patterns/UNDO_AND_STATE.md, ../patterns/CACHE_AND_STORAGE.md, ../patterns/TESTING.md, ../../shared/PROJECT_MODEL.md, ./TIMELINE.md, ./FRAGMENTS.md]
sources: [electron/main.ts, electron/preload.ts, src/App.tsx, src/state/store.ts, src/engine/autosave.ts, shared/types.ts, scripts/e2e26.mjs, scripts/e2e28.mjs, scripts/e2e29.mjs, FEATURES.md]
status: draft
updated: 2026-11-03
---

# Проект: открытие, сохранение и восстановление

> **Когда читать:** При изменении `.kadr`, save/save-as, загрузки чужого проекта, autosave или копирования истории. Родитель: [Main process](../layers/MAIN_PROCESS.md).

## Назначение и границы

Модуль связывает JSON-модель `Project`, renderer store и файловые IPC main.
`.kadr` хранит дорожки, клипы, ассеты, тексты и ссылки на фрагменты; это не архив медиа.
Состав модели задаёт `shared/types.ts:237`, пользовательское описание — `FEATURES.md:244`.
Диалоги и файловая запись принадлежат main; dirty-индикатор и выбранный путь — renderer.
Общие правила истории принадлежат [Undo/state](../patterns/UNDO_AND_STATE.md), а не файловому формату.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Загружать через `setProject`, сохраняя `sanitizeProject` | Скрипты и старые проекты передают scalar Anim, отсутствующие поля и повреждённые ключи | ✅ нормализовать на входе; ❌ считать JSON уже безопасной моделью | `src/state/store.ts:85`, `src/state/store.ts:693` |
| Открытие сбрасывает историю и временное состояние редактора | Undo от прошлого проекта не должен менять новый | ✅ новый `past/future`, playhead и selection; ❌ переносить историю между файлами | `src/state/store.ts:693` |
| Подтверждать сохранение после успешного `writeProject` | Иначе ошибка диска погасит dirty-индикатор | ✅ затем обновить путь и saved snapshot; ❌ подтверждать до await | `src/App.tsx:52` |
| Save-as меняет активный путь только после записи | Следующее Ctrl+S должно писать в реально сохранённый файл | ✅ `writeAndConfirm`; ❌ менять путь при открытии диалога | `src/App.tsx:79` |
| Сохранять autosave через временный файл и rename | Частичная запись не должна стать готовой резервной копией | ✅ `<name>.autosave.kadr.tmp` → rename; ❌ писать autosave поверх готового JSON | `electron/main.ts:822` |
| Уважать activity и проверку изменений autosave | Экспорт, Claude и voiceCheck не должны конкурировать с тяжёлой сериализацией | ✅ пропуск тика; ❌ принудительная запись при каждом таймере | `src/engine/autosave.ts:21` |
| Не мутировать разделяемые blobs ассета | `cloneProject` экономит память истории, сохраняя те же waveform/thumbnail | ✅ заменять производное поле целиком; ❌ менять содержимое waveform in-place | `src/state/store.ts:621`, `src/state/store.ts:664` |

## Входы, выходы и поток данных

1. Open dialog возвращает путь либо `null` при отмене: `electron/main.ts:800`.
2. `readProject` читает UTF-8 и делает `JSON.parse`: `electron/main.ts:811`.
3. `openProjectAt` передаёт результат в store, отмечает сохранённым и запускает синхронизацию фрагментов: `src/App.tsx:93`.
4. Save использует текущий `projectPath`; для нового проекта получает путь диалогом: `src/App.tsx:68`.
5. `writeAndConfirm` записывает захваченный project, затем обновляет UI и список недавних проектов.
6. Перенос project-owned фрагментов запускается отдельно; успешная запись JSON не означает завершённый перенос workspace.

`Project` — сохраняемые данные; `projectPath`, selection, playhead и история принадлежат состоянию редактора.
Файлы медиа остаются внешними ссылками; миниатюры и waveform входят в JSON ассетов.
Оптимизация копирования не вырезает blobs из сериализации, в том числе после undo.

## Хранение, ошибки и отмена

- Обычный `project:write` делает `fs.writeFile(JSON.stringify(...))`: `electron/main.ts:815`.
- Autosave лежит рядом с основным проектом; для несохранённого — в Downloads: `electron/main.ts:823`.
- Интервал — пять минут; неизменённость проверяется идентичностью объекта project: `src/engine/autosave.ts:17`.
- Пустой проект без клипов и текстов пропускается; наличие только ассетов само по себе не включает autosave.
- Ошибка autosave логируется, `lastSnapshot` не продвигается; следующий тик может повторить запись: `src/engine/autosave.ts:27`.
- Отмена save/open dialog возвращает `null`, это не ошибка: `electron/main.ts:795`, `electron/main.ts:806`.
- Ошибка ручного save показывается flash-состоянием; успешный путь не подтверждается: `src/App.tsx:63`.
- Восстановление — обычное открытие `.autosave.kadr`; отдельный recovery-формат не вводится.

## Переиспользуемое

| Задача | Использовать | Не создавать заново |
|---|---|---|
| Открыть проект из automation | `openProjectAt`, `src/App.tsx:93` | Второй путь загрузки без sanitize |
| Нормализовать чужую модель | `sanitizeProject`, `src/state/store.ts:85` | Локальные defaults в каждой панели |
| Копировать модель для истории/правки | `cloneProject`, `src/state/store.ts:664` | Полный JSON round-trip крупных blobs |
| Запустить проверку autosave | `autosaveNow`, `src/engine/autosave.ts:41` | Второй таймер записи |
| Разобрать путь | `dirOf/baseOf`, `shared/paths.ts:5` | Renderer split только по `/` |

## Эталонные реализации

- `writeAndConfirm` — порядок persist → UI feedback → fragment sync: `src/App.tsx:52`.
- `cloneAsset` разделяет только три производных поля, остальные копирует: `src/state/store.ts:631`.
- `setProject` — единая граница нормализации и сброса transient state: `src/state/store.ts:693`.
- `project:autosave` — атомарность конкретной резервной записи: `electron/main.ts:822`.

## Проверки

- `scripts/e2e26.mjs:1` — autosave: путь, activity и unchanged; также содержит synthetic captions.
- `scripts/e2e28.mjs:144` — история разделяет blobs, но сериализуется полностью; проверяется сохранение после undo.
- `scripts/e2e29.mjs:1` — healing script-written проекта со scalar Anim и повреждёнными ключами.
- Это CDP-сценарии с живым приложением, не чистые unit tests; условия запуска — [Testing](../patterns/TESTING.md).
- В рамках подготовки спецификации тесты не запускались.

## Текущее состояние / долг

- Атомарность гарантируется реализацией autosave, **не** обычного save; обобщать её на все записи нельзя.
- `sanitizeProject` — healing известных полей, не полная schema validation произвольного JSON (`p.tracks` ожидается существующим).
- Историческая карта перечисляет export/Claude как паузы autosave; код также учитывает `voiceCheck`.
- Переносимость `.kadr` ограничена внешними абсолютными путями; упаковка медиа здесь не реализована.

## Open Questions

- Нужна ли атомарная ручная запись наравне с autosave? Это предложение, не принятая гарантия.
- Нужна ли явная проверка версии/структуры до healing и отдельный UX ошибки открытия?

## Навигация

⬆ [Main](../layers/MAIN_PROCESS.md) · ↔ [Модель](../../shared/PROJECT_MODEL.md), [Timeline](TIMELINE.md), [Fragments](FRAGMENTS.md).
Паттерны: [Undo/state](../patterns/UNDO_AND_STATE.md), [Cache/storage](../patterns/CACHE_AND_STORAGE.md), [Testing](../patterns/TESTING.md).
