---
title: "Границы доверия и секреты Kadr"
level: L1
type: architecture
stack: shared
parent: ../README.md
related: [./INTEGRATIONS.md, ./PROJECT_MODEL.md, ../desktop/layers/PRELOAD.md, ../desktop/modules/AI_BRIDGE.md, ../desktop/modules/VOICEOVER.md]
sources: [electron/main.ts, electron/preload.ts, electron/claude.ts, electron/tts.ts, electron/storage.ts]
status: draft
updated: 2026-11-03
---

# SECURITY — capability-границы

> **Когда читать:** При изменении preload, протоколов, MCP, сетевых запросов, секретов или удаления файлов. Родитель: [README](../README.md) · стек: shared.

## Модель угроз

Renderer редактора привилегирован; `/eval` позволяет выполнять в нём JS. Фрагменты — другой origin, могут содержать чужой код. Loopback не делает запрос доверенным: веб-страница тоже может обратиться к localhost. Эти барьеры защищают конкретные переходы, не образуют полной песочницы для всего приложения.

## Правила

| Правило | Почему | ✅ / ❌ | Эталон |
|---|---|---|---|
| Сохранять token gate каждого `kadr://` URL | Privileged схема с CORS/bypassCSP читает произвольные абсолютные пути | ✅ preload fileUrl + token; ❌ открытый file-read для fragment origin | `electron/main.ts:203` |
| Token media — per-run random 24 bytes / 48 hex | Постоянный токен переживал бы сессии/утечки | ✅ `randomBytes(24)`; ❌ константа из примера | `electron/main.ts:221` |
| Не убирать CORS ради ложного security fix | Media/WebAudio/canvas иначе tainted или тихие/чёрные | ✅ сохранять CORS и capability gate; ❌ убрать ACAO и считать feature исправленной | `electron/main.ts:223` |
| `/eval`: проверять token header И отсутствие Origin | Simple cross-origin запрос может выполниться даже при нечитаемом ответе | ✅ deny wrong/missing token и любой Origin; ❌ считать localhost достаточным | `electron/claude.ts:155` |
| Не добавлять разрешающий preflight для `/eval` | Custom header — часть браузерного барьера | ✅ посторонние методы получают 404; ❌ wildcard OPTIONS+CORS | `electron/claude.ts:160` |
| Ключ ElevenLabs не возвращать renderer/MCP state | Renderer scriptable; readKey должен остаться в main | ✅ setter/has-key; ❌ getter секрета в KadrApi | `electron/tts.ts:41` |
| При создании secret-файла mode задавать на запись | chmod после записи оставляет окно доступа | ✅ `mode: 0o600`; ❌ сначала write, потом chmod | `electron/tts.ts:52` |
| Удаление storage — fail-closed и через повторное сканирование main | Произвольный путь от клиента не является разрешением удалить файл | ✅ named groups + explicit confirm; ❌ путь от page → unlink | `electron/storage.ts:1` |

## Секреты и каналы

- `<userData>/elevenlabs-key.json`: plaintext JSON; POSIX mode при создании, не криптографическое хранилище и не гарантия NTFS ACL. `mode` при существующем файле не следует путать с восстановлением его прав.
- `<userData>/kadr-mcp.json`: генерируемые argv с bridge-token. В записи сейчас нет явного mode; это **долг**, не норма «достаточно обычных прав». `electron/claude.ts:286`.
- Auth Claude CLI принадлежит пользователю; Kadr не должен копировать его в проект/отчёты.
- Environment может содержать креды; дампы env/config/logs не публиковать. Маркеры nested Claude session очищаются, но это не очистка всех секретов окружения.
- CDP-порт — полноценный контроль приложения; только явный тестовый запуск и локальная доступность. Не пробрасывать через туннели.

## Переиспользуемое

`preload.fileUrl` вместо ручных media URL; `startBridge` вместо нового unauthenticated endpoint; `apiSession`/`callApi` вместо обходного Node fetch для TTS; `storagePrune` вместо прямого удаления из renderer. См. [INTEGRATIONS](INTEGRATIONS.md).

## Текущее состояние / долг

`contextIsolation: false` — текущий performance tradeoff raw encode; не универсальный security-рецепт. Не «улучшать» флаг молча: это межпроцессный контракт с риском кратного увеличения копий кадров. Threat model и оптимизированный bridge требуют отдельного решения.

`media:download` проверяет размер после `arrayBuffer`: 512 MiB — ограничение одного загруженного тела, не общий quota `imported/` и не streaming RAM limit. Кэш-попадание тоже выполняет сетевой запрос до `fs.access`. Не обещать offline для этого API без изменения реализации. `electron/main.ts:662`.

Токены и Origin-check не защищают от уже скомпрометированного privileged renderer или доступа к userData тем же пользователем. Windows ACL, защита config-файла и лимит HTTP body `/eval` — вопросы hardening, не молчаливо выполненные задачи.

## Open Questions

NTFS ACL/OS credential store, права generated MCP config, дополнительные ограничители `/eval` и download streaming/bounds не утверждены. Новых security гарантий без threat-model и теста не добавлять.

## Навигация

⬆ [README](../README.md) · ↔ [Integrations](INTEGRATIONS.md), [Project model](PROJECT_MODEL.md), [Preload](../desktop/layers/PRELOAD.md), [AI bridge](../desktop/modules/AI_BRIDGE.md), [Voiceover](../desktop/modules/VOICEOVER.md).
