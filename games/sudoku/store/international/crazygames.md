# Sudoku Academy — CrazyGames Basic Launch

Английские тексты и пошаговые поля для формы подачи. Правила площадки —
из официальной документации, проверено 30 сентября 2026 (см. ссылки внизу).
Ничего сверх того, что игра реально делает, здесь не написано.

**Важно про поля с числами.** Официальная документация CrazyGames не
публикует точные ограничения по символам для полей названия/описания —
это видно только в самой форме подачи. Тексты ниже написаны короче
типичных лимитов конкурентов (обычно 100–200 символов на краткое,
1000–2000 на полное), но перед вставкой сверь с формой: если поле
покажет свой лимит и текст не влезет — просто обрежь по смыслу, не меняя
факты.

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

Предложение: **Puzzle**. В самой форме сверь точный список категорий —
он у площадки свой и может отличаться от нашего предположения.

## Age rating / content

Игра не содержит насилия, азартных элементов, покупок за реальные
деньги на этом этапе (магазин скрыт, пока `caps.payments` не включён —
см. `packages/platform`) и любого контента 18+. Требование Basic Launch —
соответствие PEGI-12 как минимальной планке; по содержанию игра подходит
и более младшей аудитории, отдельно занижать рейтинг не пытаемся —
достаточно подтвердить отсутствие ограничивающего контента в форме.

## Privacy / legal links

```
Privacy policy: https://peterkiselev.github.io/game-studio/privacy.html
Terms:          https://peterkiselev.github.io/game-studio/terms.html
```
Те же документы, что уже приняты VK для «Дачных тайн» и текущей заявки
Sudoku — обобщены на все игры студии, ссылки не менять.

## Что НЕ заявляем (сознательно)

Ни мультиплеера, ни лидербордов, ни соцсети, ни онлайн-режима, ни
покупок в этой сборке нет — ничего из этого не упомянуто в текстах выше.
`CLAUDE.md` §5 отдельно запрещает фальшивые «онлайн-игроков» — в текстах
их и не было.

---

## Пошаговая инструкция подачи (Basic Launch)

Готовые файлы лежат рядом, ничего собирать вручную не нужно:

1. **ZIP сборки** — `release/sudoku-crazygames-basic.zip` (собран и
   проверен, см. `games/sudoku/store/international/validation-report.md`).
2. **Обложки** — `games/sudoku/store/international/covers/`:
   `cover-1920x1080.png` (landscape), `cover-800x1200.png` (portrait),
   `cover-800x800.png` (square).
3. **Превью-ролики** — `games/sudoku/store/international/videos/`:
   `preview-landscape.mp4` (1920×1080), `preview-portrait.mp4` (720×1080).
4. Зайти в **CrazyGames Developer Portal** → **Submit a game** → выбрать
   **HTML5** → загрузить ZIP.
5. На вкладке описания вставить Title, Short description, Full
   description и Controls из блоков выше.
6. На вкладке медиа загрузить три обложки в соответствующие слоты
   (landscape/portrait/square) и оба ролика.
7. Выбрать категорию **Puzzle** (или ближайший пункт в актуальном списке
   формы).
8. В настройках релиза выбрать **Basic Launch** (не Full Launch — SDK на
   этом этапе не подключаем сознательно, см. карточку этапа).
9. Указать ссылки на Privacy policy и Terms из блока выше.
10. Отправить на модерацию. Дальше — не наше действие: ждём решения
    площадки, как и с VK/OK.

## Источники требований

- https://docs.crazygames.com/requirements/intro/
- https://docs.crazygames.com/requirements/game-covers/
- https://docs.crazygames.com/requirements/gameplay/
- https://docs.crazygames.com/requirements/quality/
