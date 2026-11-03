---
title: "Встроенный AI: PTY, HTTP eval и MCP"
level: L3
type: module
stack: main
parent: ../layers/MAIN_PROCESS.md
related: [../layers/PRELOAD.md, ../layers/RENDERER.md, ../patterns/PROCESS_LIFECYCLE.md, ../patterns/TESTING.md, ./FRAGMENTS.md, ./EXPORT.md, ./VOICEOVER.md, ./DIAGNOSTICS.md, ../../shared/SECURITY.md, ../../shared/INTEGRATIONS.md]
sources: [electron/claude.ts, electron/mcp-bridge.cjs, src/components/ClaudePanel.tsx, src/main.tsx, electron/skills/kadr-editor.md, docs/reference/AGENTS-before-specs.md]
status: draft
updated: 2026-11-03
---

# Встроенный AI: PTY, HTTP eval и MCP

> **Когда читать:** терминал Claude, MCP tools, eval bridge, управление сессией, managed skills и защита localhost. Родитель: [Main process](../layers/MAIN_PROCESS.md).

## Контракт и границы доверия

Встроенный агент — пользовательский `claude` CLI в node-pty, не внутренний SDK-вызов модели.
Main управляет PTY, session generation и HTTP server; renderer показывает terminal и предоставляет `window.kadrEditor`.
MCP stdio server — отдельный Node-процесс `electron/mcp-bridge.cjs`.
Он посылает `POST /eval {code}` на loopback bridge, main исполняет async JS body через webContents.
Успех eval кодируется `{ok: value}`, исключение — `{error: string}` (`electron/claude.ts:126`).
Это привилегированное выполнение с доступом к `window.kadr`, а не sandbox для недоверенного кода.
`GET /` возвращает обычный 404; MCP считает **любой HTTP-ответ** признаком живого редактора.

## Правила

1. **Eval требует и secret header, и отсутствия Origin.**
   Почему: localhost доступен браузерной странице; запрет чтения ответа CORS не запрещает выполнение запроса.
   ✅ per-session 24 random bytes →48 hex, `x-kadr-token`; ❌ открытый localhost eval или CORS allow-all.
   Эталон: `electron/claude.ts:155`, `electron/claude.ts:165`; угрозы — [Security](../../shared/SECURITY.md).
2. **Preflight не открывает eval.**
   Почему: custom header должен заставить браузер спросить разрешение, которого server не выдаёт.
   ✅ только POST `/eval`, остальное 404; ❌ OPTIONS с разрешающим Access-Control-Allow-Headers.
   Эталон: `electron/claude.ts:160`; health ping остаётся неаутентифицированным, но ничего не исполняет.
3. **Open/close сериализованы и имеют generation.**
   Почему: async spawn переживал быстрый close/StrictMode remount и создавал orphan PTY.
   ✅ sessionChain + sessionGen; ❌ close только текущей переменной без учёта pending open.
   Эталон: `electron/claude.ts:382`, `electron/claude.ts:398`.
4. **PTY callbacks принадлежат конкретному session object.**
   Почему: выход/данные старого процесса не должны закрыть новый bridge или перемешать terminal output.
   ✅ `session === mine`; ❌ любой onExit сбрасывает глобальный session.
   Эталон: `electron/claude.ts:329`, `electron/claude.ts:335`.
5. **Процессное дерево не живёт дольше панели/редактора.**
   Почему: унаследованные Chromium sockets мешали следующему запуску, даже после смерти Electron.
   ✅ watchdog и kill group с escalation, startup sweep; ❌ завершить только непосредственный CLI child.
   Эталон: `electron/claude.ts:67`, `electron/claude.ts:319`, `electron/claude.ts:354`.
6. **Удалять только известные nested-session env markers.**
   Почему: wildcard `CLAUDE_*` уничтожит пользовательский config/auth path вместе со служебными флагами.
   ✅ SESSION_MARKERS и затем user env overrides; ❌ очистить весь namespace Claude.
   Эталон: `electron/claude.ts:220`, `electron/claude.ts:240`.
7. **Ответы MCP ограничивать до переполнения stdio клиента.**
   Почему: исторический предел клиента ~16 MB закрывал transport на waveform/base64 dump.
   ✅ compact `kadr_state`, `asText`; ❌ возврат полного Project с thumbnails/waveforms.
   Эталон: `electron/mcp-bridge.cjs:71`, `electron/mcp-bridge.cjs:114`.
8. **Managed skill cleanup опирается на маркер владения.**
   Почему: префикс `kadr-` сам по себе не делает пользовательскую папку собственностью приложения.
   ✅ удалить не поставляемую больше `kadr-*` только при `<!-- managed by Kadr`; ❌ удалить все неизвестные `kadr-*`.
   Эталон: `electron/claude.ts:406`, `electron/claude.ts:446`.

## Поток данных, конфигурация и отмена

- `claude:open` получает terminal cols/rows/cwd; command выбирается из KADR_CLAUDE_CMD → claude-env.json → `claude` (`electron/claude.ts:261`).
- Optional `userData/claude-env.json` содержит command/args/env; `claude-mcp.json` добавляет servers.
- Generated `userData/kadr-mcp.json` объединяет extra servers и `kadr`; argv[2]=port, argv[3]=token (`electron/claude.ts:279`).
- По умолчанию CLI получает `--mcp-config` и system hint; custom `cfg.args` заменяет этот набор целиком (`electron/claude.ts:304`).
- Terminal input/resize идут в PTY; data/exit возвращаются renderer; cwd проверяется, fallback — home.
- Lazy node-pty import не должен ломать старт всего редактора при отсутствии native binary (`electron/claude.ts:311`).
- Close инвалидирует pending generation, сбрасывает session, HUP-ит группу, через 1.5 s делает SIGKILL и закрывает bridge.
- MCP выходит на stdin end/close или после трёх неудачных liveness probes; интервал 10 s, timeout 3 s (`electron/mcp-bridge.cjs:21`).
- 403 превращается в ошибку stale token с предложением переоткрыть панель; JS error становится MCP `isError` (`electron/mcp-bridge.cjs:52`, `electron/mcp-bridge.cjs:85`).
- Нет общего transactional rollback для произвольного `kadr_eval`; вызывающий обязан соблюдать доменные undo/cancel контракты.

## Реальная MCP-поверхность

На дату сверки в `electron/mcp-bridge.cjs` **24** вызова `server.registerTool`, не число из сырого рекон-реестра.

| Группа | Инструменты | Проверенный entry |
|---|---|---|
| Состояние/визуальный контроль | kadr_state, kadr_eval, kadr_snapshot, kadr_sheet | `electron/mcp-bridge.cjs:89` |
| 3D/media/checks | kadr_model_import, kadr_fragment_media, kadr_models, kadr_check, kadr_typecheck | `electron/mcp-bridge.cjs:230` |
| Render/text/fragments | kadr_export, kadr_transcribe, kadr_fragment_create | `electron/mcp-bridge.cjs:336` |
| Music | kadr_beats, kadr_audio_react, kadr_sounds, kadr_sound_add, kadr_sound_label, kadr_neon_wave | `electron/mcp-bridge.cjs:470` |
| Voice | kadr_voice_speak, kadr_voice_check, kadr_voice_verdict, kadr_voice_mark, kadr_voice_regenerate, kadr_voice_learn | `electron/mcp-bridge.cjs:687` |

`MAX_TEXT = 4_000_000` проверяется через JS `text.length`, затем `slice`, с добавлением сообщения о truncation.
Это **не** точный 4 MiB byte cap и **не** настройка SDK на 16 MB (`electron/mcp-bridge.cjs:75`).
Большие ответы надо сокращать на стороне запроса; обрезанный JSON-текст не обязан оставаться parseable JSON.

## Переиспользуемое

- `editorEval`, `asText`, `asError` — единый error/serialization funnel (`electron/mcp-bridge.cjs:38`, `electron/mcp-bridge.cjs:75`).
- `sessionEnv`, open/close chain — вместо нового независимого управления PTY.
- `window.kadrEditor` — domain flows, не копия editor logic в строках MCP (`src/main.tsx`).
- `kadr-editor` базовый LOOK→ACT→VERIFY; music/motion/3d — composable skills, не требования к любому проекту.

## Эталонные реализации

- `startBridge` (`electron/claude.ts:155`) — двухфакторный browser barrier, не замена OS permissions.
- `syncSkill` (`electron/claude.ts:424`) — changed-only atomic write и cleanup marker-owned stale directories.
- При пустом shipped set cleanup запрещён: недоступный source dir нельзя трактовать как «удалить всё» (`electron/claude.ts:446`).

## Проверка

- Проверять open→close во время async spawn, StrictMode remount, stale onExit и stdin close без реальной платной AI-сессии.
- Security regression: POST без токена, с токеном + Origin, OPTIONS и stale token должны не выполнить JS.
- При override `claude-env.json` тест обязан backup/restore user store; см. [Testing](../patterns/TESTING.md).

## Текущее состояние / долг

- `which` использует `/bin/sh`, PTY wrapper — `/bin/bash`, teardown — POSIX process groups; полноценная Windows-реализация не подтверждена.
- Generated kadr-mcp.json содержит secret без явного mode0600; remediation — открытый вопрос, не выполненное изменение (`electron/claude.ts:287`).
- Cleanup защищает unmarked stale folders, но запись поставляемого same-name SKILL.md не проверяет marker старого файла (`electron/claude.ts:439`).
- Поэтому фразу «пользовательские skills никогда не затрагиваются» нельзя распространять на collision с shipped name.
- HTTP body накапливается без явного лимита (`electron/claude.ts:169`); не считать truncation MCP ограничением входа eval.

## Open Questions

- Какая Windows process-tree/PTY стратегия будет одобрена вместо POSIX shell?
- Нужны ли explicit permissions generated MCP config, лимит body и защита same-name unmarked skill при sync?

## Навигация

⬆ [Main process](../layers/MAIN_PROCESS.md) · ↔ [Fragments](./FRAGMENTS.md), [Voiceover](./VOICEOVER.md), [Diagnostics](./DIAGNOSTICS.md).
Сквозные нормы: [Security](../../shared/SECURITY.md), [Lifecycle](../patterns/PROCESS_LIFECYCLE.md), [Integrations](../../shared/INTEGRATIONS.md).
