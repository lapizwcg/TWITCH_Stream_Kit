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
  // непрозрачность (%). Рамка эфира его не сдвигает — встаёт ровно туда, куда задано
  logo: { on: false, file: 'cover', pos: 'br', size: 400, dx: 0, dy: 0, opacity: 100 },
  frame: {
    on: false, style: 'esports', width: 36, margin: 0, opacity: 35, line: 2, scale: 100,
    corners: ['bevel', 'bevel', 'bevel', 'bevel'], corner: 24,
    look: { bg: 'obsidian@0.12', border: 'citrine@0.75' },
  },
  goal: { on: true, pos: 'b', title: 'ЦЕЛЬ: ФОЛЛОВЕРЫ', source: 'followers', current: 0, target: 100, style: 'ltr', pad: 50, sx: 100, sy: 100, inner: 1, look: style() },
  // челлендж «Альбион: Соло Левелинг без рынка»: rank — номер в ranks, у ранга вехи (по одной на строку, правятся в доке);
  // done — отмеченные вехи («E|текст вехи»: правка списка не сдвигает отметки); счётчики; log — журнал, новые сверху:
  // { t: время, day, kind: 'vio' | 'ach' | 'rank', text }. Карточки — окошком анонса со своим заголовком; goal — прогресс ранга
  // ведёт цель (счёт вручную: «РАНГ D · 1/3»)
  challenge: {
    rank: 0,
    ranks: [
      { id: 'E', name: 'Голые руки', items: 'Первый крафт\nПолный сет Т3 своими руками' },
      { id: 'D', name: 'Ремесленник', items: 'Полный сет Т4\nПервый соло-данж\nПокупка острова' },
      { id: 'C', name: 'Свой транспорт', items: 'Первый выращенный маунт\nСет Т5\nВыход в жёлтую зону' },
      { id: 'B', name: 'Опасные земли', items: 'Сет Т6\nСбор в красной зоне' },
      { id: 'A', name: 'Мастер', items: 'Сет Т7\nВылазка в чёрную зону\nФракционный маунт' },
      { id: 'S', name: 'Монарх', items: 'Полный сет Т8 или зачарованный, весь скрафченный самим' },
    ],
    done: [],
    day: 1, deaths: 0, kills: 0,
    log: [],
    cards: true, achTitle: 'ДОСТИЖЕНИЕ', vioTitle: 'НАРУШЕНИЕ', rankTitle: 'НОВЫЙ РАНГ',
    goal: false,
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
