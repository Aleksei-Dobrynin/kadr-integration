---
title: "Текстовые документы, SRT и анимированные субтитры"
level: L3
type: module
stack: renderer
parent: ../layers/RENDERER.md
related: [../patterns/UNDO_AND_STATE.md, ../patterns/RENDER_PIPELINE.md, ../patterns/TESTING.md, ../../shared/PROJECT_MODEL.md, ./MEDIA_IMPORT.md, ./TRANSCRIPTION.md, ./FRAGMENTS.md, ./VOICEOVER.md]
sources: [src/engine/subtitles.ts, src/engine/captions.ts, src/components/TextTools.tsx, src/engine/mediaImport.ts, shared/types.ts, scripts/e2e23.mjs, scripts/e2e26.mjs, FEATURES.md]
status: draft
updated: 2026-11-03
---

# Текстовые документы, SRT и анимированные субтитры

> **Когда читать:** При изменении SRT parse/serialize, TextDoc, seek по репликам, word splitting или генерации captions. Родитель: [Renderer](../layers/RENDERER.md).

## Назначение и границы

`src/engine/subtitles.ts` существует и содержит SRT helpers, word grouping и общий transcription flow.
`src/engine/captions.ts` генерирует прозрачный Remotion-фрагмент; UI документов — `SubtitlePanel` в `TextTools.tsx`.
Входы: UTF-8 SRT/TXT, `TranscribeSegment[]` с optional word timestamps, target asset/range и стиль captions.
Выходы: cues, внешние SRT/TXT и `TextDoc`, либо TSX-фрагмент и clip ID.
Распознавание/worker/cancel процесса — [Transcription](TRANSCRIPTION.md); исполнение TSX — [Fragments](FRAGMENTS.md).
Документ субтитров не равен текстовому клипу и не хранит своё редактируемое содержимое внутри `.kadr`.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Использовать единые SRT helpers | UI и automation должны одинаково понимать времена и многострочный текст | ✅ `parseSrt/cuesToSrt`; ❌ второй parser в панели | `src/engine/subtitles.ts:29`, `src/engine/subtitles.ts:35` |
| Не смешивать source, range-relative и project time | Иначе seek и captions съедут после trim/speed | ✅ `TextDoc.assetId/offset`; ❌ всегда трактовать cue.start как playhead | `shared/types.ts:320`, `src/engine/subtitles.ts:345` |
| Нарезать rich cues по word timestamps | Караоке должно следовать реальной речи, не равномерному делению текста | ✅ `segmentsToRichCues`; ❌ оценка времени слова по числу букв | `src/engine/subtitles.ts:69` |
| Не переносить cue через конец предложения или паузу >0.6 s | Смысловая и временная граница важнее заполнения maxWords | ✅ flush run; ❌ склеить раздельные фразы в один титр | `src/engine/subtitles.ts:133` |
| Склеивать continuation tokens и распределять слова сбалансированно | Whisper дробит составные слова, greedy chunks оставляют одинокий хвост | ✅ 7 при max3 → 3+2+2; ❌ разорвать «мини-программами» | `src/engine/subtitles.ts:87`, `src/engine/subtitles.ts:111` |
| Не затирать чужие выходные файлы | Транскрипция не должна уничтожать ручной SRT/TXT | ✅ `freePath`; ❌ overwrite любого совпавшего basename | `src/engine/subtitles.ts:262` |
| Перечитывать внешний файл автоматически только когда clean | Иначе polling уничтожит несохранённую UI-правку | ✅ mtime + `!dirty`; ❌ unconditional reload каждые 2 s | `src/components/TextTools.tsx:199` |
| Создавать captions как обычный прозрачный fragment | Preview/export, gizmo и дальнейшая ручная правка должны переиспользовать pipeline | ✅ `createFragment`, transparent true; ❌ отдельный DOM-only export renderer | `src/engine/captions.ts:144` |

## Поток документов

1. Import SRT/TXT создаёт `TextDoc { id,name,path,format }`: `src/engine/mediaImport.ts:42`.
2. `SubtitlePanel` читает содержимое и stat; SRT преобразует в `SubCue[]`, TXT редактирует строкой.
3. `setCue` меняет локальные cues и ставит dirty; это не изменение `Project.tracks`.
4. Save пишет тот же внешний path через `writeTextFile`, обновляет mtime и снимает dirty.
5. Seek вызывает `docTimeToProject`, а не напрямую `setPlayhead(cue.start)`.
6. Polling раз в 2000 ms подхватывает внешнюю правку, пока панель clean.

`parseSrt` допускает отсутствующий индекс и CRLF; блоки без стрелки времени пропускаются.
`parseSrtTime` принимает запятую или точку и возвращает 0 при отсутствии подходящего шаблона.
`srtTime` округляет до ms и ограничивает отрицательные значения нулём: `src/engine/subtitles.ts:15`.
`cuesToSrt` заново нумерует cues, trim-ит текст; это семантический round-trip, не byte-for-byte копирование.

## Временная привязка и captions

- Asset-транскрипт хранит source seconds и `assetId`; mapping ищет первый подходящий клип с учётом inPoint/speed.
- Если реплика не попадает ни в один клип этого asset, mapping возвращает `null`, seek не делается.
- Range-relative document получает `offset = start`; absolute range — `offset = 0`: `src/engine/subtitles.ts:308`.
- `segmentsToCues` удаляет words из результата того же rich grouping, не повторяет правила разбиения.
- `autoCaptions` распознаёт range с relative timecodes и использует words с нулевым offset.
- Генерируется transparent fragment на `[start,end)`; его clip получает смещение Y = 0.3 высоты и selection: `src/engine/captions.ts:161`.
- Текст/стиль запекаются в TSX; последующая ручная правка SRT сама по себе не регенерирует уже созданный fragment.

## Хранение, ошибки и отмена

- `.kadr` хранит ссылку TextDoc и временной mapping, не актуальное содержимое внешнего документа.
- SRT/TXT транскрипции пишутся рядом с исходником либо доминирующим source range: `src/engine/subtitles.ts:289`.
- Для известного project.texts path повторная транскрипция допускает overwrite; freePath не является вечным запретом записи.
- Два файла пишутся последовательно; регистрация TextDocs — после обеих записей: `src/engine/subtitles.ts:326`.
- Missing read даёт состояние missing и пустой UI: `src/components/TextTools.tsx:182`.
- `transcribeFlow` отвергает missing asset, отсутствие audio, пустой range или пустой audible mix.
- `autoCaptions` отвергает пустую цель и отсутствие распознанных cues: `src/engine/captions.ts:149`.
- UI отменяет распознавание существующим transcribe cancel: `src/components/TextTools.tsx:84`; cue helpers не имеют async cancel.
- Закрытие панели само по себе не записывает файл: `src/components/TextTools.tsx:215`.

## Переиспользуемое

| Задача | Использовать | Где |
|---|---|---|
| Parse/serialize SRT | `parseSrt`, `cuesToSrt`, `srtTime` | `src/engine/subtitles.ts:15` |
| Word-precise grouping | `segmentsToRichCues` | `src/engine/subtitles.ts:69` |
| Plain SRT/TXT cues | `segmentsToCues`, `cuesToTxt` | `src/engine/subtitles.ts:153` |
| Seek по документу | `docTimeToProject` | `src/engine/subtitles.ts:345` |
| Общий transcription orchestration | `transcribeFlow` | `src/engine/subtitles.ts:275` |
| TSX и вставка captions | `captionsTsx`, `autoCaptions` | `src/engine/captions.ts:144` |

## Эталонные реализации

- `segmentsToRichCues` — continuation tokens, balanced chunks и временные границы: `src/engine/subtitles.ts:69`.
- `SubtitlePanel` — clean-only refresh и явная запись: `src/components/TextTools.tsx:169`.
- `autoCaptions` — orchestration через существующие transcription/fragment flows: `src/engine/captions.ts:144`.

## Проверки

- `scripts/e2e23.mjs:98` — SRT round-trip; весь suite затрагивает asset/range transcription.
- `scripts/e2e26.mjs:136` — synthetic caption TSX, live overlay и gizmo без необходимости распознавать речь.
- Проверки gizmo drag/history — `scripts/e2e26.mjs:186`.
- Эти suites требуют живого приложения; тесты в данной работе не запускались.

## Текущее состояние / долг

- Parser не является строгим SRT validator: malformed время может стать 0, проверки end > start здесь нет.
- Panel draft живёт в component state, а не в проектной undo history; нельзя обещать Ctrl+Z всего внешнего файла.
- Save/polling вызывают async IPC без единого error UX на всех ветках; это не гарантия автоматического восстановления.
- После частичного failure записи пары файлов возможен один готовый файл без зарегистрированной пары.

## Open Questions

- Нужен ли conflict UX, если файл изменён снаружи одновременно с dirty-панелью?
- Нужны ли строгая SRT-валидация и явная связь для regeneration captions после редактирования документа?

## Навигация

⬆ [Renderer](../layers/RENDERER.md) · ↔ [Transcription](TRANSCRIPTION.md), [Fragments](FRAGMENTS.md), [Media import](MEDIA_IMPORT.md), [Voiceover](VOICEOVER.md).
Паттерны: [Undo/state](../patterns/UNDO_AND_STATE.md), [Render](../patterns/RENDER_PIPELINE.md), [Testing](../patterns/TESTING.md).
