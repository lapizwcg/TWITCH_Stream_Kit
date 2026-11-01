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

// анонс по умолчанию; id — чтобы док различал анонсы при правке списка (таймер каждого — свой)
export function announceItem(name = 'Анонс', output = 'overlay', messages = 'Подписывайтесь на канал!', every = 15) {
  return { id: crypto.randomUUID(), name, on: false, output, messages, every, title: '' };
}
const RULES_MSG = 'Челлендж «Соло Левелинг без рынка»: без рынка, без помощи игроков, всё своим крафтом. Правила: https://lapizwcg.github.io/TWITCH_Stream_Kit/rules.html';

export const DEFAULTS = {
  // pad — отступ от края экрана (точки при высоте 1080), sx/sy — размер по X и по Y (проценты), inner — внутренний отступ
  // (проценты высоты кадра); то же у цели
  follow: { on: true, pos: 'c', title: 'НОВЫЙ ФОЛЛОУЕР', seconds: 4, pad: 70, sx: 100, sy: 100, inner: 1, look: style() },
  // анонсы: items — несколько, у каждого своё: name — название в доке, on — по таймеру раз в every минут, output — overlay | chat |
  // both, messages — по одному на строку, по очереди, title — заголовок карточки ('' — общий title). Окошко в оверлее (заголовок
  // по умолчанию, время, место, размер, оформление) — общее для всех
  announce: {
    items: [announceItem('Подписка'), announceItem('Правила челленджа', 'chat', RULES_MSG, 20)],
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
  // челлендж «Альбион: Соло Левелинг без рынка» (правила — rules.html): счётчики дня, смертей и убийств
  challenge: {
    day: 1, deaths: 0, kills: 0,
    // статистика из игры: AoMarket --stats-port (AO-Auras) на этом компьютере; смерти и убийства прибавляются к счётчикам сами,
    // карточки «СМЕРТЬ» / «УБИЙСТВО»; sync — последние увиденные счёты AoMarket ({ since, deaths, kills }), от них считается прибавка
    statsOn: true, statsPort: 8790, gameCards: true, deathTitle: 'СМЕРТЬ', killTitle: 'УБИЙСТВО', sync: null,
  },
  // таблички в оверлее (src/Kit/Board.cs). badge — карточка челленджа, всегда на экране: заголовок и текст, в тексте {day} {deaths}
  // {kills} — счётчики челленджа, строки — через перевод строки. stats — статистика, показывают и прячут кнопкой: rows — какие строки
  // (ключи STAT_ROWS) по порядку
  badge: { on: true, pos: 'tl', title: 'СОЛО ЛЕВЕЛИНГ БЕЗ РЫНКА', text: 'ДЕНЬ {day}', pad: 20, sx: 100, sy: 100, inner: 1, look: style() },
  stats: {
    on: false, pos: 'r', title: 'СТАТИСТИКА', rows: ['kills', 'deaths', 'silverEarned', 'silverSpent', 'fameCrafting', 'fameGathering', 'famePve', 'famePvp'],
    pad: 20, sx: 100, sy: 100, inner: 1, look: style(),
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
  // один анонс прежних версий (on, output, messages, every) — первым в списке, рядом — анонс правил челленджа (выключен)
  const an = out.announce;
  if (!saved.announce?.items && saved.announce?.messages !== undefined) {
    const old = saved.announce;
    an.items = [{ ...announceItem('Анонс', old.output, old.messages, old.every), on: !!old.on }, announceItem('Правила челленджа', 'chat', RULES_MSG, 20)];
  }
  for (const k of ['on', 'output', 'messages', 'every']) delete an[k];
  // ранги, достижения, нарушения и журнал челленджа убраны — их поля из прежних версий не храним
  for (const k of ['rank', 'ranks', 'ranksVer', 'done', 'goal', 'rankTitle', 'log', 'cards', 'achTitle', 'vioTitle']) delete out.challenge[k];
  return out;
}

// строки статистики: ключ, подпись, откуда значение — счётчик челленджа (c) или счёт сессии AoMarket (g, путь в ответе)
export const STAT_ROWS = [
  ['kills', 'Убийства', 'c'], ['deaths', 'Смерти', 'c'], ['day', 'День', 'c'],
  ['silverEarned', 'Серебро получено', 'g'], ['silverSpent', 'Серебро потрачено', 'g'], ['silver', 'Серебро итого', 'g'],
  ['fame', 'Слава за сессию', 'g'], ['fameCrafting', 'Слава крафта', 'g'], ['fameGathering', 'Слава сбора', 'g'],
  ['famePve', 'Слава PvE', 'g'], ['famePvp', 'Слава PvP', 'g'], ['crafts', 'Крафтов', 'g'], ['harvests', 'Сборов', 'g'],
  ['totals.fame', 'Слава персонажа', 'g'],
];

// число с пробелами между тысячами (обычный пробел: в шрифтах движка узкого может не быть); нет значения — прочерк
export const fmtNum = (v) => (v == null || !Number.isFinite(+v) ? '—' : (Math.round(v) < 0 ? '-' : '') + String(Math.abs(Math.round(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));

// строки табличек для оверлея (Board.cs): название и значение через табуляцию, строки — через перевод строки
export function boardRows(s, game) {
  const c = s.challenge;
  const badge = String(s.badge.text || '').replace(/\{(day|deaths|kills)\}/g, (_, k) => fmtNum(c[k]));
  const stats = (s.stats.rows || [])
    .map((k) => STAT_ROWS.find((r) => r[0] === k))
    .filter(Boolean)
    .map(([k, label, from]) => `${label}\t${fmtNum(from === 'c' ? c[k] : game ? k.split('.').reduce((o, p) => o?.[p], game) : null)}`)
    .join('\n');
  return { badge, stats };
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

// сообщения: { type: 'settings', settings } | { type: 'alert', kind, name } — настоящее событие канала или тест из дока |
// { type: 'card', title, text } — карточка окошком анонса со своим заголовком | { type: 'game', game } — счёт сессии AoMarket из дока
// (для статистики в оверлее) |
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
