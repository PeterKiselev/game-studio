import './tokens.css';
import './ui.css';

export type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'studio:theme';

/**
 * Тема запоминается один раз на все игры студии: игрок выбрал тёмную в судоку —
 * получил тёмную и в пасьянсе. Мелочь, которая читается как «сделано одними руками».
 */
export function initTheme(): Theme {
  let saved: Theme = 'system';
  try {
    saved = (localStorage.getItem(THEME_KEY) as Theme) ?? 'system';
  } catch {
    /* приватное окно */
  }
  applyTheme(saved);
  return saved;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* */
  }
}

export function cycleTheme(): Theme {
  const current = document.documentElement.getAttribute('data-theme');
  const next: Theme = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
  applyTheme(next);
  return next;
}

/** Короткая обёртка над createElement — читается лучше, чем ручная сборка DOM. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: className, ...rest } = props as Record<string, unknown> & { class?: string };
  if (className) node.className = className;
  Object.assign(node, rest);
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export interface DialogAction {
  label: string;
  kind?: 'primary' | 'ghost' | 'reward';
  value: string;
  disabled?: boolean;
}

/**
 * Модальный диалог. Возвращает value нажатой кнопки.
 * Закрытие по фону намеренно отключено: на телефоне это самый частый
 * способ случайно отменить важный выбор.
 */
export function dialog(opts: {
  title: string;
  text?: string;
  actions: DialogAction[];
}): Promise<string> {
  return new Promise((resolve) => {
    const box = el('div', { class: 'dialog' }, el('h2', {}, opts.title));
    if (opts.text) box.append(el('p', {}, opts.text));

    const actions = el('div', { class: 'actions' });
    for (const action of opts.actions) {
      const btn = el('button', {
        class: `btn ${action.kind ?? ''}`.trim(),
        type: 'button',
        disabled: !!action.disabled,
      });
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        overlay.remove();
        resolve(action.value);
      });
      actions.append(btn);
    }
    box.append(actions);

    const overlay = el('div', { class: 'overlay' }, box);
    document.body.append(overlay);
    (actions.firstElementChild as HTMLElement | null)?.focus();
  });
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, ms = 2200): void {
  document.querySelector('.toast')?.remove();
  const node = el('div', { class: 'toast' }, message);
  document.body.append(node);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), ms);
}

/** Короткая вибрация там, где браузер её поддерживает. */
export function haptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS Safari не умеет */
  }
}
