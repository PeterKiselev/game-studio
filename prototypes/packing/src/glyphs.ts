/**
 * Простые контурные значки предметов, нарисованные кодом (viewBox 24×24,
 * штрих `currentColor`). Свои, не заимствованные: ничего не скопировано
 * из чужих игр или иконочных наборов. Значок ставится в одну клетку
 * предмета — форма всего предмета читается по контуру клеток.
 */
const GLYPHS: Record<string, string> = {
  cup: '<path d="M6 8h9v6a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4z"/><path d="M15 10h2a2 2 0 0 1 0 4h-2"/>',
  vase: '<path d="M9 3h6"/><path d="M10 3v4c-3 2-4 5-4 8a5 5 0 0 0 5 5h2a5 5 0 0 0 5-5c0-3-1-6-4-8V3"/>',
  teapot:
    '<path d="M5 10h10v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M15 12h2.5a1.5 1.5 0 0 1 0 3H15"/><path d="M8 10V8h4v2"/>',
  lamp: '<path d="M12 9 6 17h12z"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M12 3v3"/>',
  book: '<path d="M5 5h12a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2z"/><path d="M9 5v14"/>',
  dumbbell: '<path d="M3 10v4"/><path d="M6 7v10"/><path d="M18 7v10"/><path d="M21 10v4"/><path d="M6 12h12"/>',
  toolbox: '<path d="M4 9h16v10H4z"/><path d="M9 9V6h6v3"/><path d="M4 13h16"/>',
  anvil: '<path d="M4 8h16v3l-4 2v3h3v3H5v-3h3v-3L4 11z"/>',
  teddy:
    '<circle cx="7" cy="6" r="2"/><circle cx="17" cy="6" r="2"/><circle cx="12" cy="13" r="6"/><path d="M10 12h.01"/><path d="M14 12h.01"/><path d="M11 15h2"/>',
  cushion: '<path d="M5 7h14v10H5z"/><path d="M5 7l2 2"/><path d="M19 7l-2 2"/><path d="M5 17l2-2"/><path d="M19 17l-2-2"/>',
};

export function glyphSvg(itemId: string): string {
  const body = GLYPHS[itemId] ?? '<circle cx="12" cy="12" r="6"/>';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
