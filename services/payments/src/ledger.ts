/**
 * Журнал подтверждённых покупок.
 *
 * Почему не KV. Cloudflare KV — eventually consistent и не умеет атомарно менять
 * два ключа: между «записали покупку» и «записали транзакцию» возможен сбой, и
 * тогда покупка есть, а отметки о транзакции нет (или наоборот). Покупку, у
 * которой запись завершилась наполовину, нельзя считать состоявшейся. Поэтому
 * учёт ведёт Durable Object: один объект на (приложение, площадка, режим,
 * пользователь), все его операции выполняются по очереди, а обе записи —
 * `tx:` и `p:` — идут в одной транзакции хранилища: либо обе, либо ни одной.
 *
 * Ответ площадке «подтверждено» отправляется только после того, как `record`
 * вернул `new` или `duplicate`.
 */

export type Platform = 'vk' | 'ok';
export type Mode = 'test' | 'live';

export interface Scope {
  /** Ключ приложения в каталоге (`dachnye-tainy`, `sudoku`) — изоляция приложений. */
  app: string;
  platform: Platform;
  /** test и live — разные журналы: тестовая покупка никогда не выдаёт товар в рабочем режиме. */
  mode: Mode;
  uid: string;
}

export interface TxRecord {
  txId: string;
  sku: string;
  /** Сумма, по которой покупка была принята (голоса ВК или ОКи) — для сверки повторов. */
  amount: number;
  at: string;
}

export type RecordResult = 'new' | 'duplicate' | 'conflict';

export interface Ledger {
  /** Найденная ранее транзакция или null. */
  lookup(scope: Scope, txId: string): Promise<TxRecord | null>;
  /** Атомарно записывает транзакцию и покупку. Исключение = ничего не записано. */
  record(scope: Scope, tx: TxRecord): Promise<RecordResult>;
  /** SKU, купленные пользователем в этом журнале. */
  list(scope: Scope): Promise<string[]>;
}

// --- Durable Object ---------------------------------------------------------

/** Минимум от DurableObjectStorage, чтобы тестировать без workers-types. */
export interface StorageLike {
  get<T>(key: string): Promise<T | undefined>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  transaction<T>(closure: (txn: TxnLike) => Promise<T>): Promise<T>;
}
export interface TxnLike {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}
export interface StateLike {
  storage: StorageLike;
}

type Request_ = { op: 'lookup'; txId: string } | { op: 'record'; tx: TxRecord } | { op: 'list' };

export class LedgerDO {
  constructor(private readonly state: StateLike) {}

  async fetch(request: Request): Promise<Response> {
    const req = (await request.json()) as Request_;
    const storage = this.state.storage;

    if (req.op === 'lookup') {
      return Response.json({ tx: (await storage.get<TxRecord>(`tx:${req.txId}`)) ?? null });
    }
    if (req.op === 'list') {
      const purchases = await storage.list<unknown>({ prefix: 'p:' });
      return Response.json({ skus: [...purchases.keys()].map((k) => k.slice(2)).sort() });
    }

    const result = await storage.transaction(async (txn): Promise<RecordResult> => {
      const seen = await txn.get<TxRecord>(`tx:${req.tx.txId}`);
      if (seen) {
        return seen.sku === req.tx.sku && seen.amount === req.tx.amount ? 'duplicate' : 'conflict';
      }
      await txn.put(`tx:${req.tx.txId}`, req.tx);
      // Товары у нас одноразовые: если SKU уже куплен другой транзакцией, первая остаётся.
      if ((await txn.get(`p:${req.tx.sku}`)) === undefined) {
        await txn.put(`p:${req.tx.sku}`, { txId: req.tx.txId });
      }
      return 'new';
    });
    return Response.json({ result });
  }
}

// --- клиент к Durable Object ------------------------------------------------

export interface NamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export function doLedger(ns: NamespaceLike): Ledger {
  const call = async (scope: Scope, body: Request_): Promise<any> => {
    const name = `${scope.app}:${scope.platform}:${scope.mode}:${scope.uid}`;
    const res = await ns.get(ns.idFromName(name)).fetch(
      new Request('https://ledger.internal/', { method: 'POST', body: JSON.stringify(body) }),
    );
    if (!res.ok) throw new Error(`ledger ${res.status}`);
    return res.json();
  };
  return {
    lookup: async (scope, txId) => (await call(scope, { op: 'lookup', txId })).tx,
    record: async (scope, tx) => (await call(scope, { op: 'record', tx })).result,
    list: async (scope) => (await call(scope, { op: 'list' })).skus,
  };
}
