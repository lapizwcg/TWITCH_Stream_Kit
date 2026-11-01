// ОБЩЕЕ ДЛЯ ДОК-ПАНЕЛИ И ОВЕРЛЕЕВ: настройки и связь без сервера. Док-панель (dock.html) — меню настроек, источники-браузеры
// (index.html) — показы. В OBS док и источники — один браузер с одним адресом: настройки лежат в localStorage, изменения и
// тестовые показы идут по BroadcastChannel (и событием storage — на случай, если канала нет)

const KEY = 'kit.settings';
const BUS = 'kit.bus';

// оформление окошка по умолчанию: цвета — материал@тон (только материалы движка), углы по часовой tl tr br bl (round | bevel |
// rect) и сила, эффект появления: места (l+r tl+br bl+tr t+b center circle), набор частиц, размер (%), материал частиц ('' — свой)
export const STYLE = {
  accent: 'citrine@0.85', text: 'pearl@0.95', bg: 'obsidian@0.12', border: 'c_azure@0.7', fill: 'c_azure@0.6',
  corners: ['round', 'round', 'round', 'round'], corner: 16,
  // шрифты заголовка и текста — id из data/fonts.json
  head: 'noto', font: 'noto',
  // размер заголовка и текста (проценты обычного) и разрядка — прибавка между буквами (проценты кегля)
  headSize: 100, textSize: 100, headTrack: 0, textTrack: 0,
  // обводка текста: style none | solid | soft | neon | shadow | double | extrude, материал, толщина (точки при 1080), к заголовку / к тексту
  stroke: { style: 'solid', color: 'obsidian@0.05', width: 2, head: false, text: true },
  fx: { at: ['l+r'], set: 'boom', size: 100, mat: '' },
};
const style = () => structuredClone(STYLE);

// логотипы канала (векторные, logos/<id>.svg): обложка мини-карты, табличка, водяной знак — каждый в трёх цветах; w, h — родной
// размер рисунка (соотношение сторон)
export const LOGOS = [
  ['Обложка мини-карты', [['cover', 'Основная', 400, 370], ['cover_blue', 'Синяя', 400, 370], ['cover_emerald', 'Изумрудная', 400, 370]]],
  ['Табличка', [['plaque', 'Основная', 1200, 400], ['plaque_blue', 'Синяя', 1200, 400], ['plaque_emerald', 'Изумрудная', 1200, 400]]],
  ['Водяной знак', [['watermark', 'Основной', 1200, 340], ['watermark_blue', 'Синий', 1200, 340], ['watermark_emerald', 'Изумрудный', 1200, 340]]],
];
export const logoOf = (id) => LOGOS.flatMap(([, list]) => list).find(([v]) => v === id) || LOGOS[0][1][0];

// вырез рамки эфира для того, что рисуется не в движке (логотип): поле от края экрана до линии выреза — точки при высоте 1080;
// считается как в Frame.Load (src/Kit/Frame.cs) — меняются вместе
export function frameInset(f) {
  if (!f?.on) return 0;
  const num = (v, def, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : def));
  const width = num(f.width, 36, 0, 200), margin = num(f.margin, 0, 0, 200), line = num(f.line, 2, 0, 16);
  const scale = num(f.scale, 100, 30, 300) / 100;
  // место под узор у края экрана (Frame.Reach)
  const reach = line <= 0 ? 0 : f.style === 'plain' ? line : 13 * scale + line * 1.2;
  return Math.max(margin + width, reach) + line / 2;
}

// ранги челленджа — тиры Альбиона: ранг — тир сета, который носишь; задания ранга — что сделать, чтобы подняться на следующий.
// Задания — то, что видно в игре: открытые тиры сбора и переработки, мастерство на доске судьбы, слава по видам (окно статистики
// персонажа), свой сет; заданий на зоны нет. Задания показывает только страница правил (rules.html); док берёт отсюда названия
// рангов, ранг в нём выбирается вручную
export const RANKS = [
  { id: 'Т1', name: 'Новичок', items: 'Пройти обучение\nСвои инструменты Т2 на все пять видов сбора: руда, дерево, волокно, шкуры, камень\nСвой сет Т2: оружие, шлем, броня, обувь\nСлава всего: 10 000' },
  { id: 'Т2', name: 'Ученик', items: 'Т3 открыт во всех пяти видах сбора\nПереработка Т3 открыта для всех пяти ресурсов\nСвой сет Т3: оружие, шлем, броня, обувь, сумка\nСвои инструменты Т3 на все пять видов сбора\nСвоя еда\nСлава всего: 60 000, крафт: 15 000, PvE: 15 000' },
  { id: 'Т3', name: 'Подмастерье', items: 'Т4 (Адепт) открыт во всех пяти видах сбора\nПереработка Т4 открыта для всех пяти ресурсов\nСвой сет Т4: оружие, вторая рука, шлем, броня, обувь, сумка, плащ\nСвои инструменты Т4 на все пять видов сбора\nСвои зелья: лечения и энергии\nЛичный остров\nСлава всего: 350 000, крафт: 80 000, PvE: 80 000' },
  { id: 'Т4', name: 'Адепт', items: 'Т5 (Эксперт) открыт в трёх видах сбора\nПереработка Т5 открыта для всех пяти ресурсов\nСвой сет Т5 целиком, свои инструменты Т5\nМастерство своей линии оружия на доске судьбы: 30\nФерма и пастбище на острове: первый урожай и первое выращенное животное\nМаунт своего выращивания: верховая лошадь или бык\nСлава всего: 1 200 000, крафт: 300 000, PvE: 300 000' },
  { id: 'Т5', name: 'Эксперт', items: 'Т6 (Мастер) открыт в двух видах сбора, Т5 — во всех пяти\nПереработка Т6 открыта для всех пяти ресурсов\nСвой сет Т6 целиком, хотя бы одна вещь зачарована (.1)\nМастерство линии оружия: 50, мастерство крафта своей брони: 50\nАртефактная вещь своего крафта\nМаунт Т5 или выше своего выращивания\nСлава всего: 4 000 000, крафт: 1 000 000, PvE: 1 000 000' },
  { id: 'Т6', name: 'Мастер', items: 'Т7 (Грандмастер) открыт в одном виде сбора, Т6 — в трёх\nПереработка Т7 открыта для всех пяти ресурсов\nСвой сет Т7 целиком или равный по силе: 6.1, 5.2\nМастерство линии оружия: 70, мастерство крафта брони: 70, специализация своего оружия: 50\nФракционный маунт\nСлава всего: 10 000 000, крафт: 2 500 000, PvE: 2 500 000' },
  { id: 'Т7', name: 'Грандмастер', items: 'Т8 (Старейшина) открыт в одном виде сбора, Т7 — в двух\nПереработка Т8 открыта хотя бы для одного ресурса\nСвой сет Т8 целиком или равный по силе: 7.1, 6.2, 5.3, 4.4\nМастерство линии оружия: 100, мастерство крафта брони: 100\nМаунт Т7 или выше своего выращивания\nСлава всего: 25 000 000, крафт: 6 000 000, PvE: 6 000 000' },
  { id: 'Т8', name: 'Старейшина', items: '' },
];

export const DEFAULTS = {
  // pad — отступ от края экрана (точки при высоте 1080), sx/sy — размер по X и по Y (проценты), inner — внутренний отступ
  // (проценты высоты кадра); то же у цели
  follow: { on: true, pos: 'c', title: 'НОВЫЙ ФОЛЛОУЕР', seconds: 4, pad: 70, sx: 100, sy: 100, inner: 1, look: style() },
  // анонсы: on — по таймеру раз в every минут; output — overlay | chat | both; messages — по одному на строку, по очереди
  announce: {
    on: false, output: 'overlay', messages: 'Подписывайтесь на канал!', every: 15,
    title: 'АНОНС', seconds: 8, pos: 't', pad: 70, sx: 100, sy: 100, inner: 1, look: style(),
  },
  // source: followers | subs — счёт ведёт Twitch (нужен вход в доке), manual — вручную
  // style: ltr rtl ttb btt radial — вид прогресса
  // рамка эфира: толщина, отступ от края, непрозрачность фона (%), линия по краю выреза; внутренние углы
  // (round bevel rect scoop notch) и их размер; стиль — esports (киберспорт), blades (клинки), panels (панели),
  // plain (одна линия) — только чёткие фигуры, без свечения; scale — размер узора (%), сам по себе; точки при 1080
  // логотип поверх всего (например, закрыть мини-карту): место из девяти, ширина и сдвиг — точки кадра при высоте 1080,
  // непрозрачность (%). При включённой рамке эфира — внутри выреза, как и окошки (сдвиг — от края выреза)
  logo: { on: false, file: 'cover', pos: 'br', size: 400, dx: 0, dy: 0, opacity: 100 },
  frame: {
    on: false, style: 'esports', width: 36, margin: 0, opacity: 35, line: 2, scale: 100,
    corners: ['bevel', 'bevel', 'bevel', 'bevel'], corner: 24,
    look: { bg: 'obsidian@0.12', border: 'citrine@0.75' },
  },
  goal: { on: true, pos: 'b', title: 'ЦЕЛЬ: ФОЛЛОВЕРЫ', source: 'followers', current: 0, target: 100, style: 'ltr', pad: 50, sx: 100, sy: 100, inner: 1, look: style() },
  // челлендж «Альбион: Соло Левелинг без рынка»: rank — номер в RANKS (выбирается в доке вручную); счётчики; log — журнал, новые
  // сверху: { t: время, day, kind: 'vio' | 'ach' | 'rank', text }. Карточки — окошком анонса со своим заголовком
  challenge: {
    rank: 0,
    day: 1, deaths: 0, kills: 0,
    log: [],
    cards: true, achTitle: 'ДОСТИЖЕНИЕ', vioTitle: 'НАРУШЕНИЕ', rankTitle: 'НОВЫЙ РАНГ',
    // статистика из игры: AoMarket --stats-port (AO-Auras) на этом компьютере; смерти и убийства прибавляются к счётчикам сами,
    // карточки «СМЕРТЬ» / «УБИЙСТВО»; sync — последние увиденные счёты AoMarket ({ since, deaths, kills }), от них считается прибавка
    statsOn: true, statsPort: 8790, gameCards: true, deathTitle: 'СМЕРТЬ', killTitle: 'УБИЙСТВО', sync: null,
  },
};

export function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {}
  // новые разделы и поля появляются со значениями по умолчанию, сохранённое — поверх
  const out = {};
  for (const [part, def] of Object.entries(DEFAULTS)) out[part] = { ...def, ...(saved[part] || {}) };
  // прежние версии хранили в доке свой список рангов (с вехами E–S или Т1–Т8): ранг — по id, иначе с начала
  const c = out.challenge;
  if (c.ranks) {
    c.rank = Math.max(0, RANKS.findIndex((r) => r.id === c.ranks[c.rank]?.id));
    delete c.ranks; delete c.ranksVer; delete c.done; delete c.goal;
  }
  return out;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

// сообщения: { type: 'settings', settings } | { type: 'alert', kind, name } — настоящее событие канала или тест из дока |
// { type: 'card', title, text } — карточка челленджа окошком анонса |
// { type: 'goalTest', frac } — тест цели | { type: 'ping' } | { type: 'pong', page }
export function createBus(onMessage) {
  const seen = new Set();
  const deliver = (msg) => {
    if (!msg || seen.has(msg.id)) return;
    seen.add(msg.id);
    if (seen.size > 200) seen.delete(seen.values().next().value);
    onMessage(msg);
  };
  let channel = null;
  try {
    channel = new BroadcastChannel(BUS);
    channel.onmessage = (e) => deliver(e.data);
  } catch {}
  addEventListener('storage', (e) => {
    if (e.key !== BUS || !e.newValue) return;
    try {
      deliver(JSON.parse(e.newValue));
    } catch {}
  });
  return {
    send(type, payload = {}) {
      const msg = { id: crypto.randomUUID(), type, ...payload };
      seen.add(msg.id);
      channel?.postMessage(msg);
      try {
        localStorage.setItem(BUS, JSON.stringify(msg));
      } catch {}
    },
  };
}
