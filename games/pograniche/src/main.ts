import { GameApp } from '@studio/game-kit';
import {
  ARMORS, CHAPTERS, ENEMIES, EXPEDITION_MAP, FRONTIER_CONTRACTS, FRONTIER_TALENT_CAPS, WEAPONS, acceptFrontierContract, applyFrontierCitySupplies, applyFrontierForge, availableMapNodes,
  buyFrontierPotion, buyFrontierTincture, chooseLoot, claimFrontierContract, claimVictory, collectFrontierTrophy, consumeFrontierDepartureSupply, equipFrontierLoot, finishFrontierTurn, frontierIntent,
  chapterStage, frontierDefeatText, frontierEnemyTrophy, frontierPouchSize, frontierTalentCost, isFinalStage, learnFrontierTalent, lootOptions, playFrontierAction,
  frontierChapterUnlocked, improveFrontierForge, progressFrontierContract, retryEncounter, selectMapNode, startExpedition, turnInFrontierTrophy, unlockFrontierLoot,
} from '@studio/rules';
import type { ChapterId, FrontierAction, FrontierContractId, FrontierTalentId, LootId, MapNodeId } from '@studio/rules';
import { haptic } from '@studio/ui';
import { defaultPogranicheSave, migratePogranicheSave } from './save';
import type { PogranicheSave } from './save';
import './theme.css';
import './style.css';

const root = document.getElementById('app')!;

async function main(): Promise<void> {
  const app = await GameApp.boot<PogranicheSave>({
    gameId: 'pograniche', saveVersion: 12,
    defaults: defaultPogranicheSave(),
    migrate: migratePogranicheSave,
    adPolicy: { firstAdAfterRounds: 2, minSecondsBetween: 180 },
  });

  const effectiveTalents = (): typeof app.save.data.talents => applyFrontierForge(app.save.data.talents, app.save.data.city);
  const freshExpedition = (chapter: ChapterId = app.save.data.chapter): ReturnType<typeof startExpedition> => {
    return applyFrontierCitySupplies(
      startExpedition(app.save.data.loadout, effectiveTalents(), frontierPouchSize(app.save.data.progress.prologue.victories), chapter),
      app.save.data.city,
    );
  };
  let run = app.save.data.run ?? freshExpedition();
  let inventoryOpen = false;
  let cityOpen = false;
  let inventoryReturnsToCity = false;
  let roundClosed = run.phase !== 'battle' || run.combat.outcome !== null;
  root.innerHTML = `
    <main>
      <header class="topbar"><div><span class="brand">ПОГРАНИЧЬЕ</span><small id="chapter-title"></small></div><div class="record"><span>ПОБЕД</span><strong id="victories">0</strong></div></header>
      <section class="screen map-screen" id="map-screen" hidden>
        <div class="chapter-mark">КАРТА ПОХОДА</div><h1 id="map-title"></h1><p id="map-copy"></p>
        <div class="expedition-resources" id="expedition-resources"></div>
        <div class="chapter-switcher" id="chapter-switcher"></div>
        <div class="expedition-map" id="expedition-map" aria-label="Карта маршрута"></div>
        <div class="map-options" id="map-options"></div>
        <div class="map-footer-actions"><button type="button" class="btn secondary" id="map-inventory">Снаряжение и инвентарь</button><button type="button" class="btn primary" id="map-city">Войти в город</button></div>
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
          <div class="actions"><button type="button" data-action="attack"><span>⚔</span><strong>Атака</strong><small id="attack-hint"></small></button><button type="button" data-action="feint"><span>⌁</span><strong>Финт</strong><small id="feint-hint"></small></button><button type="button" data-action="heavy"><span>◆</span><strong>Тяжёлый</strong><small id="heavy-hint"></small></button><button type="button" data-action="guard"><span>⬡</span><strong>Блок</strong><small id="guard-hint"></small></button><button type="button" data-action="dodge"><span>↝</span><strong>Уклонение</strong><small id="dodge-hint"></small></button><button type="button" data-action="potion"><span>✦</span><strong>Зелье</strong><small>1 ОД · лечение 10</small></button><button type="button" data-action="tincture"><span>❧</span><strong>Настойка</strong><small id="tincture-hint"></small></button></div>
          <button type="button" class="end-turn" id="end-turn">Завершить ход</button><ol class="combat-log" id="combat-log" aria-live="polite"></ol>
        </div>
        <div class="result-card" id="battle-result" hidden><small id="result-kicker"></small><h2 id="result-title"></h2><p id="result-copy"></p><div class="result-actions"><button type="button" class="btn primary" id="result-action"></button><button type="button" class="btn secondary" id="abandon-run" hidden>Прервать поход</button></div></div>
      </section>
      <section class="screen loot-screen" id="loot-screen" hidden><div class="chapter-mark">ДОРОГА ОТКРЫТА</div><h1>Выбери добычу</h1><p id="loot-copy"></p><div class="loot-list" id="loot-list"></div></section>
      <section class="screen inventory-screen" id="inventory-screen" hidden><div class="chapter-mark">ПОСТОЯННАЯ КОЛЛЕКЦИЯ</div><h1>Снаряжение</h1><p>Найденные вещи и выученные навыки остаются между походами.</p><div class="progress-balances"><div class="marks-balance">ЗВЕРИНЫЕ МЕТКИ <strong id="marks-balance">0</strong></div><div class="marks-balance">ПЕЧАТЬ ПРИВРАТНИКА <strong id="seal-balance">0 / 2</strong></div></div><div class="talent-list" id="talent-list"></div><div class="inventory-slots"><section><h2>Оружие</h2><div class="inventory-list" id="inventory-weapons"></div></section><section><h2>Броня</h2><div class="inventory-list" id="inventory-armors"></div></section></div><button type="button" class="btn secondary" id="inventory-back">Вернуться</button></section>
      <section class="screen city-screen" id="city-screen" hidden>
        <div class="chapter-mark">РАТУШНАЯ ПЛОЩАДЬ</div><h1>Город</h1><p>Подготовь следующий поход. Здесь тратятся только заработанные в боях звериные метки.</p>
        <div class="city-balance">ЗВЕРИНЫЕ МЕТКИ <strong id="city-marks">0</strong></div>
        <div class="city-hero"><div class="figure hero-figure" id="city-hero-art" role="img"></div><div><small>СТРАННИК</small><h2>Перед выходом</h2><div class="city-loadout"><span class="item-preview" id="city-weapon-art" role="img"></span><strong id="city-weapon-name"></strong><span class="item-preview" id="city-armor-art" role="img"></span><strong id="city-armor-name"></strong></div></div></div>
        <div class="city-places">
          <article><small>КУЗНИЦА</small><h2>Закалка клинка</h2><p>Постоянно: +1 к быстрой и +2 к тяжёлой атаке для любого оружия.</p><button type="button" class="btn secondary" id="city-forge"></button></article>
          <article><small>ЛАВКА ЗЕЛЬЯРКИ</small><h2>Походный запас</h2><p>Одно дополнительное зелье в начале следующего похода. Расходуется при выходе.</p><button type="button" class="btn secondary" id="city-potion"></button></article>
          <article><small>ЛАВКА ЗЕЛЬЯРКИ</small><h2>Полынная настойка</h2><p>Одна настойка в кисете следующего похода. Как зелье, сгорает при выходе.</p><button type="button" class="btn secondary" id="city-tincture"></button></article>
          <article><small>СКУПЩИК</small><h2>Посылка из погребов</h2><p id="fence-copy">В главе «За воротами» спустись в винные погреба вместо часовни.</p><button type="button" class="btn secondary" id="city-fence"></button></article>
          <article class="contract-place"><small>ДОСКА ПОРУЧЕНИЙ</small><h2 id="contract-title">Выбери поручение</h2><p id="contract-copy"></p><div id="contract-actions"></div></article>
        </div>
        <div class="city-actions"><button type="button" class="btn secondary" id="city-inventory">Сменить снаряжение</button><button type="button" class="btn primary" id="city-back">Вернуться к походу</button></div>
      </section>
      <section class="screen ending-screen" id="ending-screen" hidden><div class="gate" aria-hidden="true">♜</div><small id="ending-kicker"></small><h1 id="ending-title"></h1><p id="ending-copy"></p><div class="seal-status" id="seal-status"></div><div class="final-gear" id="final-gear"></div><div class="ending-actions"><button type="button" class="btn secondary" id="ending-inventory">Выбрать снаряжение</button><button type="button" class="btn secondary" id="ending-city">Войти в город</button><button type="button" class="btn secondary" id="new-expedition">Повторить главу</button><button type="button" class="btn primary" id="continue-chapter" hidden>Начать главу «За воротами»</button></div></section>
      <footer>Намерение врага известно заранее. Побеждает не скорость, а порядок действий.</footer>
    </main>`;

  const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const persist = (): void => { app.save.data.run = run; const completedStages = CHAPTERS[run.chapter].stages.filter((id) => run.visited.includes(id)).length; app.save.data.progress[run.chapter].bestStage = Math.max(app.save.data.progress[run.chapter].bestStage, completedStages); app.save.markDirty(); };
  const analyticsStage = (): number => Math.max(1, chapterStage(run) + 1);
  const closeRound = (outcome: 'won' | 'lost'): void => { if (roundClosed) return; roundClosed = true; app.track('combat_result', { outcome, chapter: run.chapter, stage: analyticsStage(), turn: run.combat.turn }); void app.endRound(); };
  const beginRound = (): void => { roundClosed = false; app.startRound(); };
  const renderRoute = (): void => { const stages = CHAPTERS[run.chapter].stages; byId('route').replaceChildren(...stages.map((id, index) => { const mapStage = EXPEDITION_MAP.find((node) => node.id === id)!, enemy = ENEMIES[mapStage.enemyIndex!], node = document.createElement('span'), visited = run.visited.includes(id); node.className = run.nodeId === id && run.phase === 'battle' ? 'current' : visited ? 'done' : ''; node.textContent = visited && run.nodeId !== id ? '✓' : String(index + 1); node.title = enemy.name; return node; })); };
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
    const chapter = CHAPTERS[run.chapter];
    const available = availableMapNodes(run);
    byId('map-title').textContent = current.name;
    const maxHp = ARMORS[run.gear.armor].maxHp + app.save.data.talents.vitality * 4;
    const eventCopy: Partial<Record<MapNodeId, string>> = {
      'wormwood-ravine': `Полынная настойка собрана. Теперь в запасе: ${run.combat.tinctures}.`,
      'forester-lodge': `Ночлег завершён: ${run.combat.playerHp}/${maxHp} здоровья.`,
      'market-rows': `Обмен завершён. Зелий: ${run.combat.potions}, настоек: ${run.combat.tinctures}.`,
      backyards: `Припасы найдены. В следующем бою будет дополнительное зелье.`,
      chapel: `Раны перевязаны: ${run.combat.playerHp}/${maxHp} здоровья.`,
      'smuggler-hole': `Тайный ход разведан. Мытарь начнёт бой раненым.`,
      'tanner-yard': `Припасы найдены. В следующем бою будет дополнительное зелье.`,
      'physic-garden': `Полынная настойка собрана. Теперь в запасе: ${run.combat.tinctures}.`,
      'bell-stairs': `Раны перевязаны: ${run.combat.playerHp}/${maxHp} здоровья.`,
    };
    byId('map-copy').textContent = eventCopy[current.id] ?? current.description;
    byId('expedition-resources').textContent = `СОСТОЯНИЕ ПОХОДА · ${run.combat.playerHp}/${maxHp} ЗДОРОВЬЯ · ЗЕЛИЙ ${run.combat.potions} · НАСТОЕК ${run.combat.tinctures}`;
    byId('expedition-map').replaceChildren(...chapter.nodes.map((id) => EXPEDITION_MAP.find((node) => node.id === id)!).map((node) => {
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
      type.textContent = mapEnemy?.optional ? 'РИСК · ЗВЕРЬ' : node.kind === 'battle' ? 'БОЙ' : node.label ?? 'СОБЫТИЕ'; name.textContent = node.name; description.textContent = node.description;
      button.append(type, name, description); return button;
    }));
    const atStart = run.nodeId === chapter.start;
    byId<HTMLButtonElement>('map-inventory').hidden = !atStart;
    byId<HTMLButtonElement>('map-city').hidden = !atStart || app.save.data.progress.prologue.victories < 1;
    const availableChapters = (Object.values(CHAPTERS)).filter((candidate) => frontierChapterUnlocked(candidate, app.save.data.progress));
    byId('chapter-switcher').replaceChildren(...(atStart ? availableChapters.map((candidate) => { const button = document.createElement('button'); button.type = 'button'; button.className = `chapter-choice${candidate.id === run.chapter ? ' active' : ''}`; button.dataset.chapter = candidate.id; button.disabled = candidate.id === run.chapter; button.textContent = candidate.title; return button; }) : []));
  };

  const renderInventory = (): void => {
    const talents = effectiveTalents();
    const talentCopy: Record<FrontierTalentId, { name: string; effect: string }> = {
      strength: { name: 'Сила', effect: '+1 к быстрой и +2 к тяжёлой атаке' },
      vitality: { name: 'Живучесть', effect: '+4 максимального здоровья' },
      supplies: { name: 'Запасы', effect: '+1 зелье в начале каждого похода' },
    };
    byId('marks-balance').textContent = String(app.save.data.marks);
    byId('seal-balance').textContent = `${frontierPouchSize(app.save.data.progress.prologue.victories)} / 2`;
    const canLearnHere = run.phase === 'map' && run.nodeId === CHAPTERS[run.chapter].start;
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
      stats.textContent = 'attack' in item
        ? `${item.attack + talents.strength} быстрый · ${item.heavy + talents.strength * 2} тяжёлый`
        : `${item.maxHp + talents.vitality * 4} здоровья · ${item.block} блок`;
      status.textContent = equipped ? 'НАДЕТО' : 'Надеть'; copy.append(name, stats, status); button.append(art, copy); return button;
    };
    byId('inventory-weapons').replaceChildren(...app.save.data.inventory.weapons.map(makeCard));
    byId('inventory-armors').replaceChildren(...app.save.data.inventory.armors.map(makeCard));
  };

  const renderCity = (): void => {
    const city = app.save.data.city, weapon = WEAPONS[app.save.data.loadout.weapon], armor = ARMORS[app.save.data.loadout.armor];
    byId('city-marks').textContent = String(app.save.data.marks);
    const hero = byId('city-hero-art'); hero.dataset.weapon = weapon.id; hero.dataset.armor = armor.id; hero.setAttribute('aria-label', `Странник: ${weapon.name}, ${armor.name}`);
    const weaponArt = byId('city-weapon-art'); weaponArt.dataset.item = weapon.id; weaponArt.setAttribute('aria-label', weapon.name); byId('city-weapon-name').textContent = weapon.name;
    const armorArt = byId('city-armor-art'); armorArt.dataset.item = armor.id; armorArt.setAttribute('aria-label', armor.name); byId('city-armor-name').textContent = armor.name;
    const forge = byId<HTMLButtonElement>('city-forge'); forge.disabled = city.forgeLevel >= 1 || app.save.data.marks < 3; forge.textContent = city.forgeLevel >= 1 ? 'Закалка выполнена' : app.save.data.marks < 3 ? `Нужно 3 метки · у вас ${app.save.data.marks}` : 'Закалить за 3 метки';
    const potion = byId<HTMLButtonElement>('city-potion'); potion.disabled = city.extraPotion || app.save.data.marks < 1; potion.textContent = city.extraPotion ? 'Зелье уже уложено' : app.save.data.marks < 1 ? 'Нужна 1 метка' : 'Купить за 1 метку';
    const tincture = byId<HTMLButtonElement>('city-tincture'); tincture.disabled = city.extraTincture || app.save.data.marks < 1; tincture.textContent = city.extraTincture ? 'Настойка уже уложена' : app.save.data.marks < 1 ? 'Нужна 1 метка' : 'Купить за 1 метку';
    const fence = byId<HTMLButtonElement>('city-fence');
    byId('fence-copy').textContent = city.pendingTrophy ? 'Посылка на руках. Скупщик отдаст две звериные метки сразу.' : 'В главе «За воротами» спустись в винные погреба вместо часовни.';
    fence.disabled = !city.pendingTrophy; fence.textContent = city.pendingTrophy ? 'Сдать посылку · 2 метки' : 'Посылки нет';
    const contractTitle = byId('contract-title'), contractCopy = byId('contract-copy'), actions = byId('contract-actions');
    if (!city.contract) {
      contractTitle.textContent = 'Выбери поручение'; contractCopy.textContent = 'Одновременно можно выполнять только одно поручение. Награда выдаётся в городе.';
      actions.replaceChildren(...(Object.keys(FRONTIER_CONTRACTS) as FrontierContractId[]).map((id) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn secondary'; button.dataset.contract = id; button.textContent = FRONTIER_CONTRACTS[id].acceptLabel; return button; }));
    } else {
      const meta = FRONTIER_CONTRACTS[city.contract.id];
      contractTitle.textContent = `Поручение: ${meta.title}`;
      contractCopy.textContent = city.contract.ready ? 'Условие выполнено. Забери две звериные метки.' : meta.task;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn primary'; button.id = 'claim-contract'; button.disabled = !city.contract.ready; button.textContent = city.contract.ready ? 'Получить 2 метки' : 'Поручение выполняется'; actions.replaceChildren(button);
    }
  };

  const render = (): void => {
    const overlayOpen = inventoryOpen || cityOpen;
    byId('inventory-screen').hidden = !inventoryOpen; byId('city-screen').hidden = !cityOpen; byId('map-screen').hidden = overlayOpen || run.phase !== 'map'; byId('battle-screen').hidden = overlayOpen || run.phase !== 'battle'; byId('loot-screen').hidden = overlayOpen || run.phase !== 'loot'; byId('ending-screen').hidden = overlayOpen || run.phase !== 'complete'; byId('chapter-title').textContent = cityOpen ? 'РАТУШНАЯ ПЛОЩАДЬ' : CHAPTERS[run.chapter].title.toUpperCase(); byId('victories').textContent = String(app.save.data.progress[run.chapter].victories);
    if (inventoryOpen) { renderInventory(); return; }
    if (cityOpen) { renderCity(); return; }
    if (run.phase === 'map') { renderMap(); return; }
    if (run.phase === 'loot') { renderLoot(); return; }
    if (run.phase === 'complete') {
      const weapon = WEAPONS[run.gear.weapon], armor = ARMORS[run.gear.armor], prologueVictories = app.save.data.progress.prologue.victories, pouch = frontierPouchSize(prologueVictories), remaining = Math.max(0, 3 - prologueVictories), nextChapter = run.chapter === 'prologue' ? 'chapter-1' : run.chapter === 'chapter-1' ? 'chapter-2' : null;
      const endingCopy: Record<ChapterId, { kicker: string; title: string; copy: string }> = {
        prologue: { kicker: 'ПРОЛОГ ЗАВЕРШЁН', title: 'Ворота открыты', copy: 'Странник вошёл в Пограничье. Теперь открой карту новой главы и пройди через опасный посад.' },
        'chapter-1': { kicker: 'ГЛАВА I ЗАВЕРШЕНА', title: 'Первая улица пройдена', copy: 'Мытарь повержен, путь к Ратушной площади свободен. Ночью над городом загудел Чёрный колокол.' },
        'chapter-2': { kicker: 'ГЛАВА II ЗАВЕРШЕНА', title: 'Колокол умолк', copy: 'Моровой лекарь повержен, но под колоколом найден знак тех, кто разбудил заразу. История Пограничья продолжится.' },
      };
      const ending = endingCopy[run.chapter];
      byId('ending-kicker').textContent = ending.kicker;
      byId('ending-title').textContent = ending.title;
      byId('ending-copy').textContent = ending.copy;
      byId('seal-status').textContent = pouch >= 2 ? 'ПЕЧАТЬ II · Новый поход начнётся с 2 полынными настойками.' : pouch === 1 ? `ПЕЧАТЬ I · Новый поход начнётся с 1 настойкой. До Печати II: ${remaining} ${remaining === 1 ? 'победа' : 'победы'}.` : 'Печать привратника ещё не получена.';
      byId('final-gear').textContent = `${weapon.icon} ${weapon.name} · ${armor.icon} ${armor.name}`;
      const continueButton = byId<HTMLButtonElement>('continue-chapter');
      continueButton.hidden = nextChapter === null;
      if (nextChapter) { continueButton.dataset.chapter = nextChapter; continueButton.textContent = `Начать главу «${CHAPTERS[nextChapter].title}»`; }
      byId<HTMLButtonElement>('ending-city').hidden = app.save.data.progress.prologue.victories < 1;
      return;
    }
    const combat = run.combat, enemy = ENEMIES[run.encounterIndex], weapon = WEAPONS[run.gear.weapon], armor = ARMORS[run.gear.armor], move = frontierIntent(combat);
    byId('location').textContent = enemy.optional ? `${enemy.epithet} · Боковая встреча` : `${enemy.epithet} · Бой ${chapterStage(run) + 1} из ${CHAPTERS[run.chapter].stages.length}`; renderRoute(); byId('enemy-name').textContent = enemy.name;
    const enemyHp = byId<HTMLProgressElement>('enemy-hp'); enemyHp.max = enemy.maxHp; enemyHp.value = combat.enemyHp; byId('enemy-text').textContent = `${combat.enemyHp} / ${enemy.maxHp} здоровья · Ярость +${combat.rage}`;
    const talents = effectiveTalents(), maxHp = armor.maxHp + talents.vitality * 4; const attackDamage = weapon.attack + talents.strength, heavyDamage = weapon.heavy + talents.strength * 2;
    const playerHp = byId<HTMLProgressElement>('player-hp'); playerHp.max = maxHp; playerHp.value = combat.playerHp; byId('player-text').textContent = `${combat.playerHp} / ${maxHp} здоровья · Зелий ${combat.potions} · Настоек ${combat.tinctures}${combat.bleed > 0 ? ` · Кровотечение ${combat.bleed}` : ''}`; byId('ap').textContent = combat.stunned ? `${combat.ap} ОД · ОГЛУШЁН` : `${combat.ap} ОД`;
    const heroArt = byId('hero-art'); heroArt.dataset.weapon = run.gear.weapon; heroArt.dataset.armor = run.gear.armor; heroArt.setAttribute('aria-label', `Странник: ${weapon.name}, ${armor.name}`); byId('enemy-art').dataset.enemy = enemy.id;
    const weaponIcon = byId('weapon-icon'); weaponIcon.dataset.item = weapon.id; weaponIcon.setAttribute('aria-label', weapon.name); byId('weapon-name').textContent = weapon.name; const armorIcon = byId('armor-icon'); armorIcon.dataset.item = armor.id; armorIcon.setAttribute('aria-label', armor.name); byId('armor-name').textContent = armor.name;
    byId('attack-hint').textContent = `1 ОД · ${attackDamage} урона`; byId('feint-hint').textContent = `1 ОД · ${weapon.feint ?? Math.max(2, Math.floor(attackDamage * 0.4))} урона${combat.rage > 0 ? ' · ярость −1' : ''}`; byId('guard-hint').textContent = `1 ОД · блок ${armor.block}`; byId('heavy-hint').textContent = combat.heavyCooldown > 0 ? `Недоступен ещё ${combat.heavyCooldown} х.` : `2 ОД · ${heavyDamage} урона`; byId('dodge-hint').textContent = combat.dodgeCooldown > 0 ? `Недоступно ещё ${combat.dodgeCooldown} х.` : '2 ОД · полный промах';
    byId('tincture-hint').textContent = `Выпить заранее · +1 ОД · ${combat.tinctures} шт.`;
    byId('intent').innerHTML = combat.outcome ? `<span>БОЙ ЗАВЕРШЁН</span><strong>${combat.outcome === 'won' ? 'Противник повержен' : 'Странник пал'}</strong>` : `<span>ХОД ${combat.turn} · НАМЕРЕНИЕ</span><strong>${move.name}${move.damage ? ` · ${move.damage} урона` : ''}</strong><p>${move.text}</p>`;
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => { const action = button.dataset.action as FrontierAction, cost = action === 'heavy' || action === 'dodge' ? 2 : action === 'tincture' ? 0 : 1; button.disabled = combat.outcome !== null || combat.ap < cost || (action === 'guard' && combat.guardUsed) || (action === 'feint' && combat.feintUsed) || (action === 'dodge' && (combat.dodgeCooldown > 0 || combat.evade)) || (action === 'heavy' && combat.heavyCooldown > 0) || (action === 'potion' && (combat.potions === 0 || (combat.playerHp === maxHp && combat.bleed === 0))) || (action === 'tincture' && (combat.tinctures === 0 || combat.tinctureUsed || combat.ap >= 4)); button.classList.toggle('chosen', (action === 'guard' && combat.guard) || (action === 'dodge' && combat.evade) || (action === 'tincture' && combat.tinctureUsed)); });
    byId<HTMLButtonElement>('end-turn').disabled = combat.outcome !== null; byId('combat-log').replaceChildren(...combat.log.slice(0, 5).map((line) => { const item = document.createElement('li'); item.textContent = line; return item; }));
    const result = byId('battle-result'); result.hidden = combat.outcome === null;
    const abandonButton = byId<HTMLButtonElement>('abandon-run'); abandonButton.hidden = combat.outcome !== 'lost';
    if (combat.outcome === 'won') { const finalStage = isFinalStage(run), recovery = enemy.optional || finalStage ? 0 : Math.min(8, maxHp - combat.playerHp); const trophy = frontierEnemyTrophy(enemy); const quartermaster = finalStage && app.save.data.city.contract?.id === 'quartermaster' && !app.save.data.city.contract.ready; const smuggler = trophy && app.save.data.city.contract?.id === 'smuggler' && !app.save.data.city.contract.ready; const chapterFinalCopy: Record<ChapterId, string> = { prologue: 'За воротами начинается настоящее Пограничье.', 'chapter-1': 'Путь к Ратушной площади свободен. Над городом гудит Чёрный колокол.', 'chapter-2': 'Чёрный колокол умолкает. Под ним остался знак тех, кто разбудил заразу.' }; const finalCopy = quartermaster ? combat.potions > 0 ? `Поручение квартирмейстера выполнено: сохранено зелий — ${combat.potions}. Награда ждёт в городе.` : 'Поручение квартирмейстера не выполнено: к концу похода не осталось зелий.' : chapterFinalCopy[run.chapter]; const optionalCopy = trophy ? smuggler ? 'Поручение скупщика выполнено. Метка получена, посылка ждёт сдачи в городе.' : 'Получена звериная метка. Посылка скупщика ждёт сдачи в городе.' : `Получена звериная метка. Дальше пойдёшь с ${combat.playerHp} здоровья и ${combat.potions} зельями.`; const finalAction: Record<ChapterId, string> = { prologue: 'Войти в ворота', 'chapter-1': 'Выйти на площадь', 'chapter-2': 'Подойти к колоколу' }; byId('result-kicker').textContent = enemy.optional ? 'ЗВЕРЬ ПОВЕРЖЕН' : finalStage ? 'ПОХОД ЗАВЕРШЁН' : 'ПОБЕДА'; byId('result-title').textContent = frontierDefeatText(enemy); byId('result-copy').textContent = enemy.optional ? optionalCopy : finalStage ? finalCopy : recovery > 0 ? `Передышка вернёт ${recovery} здоровья: будет ${combat.playerHp + recovery}/${maxHp}. Зелий останется ${combat.potions}.` : `Здоровье уже полное — ${combat.playerHp}/${maxHp}. Зелий останется ${combat.potions}.`; byId('result-action').textContent = enemy.optional ? trophy ? 'Забрать посылку и вернуться' : 'Забрать метку и вернуться' : finalStage ? finalAction[run.chapter] : 'Выбрать добычу'; closeRound('won'); }
    else if (combat.outcome === 'lost') { byId('result-kicker').textContent = 'ПОРАЖЕНИЕ'; byId('result-title').textContent = 'Измени порядок действий'; byId('result-copy').textContent = `Повтор начнётся с состояния на входе: ${run.checkpointHp} здоровья, зелий ${run.checkpointPotions}, настоек ${run.checkpointTinctures}. Если ресурсов недостаточно, прерви поход и начни заново.`; byId('result-action').textContent = 'Повторить бой'; closeRound('lost'); }
  };

  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => { const action = button.dataset.action as FrontierAction; run = { ...run, combat: playFrontierAction(run.combat, run.gear, action, effectiveTalents()) }; app.track('combat_action', { action, chapter: run.chapter, stage: analyticsStage() }); haptic(8); persist(); render(); }));
  byId('end-turn').addEventListener('click', () => { run = { ...run, combat: finishFrontierTurn(run.combat, run.gear) }; app.track('turn_end', { chapter: run.chapter, stage: analyticsStage(), turn: run.combat.turn }); persist(); render(); });
  byId('result-action').addEventListener('click', () => { if (run.combat.outcome === 'lost') { run = retryEncounter(run, effectiveTalents()); beginRound(); app.track('combat_retry', { chapter: run.chapter, stage: analyticsStage() }); } else { const defeated = ENEMIES[run.encounterIndex], earnsMark = run.phase === 'battle' && run.combat.outcome === 'won' && Boolean(defeated.optional), keptPotion = run.combat.potions > 0, trophy = frontierEnemyTrophy(defeated); run = claimVictory(run, effectiveTalents()); if (earnsMark) { app.save.data.marks++; app.save.data.city = progressFrontierContract(app.save.data.city, 'optional-win'); } if (trophy) { app.save.data.city = collectFrontierTrophy(app.save.data.city, trophy); app.save.data.city = progressFrontierContract(app.save.data.city, 'smuggler-win'); } if (run.phase === 'complete') { app.save.data.progress[run.chapter].victories++; if (keptPotion) app.save.data.city = progressFrontierContract(app.save.data.city, 'chapter-win-with-potion'); app.track('expedition_complete', { chapter: run.chapter, weapon: run.gear.weapon, armor: run.gear.armor }); } else if (run.phase === 'loot') app.track('loot_open', { chapter: run.chapter, stage: analyticsStage() }); else app.track('beast_complete', { chapter: run.chapter, enemy: defeated.id, marks: app.save.data.marks }); } persist(); render(); });
  byId('abandon-run').addEventListener('click', () => { if (run.combat.outcome !== 'lost') return; app.track('expedition_abandon', { chapter: run.chapter, node: run.nodeId, checkpointHp: run.checkpointHp }); run = freshExpedition(run.chapter); roundClosed = true; persist(); render(); });
  byId('loot-list').addEventListener('click', (event) => { const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-loot]'); if (!card) return; const selected = card.dataset.loot as LootId; app.save.data.inventory = unlockFrontierLoot(app.save.data.inventory, selected); run = chooseLoot(run, selected, effectiveTalents()); app.save.data.loadout = { ...run.gear }; app.track('loot_choice', { chapter: run.chapter, item: selected, stage: analyticsStage() }); haptic([12, 30, 12]); persist(); render(); });
  byId('map-options').addEventListener('click', (event) => { const choice = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-node]'); if (!choice) return; const previous = run; run = selectMapNode(run, choice.dataset.mapNode as MapNodeId, effectiveTalents()); app.save.data.city = consumeFrontierDepartureSupply(app.save.data.city, previous, run); if (previous.phase === 'map' && run.phase === 'battle' && roundClosed) beginRound(); app.track('map_choice', { chapter: run.chapter, node: run.nodeId }); persist(); render(); });
  byId('chapter-switcher').addEventListener('click', (event) => { const choice = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-chapter]'); if (!choice || run.phase !== 'map' || run.nodeId !== CHAPTERS[run.chapter].start) return; const chapter = choice.dataset.chapter as ChapterId; if (!frontierChapterUnlocked(CHAPTERS[chapter], app.save.data.progress)) return; app.save.data.chapter = chapter; run = freshExpedition(chapter); roundClosed = true; app.track('chapter_select', { chapter }); persist(); render(); });
  const canVisitCity = (): boolean => app.save.data.progress.prologue.victories >= 1
    && (run.phase === 'complete' || (run.phase === 'map' && run.nodeId === CHAPTERS[run.chapter].start));
  const openCity = (): void => { if (!canVisitCity()) return; inventoryOpen = false; inventoryReturnsToCity = false; cityOpen = true; app.track('city_open', { chapter: run.chapter }); render(); };
  const openInventory = (): void => { inventoryReturnsToCity = false; inventoryOpen = true; app.track('inventory_open', { node: run.nodeId }); render(); };
  byId('map-inventory').addEventListener('click', openInventory); byId('ending-inventory').addEventListener('click', openInventory);
  byId('map-city').addEventListener('click', openCity); byId('ending-city').addEventListener('click', openCity);
  byId('city-back').addEventListener('click', () => { cityOpen = false; render(); });
  byId('city-inventory').addEventListener('click', () => { cityOpen = false; inventoryOpen = true; inventoryReturnsToCity = true; app.track('inventory_open', { node: run.nodeId, source: 'city' }); render(); });
  byId('inventory-back').addEventListener('click', () => { inventoryOpen = false; cityOpen = inventoryReturnsToCity; inventoryReturnsToCity = false; render(); });
  byId('city-forge').addEventListener('click', () => {
    const result = improveFrontierForge(app.save.data.city, app.save.data.marks);
    if (result.city === app.save.data.city) return;
    app.save.data.city = result.city; app.save.data.marks = result.marks;
    if (run.phase === 'map' && run.nodeId === CHAPTERS[run.chapter].start) run = freshExpedition(run.chapter);
    app.track('city_purchase', { item: 'forge', marks: result.marks }); haptic([12, 35, 18]); persist(); render();
  });
  byId('city-potion').addEventListener('click', () => {
    const result = buyFrontierPotion(app.save.data.city, app.save.data.marks);
    if (result.city === app.save.data.city) return;
    app.save.data.city = result.city; app.save.data.marks = result.marks;
    if (run.phase === 'map' && run.nodeId === CHAPTERS[run.chapter].start) run = freshExpedition(run.chapter);
    app.track('city_purchase', { item: 'extra-potion', marks: result.marks }); haptic(12); persist(); render();
  });
  byId('city-tincture').addEventListener('click', () => {
    const result = buyFrontierTincture(app.save.data.city, app.save.data.marks);
    if (result.city === app.save.data.city) return;
    app.save.data.city = result.city; app.save.data.marks = result.marks;
    if (run.phase === 'map' && run.nodeId === CHAPTERS[run.chapter].start) run = freshExpedition(run.chapter);
    app.track('city_purchase', { item: 'extra-tincture', marks: result.marks }); haptic(12); persist(); render();
  });
  byId('city-fence').addEventListener('click', () => {
    const result = turnInFrontierTrophy(app.save.data.city, app.save.data.marks);
    if (result.city === app.save.data.city) return;
    app.save.data.city = result.city; app.save.data.marks = result.marks;
    app.track('city_turn_in', { item: 'contraband', marks: result.marks }); haptic([12, 35, 12]); persist(); render();
  });
  byId('contract-actions').addEventListener('click', (event) => {
    const accept = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-contract]');
    if (accept) {
      const id = accept.dataset.contract as FrontierContractId;
      const next = acceptFrontierContract(app.save.data.city, id);
      if (next === app.save.data.city) return;
      app.save.data.city = next; app.track('contract_accept', { contract: id }); persist(); render(); return;
    }
    const claim = (event.target as HTMLElement).closest<HTMLButtonElement>('#claim-contract');
    if (!claim) return;
    const id = app.save.data.city.contract?.id;
    const result = claimFrontierContract(app.save.data.city, app.save.data.marks);
    if (result.city === app.save.data.city) return;
    app.save.data.city = result.city; app.save.data.marks = result.marks;
    app.track('contract_claim', { contract: id ?? 'unknown', marks: result.marks }); haptic([12, 35, 12]); persist(); render();
  });
  byId('inventory-screen').addEventListener('click', (event) => { const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-equip]'); if (!card) return; const selected = card.dataset.equip as LootId; const next = equipFrontierLoot(app.save.data.loadout, app.save.data.inventory, selected); if (next === app.save.data.loadout) return; app.save.data.loadout = next; if (run.phase === 'map' && run.nodeId === CHAPTERS[run.chapter].start) run = freshExpedition(run.chapter); app.track('inventory_equip', { item: selected }); haptic(10); persist(); render(); });
  byId('talent-list').addEventListener('click', (event) => { const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-talent]'); if (!card || run.phase !== 'map' || run.nodeId !== CHAPTERS[run.chapter].start) return; const id = card.dataset.talent as FrontierTalentId, learned = learnFrontierTalent(app.save.data.talents, app.save.data.marks, id); if (learned.talents === app.save.data.talents) return; app.save.data.talents = learned.talents; app.save.data.marks = learned.marks; run = freshExpedition(run.chapter); app.track('talent_learn', { talent: id, level: learned.talents[id] }); haptic([10, 30, 10]); persist(); render(); });
  byId('new-expedition').addEventListener('click', () => { run = freshExpedition(run.chapter); roundClosed = true; app.track('expedition_start', { chapter: run.chapter, replay: true, tinctures: run.combat.tinctures }); persist(); render(); });
  byId('continue-chapter').addEventListener('click', (event) => { const chapter = (event.currentTarget as HTMLButtonElement).dataset.chapter as ChapterId | undefined; if (!chapter || !frontierChapterUnlocked(CHAPTERS[chapter], app.save.data.progress)) return; app.save.data.chapter = chapter; run = freshExpedition(chapter); roundClosed = true; app.track('chapter_select', { chapter, source: 'ending' }); persist(); render(); });
  if (run.phase === 'battle' && !roundClosed) app.startRound(); app.track('app_start', { resumed: app.save.data.run !== null }); persist(); render(); app.ready();
}

void main();
