import { cases } from './cases';
import { DAILY_SCHEDULE } from './daily/schedule';

const previewCases = [...cases.filter(c => c.story?.length), ...DAILY_SCHEDULE.map(entry => entry.case)];

// Отдельная точка входа локального Vite: не читает и не меняет сохранения.
// Не входит в обычную сборку игры (единственная production-точка — index.html).
const root = document.querySelector<HTMLElement>('#preview')!;
document.body.style.cssText = 'margin:0;background:#f3eddf;color:#382c1e;font:17px/1.5 system-ui';
root.style.cssText = 'max-width:1000px;margin:auto;padding:24px';
const heading = document.createElement('h1');
heading.textContent = 'Дачные тайны · просмотр контента';
const note = document.createElement('p');
note.textContent = 'Локальный просмотр без прохождения и без изменения сохранения. Выберите дело: сюжетные иллюстрации или условия и факты дела дня.';
const select = document.createElement('select');
select.style.cssText = 'max-width:100%;padding:12px;font:inherit;margin-bottom:20px';
for (const source of previewCases) {
  const option = document.createElement('option');
  const date = DAILY_SCHEDULE.find(entry => entry.case.id === source.id)?.date;
  option.value = source.id; option.textContent = date ? `${date} · ${source.title}` : source.title; select.append(option);
}
const image = document.createElement('img');
image.style.cssText = 'display:block;width:100%;aspect-ratio:4/3;object-fit:contain;border-radius:16px';
const caption = document.createElement('p');
const controls = document.createElement('div');
controls.style.cssText = 'display:flex;align-items:center;gap:18px';
const previous = document.createElement('button'); previous.textContent = '← Назад';
const next = document.createElement('button'); next.textContent = 'Дальше →';
for (const button of [previous, next]) button.style.cssText = 'padding:12px;font:inherit;cursor:pointer';
const counter = document.createElement('span');
controls.append(previous, counter, next);
root.append(heading, note, select, image, caption, controls);
let index = 0;
function render(): void {
  const source = previewCases.find(c => c.id === select.value)!;
  const frames = source.story ?? [
    { image: '', alt: '', caption: source.intro ?? source.title },
    ...source.clues.map((clue, i) => ({ image: '', alt: '', caption: `Факт ${i + 1}. ${clue.text}` })),
  ];
  const frame = frames[index]; image.hidden = !frame.image;
  image.style.display = frame.image ? 'block' : 'none';
  if(frame.image) image.src = frame.image; else image.removeAttribute('src');
  image.alt = frame.alt;
  caption.textContent = frame.caption; counter.textContent = `${index + 1} / ${frames.length}`;
  previous.disabled = index === 0; next.disabled = index === frames.length - 1;
}
select.value = new URLSearchParams(location.search).get('case') ?? 'sixth-1';
if (!select.value) select.selectedIndex = 0;
select.onchange = () => { index = 0; render(); };
previous.onclick = () => { index--; render(); }; next.onclick = () => { index++; render(); };
render();
