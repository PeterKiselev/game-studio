/** Общие помощники текстовых тестов дел. Не тест: vitest файл не собирает. */

const WORD = /[а-яё0-9:]+/gi;

/** Основа значения для поиска в тексте: берётся самое длинное слово, времена и числа — целиком. */
export const stemOf = (value: string): string => {
  const words = value.toLowerCase().match(WORD) ?? [value.toLowerCase()];
  const word = words.reduce((a, b) => (b.length > a.length ? b : a));
  if (/^\d/.test(word)) return word;
  return word.slice(0, Math.max(3, Math.min(5, word.length - 2)));
};

/** Регулярное выражение значения: слева граница слова, у чисел и времён — и справа. */
export const valueRegExp = (value: string): RegExp => {
  const stem = stemOf(value);
  return /^\d/.test(stem) ? new RegExp('(?<![0-9:])' + stem + '(?![0-9:])') : new RegExp('(?<![а-яё0-9:])' + stem);
};

/** Имя в любом падеже: основа плюс не больше двух букв окончания, чтобы «Вера» не находилась в «веранде». */
export const nameRegExp = (name: string): RegExp =>
  new RegExp('(?<![а-яё])' + name.toLowerCase().slice(0, Math.max(2, name.length - 1)) + '[а-яё]{0,2}(?![а-яё])');

/**
 * Предложения и части между запятыми; часть без имени («в 11:00», «и на болоте набрал лисичек»)
 * продолжает предыдущую, поэтому значение всегда читается рядом со своим человеком.
 */
export function clausesOf(text: string, names: string[]): { text: string; who: string[] }[] {
  const raw = text.split(/[.!?;]\s*|,\s*/).filter((x) => x.trim());
  const out: { text: string; who: string[] }[] = [];
  for (const part of raw) {
    const who = names.filter((n) => nameRegExp(n).test(part.toLowerCase()));
    if (!who.length && out.length) out[out.length - 1].text += ', ' + part;
    else out.push({ text: part, who });
  }
  return out;
}
