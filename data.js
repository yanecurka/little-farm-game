/* ============================================================
   data.js — данные игры v2 (баланс, культуры, животные, задания)
   ============================================================ */

// growSeconds — время созревания в реальном времени
// growDays — только для миграции старых сохранений v1
const CROPS = [
  { id: 'carrot',     name: 'Морковь',  emoji: '🥕', seedEmoji: '🌰', seedPrice: 10, sellPrice: 24,  growSeconds: 25,  growDays: 1 },
  { id: 'wheat',      name: 'Пшеница',  emoji: '🌾', seedEmoji: '🌰', seedPrice: 18, sellPrice: 44,  growSeconds: 50,  growDays: 2 },
  { id: 'tomato',     name: 'Помидор',  emoji: '🍅', seedEmoji: '🌰', seedPrice: 30, sellPrice: 78,  growSeconds: 90,  growDays: 3 },
  { id: 'pumpkin',    name: 'Тыква',    emoji: '🎃', seedEmoji: '🌰', seedPrice: 48, sellPrice: 138, growSeconds: 150, growDays: 4 },
  { id: 'strawberry', name: 'Клубника', emoji: '🍓', seedEmoji: '🌰', seedPrice: 75, sellPrice: 230, growSeconds: 240, growDays: 5 },
];

const ANIMALS = [
  { id: 'chicken', name: 'Курица', emoji: '🐔', price: 90,  feedPrice: 8,  product: 'egg',  productName: 'Яйца',   productEmoji: '🥚', productPrice: 26, produceSeconds: 40 },
  { id: 'cow',     name: 'Корова', emoji: '🐄', price: 210, feedPrice: 16, product: 'milk', productName: 'Молоко', productEmoji: '🥛', productPrice: 62, produceSeconds: 70 },
  { id: 'sheep',   name: 'Овца',   emoji: '🐑', price: 300, feedPrice: 22, product: 'wool', productName: 'Шерсть', productEmoji: '🧶', productPrice: 96, produceSeconds: 100 },
];

const PRODUCTS = {};
ANIMALS.forEach(a => {
  PRODUCTS[a.product] = { id: a.product, name: a.productName, emoji: a.productEmoji, sellPrice: a.productPrice };
});
CROPS.forEach(c => {
  PRODUCTS[c.id] = { id: c.id, name: c.name, emoji: c.emoji, sellPrice: c.sellPrice };
});

// speed — множитель скорости роста при посадке
const WEATHER = [
  { id: 'sunny',  name: 'Солнечно', icon: '☀️', desc: 'Обычная скорость роста',        speed: 1.00, weight: 50 },
  { id: 'rain',   name: 'Дождь',    icon: '🌧️', desc: 'Растения растут на 25% быстрее', speed: 1.25, weight: 28 },
  { id: 'cloudy', name: 'Облачно',  icon: '⛅', desc: 'Рост на 12% быстрее',            speed: 1.12, weight: 22 },
];

const FIELD_UPGRADES = [
  { tiles: 10, price: 140 },
  { tiles: 13, price: 340 },
  { tiles: 16, price: 700 },
];

const MISC_ITEMS = [
  { id: 'energy',     name: 'Энергия+',   emoji: '⚡', price: 35, desc: 'Мгновенно +40 энергии' },
  { id: 'fertilizer', name: 'Удобрение',  emoji: '🧪', price: 45, desc: 'Срезает 40% времени роста и даёт +1 урожай' },
];

const ACHIEVEMENTS = [
  { id: 'first_harvest', icon: '🌱', name: 'Первый урожай',     desc: 'Соберите первый урожай' },
  { id: 'harvest_10',    icon: '🧺', name: 'Упорный садовник',  desc: 'Соберите 10 урожаев' },
  { id: 'harvest_50',    icon: '👨‍🌾', name: 'Мастер фермы',      desc: 'Соберите 50 урожаев' },
  { id: 'first_animal',  icon: '🐔', name: 'Первый житель',     desc: 'Купите первое животное' },
  { id: 'day_7',         icon: '📅', name: 'Неделя на ферме',    desc: 'Проживите 7 дней' },
  { id: 'coins_1000',    icon: '💰', name: 'Тысячник',           desc: 'Накопите 1000 монет одновременно' },
  { id: 'all_crops',     icon: '🌈', name: 'Разнообразие',       desc: 'Посадите все 5 видов культур' },
  { id: 'full_field',    icon: '🗺️', name: 'Вся земля в деле',   desc: 'Засадите все 16 участков' },
  { id: 'instant_10',    icon: '⚡', name: 'Скорость — всё',     desc: 'Ускорите рост 10 раз' },
  { id: 'tasks_10',      icon: '📋', name: 'Ответственный',      desc: 'Выполните 10 заданий' },
];

// Шаблоны ежедневных заданий
const TASK_TEMPLATES = [
  { type: 'harvest', icon: '🧺', targets: [3, 5, 8],  coins: [35, 55, 80], xp: 12 },
  { type: 'water',   icon: '💧', targets: [2, 4, 6],  coins: [25, 45, 65], xp: 10 },
  { type: 'plant',   icon: '🌱', targets: [2, 4, 6],  coins: [25, 45, 65], xp: 10 },
  { type: 'feed',    icon: '🌾', targets: [1, 2, 3],  coins: [30, 50, 70], xp: 12 },
  { type: 'sell',    icon: '🪙', targets: [2, 4, 6],  coins: [30, 50, 75], xp: 12 },
  { type: 'instant', icon: '⚡', targets: [1, 2, 3],  coins: [35, 60, 90], xp: 15 },
];

const TASK_LABELS = {
  harvest: 'Собрать урожаев',
  water: 'Полить растений',
  plant: 'Посадить семян',
  feed: 'Покормить животных',
  sell: 'Продать товаров',
  instant: 'Ускорить рост',
};

// === Улучшения за изумруды (премиальная валюта, зарабатывается бесплатно) ===
// costs — массив цен по уровням; длина массива = максимальный уровень
const UPGRADES = [
  { id: 'autoHarvest', icon: '🧺', name: 'Автосбор урожая',
    desc: 'Спелые культуры собираются сами каждые 5 секунд.',
    detail: 'Уровень 2: собранные участки сразу засаживаются выбранными семенами.',
    costs: [15, 30] },
  { id: 'autoCollect', icon: '🥚', name: 'Автосбор продукции',
    desc: 'Продукцию животных можно не собирать вручную.',
    detail: 'Уровень 2: животные дают двойную продукцию.',
    costs: [10, 20] },
  { id: 'autoFeed', icon: '🌾', name: 'Автокормление',
    desc: 'Голодные животные кормятся сами каждые 15 секунд.',
    detail: 'Уровень 2: корм становится бесплатным.',
    costs: [12, 35] },
  { id: 'energyRegen', icon: '⚡', name: 'Быстрая энергия',
    desc: 'Энергия восстанавливается заметно быстрее.',
    detail: 'Уровень 1: +1 раз в 10 сек · Уровень 2: +1 раз в 5 сек.',
    costs: [12, 30] },
  { id: 'maxEnergy', icon: '🔋', name: 'Ёмкость энергии',
    desc: '+30 к максимальному запасу энергии за уровень.',
    detail: 'Позволяет делать больше действий подряд.',
    costs: [8, 16, 25] },
  { id: 'growthSpeed', icon: '🌿', name: 'Ускоренный рост',
    desc: 'Все растения растут на 15% быстрее за уровень.',
    detail: 'Старые посадки тоже ускоряются.',
    costs: [10, 20, 35] },
  { id: 'bonusYield', icon: '🧺', name: 'Богатый урожай',
    desc: 'Шанс собрать +1 урожай с каждого растения.',
    detail: 'Уровень 1: +25% шанс · Уровень 2: +50% шанс.',
    costs: [18, 40] },
  { id: 'fieldSlots', icon: '🗺️', name: 'Дополнительная земля',
    desc: '+2 участка к полю за уровень (до 16).',
    detail: 'Открывает новые участки бесплатно.',
    costs: [20, 40] },
  { id: 'offlineAuto', icon: '🌙', name: 'Ночная бригада',
    desc: 'Спелые растения собираются, пока игра закрыта.',
    detail: 'Требует улучшение «Автосбор урожая».',
    costs: [25], requires: 'autoHarvest' },
];

const getUpgrade = id => UPGRADES.find(u => u.id === id);

const getCrop = id => CROPS.find(c => c.id === id);
const getAnimal = id => ANIMALS.find(a => a.id === id);
const getAchievement = id => ACHIEVEMENTS.find(a => a.id === id);
const getProduct = id => PRODUCTS[id];
