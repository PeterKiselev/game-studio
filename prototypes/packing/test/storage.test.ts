import { describe, expect, it } from 'vitest';
import { LOG_KEY, SAVE_KEY, appendLog, loadCompleted, readLog, saveCompleted } from '../src/storage';
import type { KV } from '../src/storage';

const IDS = ['order-1', 'order-2', 'order-3'];

function memory(initial: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('сохранение завершённых заказов', () => {
  it('записанное читается обратно', () => {
    const kv = memory();
    saveCompleted(kv, ['order-1', 'order-2']);
    expect(loadCompleted(kv, IDS)).toEqual(['order-1', 'order-2']);
  });

  it('пустое хранилище и отсутствие хранилища дают пустой результат', () => {
    expect(loadCompleted(memory(), IDS)).toEqual([]);
    expect(loadCompleted(null, IDS)).toEqual([]);
  });

  it('повреждённый JSON не ломает старт', () => {
    expect(loadCompleted(memory({ [SAVE_KEY]: '{not json' }), IDS)).toEqual([]);
  });

  it('неверная форма данных отвергается', () => {
    for (const bad of ['null', '42', '"text"', '[]', '{"completed":"order-1"}', '{"completed":null}']) {
      expect(loadCompleted(memory({ [SAVE_KEY]: bad }), IDS), bad).toEqual([]);
    }
  });

  it('неизвестные идентификаторы, не-строки и дубликаты отбрасываются', () => {
    const raw = JSON.stringify({ v: 1, completed: ['order-2', 7, null, 'order-99', 'order-2', 'order-1'] });
    expect(loadCompleted(memory({ [SAVE_KEY]: raw }), IDS)).toEqual(['order-2', 'order-1']);
  });

  it('хранилище, бросающее исключения, не роняет ни чтение, ни запись', () => {
    const broken: KV = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadCompleted(broken, IDS)).toEqual([]);
    expect(() => saveCompleted(broken, ['order-1'])).not.toThrow();
    expect(() => appendLog(broken, { t: 1, e: 'order_start', order: 'order-1' })).not.toThrow();
    expect(readLog(broken)).toEqual([]);
  });
});

describe('журнал событий', () => {
  it('сохраняет порядок и время событий', () => {
    const kv = memory();
    appendLog(kv, { t: 10, e: 'order_start', order: 'order-1' });
    appendLog(kv, { t: 2500, e: 'first_place', order: 'order-1' });
    expect(readLog(kv)).toEqual([
      { t: 10, e: 'order_start', order: 'order-1' },
      { t: 2500, e: 'first_place', order: 'order-1' },
    ]);
  });

  it('хранит не больше 500 последних записей', () => {
    const kv = memory();
    for (let i = 0; i < 520; i += 1) appendLog(kv, { t: i, e: 'first_place', order: 'order-1' });
    const log = readLog(kv);
    expect(log).toHaveLength(500);
    expect(log[0].t).toBe(20);
    expect(log[499].t).toBe(519);
  });

  it('повреждённый журнал читается как пустой и не мешает новой записи', () => {
    const kv = memory({ [LOG_KEY]: 'garbage' });
    expect(readLog(kv)).toEqual([]);
    appendLog(kv, { t: 1, e: 'order_start', order: 'order-1' });
    expect(readLog(kv)).toHaveLength(1);
  });

  it('записи неверной формы отбрасываются', () => {
    const kv = memory({ [LOG_KEY]: JSON.stringify([{ t: 1, e: 'order_start', order: 'order-1' }, { t: 'x' }, 5, null]) });
    expect(readLog(kv)).toEqual([{ t: 1, e: 'order_start', order: 'order-1' }]);
  });
});
