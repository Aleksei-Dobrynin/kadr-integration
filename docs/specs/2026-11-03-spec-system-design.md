# Система спецификаций Kadr — согласованная схема

Основание: прямой запрос оператора и выбор «Как BGA (Recommended)» 2026-11-03.
Образец формата: `D:/Repos/bga-backend/Specs/`; предметная модель — только Kadr.

## Архитектура документации

- `Specs/README.md` и `_meta/` — L0, вход, контракт формата, источники, покрытие и доказательства проверки.
- L1: `PROCESS.md`, `desktop/DESKTOP_CORE.md`, `desktop/DESKTOP_ARCHITECTURE.md`, сквозные `shared/` (модель проекта, интеграции, зависимости, безопасность).
- L2: `desktop/layers/` — main/preload/renderer/shared/python; `desktop/patterns/` — state/undo, render, cache/storage, process lifecycle, UI, testing.
- L3: `desktop/modules/` — Project IO, Timeline, Preview/GPU, Media import, Export, Fragments, AI bridge, Transcription, Voiceover, Music/Sounds, 3D models, Diagnostics, Animation/Effects, Subtitles.
- `templates/` — повторно используемые шаблоны вне графа нормативных документов.
- `AGENTS.md` — единый agent-agnostic вход/роутер; `CLAUDE.md` — указатель на него. Serena хранит навигацию, не дубликаты норм.
- `docs/reference/AGENTS-before-specs.md` — неизменяемый исторический снимок прежней карты, не нормативный конкурент Specs.

## Контракт нормы

Frontmatter: title, level, type, stack, parent (кроме корня), related, sources, status, updated.
Один H1; «Когда читать»; Правила с причиной, ✅/❌ и проверенным `file:line`; переиспользуемое; эталоны; текущее состояние/долг; открытые вопросы; навигация вверх/вниз/по горизонтали.
Статус новых спецификаций — draft: документ фиксирует наблюдаемое, но не превращает рекомендации рекон-отчёта в утверждённые будущие решения.

## Проверка и границы

Проверить схему frontmatter, разрешение parent/related, достижимость корня, ссылки на файлы и диапазоны строк. Числа/контракты проверять по коду, а не доверять итоговому числу «76» в сыром отчёте (там есть дубликаты и испорченные формулировки).
Новых библиотек, API, IPC-каналов, UI-поведений и Git-политик не вводить.
Окружение: установка из lockfile, typecheck/build и безопасные проверки; E2E и ML-модели не запускать автоматически.
