---
title: "Проверки, регрессии и безопасный E2E"
level: L2
type: pattern
stack: desktop
parent: ../DESKTOP_CORE.md
related: [./UNDO_AND_STATE.md, ./RENDER_PIPELINE.md, ./CACHE_AND_STORAGE.md, ./PROCESS_LIFECYCLE.md, ./UI_CONVENTIONS.md, ../../PROCESS.md]
sources: [package.json, scripts/e2e.mjs, scripts/e2e28.mjs, scripts/e2e32.mjs, scripts/e2e36.mjs, scripts/e2e44.mjs, scripts/e2e51.mjs, scripts/e2e52.mjs, scripts/check-phrases.py, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Проверки, регрессии и безопасный E2E

> **Когда читать:** при выборе regression suite, перед CDP/профилированием и любым тестом, который меняет открытый проект или userData.
> Родитель: [DESKTOP_CORE](../DESKTOP_CORE.md) · стек: desktop.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Typecheck включает renderer и main, build — отдельная проверка сборки. | Успешный TypeScript не доказывает bundling и наоборот. | ✅ `npm run typecheck` и `npm run build`; ❌ объявить оба пройденными по одному exit code. | `package.json:10` |
| E2E требует запущенный Electron с display и CDP port 9777 либо настройкой suite. | Скрипты подключаются к живому редактору, не запускают изолированный unit runtime. | ✅ отдельная тестовая сессия; ❌ незаметно подключиться к работе пользователя. | `scripts/e2e.mjs:1`, `scripts/e2e.mjs:6` |
| Перед reload/заменой проекта сохранить текущую работу и прочитать safety конкретного suite. | Старые suites могут сами менять реальный проект; защита не унифицирована. | ✅ autosave и пустой тестовый проект; ❌ считать любой номер безопасным. | `scripts/e2e.mjs:68`, `scripts/e2e51.mjs:94` |
| Async CDP eval паркует результат в global и poll-ит его. | `awaitPromise` flaky при GC и reload. | ✅ existing eval helper; ❌ длинная операция только через awaitPromise. | `scripts/e2e2.mjs:38`, `scripts/e2e51.mjs:56` |
| Touching user store требует snapshot и восстановления, включая отсутствие файла. | Presets, CLI override, TTS settings и key принадлежат реальному пользователю. | ✅ finally restore; ❌ заменить отсутствующий файл JSON null или оставить bash override. | `scripts/e2e15.mjs:80`, `scripts/e2e22.mjs:260`, `scripts/e2e36.mjs:298` |
| Синтезирующие voice-over suites запускать только с `KADR_TTS_MOCK=1` в environment приложения. | Без mock расходуются реальные ElevenLabs credits. | ✅ локальный ffmpeg synth для e2e36/38; ❌ выставить флаг только тестовому клиенту. | `scripts/e2e36.mjs:3`, `scripts/e2e38.mjs:3` |
| Exact render optimizations проверять на кадрах, не hash контейнера после x264. | Недетерминированность encode не означает изменения compositor. | ✅ frame hashes/pixels; ❌ binary diff MP4 как единственный критерий. | `src/engine/exporter.ts:378`, `docs/reference/AGENTS-before-specs.md:475` |
| Force guard применять по фактическому коду suite, не комментарию. | e2e51 считает clipsOpen, но не содержит runtime отказа. | ✅ отдельно проверить 44–50 и 52; ❌ blanket «44–52 защищены». | `scripts/e2e44.mjs:99`, `scripts/e2e52.mjs:67`, `scripts/e2e51.mjs:94` |
| Profiling CDP — interval ≥1 ms и корректное завершение клиента. | Унаследованный сбой sampler при 200 µs/убитом клиенте приводил к зависанию main thread. | ✅ завершить capture; ❌ kill profiling client посреди записи. | `docs/reference/AGENTS-before-specs.md:718` |

## Переиспользуемое

### Проверки без live приложения

Команда для `.mjs`: `node scripts/<имя>`; это отдельные скрипты, не новый npm test target.

| Скрипт | Что фиксирует | Зависимости / эталон |
|---|---|---|
| `check-envelope.mjs` | Blender-like follower и frame sampling | Node + установленный esbuild; `scripts/check-envelope.mjs:1` |
| `check-ttstext.mjs` | Нормализация/chunking, отсутствие потери текста | Node; `scripts/check-ttstext.mjs:1` |
| `check-proxy.mjs` | Выбор proxy и Chromium spelling | Без сети; `scripts/check-proxy.mjs:1` |
| `check-voicemap.mjs` | Source-time mapping после splice | Node; `scripts/check-voicemap.mjs:1` |
| `check-beats.mjs` | Synthetic grid/curves; optional parity bundled cues | Без ffmpeg на синтетике; с `resources/music` нужен ffmpeg; `scripts/check-beats.mjs:1` |
| `check-limiter.mjs` | Прозрачность ниже limit, peaks и задержка | ffmpeg; `scripts/check-limiter.mjs:1` |
| `check-sfx-labels.mjs` | Features/labels по набору 228 cues и synthetic hit | ffmpeg/ffprobe + bundled media; `scripts/check-sfx-labels.mjs:1` |
| `check-hdr.mjs` | Maths и настоящий HDR→SDR filter pipeline | ffmpeg; `scripts/check-hdr.mjs:1` |
| `check-models.mjs` | STL/3MF/components/units, GLB, decimation | Установленные 3D deps; optional реальные файлы; `scripts/check-models.mjs:1` |
| `check-timeline.mjs` | Точное равенство waveform maxima и overlap sweep старому коду | Node, без app; `scripts/check-timeline.mjs:1` |
| `check-phrases.py` | Рез в реальную тишину и соседние предложения на границе | Python 3.11 + NumPy, без ML/GPU; `scripts/check-phrases.py:1` |

### Карта E2E

Номер — имя `scripts/e2eNN.mjs`; первый suite называется `scripts/e2e.mjs`.
Таблица маршрутизирует к коду, не утверждает успешный запуск или полное покрытие фичи.

| Suites | Основной concern | Вход в реализацию проверки |
|---|---|---|
| e2e, 2–3 | Import/timeline/split/undo/preview/export; gap/copy/range; waveform/fades/loop/speed | `scripts/e2e.mjs:1`, `scripts/e2e2.mjs:1`, `scripts/e2e3.mjs:1` |
| 4–5 | Multi-select/drag/masks/keyframes; animation panel/stage | `scripts/e2e4.mjs:1`, `scripts/e2e5.mjs:1` |
| 6–9 | AV links, easing/masks, auto-keyframes, levels/meter и cross-track drag | `scripts/e2e6.mjs:1`, `scripts/e2e7.mjs:1`, `scripts/e2e8.mjs:1`, `scripts/e2e9.mjs:1` |
| 10–12 | Snap/playhead, linked trim/speed, track motion, orbit, perspective | `scripts/e2e10.mjs:1`, `scripts/e2e11.mjs:1`, `scripts/e2e12.mjs:1` |
| 13–15 | Overlap/edge transitions; pose preset persistence | `scripts/e2e13.mjs:1`, `scripts/e2e14.mjs:1`, `scripts/e2e15.mjs:1` |
| 16–18 | Proxy/original export, fast decode parity, motion blur | `scripts/e2e16.mjs:1`, `scripts/e2e17.mjs:1`, `scripts/e2e18.mjs:1` |
| 19–21 | Glow WYSIWYG, FX presets, frame blending | `scripts/e2e19.mjs:1`, `scripts/e2e20.mjs:1`, `scripts/e2e21.mjs:1` |
| 22–23 | PTY/HTTP/MCP; transcription/SRT/word cues | `scripts/e2e22.mjs:1`, `scripts/e2e23.mjs:1` |
| 24–26 | Fragment create/render/materialize; pixel capture; autosave/captions/gizmo | `scripts/e2e24.mjs:1`, `scripts/e2e25.mjs:1`, `scripts/e2e26.mjs:1` |
| 27–29 | Reverse/undo; save feedback и immutable blobs; project healing | `scripts/e2e27.mjs:1`, `scripts/e2e28.mjs:144`, `scripts/e2e29.mjs:1` |
| 30–31 | Blur; DnD/media cascade, speed, panel geometry и clipboard | `scripts/e2e30.mjs:1`, `scripts/e2e31.mjs:1` |
| 32–35 | Exact alpha/static shutter; neon-wave; PTY/media-token locks; GL lifecycle | `scripts/e2e32.mjs:1`, `scripts/e2e33.mjs:1`, `scripts/e2e34.mjs:1`, `scripts/e2e35.mjs:1` |
| 36–39 | TTS synthesis; fake QC findings; regen/splice; learning corpus | `scripts/e2e36.mjs:1`, `scripts/e2e37.mjs:1`, `scripts/e2e38.mjs:1`, `scripts/e2e39.mjs:1` |
| 40–43 | UI tokens/accessibility; session log; storage; popout identity/clock | `scripts/e2e40.mjs:1`, `scripts/e2e41.mjs:1`, `scripts/e2e42.mjs:1`, `scripts/e2e43.mjs:1` |
| 44–45 | Beats/audio bake/SFX; fragment stacking/capture и late-project HMR | `scripts/e2e44.mjs:1`, `scripts/e2e45.mjs:1` |
| 46–47 | Heavy preview/ready snapshots; project lib/fonts/render entry/typecheck | `scripts/e2e46.mjs:1`, `scripts/e2e47.mjs:1` |
| 48–49 | Inspect checks/contrast/seams; model import/kit/collisions | `scripts/e2e48.mjs:1`, `scripts/e2e49.mjs:1` |
| 50–51 | Params/onion skin; bounded pool/culling/zoom gestures | `scripts/e2e50.mjs:1`, `scripts/e2e51.mjs:1` |
| 52 | Partial renders по pixels, loop/speed, decoder first frame/backward jumps | `scripts/e2e52.mjs:1` |

## Эталонные реализации

- Реальные guards: e2e44:99, 45:62, 46:96, 47:93, 48:88, 49:91, 50:99 и 52:67 в соответствующих `scripts/e2eNN.mjs`.
- В этих guards проверяется truthiness `KADR_E2E_FORCE`; документированное opt-in значение — `1`.
- e2e51:94 лишь читает clipsOpen, затем заменяет project на строке 106; отдельного отказа нет.
- Preset snapshot/restore: `scripts/e2e15.mjs:80`, `scripts/e2e20.mjs:90`.
- CLI override restore: `scripts/e2e22.mjs:260`; key/settings cleanup: `scripts/e2e36.mjs:351`.
- Polling async result: `scripts/e2e51.mjs:58`; frame hook: `scripts/e2e32.mjs:143`.

## Текущее состояние / долг

- Live E2E в этой работе не запускались; карта получена чтением текущих suites.
- `KADR_E2E_FORCE` не является общим harness guard и не даёт разрешения портить открытый проект.
- Старые suites требуют `scripts/gen-test-media.sh`; новые часто сами создают `/tmp/kadr-*`.
- Есть Unix assumptions: bash/sh, HOME/.config/kadr, xclip и shell utilities; Windows portability не доказана.
- Для этой Windows-сессии временные файлы агента — `C:/Users/doale/AppData/Local/Temp/opencode`; scripts сами этим путём не переписаны.
- Запуск app с CDP: `npx electron-vite dev -- --remote-debugging-port=9777`; voice mock задаётся до запуска app.
- Main/preload changes требуют полного restart приложения; renderer HMR не обновляет main process.
- e2e37 использует fake QC findings и не заменяет проверку качества настоящей ML-модели.
- `preview-bench.mjs <from> <to>` проигрывает звук и меняет playback текущего проекта; это не тихий unit test.
- `hold-viewport.mjs [w] [h]` меняет layout viewport; coordinate suites чувствительны к окружению.
- Исторические FPS/PSNR/heap-цифры не объявляются вновь воспроизведёнными измерениями.
- Не добавлены test runner, CI gates, dependencies, новые npm targets или запуск ML.

## Open Questions

- Когда оператор выделит отдельную live-сессию для безопасного полного E2E-прогона?
- Нужен ли общий safety helper вместо разрозненных guards и restore blocks?
- Следует ли отдельно исправить отсутствующий guard e2e51 и Unix-only предпосылки suites?

## Навигация

- ⬆ [DESKTOP_CORE](../DESKTOP_CORE.md), [Процесс](../../PROCESS.md).
- ↔ [State](UNDO_AND_STATE.md), [Render](RENDER_PIPELINE.md), [Storage](CACHE_AND_STORAGE.md).
- ↔ [Lifecycle](PROCESS_LIFECYCLE.md), [UI](UI_CONVENTIONS.md).
