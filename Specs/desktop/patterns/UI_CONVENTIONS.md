---
title: "UI: токены, доступность и плотный timeline"
level: L2
type: pattern
stack: renderer
parent: ../DESKTOP_CORE.md
related: [./UNDO_AND_STATE.md, ./RENDER_PIPELINE.md, ./TESTING.md, ../layers/RENDERER.md, ../modules/TIMELINE.md, ../modules/DIAGNOSTICS.md]
sources: [src/styles.css, src/theme.ts, src/components/Modal.tsx, src/App.tsx, src/components/Timeline.tsx, scripts/gen-icons.mjs, src/engine/log.ts, scripts/e2e40.mjs]
status: draft
updated: 2026-11-03
---

# UI: токены, доступность и плотный timeline

> **Когда читать:** перед добавлением диалога, цвета, иконки, canvas-контрола, hotkey или оптимизацией timeline DOM.
> Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md) · стек: renderer.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Новые UI-цвета и шкалы дизайна определять в token-блоке `styles.css`, потреблять через var. | Разрозненные literals расходятся между chrome, timeline и overlays. | ✅ существующая семантика `--c-*`; ❌ новый hex в selector компонента. | `src/styles.css:25` |
| Рисуемые вручную поверхности используют те же CSS tokens через `theme.token`. | Canvas/xterm CSS напрямую не стилизует. | ✅ waveform/meter/terminal читают tokens; ❌ отдельная JS-палитра. | `src/theme.ts:11`, `src/components/Timeline.tsx:1591`, `src/components/ClaudePanel.tsx:106` |
| Не выдавать отсутствие literals во всём src за текущее состояние. | Есть fallback literals в JS и цвета содержимого проекта; это не независимые UI themes. | ✅ различать UI token, fallback и model colour; ❌ механически удалить все `#`. | `src/components/AudioMeter.tsx:47`, `src/gl/compositor.ts:1022` |
| Контраст проверять измерением, а не визуальным впечатлением. | Тёмный интерфейс должен сохранять читабельность и видимые границы controls по WCAG 2.2 AA. | ✅ проверка текста и control boundary; ❌ «на мониторе нормально». | `src/styles.css:20`, `scripts/e2e40.mjs:1` |
| Сохранять pseudo-element scrollbar path там, где нужен minimum thumb. | Стандартные non-auto scrollbar properties подавляют Chromium webkit rules. | ✅ min-width timeline thumb; ❌ `scrollbar-width: thin` на timeline. | `src/styles.css:231`, `src/styles.css:1347` |
| Диалоги строить через `Modal` с head/body/footer, trap и восстановлением фокуса. | Иначе клавиатура выходит в редактор и focus теряется при закрытии. | ✅ общий shell; ❌ новая независимая modal-back без поведения. | `src/components/Modal.tsx:27`, `src/components/Modal.tsx:44`, `src/components/Modal.tsx:58` |
| Global editor hotkeys не исполняются при открытом Modal. | Space на кнопке не должен одновременно запускать playback; D — удалять фоновые clips. | ✅ ранний `modalsOpen()` guard; ❌ проверка только INPUT/TEXTAREA. | `src/App.tsx:159`, `src/components/Modal.tsx:14` |
| Иконки интерфейса — общий inline lucide SVG, не emoji. | ОС меняет форму/цвет emoji, плотные controls теряют единый вес. | ✅ `Icon` с currentColor; ❌ emoji как кнопочная пиктограмма. | `scripts/gen-icons.mjs:59` |
| Новую иконку добавлять в MAP и регенерировать; SVG paths вручную не править. | Generated file должен воспроизводиться из локального набора lucide. | ✅ `MAP` → generator; ❌ edit paths в `icons.tsx`. | `scripts/gen-icons.mjs:7`, `scripts/gen-icons.mjs:15` |
| Генератор иконок локальный; получение lucide package — отдельная предпосылка. | Сам script не делает network request, но `npm pack` может потребовать сеть. | ✅ распакованный package передан аргументом; ❌ обещать полностью offline bootstrap. | `scripts/gen-icons.mjs:3`, `scripts/gen-icons.mjs:11` |
| Timeline culling оставляет selection в DOM, даже вне видимости. | Drag не должен размонтировать захваченный clip под pointer. | ✅ near-view + selected; ❌ фильтр строго по viewport. | `src/components/Timeline.tsx:956` |
| Zoom-жест сначала масштабирует drawn lanes/ruler/overlays, затем коммитит zoom вокруг anchor-time. | Полный render на каждом wheel событии дорог; pixel-rounded anchor даёт drift. | ✅ commit по паузе/пределу/на pointerdown; ❌ вычислять новый anchor после каждого commit. | `src/components/Timeline.tsx:235`, `src/components/Timeline.tsx:271` |
| Пользовательские сбои попадают в session log, а INFO не поднимает badge. | Одного console.warn недостаточно для объяснения «нажал — ничего». | ✅ `logWarn`/`logError`; ❌ молча потерять ошибку. | `src/engine/log.ts:50` |

## Переиспользуемое

- `:root` содержит neutral ramp, accent, semantic editing colours и RGB channels для washes.
- `theme.token` кеширует значения на жизнь окна; dynamic theme switching сейчас не контракт.
- `Modal` учитывает closeDisabled и `aria-labelledby`, экспортирует `modalsOpen`.
- `Icon` наследует currentColor; набор генерируется из `lucide-static`, runtime package не нужен.
- Локальный generator принимает package directory; `/tmp/package` в нём — Unix default, не путь Windows.
- `useT`/`tr` и `src/i18n.ts` — существующий RU/EN словарь, не второй набор строк в компоненте.
- Для больших timelines `ClipView` и CSS `--z` отделяют geometry от дорогой перерисовки.
- Клип меньше 6 px имеет упрощённое представление одним элементом.
- `useLog` хранит последние 500 entries в памяти; это не persistent telemetry.

## Эталонные реализации

- Semantic editing hues: `src/styles.css:57`; deliberate hit targets: `src/styles.css:14`.
- Hidden toolbar scrollbar — отдельное исключение: `src/styles.css:1313`.
- Общие размеры scrollbar и minimum thumb: `src/styles.css:240`, `src/styles.css:251`.
- Modal role/aria и состав: `src/components/Modal.tsx:87`.
- Передача CSS цветов canvas: `src/components/AudioMeter.tsx:47`.
- Culling включается при длине свыше четырёх экранов: `src/components/Timeline.tsx:966`.
- Zoom threshold 0.5–2 и debounce 150 ms: `src/components/Timeline.tsx:283`.
- Tiny clips и geometry: `src/components/Timeline.tsx:1913`, `src/components/Timeline.tsx:1520`.
- UI regressions: `scripts/e2e40.mjs:1`; log: `scripts/e2e41.mjs:1`.

## Текущее состояние / долг

- По текущему `styles.css` hex-цвета находятся в root-блоке; ниже есть selector `#root`.
- Поэтому исходный тест «grep на # должен быть пустым» без разбора selector некорректен.
- В JS есть fallback hex у meter/terminal и model defaults; blanket «нулевые literals вне :root» неверен.
- В CSS остаются raw px и durations; hit targets специально объяснены `ds-allow-hardcode` в header.
- Норма единого design language не утверждает, что каждый размер уже вынесен в token.
- Унаследованные contrast ratios в комментариях не пересчитывались в этой задаче.
- Наличие shell-текста npm pack в инструкции не означает установку или скачивание здесь.
- Live accessibility, coordinate E2E и screenshots в этой работе не запускались.

## Open Questions

- Нужна ли поддержка смены темы, при которой cache `theme.token` должен инвалидироваться?
- Какие raw hit-target значения оператор хочет оставить как явно документированные исключения?
- Следует ли уточнить автоматическую проверку CSS literals, чтобы отделять selectors и цвета?

## Навигация

- ⬆ [DESKTOP_CORE](../DESKTOP_CORE.md).
- ↔ [Renderer](../layers/RENDERER.md), [State/undo](UNDO_AND_STATE.md), [Render](RENDER_PIPELINE.md).
- ↔ [Testing](TESTING.md).
- ↓ [Timeline](../modules/TIMELINE.md), [Diagnostics](../modules/DIAGNOSTICS.md).
