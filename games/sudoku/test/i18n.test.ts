import { describe, expect, it } from 'vitest';
import { detectLocale, locale, setLocale, t } from '../src/i18n';
import { ACADEMY_LESSONS } from '../src/academy';
import { ACHIEVEMENT_IDS } from '../src/achievements';
import type { sudoku } from '@studio/rules';

/**
 * Самая вероятная ошибка локализации — не кривой перевод, а забытый:
 * добавили урок или достижение и не завели для него английскую строку.
 * Типы ловят отсутствие целой группы, но не отсутствие ключа внутри
 * Record<string, ...>, поэтому ключи сверяем тестом.
 */

const LOCALES = ['ru', 'en'] as const;

function withLocale<T>(value: (typeof LOCALES)[number], run: () => T): T {
  const previous = locale();
  setLocale(value);
  try {
    return run();
  } finally {
    setLocale(previous);
  }
}

describe('выбор языка', () => {
  it('?lang= имеет приоритет над локалью площадки — иначе браузерный тест невоспроизводим', () => {
    expect(detectLocale('ru_RU', '?lang=en')).toBe('en');
    expect(detectLocale('en_US', '?lang=ru')).toBe('ru');
  });

  it('без ?lang= решает площадка: ru* русский, всё остальное английский', () => {
    expect(detectLocale('ru_RU', '')).toBe('ru');
    expect(detectLocale('ru', '')).toBe('ru');
    expect(detectLocale('en_US', '')).toBe('en');
    expect(detectLocale('de_DE', '')).toBe('en');
    expect(detectLocale('', '')).toBe('en');
  });

  it('неизвестное значение ?lang= игнорируется, а не ломает игру', () => {
    expect(detectLocale('ru_RU', '?lang=fr')).toBe('ru');
    expect(detectLocale('en_US', '?lang=')).toBe('en');
  });
});

/**
 * Тестовое окружение — Node (`typeof document === 'undefined'` уже
 * используется в setLocale по этой же причине), поэтому `window` для
 * этих тестов ставится и убирается вручную через globalThis, а не через
 * jsdom — заводить целое DOM-окружение ради одного флага было бы лишним.
 */
describe('window.__SUDOKU_FORCE_LOCALE__ — умолчание международных ZIP', () => {
  function withForcedWindow<T>(forced: 'ru' | 'en' | undefined, run: () => T): T {
    const had = 'window' in globalThis;
    const previous = had ? (globalThis as any).window : undefined;
    (globalThis as any).window = { __SUDOKU_FORCE_LOCALE__: forced };
    try {
      return run();
    } finally {
      if (had) (globalThis as any).window = previous;
      else delete (globalThis as any).window;
    }
  }

  it('форсирует английский для ru-локали площадки без ?lang= — ровно тот сценарий, что поймало ревью', () => {
    withForcedWindow('en', () => {
      expect(detectLocale('ru_RU', '')).toBe('en');
    });
  });

  it('без флага (обычная web/VK-сборка) поведение не меняется — ru-локаль всё ещё даёт русский', () => {
    // window вообще не определён, как в реальной обычной сборке и в этом тестовом окружении по умолчанию.
    expect(detectLocale('ru_RU', '')).toBe('ru');
  });

  it('?lang= всё равно главнее флага — «Продолжить с ?lang=ru» из международного ZIP обязан работать', () => {
    withForcedWindow('en', () => {
      expect(detectLocale('ru_RU', '?lang=ru')).toBe('ru');
    });
  });

  it('невалидное значение флага игнорируется, откатывается на локаль площадки', () => {
    withForcedWindow(undefined, () => {
      expect(detectLocale('ru_RU', '')).toBe('ru');
      expect(detectLocale('en_US', '')).toBe('en');
    });
  });
});

describe('полнота словаря', () => {
  it.each(LOCALES)('%s: у каждого урока есть название и подзаголовок', (value) => {
    withLocale(value, () => {
      for (const lesson of ACADEMY_LESSONS) {
        const copy = t().lessons[lesson.id];
        expect(copy, `нет строк для урока ${lesson.id}`).toBeDefined();
        expect(copy.title.trim().length).toBeGreaterThan(0);
        expect(copy.short.trim().length).toBeGreaterThan(0);
      }
    });
  });

  it.each(LOCALES)('%s: у каждого достижения есть название и описание', (value) => {
    withLocale(value, () => {
      for (const id of ACHIEVEMENT_IDS) {
        const copy = t().achievements[id];
        expect(copy, `нет строк для достижения ${id}`).toBeDefined();
        expect(copy.title.trim().length).toBeGreaterThan(0);
        expect(copy.description.trim().length).toBeGreaterThan(0);
      }
    });
  });

  it.each(LOCALES)('%s: у обоих товаров магазина есть название и описание', (value) => {
    withLocale(value, () => {
      for (const sku of ['sudoku_no_ads', 'sudoku_unlimited_hints']) {
        expect(t().shop.items[sku], `нет строк для ${sku}`).toBeDefined();
        expect(t().shop.items[sku].title.trim().length).toBeGreaterThan(0);
      }
    });
  });

  it('английский словарь не содержит кириллицы — это и проверяет портал', () => {
    withLocale('en', () => {
      const strings = t();
      const collected: string[] = [
        strings.appTitle,
        ...Object.values(strings.common),
        ...Object.values(strings.academy).filter((v): v is string => typeof v === 'string'),
        ...Object.values(strings.puzzle).filter((v): v is string => typeof v === 'string'),
        ...Object.values(strings.menu).filter((v): v is string => typeof v === 'string'),
        ...Object.values(strings.reveal).filter((v): v is string => typeof v === 'string'),
        ...Object.values(strings.techniques),
        ...Object.values(strings.difficulties),
        ...ACADEMY_LESSONS.flatMap((l) => [strings.lessons[l.id].title, strings.lessons[l.id].short]),
        ...ACHIEVEMENT_IDS.flatMap((id) => [strings.achievements[id].title, strings.achievements[id].description]),
      ];
      for (const value of collected) {
        expect(value, `кириллица в английской строке: ${value}`).not.toMatch(/[А-Яа-яЁё]/);
      }
    });
  });
});

describe('разбор подсказки', () => {
  const hints: sudoku.Hint[] = [
    { index: 0, value: 7, technique: 'naked-single' },
    { index: 40, value: 3, technique: 'hidden-single', unit: 'box' },
    {
      index: 12,
      value: 5,
      technique: 'naked-pair',
      unit: 'row',
      pairCells: [10, 11] as const,
      pairDigits: [2, 8] as const,
    },
  ];

  it.each(LOCALES)('%s: все три приёма получают непустое объяснение с номером клетки и цифрой', (value) => {
    withLocale(value, () => {
      for (const hint of hints) {
        const text = t().hintText(hint);
        expect(text.trim().length).toBeGreaterThan(10);
        expect(text).toContain(String(hint.value));
        // Клетка называется человеку понятной позицией (строка/столбец с единицы),
        // а не индексом 0..80 — иначе объяснение бесполезно.
        expect(text).toContain(String(Math.floor(hint.index / 9) + 1));
      }
    });
  });

  it('en: объяснение голой пары называет обе цифры пары', () => {
    withLocale('en', () => {
      const text = t().hintText(hints[2]);
      expect(text).toContain('2/8');
      expect(text).not.toMatch(/[А-Яа-яЁё]/);
    });
  });
});

describe('множественное число', () => {
  it('русский различает три формы, а не приклеивает «дней» ко всему', () => {
    withLocale('ru', () => {
      expect(t().menu.streak(1)).toContain('1 день');
      expect(t().menu.streak(3)).toContain('3 дня');
      expect(t().menu.streak(7)).toContain('7 дней');
      expect(t().menu.streak(11)).toContain('11 дней');
      expect(t().menu.streak(21)).toContain('21 день');
    });
  });

  it('английский различает единственное и множественное', () => {
    withLocale('en', () => {
      expect(t().menu.streak(1)).toContain('1 day in');
      expect(t().menu.streak(2)).toContain('2 days');
      expect(t().reveal.stepsInTask(1)).toContain('1 logic step');
      expect(t().reveal.stepsInTask(4)).toContain('4 logic steps');
    });
  });
});
