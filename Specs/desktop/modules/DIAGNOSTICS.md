---
title: "Диагностика: session log, checks и storage inventory"
level: L3
type: module
stack: desktop
parent: ../layers/RENDERER.md
related: [../layers/MAIN_PROCESS.md, ../patterns/UI_CONVENTIONS.md, ../patterns/CACHE_AND_STORAGE.md, ../patterns/TESTING.md, ./PROJECT_IO.md, ./PREVIEW_AND_GPU.md, ./FRAGMENTS.md, ./MODELS_3D.md, ./VOICEOVER.md, ../../shared/SECURITY.md]
sources: [src/engine/log.ts, src/components/DebugPanel.tsx, src/engine/checks.ts, electron/storage.ts, electron/cacheKeys.ts, src/engine/storage.ts, src/components/StoragePanel.tsx, electron/fragment-kit/player.tsx, electron/fragments.ts, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Диагностика: session log, checks и storage inventory

> **Когда читать:** пользователь не видит причину ошибки, fragment quality checks, storage scan/prune, performance evidence. Родитель: [Renderer](../layers/RENDERER.md).

## Границы и контракт

Session log объясняет сбои текущего окна, checks оценивают декларации/пиксели, storage показывает оставленные на диске артефакты.
Это разные данные: memory log не равен audit trail, quality checks не являются typecheck, inventory не доказывает безопасность удаления исходников.
Log input: level/source/message/detail; output: entries/unseen и plain-text report (`src/engine/log.ts:15`).
Checks input: optional clipIds/pixels/collisions; output: findings и counters (`src/engine/checks.ts:260`).
Storage input: known project paths + open project; output: groups/owners/bytes, затем отдельный explicit prune request.
Persistence: log/check UI — session state; сами caches, known project files и user voice runs существуют независимо.

## Правила

1. **Session log остаётся memory-only кольцом 500 записей.**
   Почему: он объясняет текущий сбой, а не бесконтрольно растущий disk diary.
   ✅ useLog CAP=500 и explicit copy; ❌ писать каждое сообщение в project/userData logfile без нового решения.
   Эталон: `src/engine/log.ts:8`, `src/engine/log.ts:27`, `src/engine/log.ts:50`.
2. **INFO не поднимает badge, benign ResizeObserver не считается сбоем.**
   Почему: постоянный ложный alarm делает реальные failures невидимыми.
   ✅ warn/error увеличивают unseen; ❌ loop notice окрашивает кнопку ошибки.
   Эталон: `src/engine/log.ts:58`, `src/engine/log.ts:110`, `src/engine/log.ts:127`.
3. **Показывать actionable failure с источником и detail.**
   Почему: console.warn за закрытыми DevTools выглядит как «нажал — ничего не произошло».
   ✅ logWarn/logError с human source и stack; ❌ swallow failure, оставив успешную UI-индикацию.
   Эталон: `src/engine/log.ts:38`, `src/engine/log.ts:68`, `src/engine/log.ts:119`.
4. **Checks различают незадекларированное и проверенное.**
   Почему: без inspect metadata нельзя честно вывести события/камеру из одного TSX автоматически.
   ✅ counters/ограничения inspect; ❌ «нет findings» = «весь фильм доказанно корректен».
   Эталон: `src/engine/checks.ts:1`, `src/engine/checks.ts:260`, `electron/fragments.ts:997`.
5. **Пороги quality checks централизованы и проверяют наблюдаемое.**
   Почему: raw acceleration давала false camera alerts; contrast/seams зависят от настоящих pixels.
   ✅ CHECK_LIMITS, speed steps относительно local peak; ❌ отдельные magic thresholds в UI/MCP.
   Эталон: `src/engine/checks.ts:20`, `src/engine/checks.ts:184`, `src/engine/checks.ts:423`.
6. **Не путать rebuildable и referenced storage.**
   Почему: proxy можно пересоздать, а reversed/download/voice-run path может быть единственной копией используемых данных.
   ✅ классификация GROUPS; ❌ «очистить все временные папки» по названию directory.
   Эталон: `electron/storage.ts:35`, `electron/storage.ts:39`.
7. **Cache identity вычисляется одним helper, owner — по project path.**
   Почему: дрейф формулы/совпадение project names направляет delete на чужой live cache.
   ✅ mediaCacheKey(path,size,rounded mtime,suffix); ❌ второй hash или ownership по имени проекта.
   Эталон: `electron/cacheKeys.ts:18`, `electron/storage.ts:58`, `electron/storage.ts:165`.
8. **Prune fail-closed и в пределах выбранной группы.**
   Почему: неизвестный/неполный request не является разрешением потерять данные.
   ✅ !confirm/dryRun только считает, path containment перед rm; ❌ default delete при отсутствии confirm.
   Эталон: `electron/storage.ts:243`, `electron/storage.ts:269`, `electron/storage.ts:274`.
9. **Project/all scopes не удаляют referenced группы.**
   Почему: referenced files не восстанавливаются из имени cache автоматически.
   ✅ `not rebuildable` для project/all; ❌ считать explicit confirm разрешением на любую группу.
   Эталон: `electron/storage.ts:260`; stale scope имеет отдельную семантику и требует полноценного списка известных проектов.

## Поток session log

- `wireLog` подключается один раз к error/unhandledrejection, игнорирует media element load events и отдельно обрабатывает ResizeObserver notices.
- `describe` сохраняет stack Error, строки или JSON detail; JSON dump обрезается после 4000 символов (`src/engine/log.ts:38`).
- Запись создаёт timestamp/id, bounded entries, unseen; сообщения также дублируются в console.
- Открытие панели вызывает markLogSeen, очистка — clearLog; это не удаляет cache/files (`src/engine/log.ts:75`).
- `logAsText` формирует переносимый текст для bug report; отдельного фонового upload/telemetry здесь нет (`src/engine/log.ts:81`).
- Закрытие окна теряет ring; желаемое сохранение отчёта выполняется пользователем, не подразумевается persistence проекта.

## Поток quality checks

- Main hidden `?inspect=1` page загружает fragment declarations, sample functions на 30 Hz (`electron/fragment-kit/player.tsx:211`).
- Sample values хранятся с точностью 1e−6, а не грубо округлёнными координатами (`electron/fragment-kit/player.tsx:244`).
- Renderer переводит composition seconds в timeline через inPoint/speed и считает доступную длительность текста/перекрытия/events.
- Camera jerk сравнивает speed/turn step с local peak; floors и shake flips принадлежат CHECK_LIMITS.
- Caption contrast измеряется по реальному background; большие titles ≥3, обычный текст ≥4.5 (`src/engine/checks.ts:31`).
- Seams сравнивают соседние реальные кадры; continuous windows отличаются от обычного художественного cut (`src/engine/checks.ts:425`).
- Collision path `?collide=1` проигрывает кадры и проверяет parts kit через BVH; это не bbox-only обещание полного physics engine (`electron/fragments.ts:1028`).
- Inspect cache keyed fragment content hash; изменение декларации должно дать новый результат (`electron/fragments.ts:988`).
- Ошибку sampling/capture нельзя выдавать за нулевое число дефектов; `ok`/checked counters нужны для интерпретации findings.

## Поток storage и ошибки

- Main scan читает known projects и open snapshot, строит media keys/fragment ownership и sizes (`electron/storage.ts:182`).
- Rebuildable: proxies, decoded, fragment renders, ttsqc model cache; referenced: reversed, imported, voiceRuns.
- Чтение отсутствующего project не означает, что все его файлы гарантированно никому не нужны; stale означает «нет owner среди известных».
- Prune повторно вычисляет кандидатов, применяет only/scope/project, выдаёт wouldTake без explicit confirm.
- Для stale referenced файлов удаление возможно при explicit confirmation; это не обещание обнаружить все проекты диска.
- Пофайловый rm error сейчас пропускается; результат сообщает реально removed/bytes, не весь planned count (`electron/storage.ts:271`).
- Scan/prune не имеют общего cancel-job протокола; отмена UI перед подтверждением не равна остановке уже начавшегося rm.
- Формула HDR/alpha suffix переиспользуется из cacheKeys, включая HDR_VERSION (`electron/cacheKeys.ts:34`).

## Переиспользуемое

- `logInfo`, `logWarn`, `logError`, `wireLog`, `logAsText` — один error-reporting funnel.
- `readingTime`, `boxContrast`, `cameraJerks`, CHECK_LIMITS — pure/testable части checks (`src/engine/checks.ts:102`, `src/engine/checks.ts:133`).
- `mediaCacheKey`, `proxySuffix`, `decodedSuffix` — общие identity helpers, не копировать в StoragePanel.
- Domain storage flow — `src/engine/storage.ts`; UI оболочка — `src/components/StoragePanel.tsx`.

## Эталонные реализации

- `src/engine/log.ts:119` — идемпотентный catch-all wiring с исключением benign browser notices.
- `electron/storage.ts:243` — count-before-delete и boundary guard.
- `src/engine/checks.ts:184` — камера по speed discontinuity вместо raw acceleration.

## Проверка

- `scripts/e2e48.mjs` — checks; `scripts/e2e49.mjs` — models/collisions; эти suites здесь не запускались.
- Локально проверять log cap/unseen/info/clear/export text; prune без confirm — ноль удалений, referenced project/all — отказ.
- Storage tests должны использовать isolated files, не реальные user stores; [Testing](../patterns/TESTING.md) определяет safety.
- Preview/export profiling выполнять без принудительного убийства CDP profiler; историческая sampler проблема описана в snapshot, не воспроизводилась здесь.

## Текущее состояние / долг

- Memory-only — сознательное поведение, не отсутствие реализованного «обязательного disk log».
- Quality checks покрывают declarative inspect и выбранные pixel samples, не весь возможный контент/доступность/монтажную драматургию.
- BVH collision требует indexed geometries обеих сторон; importer/kit-contract см. [3D](./MODELS_3D.md).
- Исторические performance metrics в snapshot не заменяют свежую диагностику текущего Windows/GPU.
- Scan ownership зависит от предоставленного inventory; автоматический поиск всех проектов не обещан.

## Open Questions

- Нужны ли explicit partial-failure details в prune вместо текущего счётчика успешных удалений?
- Нужен ли добровольный диагностический bundle без изменения memory-only defaults и без секретов?

## Навигация

⬆ [Renderer](../layers/RENDERER.md) · ↔ [Project IO](./PROJECT_IO.md), [Preview/GPU](./PREVIEW_AND_GPU.md), [Fragments](./FRAGMENTS.md), [3D](./MODELS_3D.md).
Сквозные нормы: [Cache/storage](../patterns/CACHE_AND_STORAGE.md), [UI](../patterns/UI_CONVENTIONS.md), [Testing](../patterns/TESTING.md).
