import { describe, expect, it } from 'vitest';
import {
  countSolutions,
  deduceCase,
  describeSolution,
  formatIssues,
  markKey,
  nextHint,
  uniqueSolution,
  validateCase,
} from '@studio/rules';
import type { PlayerMarks } from '@studio/rules';
import { CASE_REQUIRES, VALUE_RENAMES, cases, nextChapterCase, tutorialCase } from '../src/cases';
import { claimedFact, falseTestimonies, testimonyHolds } from '../src/contradiction';
import { marksFitCase, renameMarks } from '../src/progress';

/**
 * Контентные тесты: каждое выпускаемое дело обязано быть корректным,
 * однозначным и решаемым рассуждением. Это защита от того, чтобы
 * сломанное дело дошло до игрока.
 */

describe('все дела пилота', () => {
  it.each(cases.map((c) => [c.id, c] as const))('дело %s проходит валидацию', (_id, source) => {
    const issues = validateCase(source);
    // Сообщение об ошибке печатает отчёт целиком — видно, что именно не так.
    expect(issues, formatIssues(source, issues)).toEqual([]);
  });

  it.each(cases.map((c) => [c.id, c] as const))('дело %s решается рассуждением', (_id, source) => {
    expect(countSolutions(source)).toBe(1);
    expect(deduceCase(source).solved).toBe(true);
  });

  it('идентификаторы дел не повторяются', () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('обучающее дело', () => {
  it('решение именно то, что описано в развязке', () => {
    const solution = uniqueSolution(tutorialCase)!;
    const lines = describeSolution(tutorialCase, solution);

    expect(lines[0]).toBe('Ирина — где были: грядка, что при них: лейка');
    expect(lines[1]).toBe('Михаил — где были: беседка, что при них: пирог');
    expect(lines[2]).toBe('Олег — где были: калитка, что при них: зонт');
  });

  it('первая подсказка объясняет шаг уликой, а не раскрывает ответ', () => {
    const hint = nextHint(tutorialCase)!;
    expect(hint.reason.rule).toBe('clue');
    expect(hint.text).toContain('Отметьте');
    expect(hint.text).toContain('улики');
  });

  it('подсказки доводят дело до конца шаг за шагом', () => {
    const marks: PlayerMarks = {};
    let guard = 0;

    while (guard < 100) {
      guard += 1;
      const hint = nextHint(tutorialCase, marks);
      if (!hint) break;
      marks[markKey(hint.a, hint.b)] = hint.positive ? 'yes' : 'no';
    }

    expect(nextHint(tutorialCase, marks)).toBeNull();
    // Дело 3x3 из трёх категорий: 3 сетки по 9 клеток.
    expect(Object.keys(marks)).toHaveLength(27);
  });

  it('у обучающего дела есть развязка и текст каждой улики', () => {
    expect(tutorialCase.epilogue.length).toBeGreaterThan(50);
    for (const clue of tutorialCase.clues) {
      expect(clue.text.trim().length).toBeGreaterThan(10);
    }
  });
});
describe('глава 1, дело 1 «Шланг у водокачки»', () => {
  const source = cases.find((c) => c.id === 'ch1-hose')!;

  it('решение совпадает с развязкой: шланг у Ромы в 9:00, Зоя с ведром в 7:00', () => {
    const lines = describeSolution(source, uniqueSolution(source)!);
    expect(lines).toEqual([
      'Зоя — время у бака: 7:00, что принесли: ведро',
      'Игорь — время у бака: 6:00, что принесли: канистра',
      'Настя — время у бака: 8:00, что принесли: лейка',
      'Рома — время у бака: 9:00, что принесли: шланг',
    ]);
    expect(source.epilogue).toContain('Рома');
    expect(source.epilogue).toContain('в девять');
  });

  it('подсказки доводят дело до конца: 3 сетки по 16 клеток', () => {
    const marks: PlayerMarks = {};
    for (let guard = 0; guard < 200; guard += 1) {
      const hint = nextHint(source, marks);
      if (!hint) break;
      expect(hint.text.length).toBeGreaterThan(10);
      marks[markKey(hint.a, hint.b)] = hint.positive ? 'yes' : 'no';
    }
    expect(nextHint(source, marks)).toBeNull();
    expect(Object.keys(marks)).toHaveLength(48);
  });

  it('вступление явно задаёт условия: по одному в каждый час, все вещи разные', () => {
    expect(source.intro).toContain('в 6, 7, 8 и 9 часов');
    expect(source.intro).toContain('все четыре разные');
  });

  /**
   * Сторож формулировок, не замена чтению: каждый текст называет обе
   * сущности своего правила и слово, которым это правило выражено.
   */
  it.each(source.clues.map((clue, i) => [i + 1, clue] as const))('улика %i прямо выражает своё правило', (_n, clue) => {
    const text = clue.text.toLowerCase();
    for (const ref of [clue.a, clue.b]) {
      const stem = ref.value.toLowerCase().slice(0, Math.min(4, ref.value.length));
      expect(text, `в тексте нет «${ref.value}»: ${clue.text}`).toContain(stem);
    }
    const marker = { before: /раньше|позже/, after: /позже|раньше/, adjacent: /соседние часы/, different: / не с /, same: /тот же|та же/ }[clue.kind];
    expect(text, `нет слова для правила ${clue.kind}: ${clue.text}`).toMatch(marker);
  });

  it('есть вступление и находка, ведущая к делу 2', () => {
    expect(source.intro).toMatch(/Кто принёс шланг\?/);
    expect(source.finding?.text).toMatch(/Склад правления/);
    expect(source.finding?.text).toMatch(/следующего дела/);
  });

  it('прежние шесть дел на своих местах и не изменили id', () => {
    expect(cases.map((c) => c.id).slice(0, 6)).toEqual(['tutorial-1', 'second-1', 'third-1', 'fourth-1', 'fifth-1', 'sixth-1']);
    expect(cases[6].id).toBe('ch1-hose');
  });
});

describe('глава 1, дело 2 «Чей ключ»', () => {
  const source = cases.find((c) => c.id === 'ch1-key')!;
  const solution = uniqueSolution(source)!;

  it('решение: Рома у склада по видео Насти, Игорь в бане', () => {
    expect(describeSolution(source, solution)).toEqual([
      'Геннадий Ильич — где в 20:00: правление, чем подтверждено: журнал склада',
      'Игорь — где в 20:00: баня, чем подтверждено: сосед',
      'Настя — где в 20:00: речка, чем подтверждено: прокат лодки',
      'Рома — где в 20:00: склад, чем подтверждено: видео Насти',
    ]);
  });

  /** Связки «подтверждение — место»: любая выводится из трёх остальных, но все явные. */
  const isLink = (clue: (typeof source.clues)[number]): boolean =>
    clue.kind === 'same' && clue.a.category === 'подтверждение' && clue.b.category === 'место';

  it('у каждого подтверждения явно сказано, какое место в 20:00 оно доказывает', () => {
    const links = source.clues.filter(isLink);
    expect(links.map((c) => `${c.a.value} → ${c.b.value}`).sort()).toEqual(
      ['видео Насти → склад', 'журнал склада → правление', 'прокат лодки → речка', 'сосед → баня'],
    );
    for (const clue of links) expect(clue.text, clue.text).toMatch(/в 20:00/);
  });

  it('все факты, кроме явных связок, необходимы: без любого решение перестаёт быть единственным', () => {
    source.clues.forEach((clue, i) => {
      if (isLink(clue)) return;
      const without = { ...source, clues: source.clues.filter((__, j) => j !== i) };
      expect(countSolutions(without), `факт ${i + 1} лишний`).toBe(2);
    });
    // Без всех четырёх связок решение не единственно — они работают, а не украшают.
    expect(countSolutions({ ...source, clues: source.clues.filter((c) => !isLink(c)) })).toBe(2);
  });

  it('прежнего «чека магазина» нет нигде: ни в значениях, ни в фактах, ни в показаниях', () => {
    expect(JSON.stringify(source)).not.toMatch(/чек|магазин|продавщ/);
  });

  it('подсказки доводят дело до конца: 3 сетки по 16 клеток', () => {
    const marks: PlayerMarks = {};
    for (let guard = 0; guard < 200; guard += 1) {
      const hint = nextHint(source, marks);
      if (!hint) break;
      expect(hint.text.length).toBeGreaterThan(10);
      marks[markKey(hint.a, hint.b)] = hint.positive ? 'yes' : 'no';
    }
    expect(nextHint(source, marks)).toBeNull();
    expect(Object.keys(marks)).toHaveLength(48);
  });

  it('вступление явно задаёт условия и вопрос дела', () => {
    expect(source.intro).toContain('по одному в каждом');
    expect(source.intro).toContain('все четыре разные');
    expect(source.intro).toMatch(/Кто был у склада в 20:00\?/);
  });

  it.each(source.clues.map((clue, i) => [i + 1, clue] as const))('факт %i прямо выражает своё правило', (_n, clue) => {
    const text = clue.text.toLowerCase();
    for (const ref of [clue.a, clue.b]) {
      // Первое слово значения без окончания: «баня» → «бан» (в бане), «Геннадий» → «генн».
      const word = ref.value.toLowerCase().split(' ')[0];
      const stem = word.slice(0, Math.min(4, word.length - 1));
      expect(text, `в тексте нет «${ref.value}»: ${clue.text}`).toContain(stem);
    }
    const marker = { same: /того, кто/, different: / не /, before: /раньше/, after: /позже/, adjacent: /соседние/ }[clue.kind];
    expect(text, `нет слова для правила ${clue.kind}: ${clue.text}`).toMatch(marker);
  });

  describe('шаг «противоречие»', () => {
    const step = source.contradiction!;

    it('показания не входят в факты: по одному от каждого из четверых', () => {
      expect(step.testimonies.map((t) => t.who.value)).toEqual(['Геннадий Ильич', 'Игорь', 'Настя', 'Рома']);
      const clueTexts = new Set(source.clues.map((c) => c.text));
      for (const t of step.testimonies) expect(clueTexts.has(t.text)).toBe(false);
    });

    it('ровно одно показание расходится с решением — слова Ромы «был в бане»', () => {
      const lies = falseTestimonies(source, solution);
      expect(lies).toHaveLength(1);
      expect(lies[0].who.value).toBe('Рома');
      expect(lies[0].claim).toEqual({ category: 'место', value: 'баня' });
    });

    it('ответ определяется решением: при другом решении лжец был бы другим', () => {
      // Поменяли местами Игоря и Рому: теперь в бане Рома, у склада Игорь.
      const swapped = Object.fromEntries(
        Object.entries(solution).map(([cat, row]) => [cat, cat === source.anchor ? row : [row[0], row[3], row[2], row[1]]]),
      );
      expect(falseTestimonies(source, swapped).map((t) => t.who.value)).toEqual(['Игорь']);
    });

    it('объяснение неверного ответа подтверждает только место в 20:00, а не реплику целиком', () => {
      const igor = step.testimonies.find((t) => t.who.value === 'Игорь')!;
      expect(testimonyHolds(source, solution, igor)).toBe(true);
      expect(claimedFact(source, solution, igor)).toBe('баня');
      expect(step.claimTopic).toBe('о месте в 20:00');
    });

    it('каждое показание утверждает место именно в 20:00 — то, что проверяет таблица', () => {
      for (const t of step.testimonies) {
        expect(t.claim.category, t.text).toBe('место');
        expect(t.text, 'нет времени, которое проверяет таблица').toMatch(/в 20:00|в восемь/i);
        expect(t.text).not.toMatch(/весь вечер/i);
      }
    });

    it('развязка и находка ведут к делу 3', () => {
      expect(step.resolution).toContain('Рома');
      expect(source.epilogue).toMatch(/копии/);
      expect(source.finding?.text).toMatch(/Правление/);
      expect(source.finding?.text).toMatch(/следующего дела/);
    });
  });

  it('глава идёт цепочкой: дело 2 открывается после дела 1 и стоит восьмым', () => {
    expect(cases[7].id).toBe('ch1-key');
    expect(CASE_REQUIRES['ch1-key']).toBe('ch1-hose');
    expect(nextChapterCase('ch1-hose')?.id).toBe('ch1-key');
    expect(nextChapterCase('ch1-key')).toBeUndefined();
    expect(nextChapterCase('tutorial-1')).toBeUndefined();
  });

  it('у остальных дел шага «противоречие» нет — они раскрываются как раньше', () => {
    expect(cases.filter((c) => c.contradiction).map((c) => c.id)).toEqual(['ch1-key']);
  });
});

describe('незаконченный прогресс от прежней версии дела', () => {
  const source = cases.find((c) => c.id === 'ch1-key')!;
  const ref = (category: string, value: string) => ({ category, value });

  it('отметки с текущими значениями подходят', () => {
    const marks: PlayerMarks = { [markKey(ref('персонажи', 'Настя'), ref('подтверждение', 'прокат лодки'))]: 'yes' };
    expect(marksFitCase(source, marks)).toBe(true);
    expect(marksFitCase(source, {})).toBe(true);
  });

  it('отметка с прежним значением «чек магазина» — прогресс не подходит', () => {
    const marks: PlayerMarks = {
      [markKey(ref('персонажи', 'Рома'), ref('место', 'склад'))]: 'yes',
      [markKey(ref('персонажи', 'Настя'), ref('подтверждение', 'чек магазина'))]: 'yes',
    };
    expect(marksFitCase(source, marks)).toBe(false);
  });
});

describe('дела с порядком не выдают пол через окончания', () => {
  // Все дела с порядком; у дел главы порядок — часы, он и раньше был нейтральным.
  const ordered = cases.filter((c) => c.categories.some((cat) => cat.ordered));
  const renamed = cases.filter((c) => ['third-1', 'fifth-1', 'sixth-1'].includes(c.id));

  it('исправлены теплица, рынок и костёр; переименования только у них', () => {
    expect(renamed).toHaveLength(3);
    expect(Object.keys(VALUE_RENAMES).sort()).toEqual(['fifth-1', 'sixth-1', 'third-1']);
  });

  it.each(renamed.map((c) => [c.id, c] as const))('%s: позиции названы числами 1–4', (_id, source) => {
    const order = source.categories.find((cat) => cat.ordered)!;
    expect(order.values).toEqual(['1', '2', '3', '4']);
    expect(order.title).toMatch(/^Порядок /);
  });

  /**
   * Сторож формулировок: ни порядковых форм с родом («третьей», «вторым»),
   * ни причастий («вышедшая»), ни «та/тот, кто» в уликах. Развязки не
   * проверяем — там ответ уже известен.
   */
  it.each(ordered.flatMap((c) => c.clues.map((clue) => [c.id, clue.text] as const)))('%s: «%s»', (_id, text) => {
    expect(text).not.toMatch(/(перв|втор|трет|четвёрт)(ой|ым|ая|ий|ья|ьей|ьим)\b|вышедш|пришедш|вернувш|\b(та|тот), кто|одна за другим|один за другой/i);
  });

  it('решения прежние: третьими были Вика, Настя и Оля', () => {
    const third = (id: string) => describeSolution(cases.find((c) => c.id === id)!, uniqueSolution(cases.find((c) => c.id === id)!)!);
    expect(third('third-1')).toEqual([
      'Аня — где были: чердак, порядок выхода: 1',
      'Борис — где были: погреб, порядок выхода: 2',
      'Вика — где были: теплица, порядок выхода: 3',
      'Гриша — где были: курятник, порядок выхода: 4',
    ]);
    expect(third('fifth-1')).toEqual([
      'Зоя — что купили: семена, порядок возвращения: 1',
      'Игорь — что купили: гвозди, порядок возвращения: 2',
      'Настя — что купили: мёд, порядок возвращения: 3',
      'Рома — что купили: творог, порядок возвращения: 4',
    ]);
    expect(third('sixth-1')).toEqual([
      'Ксюша — где сидели: у бревна, порядок прихода: 1',
      'Влад — где сидели: на траве, порядок прихода: 2',
      'Оля — где сидели: на раскладушке, порядок прихода: 3',
      'Митя — где сидели: на камне, порядок прихода: 4',
    ]);
  });

  it('старые отметки «первой/третьей» переносятся на «1/3», а не теряются', () => {
    const source = cases.find((c) => c.id === 'third-1')!;
    const old: PlayerMarks = {
      'время|первой~персонажи|Аня': 'yes',
      'места|чердак~время|третьей': 'no',
      'места|погреб~персонажи|Борис': 'yes',
    };
    expect(marksFitCase(source, old)).toBe(false);
    const moved = renameMarks(old, VALUE_RENAMES['third-1']);
    expect(moved).toEqual({
      [markKey({ category: 'время', value: '1' }, { category: 'персонажи', value: 'Аня' })]: 'yes',
      [markKey({ category: 'места', value: 'чердак' }, { category: 'время', value: '3' })]: 'no',
      'места|погреб~персонажи|Борис': 'yes',
    });
    expect(marksFitCase(source, moved)).toBe(true);
  });
});

describe('иллюстрированное вступление дела 1', () => {
  const source = cases.find((c) => c.id === 'ch1-hose')!;
  const story = source.story!;

  it('три кадра, у каждого картинка, описание и короткая подпись', () => {
    expect(story).toHaveLength(3);
    story.forEach((frame, i) => {
      expect(frame.image).toMatch(new RegExp(`ch1-hose-${i + 1}\.webp`));
      expect(frame.alt.length).toBeGreaterThan(10);
      expect(frame.caption.length).toBeLessThanOrEqual(130);
    });
  });

  it('кадры — атмосфера, не ответ и не новые улики', () => {
    const text = story.map((f) => `${f.caption} ${f.alt}`).join(' ').toLowerCase();
    // Ни ответа (Рома, 9:00), ни находки (бирка, склад), ни времени и уровня воды.
    expect(text).not.toMatch(/рома|9:00|девят|бирк|склад|\d+ час|отметк|уровн/);
  });

  it('условия задачи остались в тексте дела — без кадров решать можно', () => {
    expect(source.intro).toContain('в 6, 7, 8 и 9 часов');
    expect(source.intro).toContain('все четыре разные');
    expect(source.intro).toMatch(/Кто принёс шланг\?/);
  });

  it('кадры есть у первых двух дел и у дела 1 главы', () => {
    expect(cases.filter((c) => c.story).map((c) => c.id)).toEqual(['tutorial-1', 'second-1', 'ch1-hose']);
  });
});

describe('кадры первых двух дел', () => {
  it.each(['second-1'])('%s: один кадр с короткой подписью и обложка', (id) => {
    const source = cases.find((c) => c.id === id)!;
    expect(source.story).toHaveLength(1);
    const [frame] = source.story!;
    expect(frame.image).toMatch(/\.webp/);
    expect(frame.alt.length).toBeGreaterThan(10);
    expect(frame.caption.length).toBeLessThanOrEqual(110);
    expect(source.cover).toMatch(/cover-.*\.webp/);
  });

  it.each(['second-1'])('%s: подпись и описание без ответа — ни одного имени соседа', (id) => {
    const source = cases.find((c) => c.id === id)!;
    const names = source.categories.find((c) => c.id === source.anchor)!.values;
    const text = `${source.story![0].caption} ${source.story![0].alt}`;
    for (const name of names) expect(text, name).not.toContain(name.slice(0, 4));
    // «хозяин», «хозяйка», «он принёс» и т. п. выдали бы пол владельца.
    expect(text).not.toMatch(/хозя|принёс|принесла|оставил|оставила/i);
  });

  it('у всех дел с кадрами есть обложка карточки', () => {
    for (const c of cases.filter((x) => x.story)) expect(c.cover, c.id).toBeTruthy();
  });
});

describe('вступление-книжка «Пирога» (редакция 3, четыре страницы)', () => {
  const source = cases.find((c) => c.id === 'tutorial-1')!;
  const story = source.story!;
  const solution = uniqueSolution(source)!;

  it('четыре страницы: двор → лейка у грядки → зонт → пирог; новая редакция, прежняя обложка', () => {
    expect(story.map((f) => f.image.match(/[^/]+\.webp/)![0])).toEqual([
      'tutorial-pie-book-1.webp',
      'tutorial-pie-book-2-garden.webp',
      'tutorial-pie-book-umbrella.webp',
      'tutorial-pie-1.webp',
    ]);
    expect(source.storyVersion).toBe(3);
    expect(source.cover).toMatch(/cover-tutorial-pie\.webp/);
    for (const frame of story) {
      expect(frame.alt.length).toBeGreaterThan(10);
      expect(frame.caption.length).toBeLessThanOrEqual(130);
    }
  });

  it('страница с зонтом — фон: ни места из таблицы, ни «оставили/нашли»', () => {
    const umbrella = story[2];
    const text = `${umbrella.caption} ${umbrella.alt}`.toLowerCase();
    expect(text).not.toMatch(/беседк|грядк|калитк|оставил|оставлен|нашли|найден|забыл/);
  });

  it('лейка у грядки и пирог в беседке — уже факты дела, а не новые улики', () => {
    const facts = source.clues.filter((c) => c.kind === 'same').map((c) => [c.a.value, c.b.value].sort().join('~'));
    expect(facts).toContain(['лейка', 'грядка'].sort().join('~'));
    expect(facts).toContain(['пирог', 'беседка'].sort().join('~'));
  });

  it('в кадрах нет глаголов, выдающих владельца пирога', () => {
    const text = story.map((f) => `${f.caption} ${f.alt}`).join(' ');
    expect(text).not.toMatch(/хозя|принёс|принесла|оставил|оставила/i);
  });

  /**
   * Перечисление «Ирина, Михаил и Олег … в беседке, у калитки, у грядки»
   * читается как пары по порядку. Поэтому ни одна позиция перечисления мест
   * или вещей не должна совпадать с решением — ни в кадрах, ни в условиях.
   */
  it.each([
    ['кадры', story.map((f) => f.caption).join(' ')],
    ['условия', source.intro ?? ''],
  ])('%s: порядок перечисления не совпадает с решением ни в одной позиции', (_label, text) => {
    const names = source.categories.find((c) => c.id === source.anchor)!.values;
    const stem = (v: string) => v.toLowerCase().slice(0, 4);
    const lower = text.toLowerCase();
    const nameOrder = [...names].sort((a, b) => lower.indexOf(stem(a)) - lower.indexOf(stem(b)));
    for (const name of names) expect(lower, name).toContain(stem(name));
    for (const cat of source.categories.filter((c) => c.id !== source.anchor)) {
      for (const v of cat.values) expect(lower, v).toContain(stem(v));
      const listed = [...cat.values].sort((a, b) => lower.indexOf(stem(a)) - lower.indexOf(stem(b)));
      nameOrder.forEach((name, i) => {
        const truth = cat.values[solution[cat.id][names.indexOf(name)]];
        expect(listed[i], `${name} стоит рядом с «${listed[i]}» — это ответ`).not.toBe(truth);
      });
    }
  });

  it('условия на экране дела: трое, три места и три вещи, у всех разные', () => {
    expect(source.intro).toMatch(/по одному в каждом/);
    expect(source.intro).toMatch(/у всех разные/);
    expect(source.intro).toMatch(/Чей пирог остался в беседке\?/);
  });
});
