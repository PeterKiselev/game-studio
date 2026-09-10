/**
 * Событийная аналитика — общий шов для всех игр, не только «Дачных тайн».
 *
 * Честно про то, чего тут нет: реальной отправки в Яндекс.Метрику или
 * статистику VK нет — под это нет ни счётчика, ни выбранного поставщика.
 * Сейчас track() структурированно пишет в консоль и копит события в памяти
 * сессии. Когда появится настоящий канал — меняется одна функция send()
 * ниже, вызовы track() по всем играм трогать не придётся.
 *
 * Формат события — плоский объект с обязательными name и ts, остальное
 * произвольные примитивы. Не логируем персональные данные: только action-
 * события самой игры (начал дело, поставил отметку, взял подсказку).
 */

export interface TrackedEvent {
  name: string;
  ts: number;
  props?: Record<string, string | number | boolean>;
}

const buffer: TrackedEvent[] = [];

function send(event: TrackedEvent): void {
  // Место для реального канала. Пока — только консоль.
  const props = event.props ? ` ${JSON.stringify(event.props)}` : '';
  console.info(`[analytics] ${event.name}${props}`);
}

export function track(name: string, props?: TrackedEvent['props']): void {
  const event: TrackedEvent = { name, ts: Date.now(), props };
  buffer.push(event);
  send(event);
}

/** Для отладки и для будущих тестов — что реально было отправлено. */
export function trackedEvents(): readonly TrackedEvent[] {
  return buffer;
}
