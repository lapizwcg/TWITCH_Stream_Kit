// ОБЩЕЕ ДЛЯ ДОК-ПАНЕЛИ И ОВЕРЛЕЕВ: настройки и связь без сервера. Док-панель (dock.html) — меню настроек, источники-браузеры
// (index.html) — показы. В OBS док и источники — один браузер с одним адресом: настройки лежат в localStorage, изменения и
// тестовые показы идут по BroadcastChannel (и событием storage — на случай, если канала нет)

const KEY = 'kit.settings';
const BUS = 'kit.bus';

export const DEFAULTS = {
  // pad — отступ от края экрана (точки при высоте 1080), sx/sy — размер по X и по Y (проценты), inner — внутренний отступ
  // (проценты высоты кадра); то же у цели
  follow: { on: true, pos: 'c', title: 'НОВЫЙ ФОЛЛОУЕР', seconds: 4, pad: 70, sx: 100, sy: 100, inner: 1 },
  // анонсы: on — по таймеру раз в every минут; output — overlay | chat | both; messages — по одному на строку, по очереди
  announce: {
    on: false, output: 'overlay', messages: 'Подписывайтесь на канал!', every: 15,
    title: 'АНОНС', seconds: 8, pos: 't', pad: 70, sx: 100, sy: 100, inner: 1,
  },
  // source: followers | subs — счёт ведёт Twitch (нужен вход в доке), manual — вручную
  // style: ltr rtl ttb btt radial — вид прогресса
  goal: { on: true, pos: 'b', title: 'ЦЕЛЬ: ФОЛЛОВЕРЫ', source: 'followers', current: 0, target: 100, style: 'ltr', pad: 50, sx: 100, sy: 100, inner: 1 },
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
