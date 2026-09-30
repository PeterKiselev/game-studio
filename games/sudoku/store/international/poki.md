# Sudoku Academy — Poki: первый Playtest прототипа

Английские тексты и пошаговая инструкция для загрузки прототипа и запроса
первого Playtest. Правила площадки — из официальной документации Poki
для разработчиков, проверено 30 сентября 2026.

**Важно.** Poki прямо разрешает грузить незавершённый прототип для
первого Playtest — SDK, монетизация и финальная полировка нужны позже,
на стадии Web Fit. Здесь сознательно нет ни того, ни другого.

---

## Title

```
Sudoku Academy
```

## Short description (черновик, сверить с лимитом формы)

```
Sudoku that teaches you to reason, not guess. 12 interactive lessons,
explainable hints, and a daily puzzle.
```

## Full description

Тот же текст, что для CrazyGames (`crazygames.md`) — игра одна и та же,
переписывать заново незачем:

```
Sudoku Academy turns a familiar puzzle into a real logic course. No
guessing, no staring at an empty grid: every lesson shows one provable
step, then you pick the cell and the answer yourself.

What's inside:
- 12 sequential interactive lessons covering three techniques: naked
  single, hidden single, and naked pair
- Explainable hints that show the reason for a move, not just the answer
- A daily puzzle, the same for every player on a given day
- Practice mode across three difficulty levels
- Pencil marks, conflict highlighting, and automatic save of an
  unfinished puzzle
- Stars, a daily streak, and six achievements
- A logic profile after each puzzle: which techniques it took and how
  your mastery grows

The course and the first hint in every puzzle are free. Sessions are
short — a few minutes is enough — and progress saves automatically.
```

## Controls

```
Tap or click a cell to select it, then tap or click a number to place
it. Works with mouse and touch; no keyboard required.
```

## Category

Предложение: **Puzzle**. Сверить точный список в форме Poki.

## Privacy / legal links

```
Privacy policy: https://peterkiselev.github.io/game-studio/privacy.html
Terms:          https://peterkiselev.github.io/game-studio/terms.html
```

## Технические требования Poki, уже выполненные этой сборкой

- 16:9 адаптивная раскладка, работает на 640×360 / 836×470 / 1031×580 и
  портретном телефоне (проверено `tools/playtest-sudoku-international.cjs`).
- `localStorage` уже обёрнут в try/catch — см. `packages/platform/src/adapters/web.ts`
  и `packages/platform/src/storage.ts` (это общая инфраструктура студии,
  для этого этапа не менялась).
- Нет внешних запросов: сборка полностью самодостаточна (проверено
  валидатором, см. `validation-report.md`).
- Никакой рекламы и никакого сброса localStorage в игре нет — сторонних
  систем монетизации не подключено вовсе.

## Что НЕ заявляем (сознательно)

Никакого SDK Poki в этой сборке нет — намеренно, это только первый
Playtest прототипа. Мультиплеера, лидербордов, покупок — тоже нет и не
упомянуты в текстах.

---

## Пошаговая инструкция: загрузка прототипа и запрос Playtest

1. **ZIP сборки** — `release/sudoku-poki-playtest.zip` (тот же
   технический билд, что для CrazyGames: SDK ни там, ни там не нужен на
   этом этапе — см. карточку этапа в `WORK_QUEUE.md`).
2. **Thumbnail** — `games/sudoku/store/international/covers/poki-thumbnail.png`
   (квадрат 628×628, full-bleed, без текста и рамок — по требованиям
   Poki thumbnail guide).
3. Зайти в **Poki for Developers** → создать новую игру → загрузить ZIP
   через форму (или прогнать через **Poki Inspector**, если он доступен
   до создания игры — это тот же автоматический технический чек, что
   описан в требованиях).
4. Заполнить Title, Short description, Full description, Controls —
   тексты выше.
5. Загрузить thumbnail.
6. Дождаться **content moderation** — Poki прогоняет базовую проверку
   содержимого перед тем, как тест вообще можно запросить.
7. После того как модерация пропустит игру — нажать **Request Playtest**
   (первый этап из пяти в их процессе тестирования). Тест соберёт до
   десяти записей живых игроков.
8. Дальше — не наше действие: смотрим записи и разбираем результат,
   когда он появится.

## Источники требований

- https://developers.poki.com/guide/adding-your-game
- https://developers.poki.com/guide/how-testing-works
- https://developers.poki.com/guide/requirements-quality
- https://developers.poki.com/guide/game-thumbnail
