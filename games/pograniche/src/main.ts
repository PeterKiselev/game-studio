import { GameApp } from '@studio/game-kit';
import {
  ARMORS, ENEMIES, EXPEDITION_MAP, FRONTIER_TALENT_CAPS, WEAPONS, availableMapNodes,
  chooseLoot, claimVictory, equipFrontierLoot, finishFrontierTurn, frontierIntent,
  frontierTalentCost, learnFrontierTalent, lootOptions, playFrontierAction,
  retryEncounter, selectMapNode, startExpedition, unlockFrontierLoot,
} from '@studio/rules';
import type { FrontierAction, FrontierTalentId, LootId, MapNodeId } from '@studio/rules';
import { haptic } from '@studio/ui';
import { defaultPogranicheSave, migratePogranicheSave } from './save';
import type { PogranicheSave } from './save';
import './theme.css';
import './style.css';

const root = document.getElementById('app')!;

async function main(): Promise<void> {
  const app = await GameApp.boot<PogranicheSave>({
    gameId: 'pograniche', saveVersion: 7,
    defaults: defaultPogranicheSave(),
    migrate: migratePogranicheSave,
    adPolicy: { firstAdAfterRounds: 2, minSecondsBetween: 180 },
  });

  let run = app.save.data.run ?? startExpedition(app.save.data.loadout, app.save.data.talents);
  let inventoryOpen = false;
  let roundClosed = run.phase !== 'battle' || run.combat.outcome !== null;
  root.innerHTML = `
    <main>
      <header class="topbar"><div><span class="brand">ПОГРАНИЧЬЕ</span><small>ПЕРВЫЙ ПОХОД</small></div><div class="record"><span>ПОБЕД</span><strong id="victories">0</strong></div></header>
      <section class="screen map-screen" id="map-screen" hidden>
        <div class="chapter-mark">КАРТА ПОХОДА</div><h1 id="map-title"></h1><p id="map-copy"></p>
        <div class="expedition-resources" id="expedition-resources"></div>
        <div class="expedition-map" id="expedition-map" aria-label="Карта маршрута"></div>
        <div class="map-options" id="map-options"></div>
        <button type="button" class="btn secondary" id="map-inventory">Снаряжение и инвентарь</button>
      </section>
      <section class="screen battle-screen" id="battle-screen">
        <div class="journey"><span id="location"></span><div class="route" id="route" aria-label="Прогресс похода"></div></div>
        <div class="arena">
          <article class="fighter enemy-card"><div class="figure enemy-figure" id="enemy-art" aria-hidden="true"></div><div class="fighter-info"><small>ПРОТИВНИК</small><strong id="enemy-name"></strong><progress id="enemy-hp"></progress><span id="enemy-text"></span></div></article>
          <aside class="intent" id="intent"></aside>
          <article class="fighter hero-card"><div class="figure hero-figure" id="hero-art" role="img" aria-label="Странник в надетой экипировке"></div><div class="fighter-info"><small>ВАШ ГЕРОЙ</small><strong>Странник</strong><progress id="player-hp"></progress><span id="player-text"></span></div><b id="ap"></b></article>
        </div>
        <div class="gear-strip"><div><span class="item-preview gear-item-preview" id="weapon-icon" role="img"></span><p><small>ОРУЖИЕ</small><strong id="weapon-name"></strong></p></div><div><span class="item-preview gear-item-preview" id="armor-icon" role="img"></span><p><small>БРОНЯ</small><strong id="armor-name"></strong></p></div></div>
        <div class="combat-panel">
          <div class="actions"><button type="button" data-action="attack"><span>⚔</span><strong>Атака</strong><small id="attack-hint"></small></button><button type="button" data-action="feint"><span>⌁</span><strong>Финт</strong><small id="feint-hint"></small></button><button type="button" data-action="heavy"><span>◆</span><strong>Тяжёлый</strong><small id="heavy-hint"></small></button><button type="button" data-action="guard"><span>⬡</span><strong>Блок</strong><small id="guard-hint"></small></button><button type="button" data-action="dodge"><span>↝</span><strong>Уклонение</strong><small id="dodge-hint"></small></button><button type="button" data-action="potion"><span>✦</span><strong>Зелье</strong><small>1 ОД · лечение 10</small></button></div>
          <button type="button" class="end-turn" id="end-turn">Завершить ход</button><ol class="combat-log" id="combat-log" aria-live="polite"></ol>
        </div>
        <div class="result-card" id="battle-result" hidden><small id="result-kicker"></small><h2 id="result-title"></h2><p id="result-copy"></p><div class="result-actions"><button type="button" class="btn primary" id="result-action"></button><button type="button" class="btn secondary" id="abandon-run" hidden>Прервать поход</button></div></div>
      </section>
      <section class="screen loot-screen" id="loot-screen" hidden><div class="chapter-mark">ДОРОГА ОТКРЫТА</div><h1>Выбери добычу</h1><p id="loot-copy"></p><div class="loot-list" id="loot-list"></div></section>
      <section class="screen inventory-screen" id="inventory-screen" hidden><div class="chapter-mark">ПОСТОЯННАЯ КОЛЛЕКЦИЯ</div><h1>Снаряжение</h1><p>Найденные вещи и выученные навыки остаются между походами.</p><div class="marks-balance">ЗВЕРИНЫЕ МЕТКИ <strong id="marks-balance">0</strong></div><div class="talent-list" id="talent-list"></div><div class="inventory-slots"><section><h2>Оружие</h2><div class="inventory-list" id="inventory-weapons"></div></section><section><h2>Броня</h2><div class="inventory-list" id="inventory-armors"></div></section></div><button type="button" class="btn secondary" id="inventory-back">Вернуться</button></section>
      <section class="screen ending-screen" id="ending-screen" hidden><div class="gate" aria-hidden="true">♜</div><small>ПЕРВЫЙ ПОХОД ЗАВЕРШЁН</small><h1>Ворота открыты</h1><p>Три противника остались позади. Странник вошёл в Пограничье со своей добычей.</p><div class="final-gear" id="final-gear"></div><div class="ending-actions"><button type="button" class="btn secondary" id="ending-inventory">Выбрать снаряжение</button><button type="button" class="btn primary" id="new-expedition">Начать новый поход</button></div></section>
      <footer>Намерение врага известно заранее. Побеждает не скорость, а порядок действий.</footer>
    </main>`;

  const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const persist = (): void => { app.save.data.run = run; const mainStages = ['old-road', 'burned-road', 'gate'].filter((id) => run.visited.includes(id as MapNodeId)).length; app.save.data.bestStage = Math.max(app.save.data.bestStage, mainStages); app.save.markDirty(); };
  const closeRound = (outcome: 'won' | 'lost'): void => { if (roundClosed) return; roundClosed = true; app.track('combat_result', { outcome, stage: run.encounterIndex + 1, turn: run.combat.turn }); void app.endRound(); };
  const beginRound = (): void => { roundClosed = false; app.startRound(); };
  const renderRoute = (): void => { const ids: MapNodeId[] = ['old-road', 'burned-road', 'gate']; byId('route').replaceChildren(...ENEMIES.slice(0, 3).map((enemy, index) => { const node = document.createElement('span'), visited = run.visited.includes(ids[index]); node.className = run.encounterIndex === index && run.phase === 'battle' ? 'current' : visited ? 'done' : ''; node.textContent = visited && run.encounterIndex !== index ? '✓' : String(index + 1); node.title = enemy.name; return node; })); };
  const renderLoot = (): void => {
    const maxHp = ARMORS[run.gear.armor].maxHp + app.save.data.talents.vitality * 4;
    byId('loot-copy').textContent = `Передышка завершена: ${run.combat.playerHp}/${maxHp} здоровья. Новая броня увеличит предел, сохранив число ран.`;
    byId('loot-list').replaceChildren(...lootOptions(run).map((item) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'loot-card'; button.dataset.loot = item.id;
      const icon = document.createElement('span'); icon.className = 'item-preview loot-preview'; icon.dataset.item = item.id; icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', item.name);
      const text = document.createElement('div'), slot = document.createElement('small'), name = document.createElement('strong'), description = document.createElement('p');
      slot.textContent = item.slot === 'weapon' ? 'НОВОЕ ОРУЖИЕ' : 'НОВАЯ БРОНЯ'; name.textContent = item.name; description.textContent = item.description;
      text.append(slot, name, description); button.append(icon, text); return button;
    }));
  };

  const renderMap = (): void => {
    const current = EXPEDITION_MAP.find((node) => node.id === run.nodeId)!;
    const available = availableMapNodes(run);
    byId('map-title').textContent = current.name;
    byId('map-copy').textContent = current.description;
    const maxHp = ARMORS[run.gear.armor].maxHp + app.save.data.talents.vitality * 4;
    byId('expedition-resources').textContent = `СОСТОЯНИЕ ПОХОДА · ${run.combat.playerHp}/${maxHp} ЗДОРОВЬЯ · ЗЕЛИЙ ${run.combat.potions}`;
    byId('expedition-map').replaceChildren(...EXPEDITION_MAP.map((node) => {
      const marker = document.createElement('span');
      marker.className = `map-node ${node.kind}${run.visited.includes(node.id) ? ' visited' : ''}${node.id === run.nodeId ? ' current' : ''}${available.some((candidate) => candidate.id === node.id) ? ' available' : ''}`;
      marker.textContent = node.name;
      marker.title = node.description;
      return marker;
    }));
    byId('map-options').replaceChildren(...available.map((node) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'map-choice'; button.dataset.mapNode = node.id;
      const type = document.createElement('small'), name = document.createElement('strong'), description = document.createElement('span');
      const mapEnemy = node.enemyIndex === undefined ? null : ENEMIES[node.enemyIndex];
      type.textContent = mapEnemy?.optional ? 'РИСК · ЗВЕРЬ' : node.kind === 'battle' ? 'БОЙ' : node.id === 'watchtower' ? 'ЗАПАСЫ' : 'ЗАСАДА'; name.textContent = node.name; description.textContent = node.description;
      button.append(type, name, description); return button;
    }));
    byId<HTMLButtonElement>('map-inventory').hidden = run.nodeId !== 'trailhead';
  };

  const renderInventory = (): void => {
    const talentCopy: Record<FrontierTalentId, { name: string; effect: string }> = {
      strength: { name: 'Сила', effect: '+1 к быстрой и +2 к тяжёлой атаке' },
      vitality: { name: 'Живучесть', effect: '+4 максимального здоровья' },
      supplies: { name: 'Запасы', effect: '+1 зелье в начале каждого боя' },
    };
    byId('marks-balance').textContent = String(app.save.data.marks);
    const canLearnHere = run.phase === 'map' && run.nodeId === 'trailhead';
    byId('talent-list').replaceChildren(...(Object.keys(talentCopy) as FrontierTalentId[]).map((id) => {
      const level = app.save.data.talents[id], cap = FRONTIER_TALENT_CAPS[id], cost = frontierTalentCost(app.save.data.talents, id), copy = talentCopy[id];
      const button = document.createElement('button'); button.type = 'button'; button.className = 'talent-card'; button.dataset.talent = id; button.disabled = !canLearnHere || level >= cap || app.save.data.marks < cost;
      const name = document.createElement('strong'), effect = document.createElement('span'), status = document.createElement('small');
      name.textContent = copy.name; effect.textContent = copy.effect; status.textContent = level >= cap ? `Уровень ${level}/${cap} · максимум` : !canLearnHere ? `Уровень ${level}/${cap} · доступно перед походом` : app.save.data.marks < cost ? `Уровень ${level}/${cap} · нужно ${cost}, у вас ${app.save.data.marks}` : `Уровень ${level}/${cap} · улучшить за ${cost}`;
      button.append(name, effect, status); return button;
    }));
    const makeCard = (id: LootId): HTMLButtonElement => {
      const item = id in WEAPONS ? WEAPONS[id as keyof typeof WEAPONS] : ARMORS[id as keyof typeof ARMORS];
      const equipped = app.save.data.loadout.weapon === id || app.save.data.loadout.armor === id;
      const button = document.createElement('button'); button.type = 'button'; button.className = `inventory-card${equipped ? ' equipped' : ''}`; button.dataset.equip = id; button.disabled = equipped;
      const art = document.createElement('span'); art.className = 'item-preview inventory-preview'; art.dataset.item = id; art.setAttribute('role', 'img'); art.setAttribute('aria-label', item.name);
      const copy = document.createElement('span'), name = document.createElement('strong'), stats = document.createElement('small'), status = document.createElement('b');
      name.textContent = item.name;
      stats.textContent = 'attack' in item ? `${item.attack} быстрый · ${item.heavy} тяжёлый` : `${item.maxHp} здоровья · ${item.block} блок`;
      status.textContent = equipped ? 'НАДЕТО' : 'Надеть'; copy.append(name, stats, status); button.append(art, copy); return button;
    };
    byId('inventory-weapons').replaceChildren(...app.save.data.inventory.weapons.map(makeCard));
    byId('inventory-armors').replaceChildren(...app.save.data.inventory.armors.map(makeCard));
  };

  const render = (): void => {
    byId('inventory-screen').hidden = !inventoryOpen; byId('map-screen').hidden = inventoryOpen || run.phase !== 'map'; byId('battle-screen').hidden = inventoryOpen || run.phase !== 'battle'; byId('loot-screen').hidden = inventoryOpen || run.phase !== 'loot'; byId('ending-screen').hidden = inventoryOpen || run.phase !== 'complete'; byId('victories').textContent = String(app.save.data.victories);
    if (inventoryOpen) { renderInventory(); return; }
    if (run.phase === 'map') { renderMap(); return; }
    if (run.phase === 'loot') { renderLoot(); return; }
    if (run.phase === 'complete') { const weapon = WEAPONS[run.gear.weapon], armor = ARMORS[run.gear.armor]; byId('final-gear').textContent = `${weapon.icon} ${weapon.name} · ${armor.icon} ${armor.name}`; return; }
    const combat = run.combat, enemy = ENEMIES[run.encounterIndex], weapon = WEAPONS[run.gear.weapon], armor = ARMORS[run.gear.armor], move = frontierIntent(combat);
    byId('location').textContent = enemy.optional ? `${enemy.epithet} · Боковая встреча` : `${enemy.epithet} · Бой ${run.encounterIndex + 1} из 3`; renderRoute(); byId('enemy-name').textContent = enemy.name;
    const enemyHp = byId<HTMLProgressElement>('enemy-hp'); enemyHp.max = enemy.maxHp; enemyHp.value = combat.enemyHp; byId('enemy-text').textContent = `${combat.enemyHp} / ${enemy.maxHp} здоровья · Ярость +${combat.rage}`;
    const maxHp = armor.maxHp + app.save.data.talents.vitality * 4; const attackDamage = weapon.attack + app.save.data.talents.strength, heavyDamage = weapon.heavy + app.save.data.talents.strength * 2;
    const playerHp = byId<HTMLProgressElement>('player-hp'); playerHp.max = maxHp; playerHp.value = combat.playerHp; byId('player-text').textContent = `${combat.playerHp} / ${maxHp} здоровья · Зелий ${combat.potions}`; byId('ap').textContent = combat.stunned ? `${combat.ap} ОД · ОГЛУШЁН` : `${combat.ap} ОД`;
    const heroArt = byId('hero-art'); heroArt.dataset.weapon = run.gear.weapon; heroArt.dataset.armor = run.gear.armor; heroArt.setAttribute('aria-label', `Странник: ${weapon.name}, ${armor.name}`); byId('enemy-art').dataset.enemy = enemy.id;
    const weaponIcon = byId('weapon-icon'); weaponIcon.dataset.item = weapon.id; weaponIcon.setAttribute('aria-label', weapon.name); byId('weapon-name').textContent = weapon.name; const armorIcon = byId('armor-icon'); armorIcon.dataset.item = armor.id; armorIcon.setAttribute('aria-label', armor.name); byId('armor-name').textContent = armor.name;
    byId('attack-hint').textContent = `1 ОД · ${attackDamage} урона`; byId('feint-hint').textContent = `1 ОД · ${Math.max(2, Math.floor(attackDamage * 0.4))} урона${combat.rage > 0 ? ' · ярость −1' : ''}`; byId('guard-hint').textContent = `1 ОД · блок ${armor.block}`; byId('heavy-hint').textContent = combat.heavyCooldown > 0 ? `Недоступен ещё ${combat.heavyCooldown} х.` : `2 ОД · ${heavyDamage} урона`; byId('dodge-hint').textContent = combat.dodgeCooldown > 0 ? `Недоступно ещё ${combat.dodgeCooldown} х.` : '2 ОД · полный промах';
    byId('intent').innerHTML = combat.outcome ? `<span>БОЙ ЗАВЕРШЁН</span><strong>${combat.outcome === 'won' ? 'Противник повержен' : 'Странник пал'}</strong>` : `<span>ХОД ${combat.turn} · НАМЕРЕНИЕ</span><strong>${move.name}${move.damage ? ` · ${move.damage} урона` : ''}</strong><p>${move.text}</p>`;
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => { const action = button.dataset.action as FrontierAction, cost = action === 'heavy' || action === 'dodge' ? 2 : 1; button.disabled = combat.outcome !== null || combat.ap < cost || (action === 'guard' && combat.guardUsed) || (action === 'feint' && combat.feintUsed) || (action === 'dodge' && (combat.dodgeCooldown > 0 || combat.evade)) || (action === 'heavy' && combat.heavyCooldown > 0) || (action === 'potion' && (combat.potions === 0 || combat.playerHp === maxHp)); button.classList.toggle('chosen', (action === 'guard' && combat.guard) || (action === 'dodge' && combat.evade)); });
    byId<HTMLButtonElement>('end-turn').disabled = combat.outcome !== null; byId('combat-log').replaceChildren(...combat.log.slice(0, 5).map((line) => { const item = document.createElement('li'); item.textContent = line; return item; }));
    const result = byId('battle-result'); result.hidden = combat.outcome === null;
    const abandonButton = byId<HTMLButtonElement>('abandon-run'); abandonButton.hidden = combat.outcome !== 'lost';
    if (combat.outcome === 'won') { const recovery = enemy.optional || run.encounterIndex === 2 ? 0 : Math.min(8, maxHp - combat.playerHp); byId('result-kicker').textContent = enemy.optional ? 'ЗВЕРЬ ПОВЕРЖЕН' : run.encounterIndex === 2 ? 'ПОХОД ЗАВЕРШЁН' : 'ПОБЕДА'; byId('result-title').textContent = `${enemy.name} повержен`; byId('result-copy').textContent = enemy.optional ? `Получена звериная метка. Дальше пойдёшь с ${combat.playerHp} здоровья и ${combat.potions} зельями.` : run.encounterIndex === 2 ? 'За воротами начинается настоящее Пограничье.' : recovery > 0 ? `Передышка вернёт ${recovery} здоровья: будет ${combat.playerHp + recovery}/${maxHp}. Зелий останется ${combat.potions}.` : `Здоровье уже полное — ${combat.playerHp}/${maxHp}. Зелий останется ${combat.potions}.`; byId('result-action').textContent = enemy.optional ? 'Забрать метку и вернуться' : run.encounterIndex === 2 ? 'Войти в ворота' : 'Выбрать добычу'; closeRound('won'); }
    else if (combat.outcome === 'lost') { byId('result-kicker').textContent = 'ПОРАЖЕНИЕ'; byId('result-title').textContent = 'Измени порядок действий'; byId('result-copy').textContent = `Повтор начнётся с состояния на входе: ${run.checkpointHp} здоровья, зелий ${run.checkpointPotions}. Если ресурсов недостаточно, прерви поход и начни заново.`; byId('result-action').textContent = 'Повторить бой'; closeRound('lost'); }
  };

  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => { const action = button.dataset.action as FrontierAction; run = { ...run, combat: playFrontierAction(run.combat, run.gear, action, app.save.data.talents) }; app.track('combat_action', { action, stage: run.encounterIndex + 1 }); haptic(8); persist(); render(); }));
  byId('end-turn').addEventListener('click', () => { run = { ...run, combat: finishFrontierTurn(run.combat, run.gear) }; app.track('turn_end', { stage: run.encounterIndex + 1, turn: run.combat.turn }); persist(); render(); });
  byId('result-action').addEventListener('click', () => { if (run.combat.outcome === 'lost') { run = retryEncounter(run, app.save.data.talents); beginRound(); app.track('combat_retry', { stage: run.encounterIndex + 1 }); } else { const defeated = ENEMIES[run.encounterIndex], earnsMark = run.phase === 'battle' && run.combat.outcome === 'won' && Boolean(defeated.optional); run = claimVictory(run, app.save.data.talents); if (earnsMark) app.save.data.marks++; if (run.phase === 'complete') { app.save.data.victories++; app.track('expedition_complete', { weapon: run.gear.weapon, armor: run.gear.armor }); } else if (run.phase === 'loot') app.track('loot_open', { stage: run.encounterIndex + 1 }); else app.track('beast_complete', { enemy: defeated.id, marks: app.save.data.marks }); } persist(); render(); });
  byId('abandon-run').addEventListener('click', () => { if (run.combat.outcome !== 'lost') return; app.track('expedition_abandon', { node: run.nodeId, checkpointHp: run.checkpointHp }); run = startExpedition(app.save.data.loadout, app.save.data.talents); roundClosed = true; persist(); render(); });
  byId('loot-list').addEventListener('click', (event) => { const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-loot]'); if (!card) return; const selected = card.dataset.loot as LootId; app.save.data.inventory = unlockFrontierLoot(app.save.data.inventory, selected); run = chooseLoot(run, selected, app.save.data.talents); app.track('loot_choice', { item: selected, stage: run.encounterIndex + 1 }); haptic([12, 30, 12]); persist(); render(); });
  byId('map-options').addEventListener('click', (event) => { const choice = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-node]'); if (!choice) return; const previousPhase = run.phase; run = selectMapNode(run, choice.dataset.mapNode as MapNodeId, app.save.data.talents); if (previousPhase === 'map' && run.phase === 'battle' && roundClosed) beginRound(); app.track('map_choice', { node: run.nodeId }); persist(); render(); });
  const openInventory = (): void => { inventoryOpen = true; app.track('inventory_open', { node: run.nodeId }); render(); };
  byId('map-inventory').addEventListener('click', openInventory); byId('ending-inventory').addEventListener('click', openInventory);
  byId('inventory-back').addEventListener('click', () => { inventoryOpen = false; render(); });
  byId('inventory-screen').addEventListener('click', (event) => { const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-equip]'); if (!card) return; const selected = card.dataset.equip as LootId; const next = equipFrontierLoot(app.save.data.loadout, app.save.data.inventory, selected); if (next === app.save.data.loadout) return; app.save.data.loadout = next; if (run.phase === 'map' && run.nodeId === 'trailhead') run = startExpedition(next, app.save.data.talents); app.track('inventory_equip', { item: selected }); haptic(10); persist(); render(); });
  byId('talent-list').addEventListener('click', (event) => { const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-talent]'); if (!card || run.phase !== 'map' || run.nodeId !== 'trailhead') return; const id = card.dataset.talent as FrontierTalentId, learned = learnFrontierTalent(app.save.data.talents, app.save.data.marks, id); if (learned.talents === app.save.data.talents) return; app.save.data.talents = learned.talents; app.save.data.marks = learned.marks; run = startExpedition(app.save.data.loadout, learned.talents); app.track('talent_learn', { talent: id, level: learned.talents[id] }); haptic([10, 30, 10]); persist(); render(); });
  byId('new-expedition').addEventListener('click', () => { run = startExpedition(app.save.data.loadout, app.save.data.talents); roundClosed = true; app.track('expedition_start', { replay: true }); persist(); render(); });
  if (run.phase === 'battle' && !roundClosed) app.startRound(); app.track('app_start', { resumed: app.save.data.run !== null }); persist(); render(); app.ready();
}

void main();
