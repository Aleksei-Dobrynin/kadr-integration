---
title: "Remotion-фрагменты и управляемый workspace"
level: L3
type: module
stack: desktop
parent: ../layers/MAIN_PROCESS.md
related: [../layers/RENDERER.md, ../patterns/RENDER_PIPELINE.md, ../patterns/CACHE_AND_STORAGE.md, ../patterns/PROCESS_LIFECYCLE.md, ../patterns/TESTING.md, ./EXPORT.md, ./PREVIEW_AND_GPU.md, ./MODELS_3D.md, ./MUSIC_AND_SOUNDS.md, ../../shared/DEPENDENCIES.md]
sources: [electron/fragments.ts, electron/fragment-kit/player.tsx, electron/fragment-kit/vite.config.ts, electron/fragment-kit/runtime.ts, electron/fragment-kit/webpack.ts, src/engine/fragmentParams.ts, src/engine/fragmentCapture.ts, src/components/FragmentOverlays.tsx, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Remotion-фрагменты и управляемый workspace

> **Когда читать:** fragment create/delete, preview/capture, Remotion render, params, HMR и зависимости workspace. Родитель: [Main process](../layers/MAIN_PROCESS.md).

## Границы и данные

Main создаёт workspace, связывает project-owned TSX, поднимает dev server и render queue.
Renderer хранит remotion clips и выбирает iframe overlay либо capture в GL.
`~/kadr-fragments` — внешний генерируемый workspace, **не** `src/` этого репозитория.
Его `src/fragments/lazy.ts`, `src/_entries/current.tsx`, `src/_kadr/*` создаются генератором.
Канонические repo-источники: `electron/fragments.ts` и шаблоны `electron/fragment-kit/`.
У сохранённого проекта исходники фрагментов и `kadr-lib` принадлежат папке проекта; workspace содержит связи/служебные файлы.
Вход render: fragment id, transparency, optional composition range; выход: path, cached, start, duration.

## Правила

1. **Редактировать шаблон, а не выдавать внешний workspace за repo-код.**
   Почему: локальная правка generated runtime исчезнет при следующей синхронизации.
   ✅ `electron/fragment-kit/runtime.ts`; ❌ ссылка на отсутствующий repo `src/_kadr/runtime.ts`.
   Эталон: генераторы `electron/fragments.ts:328`, `electron/fragments.ts:709`.
2. **Набор workspace-зависимостей согласован и pin-нут отдельно от приложения.**
   Почему: несовместимые Remotion/React/Three ломают preview и offline render по-разному.
   ✅ мигрировать существующий package.json/tsconfig; ❌ создать их только при первом запуске и забыть обновления.
   Эталон: `electron/fragments.ts:92`, `electron/fragments.ts:283`.
3. **Server startup сериализован и умеет принять уже работающий экземпляр.**
   Почему: изменение vite.config перезапускает старый server с временно занятым портом.
   ✅ `starting`, awaitExisting и adoption; ❌ spawn второго vite после одного неудачного probe.
   Эталон: `electron/fragments.ts:410`, `electron/fragments.ts:422`.
4. **Следить за realpath project symlink и повторным появлением папки.**
   Почему: chokidar не подхватывает позднюю symlink-директорию; inode может быть переиспользован.
   ✅ сверка `getWatched()` и relay событий; ❌ надеяться на старый watcher после delete/recreate.
   Эталон: `electron/fragment-kit/vite.config.ts:15`, `electron/fragment-kit/vite.config.ts:50`.
5. **Одна очередь — один render-entry и managed config.**
   Почему: entry на каждый fragment раздувал webpack cache; общий entry нельзя переписывать до своей очереди.
   ✅ writeRenderEntry внутри renderChain; ❌ параллельные записи `current.tsx`.
   Эталон: `electron/fragments.ts:709`, `electron/fragments.ts:924`.
6. **Cache появляется только после успешного render.**
   Почему: оборванный WebM может корректно читаться, но тихо заканчиваться раньше композиции.
   ✅ `.part.webm/mp4` → rename; ❌ render сразу в финальный cache path.
   Эталон: `electron/fragments.ts:903`, `electron/fragments.ts:973`; общая норма — [Cache/storage](../patterns/CACHE_AND_STORAGE.md).
7. **Progress включает draw и stitch, cancel достигает потомков.**
   Почему: VP9 долго кодируется после отрисовки, а Chrome живёт в отдельной process group.
   ✅ Rendered + Stitched/Encoded, snapshot дерева и SIGKILL; ❌ TERM только npx.
   Эталон: `electron/fragments.ts:833`, `electron/fragments.ts:951`; Windows-ветка — taskkill `/T /F` (`electron/fragments.ts:837`).
8. **Overlay не должен скрыть GL-слой над собой.**
   Почему: iframe физически поверх GL canvas, порядок таймлайна сам по себе недостаточен.
   ✅ `fragmentNeedsCapture` при GL-only свойствах/перекрытии сверху; ❌ любой fragment всегда iframe.
   Эталон: `src/components/FragmentOverlays.tsx:110`, `src/engine/fragmentCapture.ts`.
9. **Один site на slot, только нужный lazy fragment, parked opacity 0.001.**
   Почему: общий main thread/полная registry и visibility:hidden увеличивали задержку первого кадра.
   ✅ свободный `f<slot>.localhost`; ❌ одна и та же origin/thread у входящей и выходящей тяжёлых страниц.
   Эталон: `src/components/FragmentOverlays.tsx:147`, `src/components/FragmentOverlays.tsx:162`, `src/components/FragmentOverlays.tsx:179`.
10. **Readiness означает реально нарисованный кадр.**
    Почему: seek acknowledgement не ждёт fonts/models/canvas и двух rAF.
    ✅ ждать `__kadrDrawn`, clamp frame к композиции; ❌ snapshot сразу после postMessage.
    Эталон: `electron/fragment-kit/player.tsx:153`, `electron/fragment-kit/player.tsx:298`.
11. **Params сохраняются patch-merge после 400 ms тишины.**
    Почему: полная перезапись затирала ручную параллельную правку params.json.
    ✅ live значения всем страницам, merge только изменённых ключей; ❌ сохранить старую полную копию.
    Эталон: `src/engine/fragmentParams.ts:23`, `src/engine/fragmentParams.ts:50`, `electron/fragments.ts:633`.

## Поток данных и сохранение

- `createFragment` создаёт TSX/meta и обновляет registry (`electron/fragments.ts:502`); renderer добавляет clip по правилам undo.
- `deleteFragment` требует согласованного удаления ссылок clips; project relocation обслуживается main (`electron/fragments.ts:533`, `electron/fragments.ts:558`).
- `@lib/` разрешается относительно realpath импортёра; `@kadr/runtime`/`@kadr/three` — managed kit.
- Fonts из kadr-lib/fonts регистрируются player/render entry, не отдельным компонентом (`electron/fragments.ts:709`).
- Vite watcher сообщает params add/change/unlink отдельным событием; значения обновляются без reload (`electron/fragment-kit/vite.config.ts:146`).
- `fragmentHash` включает kadr-lib/runtime только при их импорте, чтобы общий код инвалидировал зависимые renders (`electron/fragments.ts:657`).
- Partial render использует абсолютные `--frames`, full-cache приоритетен; range math и inPoint conversion — [Export](./EXPORT.md).
- Transparency: PNG source frames → VP9 yuva420p CRF12; opaque: H.264 CRF15 (`electron/fragments.ts:918`).
- Managed config добавляет VP9 row-mt после пользовательского override; `KADR_VP9_ROW_MT=0` — диагностический opt-out (`electron/fragments.ts:763`).
- Cancellation устанавливает общий флаг: queued jobs отказывают, пока он остаётся true; любой следующий `fragment:render` IPC сбрасывает его (`electron/fragments.ts:1236`). Это не cancellation token конкретного job. Unix чистит новый scratch directory, Windows-ветка возвращается после taskkill.
- Error удаляет `.part`, сохраняет живую очередь через catch; успешный результат отвечает picture duration в frames/fps.

## Переиспользуемое

- `writeManaged`/`writeFragmentFile` — согласованная запись generated files (`electron/fragments.ts:231`, `electron/fragments.ts:612`).
- `defineParams`/`useParams`, `defineInspect`, font helpers — `electron/fragment-kit/runtime.ts`.
- Three preview on-demand shim — `electron/fragment-kit/three-preview.tsx`; offline renderer этот Vite-only shim не использует.
- `flushParamSaves` нужен до render/hash, иначе последний slider edit ещё не на диске (`src/engine/fragmentParams.ts:99`).
- Capture BrowserWindow создаётся с `enableLargerThanScreen`, иначе hidden viewport может быть обрезан (`electron/fragments.ts:1121`).

## Эталонные реализации

- Pins: Remotion cli/player/three/core 4.0.247; React/react-dom 18.3.1; fiber 8.17.14; Three 0.170.0; BVH 0.8.3 (`electron/fragments.ts:92`).
- Dev pins: @types/react 18.3.3, @types/three 0.170.0, plugin-react 4.3.1, TS 5.5.4, Vite 5.4.8 (`electron/fragments.ts:104`).
- Boot delayRender/continueRender pair снимает вечное false readiness; leaked handle ждётся до 1.5 s (`electron/fragment-kit/player.tsx:23`, `electron/fragment-kit/player.tsx:173`).

## Проверка

- `scripts/e2e45.mjs`: stacking и late project HMR; `scripts/e2e46.mjs`: cuts/snapshots.
- `scripts/e2e47.mjs`: library/fonts/render entry/typecheck; `scripts/e2e50.mjs`: params.
- `scripts/e2e52.mjs`: partial render pixel parity; эти suites не запускались в данной работе.

## Текущее состояние / долг

- Унаследованные, не повторённые метрики: first frame 2.3 s →42–76 ms, heap 380→62 MB; grain 119 MB/144 s против 3.6 MB/40 s на 120 frames.
- Случайный grain каждого прозрачного кадра плохо сжимается: предпочтителен отдельный короткий loop RGBA, а не шум в тяжёлом fragment.
- VP9 row-mt не bit-identical к encode без него; историческая оценка качества/ускорения не является свежим benchmark.
- Shell watchdog использует `sh`; наличие Windows taskkill-ветки не доказывает Windows-ready весь workspace lifecycle.

## Open Questions

- Нужна ли отдельная Windows-реализация запуска/watchdog и симметричная очистка scratch после taskkill?
- Как диагностировать leaked delayRender без бесконечного ожидания и без сокрытия неполной загрузки?

## Навигация

⬆ [Main process](../layers/MAIN_PROCESS.md) · ↔ [Export](./EXPORT.md), [Preview/GPU](./PREVIEW_AND_GPU.md), [3D](./MODELS_3D.md), [Diagnostics](./DIAGNOSTICS.md).
Сквозные нормы: [Lifecycle](../patterns/PROCESS_LIFECYCLE.md), [Render pipeline](../patterns/RENDER_PIPELINE.md), [Dependencies](../../shared/DEPENDENCIES.md).
