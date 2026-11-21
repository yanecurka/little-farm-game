/* ============================================================
   Маленькая Ферма v2 — игровая логика
   Реальное время, таймеры, энергия, задания, уровни
   ============================================================ */

const SAVE_KEY = 'little_farm_save_v2';
const OLD_KEY = 'little_farm_save_v1';
const ENERGY_REGEN_MS = 20000;   // +1 энергия каждые 20 секунд
const MAX_TASKS = 3;

let state = null;
let selectedSeed = 'carrot';
let selectedTile = -1;
let toastTimer = null;
let audioCtx = null;
let lastReadySig = '';
let tickTimer = null;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = n => Math.floor(Math.random() * n);
const now = () => Date.now();

// ---------- Звук ----------
const SOUNDS = {
  plant: [[420, .06], [560, .09]],
  water: [[320, .06], [250, .09]],
  harvest: [[520, .06], [660, .06], [880, .12]],
  coin: [[880, .05], [1170, .10]],
  error: [[180, .16]],
  day: [[392, .11], [523, .11], [659, .18]],
  achievement: [[523, .09], [659, .09], [784, .09], [1047, .22]],
  feed: [[280, .09]],
  boost: [[330, .05], [550, .05], [770, .05], [1100, .14]],
};

function playSound(type) {
  if (!state || !state.settings.sound) return;
  const notes = SOUNDS[type];
  if (!notes) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    let offset = 0;
    notes.forEach(([freq, dur]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.11, audioCtx.currentTime + offset + .01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + offset + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + offset);
      osc.stop(audioCtx.currentTime + offset + dur + .02);
      offset += dur * .85;
    });
  } catch (e) { /* звук необязателен */ }
}

// ---------- Форматирование времени ----------
function formatTime(ms) {
  if (ms <= 0) return 'Готово!';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}с`;
}
const formatDuration = sec => sec < 60 ? `${sec} сек` : `${Math.floor(sec / 60)} мин`;

// ---------- Состояние ----------
function createNewGame() {
  return {
    version: 2,
    day: 1,
    coins: 180,
    energy: 100,
    maxEnergy: 100,
    weather: 'sunny',
    marketMult: 1.00,
    priceDay: 1,
    xp: 0,
    level: 1,
    tiles: Array.from({ length: 16 }, () => ({ crop: null, readyAt: 0, plantedAt: 0, waterCount: 0, fertilized: false })),
    unlockedTiles: 6,
    inventory: { seeds: {}, products: {}, items: {} },
    animals: [],
    tasks: [],
    achievements: [],
    stats: { harvested: 0, earned: 0, spent: 0, planted: 0, daysPlayed: 1, waterings: 0, instantGrows: 0, tasksDone: 0 },
    settings: { sound: true, animations: true },
    tutorialSeen: false,
    lastEnergyAt: now(),
  };
}

function marketForDay(day) {
  return Math.round((0.85 + ((day * 37) % 50) / 100) * 100) / 100;
}

function normalize(data) {
  const f = createNewGame();
  const s = { ...f, ...data };
  s.tiles = Array.from({ length: 16 }, (_, i) => {
    const t = data.tiles && data.tiles[i];
    return t && typeof t === 'object'
      ? { crop: t.crop || null, readyAt: Number(t.readyAt) || 0, plantedAt: Number(t.plantedAt) || 0, waterCount: Number(t.waterCount) || 0, fertilized: !!t.fertilized }
      : f.tiles[i];
  });
  s.inventory = {
    seeds: (data.inventory && data.inventory.seeds) || {},
    products: (data.inventory && data.inventory.products) || {},
    items: (data.inventory && data.inventory.items) || {},
  };
  s.stats = { ...f.stats, ...(data.stats || {}) };
  s.settings = { ...f.settings, ...(data.settings || {}) };
  s.animals = Array.isArray(data.animals) ? data.animals : [];
  s.tasks = Array.isArray(data.tasks) ? data.tasks : [];
  s.achievements = Array.isArray(data.achievements) ? data.achievements : [];
  s.lastEnergyAt = Number(data.lastEnergyAt) || now();
  s.marketMult = Number(data.marketMult) || marketForDay(s.day);
  s.maxEnergy = Number(data.maxEnergy) || 100 + (s.level - 1) * 10;
  return s;
}

function migrateV1(d) {
  const f = createNewGame();
  const t = now();
  const tiles = f.tiles.map((empty, i) => {
    const o = d.tiles && d.tiles[i];
    if (!o || !o.crop) return empty;
    const crop = getCrop(o.crop) || CROPS[0];
    const remainSec = Math.max(5, (crop.growDays - (o.growth || 0)) * crop.growSeconds);
    let readyAt = t + remainSec * 1000;
    if (o.watered) readyAt -= crop.growSeconds * 200;
    return { crop: o.crop, readyAt, plantedAt: t - (crop.growSeconds - remainSec) * 1000, waterCount: o.watered ? 1 : 0, fertilized: false };
  });
  const animals = (d.animals || []).map(a => {
    const info = getAnimal(a.type) || ANIMALS[0];
    return {
      ...a,
      readyAt: a.ready ? t : (a.fed ? t + info.produceSeconds * 1000 : 0),
    };
  });
  return {
    ...f,
    day: d.day || 1,
    coins: typeof d.coins === 'number' ? d.coins : 180,
    energy: typeof d.energy === 'number' ? d.energy : 100,
    weather: d.weather || 'sunny',
    tiles,
    unlockedTiles: d.unlockedTiles || 6,
    inventory: { seeds: (d.inventory && d.inventory.seeds) || {}, products: (d.inventory && d.inventory.products) || {}, items: {} },
    animals,
    achievements: d.achievements || [],
    stats: { ...f.stats, ...(d.stats || {}) },
    settings: { ...f.settings, ...(d.settings || {}) },
    marketMult: marketForDay(d.day || 1),
  };
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return normalize(JSON.parse(raw));
    const old = localStorage.getItem(OLD_KEY);
    if (old) return migrateV1(JSON.parse(old));
  } catch (e) { /* повреждённый файл — новая игра */ }
  return null;
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Не удалось сохранить игру', 'error'); }
}

function commit() { saveGame(); renderAll(); }

// ---------- Уведомления и модалки ----------
function toast(text, type = '') {
  const el = $('#toast');
  el.textContent = text;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2400);
}

function openModal({ icon, title, body, actions }) {
  $('#modal-icon').textContent = icon || '❓';
  $('#modal-title').textContent = title || '';
  $('#modal-body').innerHTML = body || '';
  const box = $('#modal-actions');
  box.innerHTML = '';
  (actions || [{ label: 'Ок', cls: 'btn-primary' }]).forEach(a => {
    const btn = document.createElement('button');
    btn.className = a.cls || 'btn-primary';
    btn.textContent = a.label;
    btn.addEventListener('click', () => { if (a.onClick) a.onClick(); if (!a.keepOpen) closeModal(); });
    box.appendChild(btn);
  });
  $('#modal-overlay').classList.remove('hidden');
}
const closeModal = () => $('#modal-overlay').classList.add('hidden');

function showHelp() {
  openModal({
    icon: '🌿', title: 'Как играть',
    body: `
      <p><strong>Главное:</strong> растения растут в реальном времени — даже когда игра закрыта. На плитке виден таймер до созревания.</p>
      <ul>
        <li>🌱 <strong>Посадите:</strong> выберите семена и нажмите на пустой участок.</li>
        <li>💧 <strong>Полив</strong> за 2⚡ срезает 20% оставшегося времени.</li>
        <li>⚡ <strong>Ускорение</strong> за энергию делает растение спелым мгновенно. Стоимость зависит от остатка времени.</li>
        <li>🧪 <strong>Удобрение</strong> срезает 40% времени и даёт +1 урожай.</li>
        <li>🧺 <strong>Сбор:</strong> нажмите на спелое растение или кнопку в панели.</li>
        <li>🐔 <strong>Животные:</strong> покормите — через таймер дадут продукцию. Соберите и продайте.</li>
        <li>⚡ <strong>Энергия</strong> восстанавливается сама: +1 каждые 20 секунд. Кнопка «Отдых» восстанавливает её полностью и меняет погоду с ценами.</li>
        <li>📋 <strong>Задания</strong> и 🏆 достижения дают монеты и опыт. Уровень увеличивает запас энергии.</li>
      </ul>
      <p>📈 Цены на продукцию меняются каждый день — продавайте выгоднее!</p>`,
    actions: [{ label: 'Понятно!', cls: 'btn-primary' }],
  });
}

// ---------- Опыт и уровни ----------
function gainXp(n) {
  state.xp += n;
  while (state.xp >= state.level * 100) {
    state.xp -= state.level * 100;
    state.level++;
    state.maxEnergy += 10;
    state.energy = state.maxEnergy;
    const bonus = 50 * state.level;
    state.coins += bonus;
    state.stats.earned += bonus;
    playSound('achievement');
    toast(`🎉 Уровень ${state.level}! +10⚡ и +${bonus}🪙`, 'success');
  }
}

// ---------- Достижения ----------
function checkAchievements() {
  const unlocked = new Set(state.achievements);
  const unlock = id => {
    if (unlocked.has(id)) return;
    state.achievements.push(id);
    unlocked.add(id);
    playSound('achievement');
    const a = getAchievement(id);
    if ($('#modal-overlay').classList.contains('hidden')) {
      openModal({ icon: '🏆', title: 'Достижение открыто!',
        body: `<p style="text-align:center;font-size:15px;color:var(--text)"><strong>${a.icon} ${a.name}</strong></p><p style="text-align:center">${a.desc}</p>`,
        actions: [{ label: 'Отлично!', cls: 'btn-primary' }] });
    } else toast(`🏆 ${a.name}`, 'success');
  };
  const s = state.stats;
  if (s.harvested >= 1) unlock('first_harvest');
  if (s.harvested >= 10) unlock('harvest_10');
  if (s.harvested >= 50) unlock('harvest_50');
  if (state.animals.length >= 1) unlock('first_animal');
  if (state.day >= 7) unlock('day_7');
  if (state.coins >= 1000) unlock('coins_1000');
  const plantedTypes = new Set(state.tiles.filter(t => t.crop).map(t => t.crop));
  if (plantedTypes.size >= CROPS.length) unlock('all_crops');
  if (state.unlockedTiles >= 16 && state.tiles.filter(t => t.crop).length >= 16) unlock('full_field');
  if (s.instantGrows >= 10) unlock('instant_10');
  if (s.tasksDone >= 10) unlock('tasks_10');
}

// ---------- Задания ----------
function generateTasks() {
  let guard = 0;
  while (state.tasks.length < MAX_TASKS && guard++ < 30) {
    const tpl = TASK_TEMPLATES[rand(TASK_TEMPLATES.length)];
    if (state.tasks.some(t => t.type === tpl.type)) continue;
    const i = rand(3);
    state.tasks.push({
      uid: now() + rand(100000),
      type: tpl.type, icon: tpl.icon, label: TASK_LABELS[tpl.type],
      target: tpl.targets[i], progress: 0,
      coins: tpl.coins[i], xp: tpl.xp, claimed: false,
    });
  }
}

function updateTask(type, amount) {
  state.tasks.forEach(t => {
    if (t.type === type && !t.claimed) t.progress = Math.min(t.target, t.progress + amount);
  });
}

function claimTask(uid) {
  const t = state.tasks.find(x => x.uid === uid);
  if (!t || t.claimed || t.progress < t.target) return;
  t.claimed = true;
  state.coins += t.coins;
  state.stats.earned += t.coins;
  state.stats.tasksDone++;
  gainXp(t.xp);
  playSound('coin');
  toast(`📋 Задание выполнено: +${t.coins}🪙 +${t.xp}XP`, 'success');
  checkAchievements();
  commit();
}

// ---------- Ресурсы ----------
function spendEnergy(n) {
  if (state.energy < n) { toast('Не хватает энергии — подождите или отдохните', 'error'); playSound('error'); return false; }
  state.energy -= n;
  state.lastEnergyAt = now();
  return true;
}
function spendCoins(n) {
  if (state.coins < n) { toast(`Не хватает монет (нужно ${n})`, 'error'); playSound('error'); return false; }
  state.coins -= n;
  state.stats.spent += n;
  return true;
}

function regenEnergy() {
  if (state.energy >= state.maxEnergy) { state.lastEnergyAt = now(); return; }
  const periods = Math.floor((now() - state.lastEnergyAt) / ENERGY_REGEN_MS);
  if (periods <= 0) return;
  const add = Math.min(periods, state.maxEnergy - state.energy);
  state.energy += add;
  state.lastEnergyAt = state.energy >= state.maxEnergy ? now() : state.lastEnergyAt + add * ENERGY_REGEN_MS;
  saveGame();
}

// ---------- Действия с полем ----------
const tileReady = t => !!t.crop && t.readyAt > 0 && t.readyAt <= now();
const tileRemaining = t => Math.max(0, t.readyAt - now());
const boostCost = t => Math.max(3, Math.ceil(tileRemaining(t) / 1000 / 6) + 2);
// детерминированный бонус, чтобы панель и сбор показывали одно и то же
const bonusYield = t => 1 + (t.fertilized ? 1 : 0) + (t.readyAt % 4 < 1 ? 1 : 0);

function plantTile(index) {
  const t = state.tiles[index];
  if (!state.inventory.seeds[selectedSeed]) { toast(`Нет семян: ${getCrop(selectedSeed).name}. Купите в магазине`, 'error'); playSound('error'); return; }
  if (!spendEnergy(2)) return;
  const crop = getCrop(selectedSeed);
  const weather = WEATHER.find(w => w.id === state.weather) || WEATHER[0];
  const duration = Math.round(crop.growSeconds / weather.speed);
  state.inventory.seeds[selectedSeed]--;
  t.crop = selectedSeed;
  t.plantedAt = now();
  t.readyAt = now() + duration * 1000;
  t.waterCount = 0;
  t.fertilized = false;
  state.stats.planted++;
  gainXp(2);
  updateTask('plant', 1);
  playSound('plant');
  toast(`🌱 ${crop.name} — готов через ${formatDuration(duration)}`);
  checkAchievements();
  commit();
}

function tileClick(index) {
  const t = state.tiles[index];
  if (index >= state.unlockedTiles) { toast('Участок закрыт — расширьте поле', 'error'); return; }
  if (!t.crop) { plantTile(index); return; }
  if (tileReady(t)) { harvestTile(index); return; }
  selectedTile = index;
  renderField();
  renderTilePanel();
  playSound('water');
}

function waterTile(index) {
  const t = state.tiles[index];
  if (!t.crop || tileReady(t)) return;
  if (!spendEnergy(2)) return;
  const remain = tileRemaining(t);
  t.readyAt = Math.max(now() + 1000, t.readyAt - remain * 0.2);
  t.waterCount++;
  state.stats.waterings++;
  gainXp(1);
  updateTask('water', 1);
  playSound('water');
  toast(`💧 Осталось ${formatTime(tileRemaining(t))}`);
  commit();
}

function boostTile(index) {
  const t = state.tiles[index];
  if (!t.crop || tileReady(t)) return;
  const cost = boostCost(t);
  if (!spendEnergy(cost)) return;
  t.readyAt = now();
  state.stats.instantGrows++;
  gainXp(3);
  updateTask('instant', 1);
  playSound('boost');
  toast('⚡ Растение выросло мгновенно!', 'success');
  checkAchievements();
  commit();
}

function fertilizeTile(index) {
  const t = state.tiles[index];
  if (!t.crop || tileReady(t)) return;
  if (!(state.inventory.items.fertilizer > 0)) { toast('Нет удобрений — купите в магазине', 'error'); return; }
  state.inventory.items.fertilizer--;
  if (!state.inventory.items.fertilizer) delete state.inventory.items.fertilizer;
  t.fertilized = true;
  const remain = tileRemaining(t);
  t.readyAt = Math.max(now() + 1000, t.readyAt - remain * 0.4);
  playSound('plant');
  toast(`🧪 Осталось ${formatTime(tileRemaining(t))} · урожай +1`);
  commit();
}

function clearTile(index) {
  const t = state.tiles[index];
  if (!t.crop) return;
  if (!spendEnergy(1)) return;
  state.inventory.seeds[t.crop] = (state.inventory.seeds[t.crop] || 0) + 1;
  t.crop = null; t.readyAt = 0; t.plantedAt = 0; t.waterCount = 0; t.fertilized = false;
  selectedTile = -1;
  toast('🧹 Участок очищен, семя вернулось');
  commit();
}

function harvestTile(index) {
  const t = state.tiles[index];
  if (!tileReady(t)) return;
  const crop = getCrop(t.crop);
  const qty = bonusYield(t);
  state.inventory.products[crop.id] = (state.inventory.products[crop.id] || 0) + qty;
  state.stats.harvested += qty;
  gainXp(5);
  updateTask('harvest', qty);
  t.crop = null; t.readyAt = 0; t.plantedAt = 0; t.waterCount = 0; t.fertilized = false;
  if (selectedTile === index) selectedTile = -1;
  playSound('harvest');
  toast(`🧺 ${crop.name} ×${qty}`);
  checkAchievements();
  commit();
}

// ---------- Магазин ----------
function buySeed(id) {
  const crop = getCrop(id);
  if (!spendCoins(crop.seedPrice)) return;
  state.inventory.seeds[id] = (state.inventory.seeds[id] || 0) + 1;
  playSound('coin');
  toast(`🌰 Семена: ${crop.name}`);
  commit();
}
function buyAnimal(id) {
  const a = getAnimal(id);
  if (!spendCoins(a.price)) return;
  state.animals.push({ uid: now() + rand(100000), type: id, fed: false, readyAt: 0 });
  playSound('coin');
  toast(`${a.emoji} ${a.name} поселилась на ферме!`);
  checkAchievements();
  commit();
}
function buyMisc(id) {
  const item = MISC_ITEMS.find(m => m.id === id);
  if (!item) return;
  if (id === 'energy' && state.energy >= state.maxEnergy) { toast('Энергия полная'); return; }
  if (!spendCoins(item.price)) return;
  if (id === 'energy') {
    state.energy = clamp(state.energy + 40, 0, state.maxEnergy);
    state.lastEnergyAt = now();
  } else {
    state.inventory.items[id] = (state.inventory.items[id] || 0) + 1;
  }
  playSound('coin');
  toast(`🛒 Куплено: ${item.name}`);
  commit();
}

// ---------- Животные ----------
function feedAnimal(uid) {
  const a = state.animals.find(x => x.uid === uid);
  if (!a || a.fed) { toast('Животное уже сыто'); return; }
  const info = getAnimal(a.type);
  if (!spendCoins(info.feedPrice)) return;
  if (!spendEnergy(1)) { state.coins += info.feedPrice; return; }
  a.fed = true;
  a.readyAt = now() + info.produceSeconds * 1000;
  gainXp(2);
  updateTask('feed', 1);
  playSound('feed');
  toast(`${info.emoji} Продукция через ${formatDuration(info.produceSeconds)}`);
  commit();
}
function feedAll() {
  const hungry = state.animals.filter(a => !a.fed);
  if (!hungry.length) { toast('Все сыты'); return; }
  const cost = hungry.reduce((s, a) => s + getAnimal(a.type).feedPrice, 0);
  if (state.coins < cost || state.energy < hungry.length) { toast('Не хватает монет или энергии', 'error'); playSound('error'); return; }
  state.coins -= cost; state.stats.spent += cost; state.energy -= hungry.length;
  state.lastEnergyAt = now();
  hungry.forEach(a => { a.fed = true; a.readyAt = now() + getAnimal(a.type).produceSeconds * 1000; });
  gainXp(2 * hungry.length);
  updateTask('feed', hungry.length);
  playSound('feed');
  toast(`🌾 Накормлено: ${hungry.length}`);
  commit();
}
function collectAnimal(uid) {
  const a = state.animals.find(x => x.uid === uid);
  if (!a || !a.readyAt || a.readyAt > now()) { toast('Пока нечего собирать — покормите животное'); return; }
  const info = getAnimal(a.type);
  state.inventory.products[info.product] = (state.inventory.products[info.product] || 0) + 1;
  a.readyAt = 0; a.fed = false;
  gainXp(3);
  playSound('harvest');
  toast(`🧺 ${info.productName}`);
  commit();
}

// ---------- Торговля ----------
function sellProduct(id, all) {
  const have = state.inventory.products[id] || 0;
  if (!have) return;
  const qty = all ? have : 1;
  const price = Math.max(1, Math.round(PRODUCTS[id].sellPrice * state.marketMult));
  const gain = qty * price;
  state.coins += gain;
  state.stats.earned += gain;
  state.inventory.products[id] -= qty;
  if (state.inventory.products[id] <= 0) delete state.inventory.products[id];
  gainXp(3);
  updateTask('sell', qty);
  playSound('coin');
  toast(`🪙 +${gain} монет (×${state.marketMult})`);
  checkAchievements();
  commit();
}

// ---------- Отдых / погода ----------
function restGame() {
  state.day++;
  state.energy = state.maxEnergy;
  state.lastEnergyAt = now();
  state.stats.daysPlayed = state.day;
  state.priceDay = state.day;
  state.marketMult = marketForDay(state.day);

  const total = WEATHER.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  let weather = WEATHER[0];
  for (const w of WEATHER) { r -= w.weight; if (r <= 0) { weather = w; break; } }
  state.weather = weather.id;

  const bonus = weather.id === 'rain' ? .10 : (weather.id === 'cloudy' ? .05 : 0);
  if (bonus) state.tiles.forEach(t => {
    if (t.crop && t.readyAt > now()) t.readyAt -= tileRemaining(t) * bonus;
  });

  state.tasks = state.tasks.filter(t => !t.claimed);
  generateTasks();
  gainXp(5);
  playSound('day');
  commit();
  toast(`🌙 День ${state.day} · ${weather.icon} ${weather.name} · цены ×${state.marketMult}`);
}

function expandField() {
  const next = FIELD_UPGRADES.find(u => u.tiles > state.unlockedTiles);
  if (!next) { toast('Поле уже максимальное'); return; }
  openModal({
    icon: '🗺️', title: 'Расширить поле',
    body: `<p>Откроется ${next.tiles - state.unlockedTiles} новых участков.</p><p>Стоимость: 🪙 ${next.price} · у вас 🪙 ${state.coins}</p>`,
    actions: [
      { label: `Купить за ${next.price}`, cls: 'btn-primary', onClick: () => {
          if (!spendCoins(next.price)) return;
          state.unlockedTiles = next.tiles; playSound('coin'); toast('🗺️ Поле расширено!'); commit();
        } },
      { label: 'Отмена', cls: 'btn-secondary' },
    ],
  });
}

function resetGame() {
  openModal({
    icon: '⚠️', title: 'Начать заново?',
    body: '<p>Весь прогресс будет удалён без возможности восстановления.</p>',
    actions: [
      { label: 'Да, начать заново', cls: 'btn-danger', onClick: () => {
          state = createNewGame(); selectedTile = -1; selectedSeed = 'carrot';
          generateTasks(); saveGame(); renderAll(); toast('🌱 Новая ферма!', 'success');
        } },
      { label: 'Отмена', cls: 'btn-secondary' },
    ],
  });
}

// ---------- Тик реального времени ----------
function updateTimers() {
  const t = now();
  $$('[data-timer]').forEach(el => {
    const key = el.dataset.timer;
    let ms = 0, total = 0;
    if (key.startsWith('tile-')) {
      const i = Number(key.slice(5));
      const tile = state.tiles[i];
      if (!tile || !tile.crop) return;
      ms = tileRemaining(tile);
      total = Math.max(1, tile.readyAt - tile.plantedAt);
    } else if (key.startsWith('animal-')) {
      const a = state.animals.find(x => x.uid === Number(key.slice(7)));
      if (!a || !a.readyAt) return;
      ms = Math.max(0, a.readyAt - t);
      const info = getAnimal(a.type);
      total = info.produceSeconds * 1000;
    } else if (key === 'panel') {
      const tile = state.tiles[selectedTile];
      if (!tile || !tile.crop) return;
      ms = tileRemaining(tile);
      total = Math.max(1, tile.readyAt - tile.plantedAt);
    }
    el.textContent = ms <= 0 ? 'Готово!' : formatTime(ms);
    const bar = document.querySelector(`[data-progress="${key}"]`);
    if (bar) bar.style.width = `${clamp(100 - (ms / total) * 100, 0, 100)}%`;
  });
}

function updateEnergyUI() {
  const pct = `${(state.energy / state.maxEnergy) * 100}%`;
  $('#hud-energy').textContent = state.energy;
  $('#energy-text').textContent = `${state.energy} / ${state.maxEnergy}`;
  $('#energy-fill').style.width = pct;
}

function tick() {
  if (!state) return;
  regenEnergy();
  const sig = state.tiles.map((t, i) => i < state.unlockedTiles && tileReady(t) ? '1' : '0').join('')
    + '|' + state.animals.map(a => a.readyAt && a.readyAt <= now() ? '1' : '0').join('');
  if (sig !== lastReadySig) {
    const wasEmpty = !lastReadySig;
    lastReadySig = sig;
    renderField(); renderAnimals(); renderTilePanel();
    if (!wasEmpty) {
      const readyCrops = state.tiles.filter((t, i) => i < state.unlockedTiles && tileReady(t)).length;
      const readyAnimals = state.animals.filter(a => a.readyAt && a.readyAt <= now()).length;
      if (readyCrops || readyAnimals) toast(`✅ Готово к сбору: ${readyCrops} культур, ${readyAnimals} животных`);
    }
  }
  updateTimers();
  updateEnergyUI();
}

// ---------- Отрисовка ----------
function renderHUD() {
  $('#hud-day').textContent = state.day;
  $('#hud-coins').textContent = state.coins;
  $('#level-label').textContent = `Уровень ${state.level}`;
  $('#xp-fill').style.width = `${(state.xp / (state.level * 100)) * 100}%`;
  $('#xp-text').textContent = `${state.xp} / ${state.level * 100}`;
  const w = WEATHER.find(x => x.id === state.weather) || WEATHER[0];
  $('#weather-icon').textContent = w.icon;
  $('#weather-name').textContent = w.name;
  $('#weather-desc').textContent = w.desc;
  $('#field-progress').textContent = `${state.unlockedTiles} / 16`;
  $('#btn-expand').style.display = state.unlockedTiles >= 16 ? 'none' : '';
  $('#market-banner').textContent = `📈 Цены сегодня: ×${state.marketMult.toFixed(2)} ${state.marketMult >= 1 ? '↗ спрос высокий' : '↘ цены низкие'}`;
  updateEnergyUI();
}

function renderSeedPicker() {
  $('#seed-picker').innerHTML = CROPS.map(c => {
    const count = state.inventory.seeds[c.id] || 0;
    return `<button class="seed-btn ${c.id === selectedSeed ? 'selected' : ''}" data-action="select-seed" data-id="${c.id}">
      <span class="seed-emoji">${c.emoji}</span><span class="seed-name">${c.name}</span>
      <span class="seed-count ${count === 0 ? 'empty' : ''}">×${count}</span></button>`;
  }).join('');
}

function renderField() {
  $('#field-grid').innerHTML = state.tiles.map((t, i) => {
    if (i >= state.unlockedTiles) return `<button class="tile locked" data-action="tile" data-index="${i}">🔒</button>`;
    if (!t.crop) return `<button class="tile empty" data-action="tile" data-index="${i}" title="Пустой участок"></button>`;
    const crop = getCrop(t.crop);
    const ready = tileReady(t);
    const emoji = ready ? crop.emoji : (tileRemaining(t) < (t.readyAt - t.plantedAt) * .5 ? '🌿' : '🌱');
    const badges = (t.waterCount ? '💧' : '') + (t.fertilized ? '🧪' : '');
    return `<button class="tile ${ready ? 'ready' : ''} ${i === selectedTile ? 'selected' : ''}" data-action="tile" data-index="${i}" title="${crop.name}">
      ${badges ? `<span class="tile-badge">${badges}</span>` : ''}
      <span class="tile-emoji">${emoji}</span>
      <span class="tile-timer" data-timer="tile-${i}">${formatTime(tileRemaining(t))}</span>
      <span class="tile-progress"><i data-progress="tile-${i}"></i></span>
    </button>`;
  }).join('');
}

function renderTilePanel() {
  const box = $('#tile-panel');
  const t = state.tiles[selectedTile];
  if (!t || !t.crop || selectedTile >= state.unlockedTiles) {
    box.innerHTML = '<div class="tile-panel-empty">👆 Нажмите на растущее растение, чтобы поливать его, удобрять или ускорять рост за энергию</div>';
    return;
  }
  const crop = getCrop(t.crop);
  if (tileReady(t)) {
    box.innerHTML = `<div class="tile-panel-head"><span class="panel-emoji">${crop.emoji}</span>
      <div><strong>${crop.name}</strong><small>Спело! Урожай ×${bonusYield(t)}</small></div>
      <div class="panel-timer"><strong>✅</strong><small>готово</small></div></div>
      <div class="panel-actions"><button class="panel-btn harvest" data-action="harvest" data-index="${selectedTile}">🧺 Собрать урожай</button></div>`;
    return;
  }
  const cost = boostCost(t);
  const fert = state.inventory.items.fertilizer || 0;
  box.innerHTML = `<div class="tile-panel-head"><span class="panel-emoji">🌱</span>
    <div><strong>${crop.name}</strong><small>${t.waterCount ? '💧 полито · ' : ''}${t.fertilized ? '🧪 удобрено' : 'без удобрений'}</small></div>
    <div class="panel-timer"><strong data-timer="panel">${formatTime(tileRemaining(t))}</strong><small>до созревания</small>
      <div class="quest-bar"><i data-progress="panel"></i></div></div></div>
    <div class="panel-actions">
      <button class="panel-btn water" data-action="water" data-index="${selectedTile}" ${state.energy < 2 ? 'disabled' : ''}>💧 Полить<small>−20% времени · 2⚡</small></button>
      <button class="panel-btn boost" data-action="boost" data-index="${selectedTile}" ${state.energy < cost ? 'disabled' : ''}>⚡ Ускорить<small>сразу · ${cost}⚡</small></button>
      <button class="panel-btn fert" data-action="fertilize" data-index="${selectedTile}" ${fert <= 0 ? 'disabled' : ''}>🧪 Удобрить<small>×${fert} · −40%</small></button>
      <button class="panel-btn clear" data-action="clear" data-index="${selectedTile}">🧹 Убрать<small>вернуть семя · 1⚡</small></button>
    </div>`;
  updateTimers();
}

function renderBarn() {
  const seeds = CROPS.filter(c => (state.inventory.seeds[c.id] || 0) > 0);
  $('#barn-seeds').innerHTML = seeds.length ? seeds.map(c => `
    <div class="item-card"><div class="item-emoji">${c.emoji}</div>
      <div class="item-info"><div class="item-name">${c.name}</div><div class="item-desc">Семена · растут ${formatDuration(c.growSeconds)}</div>
      <div class="item-qty">В наличии: ${state.inventory.seeds[c.id]} шт.</div></div>
      <button class="item-action" data-action="select-seed-go" data-id="${c.id}">Выбрать</button></div>`).join('')
    : '<div class="empty-state"><span class="big-emoji">🌰</span>Семян пока нет.<br>Загляните в магазин.</div>';

  const items = MISC_ITEMS.filter(m => (state.inventory.items[m.id] || 0) > 0);
  if (items.length) {
    const box = $('#barn-seeds');
    box.insertAdjacentHTML('beforeend', items.map(m => `
      <div class="item-card"><div class="item-emoji">${m.emoji}</div>
        <div class="item-info"><div class="item-name">${m.name}</div><div class="item-desc">${m.desc}</div>
        <div class="item-qty">В наличии: ${state.inventory.items[m.id]} шт.</div></div></div>`).join(''));
  }

  const products = Object.keys(state.inventory.products).filter(id => state.inventory.products[id] > 0);
  $('#barn-products').innerHTML = products.length ? products.map(id => {
    const p = PRODUCTS[id];
    const qty = state.inventory.products[id];
    const price = Math.max(1, Math.round(p.sellPrice * state.marketMult));
    return `<div class="item-card"><div class="item-emoji">${p.emoji}</div>
      <div class="item-info"><div class="item-name">${p.name}</div><div class="item-desc">Цена: 🪙 ${price} за шт. (база ${p.sellPrice})</div>
      <div class="item-qty">${qty} шт. = 🪙 ${qty * price}</div></div>
      <button class="item-action sell" data-action="sell" data-id="${id}">Продать всё</button></div>`;
  }).join('') : '<div class="empty-state"><span class="big-emoji">📦</span>Амбар пуст.<br>Соберите урожай или продукцию животных.</div>';
}

function renderShop() {
  $('#shop-seeds').innerHTML = CROPS.map(c => `
    <div class="item-card"><div class="item-emoji">${c.emoji}</div>
      <div class="item-info"><div class="item-name">${c.name}</div>
      <div class="item-desc">Рост ${formatDuration(c.growSeconds)} · продажа ~🪙 ${Math.round(c.sellPrice * state.marketMult)}</div></div>
      <button class="item-action buy" data-action="buy-seed" data-id="${c.id}" ${state.coins < c.seedPrice ? 'disabled' : ''}>🪙 ${c.seedPrice}</button></div>`).join('');

  $('#shop-animals').innerHTML = ANIMALS.map(a => `
    <div class="item-card"><div class="item-emoji">${a.emoji}</div>
      <div class="item-info"><div class="item-name">${a.name}</div>
      <div class="item-desc">${a.productEmoji} через ${formatDuration(a.produceSeconds)} · корм 🪙 ${a.feedPrice}</div></div>
      <button class="item-action buy" data-action="buy-animal" data-id="${a.id}" ${state.coins < a.price ? 'disabled' : ''}>🪙 ${a.price}</button></div>`).join('');

  $('#shop-misc').innerHTML = MISC_ITEMS.map(m => `
    <div class="item-card"><div class="item-emoji">${m.emoji}</div>
      <div class="item-info"><div class="item-name">${m.name}</div><div class="item-desc">${m.desc}</div></div>
      <button class="item-action buy" data-action="buy-misc" data-id="${m.id}" ${state.coins < m.price ? 'disabled' : ''}>🪙 ${m.price}</button></div>`).join('');
}

function renderAnimals() {
  if (!state.animals.length) {
    $('#animal-list').innerHTML = '<div class="empty-state"><span class="big-emoji">🐄</span>Животных пока нет.<br>Купите их в магазине — они дадут продукцию по таймеру.</div>';
    $('#btn-feed-all').style.display = 'none';
    return;
  }
  $('#animal-list').innerHTML = state.animals.map(a => {
    const info = getAnimal(a.type);
    let status, btn;
    const ready = a.readyAt && a.readyAt <= now();
    if (ready) {
      status = '✅ Продукция готова!';
      btn = `<button class="item-action sell" data-action="collect" data-id="${a.uid}">🧺 Собрать</button>`;
    } else if (a.fed) {
      status = `⏳ <span data-timer="animal-${a.uid}">${formatTime(a.readyAt - now())}</span> до продукции`;
      btn = '<button class="item-action" disabled>✓ Сыта</button>';
    } else {
      status = 'Голодна — покормите';
      btn = `<button class="item-action feed" data-action="feed" data-id="${a.uid}">🌾 Кормить · 🪙 ${info.feedPrice}</button>`;
    }
    return `<div class="item-card"><div class="item-emoji">${info.emoji}</div>
      <div class="item-info"><div class="item-name">${info.name}</div><div class="item-desc">${status}</div></div>${btn}</div>`;
  }).join('');
  $('#btn-feed-all').style.display = state.animals.some(a => !a.fed) ? '' : 'none';
}

function renderAchievements() {
  $('#ach-count').textContent = `${state.achievements.length} / ${ACHIEVEMENTS.length}`;
  $('#ach-fill').style.width = `${(state.achievements.length / ACHIEVEMENTS.length) * 100}%`;
  $('#ach-list').innerHTML = ACHIEVEMENTS.map(a => {
    const got = state.achievements.includes(a.id);
    return `<div class="ach-card ${got ? 'unlocked' : ''}"><div class="ach-icon">${a.icon}</div>
      <div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>
      <div class="ach-check">${got ? '✅' : '🔒'}</div></div>`;
  }).join('');
  const s = state.stats;
  $('#stats-grid').innerHTML = [
    ['📅', s.daysPlayed, 'дней на ферме'], ['🧺', s.harvested, 'собрано урожаев'],
    ['⚡', s.instantGrows, 'ускорений роста'], ['📋', s.tasksDone, 'заданий выполнено'],
    ['🪙', s.earned, 'заработано'], ['⭐', state.level, 'уровень фермера'],
  ].map(([i, v, l]) => `<div class="stat-card"><strong>${i} ${v}</strong><small>${l}</small></div>`).join('');
}

function renderQuests() {
  if (!state.tasks.length) generateTasks();
  $('#quest-list').innerHTML = state.tasks.map(t => {
    const done = t.progress >= t.target;
    return `<div class="quest-card ${done ? 'done' : ''}">
      <div class="quest-top"><span class="quest-icon">${t.icon}</span>
        <span class="quest-name">${t.label} ${t.progress}/${t.target}</span>
        <span class="quest-reward">+${t.coins}🪙 +${t.xp}XP</span></div>
      <div class="quest-bar"><i style="width:${(t.progress / t.target) * 100}%"></i></div>
      <div class="quest-bottom"><span>${t.claimed ? '✅ Награда получена' : (done ? '🎉 Можно забрать!' : 'Выполняется…')}</span>
        <button class="quest-claim" data-action="claim-task" data-id="${t.uid}" ${(!done || t.claimed) ? 'disabled' : ''}>${t.claimed ? 'Получено' : 'Забрать'}</button></div></div>`;
  }).join('');
}

function renderSettings() {
  $('#set-sound').checked = state.settings.sound;
  $('#set-animations').checked = state.settings.animations;
  document.body.classList.toggle('no-animations', !state.settings.animations);
}

function renderAll() {
  renderHUD(); renderSeedPicker(); renderField(); renderTilePanel();
  renderBarn(); renderShop(); renderAnimals(); renderAchievements(); renderQuests(); renderSettings();
  updateTimers();
}

function switchScreen(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.screen === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- События ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;
  const index = Number(el.dataset.index);
  switch (action) {
    case 'tile': tileClick(index); break;
    case 'harvest': harvestTile(index); break;
    case 'water': waterTile(index); break;
    case 'boost': boostTile(index); break;
    case 'fertilize': fertilizeTile(index); break;
    case 'clear': clearTile(index); break;
    case 'select-seed':
    case 'select-seed-go':
      selectedSeed = id; renderSeedPicker(); switchScreen('field');
      if (action === 'select-seed-go') toast(`Выбраны семена: ${getCrop(id).name}`);
      break;
    case 'buy-seed': buySeed(id); break;
    case 'buy-animal': buyAnimal(id); break;
    case 'buy-misc': buyMisc(id); break;
    case 'feed': feedAnimal(Number(id)); break;
    case 'collect': collectAnimal(Number(id)); break;
    case 'sell': sellProduct(id, true); break;
    case 'claim-task': claimTask(Number(id)); break;
  }
});

$$('.tab').forEach(tab => tab.addEventListener('click', () => switchScreen(tab.dataset.screen)));
$('#btn-next-day').addEventListener('click', restGame);
$('#btn-expand').addEventListener('click', expandField);
$('#btn-feed-all').addEventListener('click', feedAll);
$('#btn-help').addEventListener('click', showHelp);
$('#btn-save').addEventListener('click', () => { saveGame(); toast('💾 Игра сохранена', 'success'); });
$('#btn-reset').addEventListener('click', resetGame);
$('#modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });
$('#set-sound').addEventListener('change', e => { state.settings.sound = e.target.checked; saveGame(); if (e.target.checked) playSound('coin'); });
$('#set-animations').addEventListener('change', e => {
  state.settings.animations = e.target.checked;
  document.body.classList.toggle('no-animations', !e.target.checked);
  saveGame();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

// ---------- Запуск ----------
function init() {
  state = loadGame() || createNewGame();
  state.marketMult = marketForDay(state.day);
  regenEnergy();
  generateTasks();
  renderAll();
  saveGame();
  lastReadySig = state.tiles.map((t, i) => i < state.unlockedTiles && tileReady(t) ? '1' : '0').join('')
    + '|' + state.animals.map(a => a.readyAt && a.readyAt <= now() ? '1' : '0').join('');
  tickTimer = setInterval(tick, 250);
  if (!state.tutorialSeen) {
    state.tutorialSeen = true;
    saveGame();
    showHelp();
  } else {
    const ready = state.tiles.filter((t, i) => i < state.unlockedTiles && tileReady(t)).length;
    if (ready) toast(`✅ Готово к сбору: ${ready} культур`, 'success');
    else toast('💾 Прогресс загружен', 'success');
  }
}

init();
