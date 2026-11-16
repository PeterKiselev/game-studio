import { describe, expect, it } from 'vitest';
import { uniqueSolution } from '@studio/rules';
import type { Case } from '@studio/rules';
import { DAILY_SCHEDULE } from '../src/daily/schedule';
import { clausesOf, nameRegExp, valueRegExp } from './helpers';

/**
 * Решения дел дня закреплены явно: «имя → значения остальных категорий, в порядке категорий
 * дела». Если улики когда-нибудь поменяются так, что решение станет другим, тест скажет об
 * этом, а не только пересчитает число решений. Развязка обязана говорить то же самое.
 */
const EXPECTED: Record<string, Record<string, string[]>> = {
  'daily-glasses': { Майя: ['веранда', 'ключи'], Борис: ['сарай', 'телефон'], Лёня: ['теплица', 'очки'] },
  'daily-watering': { Лида: ['ведро'], Фёдор: ['шланг'], Тамара: ['лейка'], Сева: ['ковшик'] },
  'daily-well': { Лида: ['4', 'банка'], Фёдор: ['2', 'бидон'], Тамара: ['1', 'канистра'], Сева: ['3', 'ведро'] },
  'daily-beds': { Глеб: ['4', 'лук'], Вера: ['2', 'морковь'], Инна: ['1', 'укроп'], Юра: ['3', 'редис'] },
  'daily-bath': {
    Майя: ['понедельник', 'вода'],
    Борис: ['среда', 'дрова'],
    Лёня: ['вторник', 'уборка'],
    Дана: ['четверг', 'веники'],
  },
  'daily-jam': {
    Глеб: ['малиновое', 'красная', 'второе'],
    Вера: ['смородина', 'белая', 'первое'],
    Инна: ['вишнёвое', 'клетчатая', 'третье'],
    Юра: ['крыжовник', 'синяя', 'приз зрителей'],
  },
  'daily-fishing': {
    Пётр: ['5:00', 'ёрш'],
    Ася: ['6:00', 'карась'],
    Рустам: ['7:00', 'лещ'],
    Нина: ['5:30', 'плотва'],
    Олег: ['6:30', 'окунь'],
  },
  'daily-post': { Инна: ['9:00'], Лев: ['10:00'], Ада: ['11:00'] },
  'daily-apples': { Нина: ['7:00', 'красная'], Павел: ['8:00', 'синяя'], Эмма: ['9:00', 'белая'] },
  'daily-repair': { Вера: ['молоток'], Глеб: ['отвёртка'], Лена: ['рубанок'], Борис: ['пила'] },
  'daily-seedlings': {
    Мила: ['синий', 'перец', 'дрожжи'],
    Степан: ['жёлтый', 'баклажан', 'зола'],
    Ульяна: ['зелёный', 'томаты', 'крапива'],
  },
  'daily-tea': { Клава: ['17:30'], Мирон: ['17:00'], Раиса: ['16:30'], Савва: ['18:00'], Тоня: ['16:00'] },
  'daily-concert': {
    Алиса: ['4', 'скрипка'],
    Богдан: ['5', 'танец'],
    Варя: ['2', 'песня'],
    Гордей: ['3', 'фокус'],
    Диана: ['1', 'стихи'],
  },
  'daily-mushrooms': {
    Арина: ['7:00', 'опята', 'роща'],
    Демид: ['8:00', 'лисички', 'болото'],
    Полина: ['6:00', 'белые', 'овраг'],
    Фома: ['5:00', 'рыжики', 'ельник'],
  },
  'daily-fair': { Арсений: ['10:00', 'навес'], Злата: ['9:00', 'фонтан'], Кира: ['11:00', 'вход'], Тихон: ['8:00', 'ворота'] },
  'daily-winter': { Ефим: ['свёкла'], Лада: ['чеснок'], Нонна: ['петрушка'], Прохор: ['лук'], Ярослава: ['морковь'] },
  'daily-bonfire': { Савелий: ['воскресенье', 'ботва'], Устинья: ['пятница', 'ветки'], Харитон: ['суббота', 'листья'] },
  'daily-pickles': {
    Варвара: ['капуста', 'нижняя'],
    Денис: ['огурцы', 'угловая'],
    Ольга: ['помидоры', 'верхняя'],
    Роман: ['грибы', 'средняя'],
  },
  'daily-train': {
    Агния: ['6:30', 'корзина'],
    Вадим: ['6:50', 'рюкзак'],
    Елисей: ['6:20', 'удочки'],
    Марфа: ['6:10', 'саженцы'],
    Трофим: ['6:40', 'ведро'],
  },
  'daily-digging': { Гаврила: ['13:00'], Дарья: ['10:00'], Лукьян: ['11:00'], Серафима: ['12:00'] },
  'daily-leaves': {
    Зинаида: ['16:00', 'вилы', 'мешок'],
    Касьян: ['15:00', 'грабли', 'компост'],
    Олеся: ['14:00', 'веник', 'тачка'],
  },
  'daily-snow': { Аким: ['колодец'], Белла: ['калитка'], Всеволод: ['сарай'] },
  'daily-feeders': { Ганна: ['пакет', 'рябина'], Егор: ['тыква', 'семечки'], Игнат: ['бутылка', 'сало'] },
  'daily-roses': { Ксения: ['12:00'], Матвей: ['10:00'], Нил: ['13:00'], Оксана: ['11:00'] },
  'daily-firewood': {
    Платон: ['ольха', 'сарай'],
    Регина: ['берёза', 'крыльцо'],
    Тарас: ['сосна', 'забор'],
    Фаина: ['осина', 'баня'],
    Эрик: ['дуб', 'навес'],
  },
  'daily-barrels': { Юлиан: ['суббота', 'ржавая'], Ия: ['воскресенье', 'синяя'], Остап: ['пятница', 'зелёная'] },
  'daily-stove': {
    Влас: ['19:00', 'береста', 'кухня'],
    Галина: ['17:00', 'щепки', 'флигель'],
    Добрыня: ['16:00', 'шишки', 'дом'],
    Евгения: ['18:00', 'газета', 'баня'],
  },
  'daily-keys': { Анфиса: ['10:30'], Борислав: ['9:00'], Велимир: ['11:00'], Глафира: ['10:00'], Евсей: ['9:30'] },
  'daily-cabbage': {
    Илья: ['понедельник', 'краснокочанная', 'щи'],
    Капитолина: ['среда', 'белокочанная', 'квашеная'],
    Леонтий: ['вторник', 'савойская', 'тушёная'],
  },
  'daily-watchman': {
    Аркадий: ['красный'],
    Валентина: ['жёлтый'],
    Геннадий: ['серый'],
    Евдокия: ['зелёный'],
    Захар: ['голубой'],
    Лукерья: ['белый'],
  },
  'daily-bullfinches': {
    Мирослава: ['9:00', 'свиристель'],
    Никита: ['11:00', 'снегирь'],
    Прасковья: ['8:00', 'дятел'],
    Родион: ['10:00', 'синица'],
  },
  'daily-mittens': {
    Святослав: ['белые', 'ёлочки', 'калитка', 'мама'],
    Таисия: ['красные', 'снежинки', 'скамейка', 'бабушка'],
    Фрол: ['синие', 'олени', 'забор', 'тётя'],
  },
  'daily-seeds': {
    Аглая: ['среда', 'кабачки'],
    Ерофей: ['пятница', 'томаты'],
    Людмила: ['понедельник', 'тыква'],
    Пахом: ['четверг', 'огурцы'],
    Снежана: ['вторник', 'перец'],
  },
  'daily-tree': { Вениамин: ['17:15'], Дарина: ['17:45'], Елизар: ['17:00'], Зоя: ['17:30'] },
  'daily-meeting': {
    Емельян: ['18:30'],
    Ирина: ['18:00'],
    Кузьма: ['18:50'],
    Любава: ['18:10'],
    Мефодий: ['18:40'],
    Нелли: ['18:20'],
  },
};

/** Ответ на вопрос из условий: кто или что. Развязка обязана его назвать. */
const ANSWER: Record<string, { question: RegExp; answer: string }> = {
  'daily-seedlings': { question: /Кто выращивал баклажан\?$/, answer: 'Степан' },
  'daily-tea': { question: /Кто пришёл в 17:00\?$/, answer: 'Мирон' },
  'daily-concert': { question: /Кто показал фокус\?$/, answer: 'Гордей' },
  'daily-mushrooms': { question: /Кто нашёл рыжики\?$/, answer: 'Фома' },
  'daily-fair': { question: /Кто встал у фонтана\?$/, answer: 'Злата' },
  'daily-winter': { question: /Кто посадил чеснок\?$/, answer: 'Лада' },
  'daily-bonfire': { question: /Кто жёг ботву\?$/, answer: 'Савелий' },
  'daily-pickles': { question: /Кто солил огурцы\?$/, answer: 'Денис' },
  'daily-train': { question: /Кто вёз удочки\?$/, answer: 'Елисей' },
  'daily-digging': { question: /Кто копал в 12:00\?$/, answer: 'Серафима' },
  'daily-leaves': { question: /Кто сгребал граблями\?$/, answer: 'Касьян' },
};

const solutionOf = (c: Case): Record<string, string[]> => {
  const solution = uniqueSolution(c)!;
  const anchor = c.categories.find((x) => x.id === c.anchor)!;
  const others = c.categories.filter((x) => x.id !== c.anchor);
  return Object.fromEntries(anchor.values.map((name, i) => [name, others.map((cat) => cat.values[solution[cat.id][i]])]));
};

const dailies = DAILY_SCHEDULE.map((e) => e.case);

describe('решения дел дня закреплены явно', () => {
  it('таблица охватывает все двадцать одно дело и ничего лишнего', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(dailies.map((c) => c.id).sort());
  });

  it.each(dailies.map((c) => [c.id, c] as const))('%s: единственное решение — ожидаемое', (id, c) => {
    expect(solutionOf(c)).toEqual(EXPECTED[id]);
  });
});

describe('развязка говорит то же, что решение', () => {
  it.each(dailies.map((c) => [c.id, c] as const))('%s: у каждого человека — его значения и ничьи чужие', (id, c) => {
    const names = c.categories.find((x) => x.id === c.anchor)!.values;
    const expected = EXPECTED[id];
    const clauses = clausesOf(c.epilogue, names);
    const lower = (t: string) => t.toLowerCase();
    for (const name of names) {
      const own = clauses.filter((cl) => cl.who.includes(name));
      expect(own.length, `в развязке нет «${name}»`).toBeGreaterThan(0);
      const text = lower(own.map((cl) => cl.text).join(' '));
      for (const value of expected[name]) {
        const literal = valueRegExp(value).test(lower(c.epilogue));
        // Значение, которого в развязке нет словами («первой», «последней»), проверить нечем.
        if (literal) expect(valueRegExp(value).test(text), `${name}: в развязке нет «${value}» рядом с именем`).toBe(true);
      }
      // Чужое значение не стоит в частях, где назван этот человек (и больше никто не назван).
      for (const other of names.filter((n) => n !== name)) {
        for (const value of expected[other]) {
          if (expected[name].includes(value)) continue;
          for (const cl of own.filter((x) => x.who.length === 1)) {
            expect(valueRegExp(value).test(lower(cl.text)), `${name}: «${value}» принадлежит ${other}: «${cl.text}»`).toBe(false);
          }
        }
      }
    }
  });

  it.each(Object.entries(ANSWER))('%s: вопрос из условий, и развязка называет ответ', (id, { question, answer }) => {
    const c = dailies.find((x) => x.id === id)!;
    expect(c.intro).toMatch(question);
    expect(nameRegExp(answer).test(c.epilogue.toLowerCase())).toBe(true);
    const last = c.epilogue.split(/[.!?]\s*/).filter(Boolean).slice(-2).join(' ');
    expect(last, 'ответ — в конце развязки').toMatch(new RegExp(answer.slice(0, 3)));
  });

  it('проверка ловит перепутанную развязку: значения двух людей поменяны местами', () => {
    const repair = dailies.find((c) => c.id === 'daily-repair')!;
    const swapped = { ...repair, epilogue: repair.epilogue.replace('молотком', 'ПИЛА').replace('пилой', 'молотком').replace('ПИЛА', 'пилой') };
    const names = repair.categories[0].values;
    const clauses = clausesOf(swapped.epilogue, names);
    const vera = clauses.filter((cl) => cl.who.includes('Вера')).map((cl) => cl.text.toLowerCase()).join(' ');
    expect(valueRegExp('молоток').test(vera)).toBe(false);
  });
});
