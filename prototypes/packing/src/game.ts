import { bounds, evaluate, footprint, placementProblem, rotateCells } from './rules';
import type { Evaluation, ItemDef, OrderDef, Placement, PlacementProblem } from './rules';

export type TapResult =
  | { type: 'noop' }
  | { type: 'rejected'; problem: PlacementProblem }
  | { type: 'picked'; itemId: string }
  | {
      type: 'placed';
      itemId: string;
      first: boolean;
      evaluation: Evaluation;
    };

/**
 * Состояние одного заказа без DOM: что лежит в коробке, что в «руке»,
 * как повёрнут каждый предмет. Интерфейс только рисует это состояние и
 * зовёт методы — так правила игры целиком покрываются тестами без браузера.
 */
export class PackingGame {
  readonly order: OrderDef;
  placements: Placement[] = [];
  heldId: string | null = null;
  completed = false;
  private rotations = new Map<string, number>();
  private placedAny = false;

  constructor(order: OrderDef) {
    this.order = order;
    for (const item of order.items) this.rotations.set(item.id, 0);
  }

  item(id: string): ItemDef {
    const found = this.order.items.find((i) => i.id === id);
    if (!found) throw new Error(`неизвестный предмет ${id}`);
    return found;
  }

  rotationOf(id: string): number {
    return this.rotations.get(id) ?? 0;
  }

  /** Предметы, которых нет в коробке (в том числе тот, что сейчас в руке). */
  trayIds(): string[] {
    const placed = new Set(this.placements.map((p) => p.itemId));
    return this.order.items.filter((i) => !placed.has(i.id)).map((i) => i.id);
  }

  /** Выбрать предмет из ряда внизу; повторный выбор того же — убирает из руки. */
  select(itemId: string): void {
    if (this.completed) return;
    if (!this.trayIds().includes(itemId)) return;
    this.heldId = this.heldId === itemId ? null : itemId;
  }

  deselect(): void {
    this.heldId = null;
  }

  rotate(): boolean {
    if (this.completed || !this.heldId) return false;
    this.rotations.set(this.heldId, (this.rotationOf(this.heldId) + 1) % 4);
    return true;
  }

  /** Куда ляжет предмет из руки, если коснуться клетки (x, y): левый верхний угол, но не за край. */
  previewAt(x: number, y: number): { placement: Placement; problem: PlacementProblem | null } | null {
    if (!this.heldId) return null;
    const item = this.item(this.heldId);
    const rot = this.rotationOf(item.id);
    const { w, h } = bounds(rotateCells(item.cells, rot));
    const px = Math.max(0, Math.min(x, this.order.width - w));
    const py = Math.max(0, Math.min(y, this.order.height - h));
    const placement: Placement = { itemId: item.id, x: px, y: py, rot };
    return { placement, problem: placementProblem(this.order, this.placements, placement) };
  }

  tapCell(x: number, y: number): TapResult {
    if (this.completed) return { type: 'noop' };

    if (this.heldId) {
      const preview = this.previewAt(x, y);
      if (!preview) return { type: 'noop' };
      if (preview.problem) return { type: 'rejected', problem: preview.problem };
      this.placements.push(preview.placement);
      const itemId = this.heldId;
      this.heldId = null;
      const first = !this.placedAny;
      this.placedAny = true;
      const evaluation = evaluate(this.order, this.placements);
      if (evaluation.complete) this.completed = true;
      return { type: 'placed', itemId, first, evaluation };
    }

    const owner = this.ownerAt(x, y);
    if (!owner) return { type: 'noop' };
    this.placements = this.placements.filter((p) => p.itemId !== owner.itemId);
    this.rotations.set(owner.itemId, owner.rot);
    this.heldId = owner.itemId;
    return { type: 'picked', itemId: owner.itemId };
  }

  ownerAt(x: number, y: number): Placement | null {
    for (const p of this.placements) {
      if (footprint(this.item(p.itemId), p).some(([cx, cy]) => cx === x && cy === y)) return p;
    }
    return null;
  }

  evaluation(): Evaluation {
    return evaluate(this.order, this.placements);
  }

  reset(): void {
    this.placements = [];
    this.heldId = null;
    this.completed = false;
    this.placedAny = false;
    for (const item of this.order.items) this.rotations.set(item.id, 0);
  }
}
