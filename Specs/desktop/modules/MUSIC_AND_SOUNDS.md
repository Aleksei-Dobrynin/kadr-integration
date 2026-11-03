---
title: "Музыка: биты, ритм, bake и библиотека звуков"
level: L3
type: module
stack: shared
parent: ../layers/RENDERER.md
related: [../layers/SHARED.md, ../layers/MAIN_PROCESS.md, ../patterns/UNDO_AND_STATE.md, ../patterns/CACHE_AND_STORAGE.md, ../patterns/TESTING.md, ./TIMELINE.md, ./FRAGMENTS.md, ./EXPORT.md, ../../shared/PROJECT_MODEL.md, ../../shared/INTEGRATIONS.md]
sources: [shared/audioAnalysis.ts, shared/rhythm.ts, shared/envelope.ts, shared/sfxFeatures.ts, electron/sounds.ts, electron/envelope.ts, src/engine/beats.ts, src/engine/audioReact.ts, src/engine/sounds.ts, src/engine/neonWave.ts, resources/CREDITS.md, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Музыка: биты, ритм, bake и библиотека звуков

> **Когда читать:** beat/rhythm анализ, музыкальные markers, audio-reactive TSX, loudness envelope и SFX placement. Родитель: [Renderer](../layers/RENDERER.md).

## Границы и контракт

Pure DSP живёт в shared; main декодирует/микширует ffmpeg; renderer выбирает диапазон и мутирует Project.
Input анализа: AudioSegments + duration; output: tempo, beats, rhythm summary, curves и optional attack alignment.
Marker — project-wide time, kind beat/section/pause; это не привязка к audio clip.
Bake переводит слышимый timeline mix в массивы на каждый composition frame.
SFX library объединяет bundled resources и пользовательскую `userData/sfx/<family>/`.
Лицензии — `resources/CREDITS.md`; bundled music CC BY 4.0 требует атрибуции, SFX имеют собственные CC0/source сведения.

## Правила

1. **Raw beat grid сохраняет семантику librosa 0.11, не 0.10.**
   Почему: trim, symmetric Hann, half-even rounding и сдвиг onset меняют каждый beat.
   ✅ port с roundHalfEven и np.hanning(5); ❌ заменить на Math.round/periodic Hann «как почти то же».
   Эталон: `shared/audioAnalysis.ts:473`, `shared/audioAnalysis.ts:580`, `shared/audioAnalysis.ts:666`.
2. **Attack alignment — отдельная осознанная стадия поверх raw grid.**
   Почему: onset peak на brickwalled bass часто позже слышимого начала; это не ошибка DP parity.
   ✅ raw через alignAttacks=false, default — условная коррекция; ❌ безусловно сдвинуть каждый beat на фиксированные ms.
   Эталон: `shared/audioAnalysis.ts:837`, `shared/audioAnalysis.ts:873`, `shared/audioAnalysis.ts:903`.
3. **Двигать grid только при устойчивом подтверждении атак.**
   Почему: sparse/noisy attacks иначе разрушат корректный ритм.
   ✅ ≥8 clear и ≥60%, IQR≤50 ms, |median|>25 ms; ❌ коррекция по одному удачному kick.
   Эталон: `shared/audioAnalysis.ts:838`, `shared/audioAnalysis.ts:848`.
4. **Пустой audible range — цифровая тишина, не ffmpeg без inputs.**
   Почему: export mixdown без `-i` не создаёт корректный analysis input.
   ✅ zeros bounded chunks, flat curves/no beats; ❌ вызвать muxer с пустыми segments и ждать silence WAV.
   Эталон: `electron/sounds.ts:37`, `electron/sounds.ts:44`; envelope следует тому же назначению.
5. **Bake использует composition↔timeline mapping с inPoint/speed.**
   Почему: frame τ слышит звук в `clip.start+(τ−inPoint)/speed`, а не под клипом с нулевого frame.
   ✅ bakePlan и контекст ±8 s, structure context 60 s; ❌ нарезать только видимую часть без контекста tempo.
   Эталон: `src/engine/audioReact.ts:36`, `src/engine/audioReact.ts:65`, `src/engine/audioReact.ts:90`.
6. **Свежесть определяется hash плана, не фактом наличия audio.json.**
   Почему: перемещение clip, правка tracks или markers меняет смысл данных.
   ✅ clip.audioBake.hash против bakePlan; ❌ сохранить «fresh» после смены музыки.
   Эталон: `src/engine/audioReact.ts:84`, `src/engine/audioReact.ts:106`, `src/engine/exporter.ts:778`.
7. **SFX features получают channel mean, не энергосохраняющий downmix.**
   Почему: ffmpeg `-ac 1` для stereo даёт √2 scaling и меняет выведенные из /brag labels.
   ✅ decode interleaved и sum/channels; ❌ применить -ac1 как эквивалент mean.
   Эталон: `electron/sounds.ts:105`, `electron/sounds.ts:124`.
8. **На beat ставится HIT, а не начало SFX-файла.**
   Почему: у boom может быть длинный lead-in; зритель слышит главный удар позже file start.
   ✅ start=max(0,at−hit), возвратить фактический hitAt; ❌ всегда start=beat.
   Эталон: `src/engine/sounds.ts:125`, `src/engine/sounds.ts:136`.
9. **Audio track должен быть свободен на всём span нового звука.**
   Почему: overlap на той же дорожке превращается в crossfade с музыкой.
   ✅ общий placeAudio; ❌ класть на первую свободную в точке start дорожку.
   Эталон: `src/engine/sounds.ts:138`, `src/state/store.ts:1145`.
10. **User SFX cache инвалидируется по версии анализа и файлу.**
    Почему: устаревшие features после смены формулы/медиа дают ложный HIT и labels.
    ✅ size+rounded mtime+SFX_ANALYSIS_VERSION; ❌ cache только по имени.
    Эталон: `electron/sounds.ts:175`, `electron/sounds.ts:193`.

## Поток данных и хранение

- `detectBeats` выбирает target, получает main analysis и создаёт markers одним domain action (`src/engine/beats.ts:46`, `src/engine/beats.ts:76`).
- Main mixdown использует слышимые gain/fades/speed без export limiter; decode для beat analysis — 44.1 kHz (`electron/sounds.ts:53`).
- AudioAnalyzer: 128 Slaney mel bands → onset strength → tempogram с prior 120 BPM → Ellis DP → 0.11 trim.
- Attack search [−180,+60] ms ищет steepest rise на −6 dB, low band <150 Hz сначала, full band затем (`shared/audioAnalysis.ts:745`).
- Low envelope 20 ms нужна для периода 50 Hz, full 5 ms; delay/filter centering компенсируются, а не игнорируются.
- Rhythm определяет meter/downbeat по kick+bass+harmonic change−backbeat, sections через self-similarity/loudness, pauses как непериодические относительные dips (`shared/rhythm.ts`).
- Project markers участвуют в snapping; beat markers учитывают настройку snapBeats и exclude ids — владелец UX [Timeline](./TIMELINE.md).
- Bake пишет `audio.json` и `audio.ts` в папку fragment; данные детерминированно читаются на frame, без runtime FFT (`src/engine/audioReact.ts:113`).
- Generated hooks: useAudio/audioAt, useAccent/accentAt, breathAt, sectionAt, bars, pauses.
- Export пытается refreshStaleBakes перед materialization; failed rebake сейчас warning со старым bake, не жёсткий отказ (`src/engine/exporter.ts:774`).
- User sounds сканируются в main, метаданные сохраняются в `userData/sfx/kadr-sfx.json`; bundled catalog — repo resource (`electron/sounds.ts:175`).
- Label correction через setUserSoundMeta не должна переписать bundled source audio (`electron/sounds.ts:238`).

## Envelope и neon wave

Envelope — отдельный loudness follower, не замена beat detector: channels sum → abs → one-pole attack 5 ms/release 200 ms.
Frame sampling линейный; semantics наследуют Blender Bake Sound to F-Curves (`shared/envelope.ts:53`, `shared/envelope.ts:120`).
Main вычисляет envelope из WYSIWYG mixdown; `neonWave` генерирует fragment с baked ENV/style.
Lens Distortion в финальном shader повторяет Blender per-channel dispersion, а не произвольную radial approximation (`src/engine/neonWave.ts`).
Пустой звук должен дать нулевой envelope, а не ошибку no-input mux (`electron/envelope.ts`).

## Ошибки и отмена

- Недопустимая duration — ошибка; transient WAV очищается в finally (`electron/sounds.ts:39`, `electron/sounds.ts:70`).
- Анализ main использует потоковый ffmpeg и сохраняет остаток невыравненного f32 chunk; потеря байтов не допускается.
- В этом IPC нет обещания общего cancellable analysis job; не путать его с cancel экспортного mux/STT.
- Bake имеет побочные записи в fragment directory: проектный hash — маркер согласованности, не транзакция двух файлов.
- Placement/import errors должны доходить до UI/log, а не оставлять фиктивный успешно добавленный sound.

## Нормализация громкости отдельного клипа

Владелец — `normalizeClip` в `src/engine/normalize.ts:33`, не master limiter экспортного микса.

- **Правило:** нормализовать звучащий audio twin linked-пары; keyframed gain отклонять. **Почему:** статическая нормализация не должна уничтожить envelope автоматизации. ✅ найти audio-track twin, затем измерить; ❌ заменить gain с ключами одним числом. Эталон: `src/engine/normalize.ts:39`, `src/engine/normalize.ts:49`.
- **Правило:** измерять используемый source span с учётом inPoint/speed и source duration; default target −14 LUFS, ceiling −1 dBTP. **Почему:** нормализация всего исходника не соответствует выбранной части; достижение LUFS не оправдывает превышение peak ceiling. ✅ `gainDb = min(target−i, ceiling−tp)` по условию; ❌ обещать обязательное достижение target при peak limit. Эталон: `src/engine/normalize.ts:9`, `src/engine/normalize.ts:56`.
- Результат — статический gain, measured LUFS/true peak и peakLimited; одна запись undo; busy снимается в finally. Это не loudness-normalization всего микса и не новый rendered asset: `src/engine/normalize.ts:68`.
- После долгого measurement текущий helper не повторяет все проверки clip/project provenance; это ограничение реализации, не гарантия безопасного применения к сменившемуся проекту.

## Переиспользуемое

- `AudioAnalyzer`, `analyzeBeats`, `analyzeRhythm`, `sampleCurve` — shared DSP без Electron/DOM.
- `bakePlan`, `bakeState`, `musicMap` — единая temporal/hash семантика (`src/engine/audioReact.ts:65`, `src/engine/audioReact.ts:318`).
- `findSfx`, `addSound`, `placeAudio` — selection и placement без копии в MCP (`src/engine/sounds.ts:70`).
- `sfxFeatures`/`labelSfx`/SFX_ANALYSIS_VERSION — одинаковые для bundled regeneration и user scan (`shared/sfxFeatures.ts`).

## Эталонные реализации

- `electron/sounds.ts:108` — явный arithmetic mean каналов.
- `shared/audioAnalysis.ts:837` — bounded conditional attack alignment без изменения raw parity режима.
- `src/engine/audioReact.ts:65` — pure staleness plan до side effects.

## Проверка

- `node scripts/check-beats.mjs resources/music` — raw/librosa cues и attack behavior; `node scripts/check-envelope.mjs` — follower.
- `node scripts/check-sfx-labels.mjs` — labels vs reference; `scripts/gen-sfx-catalog.mjs` — regeneration после изменения analysis version/resources.
- `scripts/e2e44.mjs` — beats/bake/library, требует безопасного проекта; здесь не запускался.

## Текущее состояние / долг

- 96–99% label agreement, ~110 ms bass offset и bundled parity — унаследованные результаты, не повторённые измерения.
- Attack alignment исправляет устойчивое опоздание, но не потерю фазы beat tracker; rhythm confidence не означает гарантированную музыкальную истину.
- Labels reverse-engineered из опубликованных /brag данных, не оригинальная модель классификации.
- При смене library/analysis license и attribution нужно проверять отдельно; перенос media не делает лицензию CC0 автоматически.

## Open Questions

- Нужны ли explicit cancellation/progress для длинного анализа и атомарность пары bake files?
- Как показывать низкую rhythm confidence, не меняя существующую marker semantics?

## Навигация

⬆ [Renderer](../layers/RENDERER.md) · ↔ [Timeline](./TIMELINE.md), [Fragments](./FRAGMENTS.md), [Export](./EXPORT.md).
Сквозные нормы: [Undo/state](../patterns/UNDO_AND_STATE.md), [Cache/storage](../patterns/CACHE_AND_STORAGE.md), [Testing](../patterns/TESTING.md).
