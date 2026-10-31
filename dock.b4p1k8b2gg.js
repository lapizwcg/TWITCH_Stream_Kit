// ДОК-ПАНЕЛЬ: поля ↔ настройки. Каждое изменение сразу сохраняется и уходит в открытые оверлеи — в OBS видно без перезагрузки.
// Здесь же — связь с Twitch: вход, события канала (новые фолловеры → оповещение в показ), счёт цели по фолловерам или сабам
import { DEFAULTS, STYLE, loadSettings, saveSettings, createBus } from './kit.js';
import * as Twitch from './twitch.js';

const $ = (id) => document.getElementById(id);
let settings = loadSettings();

// оверлей отвечает на ping — так видно, открыт ли он где-нибудь (источник в OBS или вкладка)
let lastPong = 0;
const bus = createBus((msg) => {
  if (msg.type === 'pong') {
    lastPong = Date.now();
    renderLink();
  }
});
const renderLink = () => {
  const on = Date.now() - lastPong < 5000;
  $('link').classList.toggle('on', on);
  $('link').classList.toggle('off', !on);
  $('link').textContent = on ? 'оверлей подключён' : 'оверлей не найден';
};
setInterval(() => {
  bus.send('ping');
  renderLink();
}, 2000);
bus.send('ping');

function commit() {
  saveSettings(settings);
  bus.send('settings', { settings });
  render();
}

function render() {
  const f = settings.follow;
  $('followOn').checked = f.on;
  for (const b of $('followPos').children) b.classList.toggle('active', b.dataset.pos === f.pos);
  if (document.activeElement !== $('followTitle')) $('followTitle').value = f.title;
  $('followSeconds').value = f.seconds;
  $('followSecondsVal').textContent = `${f.seconds} с`;
  renderSize('follow', f);

  const g = settings.goal;
  $('goalOn').checked = g.on;
  for (const b of $('goalPos').children) b.classList.toggle('active', b.dataset.pos === g.pos);
  for (const b of $('goalStyle').children) b.classList.toggle('active', b.dataset.style === g.style);
  // поле, в котором сейчас печатают, не перезаписываем — курсор не прыгает
  for (const [id, v] of [['goalTitle', g.title], ['goalCurrent', g.current], ['goalTarget', g.target]])
    if (document.activeElement !== $(id)) $(id).value = v;
  $('goalSource').value = g.source;
  renderSize('goal', g);

  const an = settings.announce;
  $('announceOn').checked = an.on;
  $('announceOutput').value = an.output;
  for (const [id, v] of [['announceMessages', an.messages], ['announceTitle', an.title]]) if (document.activeElement !== $(id)) $(id).value = v;
  $('announceEvery').value = an.every;
  $('announceEveryVal').textContent = `каждые ${an.every} мин`;
  $('announceSeconds').value = an.seconds;
  $('announceSecondsVal').textContent = `${an.seconds} с`;
  for (const b of $('announcePos').children) b.classList.toggle('active', b.dataset.pos === an.pos);
  // настройки карточки нужны, только если анонс идёт в оверлей
  for (const el of document.querySelectorAll('#tab-announce [data-overlay]')) el.hidden = an.output === 'chat';
  renderSize('announce', an);
  renderAnnounceNote();
  // оформление — после того как разделы собраны (buildLook)
  if (document.querySelector('[data-look] .mp')) for (const part of LOOK_PARTS) renderLook(part);
  // счёт по Twitch ведётся сам — руками его не трогаем
  const auto = g.source !== 'manual';
  for (const id of ['goalCurrent', 'goalPlus', 'goalMinus', 'goalReset']) $(id).disabled = auto;
  $('goalNote').textContent = !auto
    ? 'Счёт ведёте вы: кнопками или числом.'
    : !helix
      ? 'Войдите через Twitch — счёт будет вестись сам.'
      : g.source === 'subs'
        ? 'Считает Twitch: все сабы канала, новые прибавляются сами.'
        : 'Считает Twitch: все фолловеры канала, новые прибавляются сами.';
}

// ---------- Twitch ----------

let session = null;
let helix = null;
let events = null;
let linkState = '';
const followed = new Set(); // кто уже зафолловил за эту сессию: отписался и снова подписался — второй раз не оповещаем

function showError(text) {
  $('accError').hidden = !text;
  $('accError').textContent = text || '';
}

async function startTwitch() {
  const err = Twitch.consumeRedirect();
  // самая частая ошибка — адреса дока нет в приложении Twitch: показываем, какой именно адрес туда вписать
  if (err)
    showError(
      /redirect/i.test(err)
        ? `Вход не удался: Twitch не знает адрес этой панели. В приложении на dev.twitch.tv → «Управление» → «URL-адреса перенаправления OAuth» должен быть ровно: ${Twitch.redirectUri()} — затем «Сохранить» и подождать пару минут.`
        : `Вход не удался: ${err}`,
    );
  if (!Twitch.isConfigured()) {
    $('login').disabled = true;
    showError('Вход пока не настроен: нужен Client ID приложения Stream Kit на dev.twitch.tv (вписывается в twitch.js).');
    return renderAccount();
  }
  session = await Twitch.restoreSession().catch(() => null);
  if (session && Twitch.SCOPES.some((sc) => !session.scopes.includes(sc))) {
    showError('Входу не хватает прав — войдите ещё раз.');
    session = null;
  }
  if (!session) return renderAccount();
  helix = new Twitch.Helix(session);
  const me = await helix.me().catch(() => null);
  $('accName').textContent = me?.name || session.login;
  if (me?.avatar) $('accAvatar').src = me.avatar;
  events = new Twitch.EventSub(helix, onTwitchEvent, (st) => {
    linkState = st;
    renderAccount();
    if (st === 'connected') syncGoal();
  });
  renderAccount();
  render();
  // поправка счёта раз в две минуты: отписки событием не приходят
  setInterval(syncGoal, 120000);
}

function renderAccount() {
  $('accOut').hidden = !!session;
  $('accIn').hidden = !session;
  const st = $('accStatus');
  const errs = events?.errors?.length ? ` · не всё доступно: ${events.errors.join('; ')}` : '';
  st.textContent = linkState === 'connected' ? `события канала подключены${errs}` : linkState === 'reconnecting' ? 'переподключение…' : 'подключение…';
  st.classList.toggle('ok', linkState === 'connected' && !errs);
}

function onTwitchEvent(e) {
  if (e.type === 'follow') {
    if (!followed.has(e.userId)) {
      followed.add(e.userId);
      bus.send('alert', { kind: 'follow', name: e.name });
    }
    if (settings.goal.source === 'followers') bump();
  } else if (e.type === 'subscribe' && settings.goal.source === 'subs') bump();
}

function bump() {
  settings.goal.current++;
  commit();
}

// счёт цели — с Twitch: при входе, при смене «что считаем» и раз в две минуты
async function syncGoal() {
  const g = settings.goal;
  if (!helix || g.source === 'manual') return;
  try {
    const n = g.source === 'subs' ? await helix.subCount() : await helix.followerCount();
    if (n !== settings.goal.current) {
      settings.goal.current = n;
      commit();
    }
    showError('');
  } catch (e) {
    showError(`Twitch не отдал счёт: ${e.message}`);
  }
}

$('login').onclick = () => Twitch.login();
$('logout').onclick = async () => {
  events?.close();
  await Twitch.logout(session);
  location.reload();
};

// отступ и размер — одинаковые ползунки у каждого показа
function renderSize(pre, part) {
  for (const [key, unit] of [['pad', ' px'], ['sx', '%'], ['sy', '%'], ['inner', '%']]) {
    const id = pre + key[0].toUpperCase() + key.slice(1);
    $(id).value = part[key];
    $(id + 'Val').textContent = part[key] + unit;
  }
}
for (const pre of ['follow', 'goal', 'announce']) {
  for (const key of ['pad', 'sx', 'sy', 'inner'])
    $(pre + key[0].toUpperCase() + key.slice(1)).oninput = (e) => {
      settings[pre][key] = +e.target.value;
      commit();
    };
  $(pre + 'SizeReset').onclick = () => {
    const def = DEFAULTS[pre];
    Object.assign(settings[pre], { pad: def.pad, sx: def.sx, sy: def.sy, inner: def.inner });
    commit();
  };
}

// вкладки
for (const t of document.querySelectorAll('.tab')) {
  t.onclick = () => {
    for (const x of document.querySelectorAll('.tab')) x.classList.toggle('active', x === t);
    for (const p of document.querySelectorAll('.pane')) p.hidden = p.id !== `tab-${t.dataset.tab}`;
  };
}

// фолловеры
$('followOn').onchange = (e) => {
  settings.follow.on = e.target.checked;
  commit();
};
$('followPos').onclick = (e) => {
  const pos = e.target.dataset?.pos;
  if (!pos) return;
  settings.follow.pos = pos;
  commit();
};
$('followTitle').oninput = (e) => {
  settings.follow.title = e.target.value;
  commit();
};
$('followSeconds').oninput = (e) => {
  settings.follow.seconds = +e.target.value;
  commit();
};
// цель
const int = (v, min) => Math.max(min, Math.floor(+v) || 0);
$('goalOn').onchange = (e) => {
  settings.goal.on = e.target.checked;
  commit();
};
$('goalPos').onclick = (e) => {
  const pos = e.target.dataset?.pos;
  if (!pos) return;
  settings.goal.pos = pos;
  commit();
};
$('goalStyle').onclick = (e) => {
  const style = e.target.dataset?.style;
  if (!style) return;
  settings.goal.style = style;
  commit();
};
// тест: заливка на 75% на несколько секунд в показе, сохранённый счёт не меняется
$('goalTest').onclick = () => bus.send('goalTest', { frac: 0.75 });
$('goalTitle').oninput = (e) => {
  settings.goal.title = e.target.value;
  commit();
};
$('goalSource').onchange = (e) => {
  settings.goal.source = e.target.value;
  commit();
  syncGoal();
};
$('goalCurrent').onchange = (e) => {
  settings.goal.current = int(e.target.value, 0);
  commit();
};
$('goalTarget').onchange = (e) => {
  settings.goal.target = int(e.target.value, 1);
  commit();
};
$('goalPlus').onclick = () => {
  settings.goal.current++;
  commit();
};
$('goalMinus').onclick = () => {
  settings.goal.current = Math.max(0, settings.goal.current - 1);
  commit();
};
$('goalReset').onclick = () => {
  settings.goal.current = 0;
  commit();
};

// анонсы: таймер — здесь, в доке (он один на OBS); сообщения по кругу; в оверлей — карточкой через показ, в чат — от имени канала
let annLast = Date.now();
let annIndex = 0;
const annList = () => settings.announce.messages.split('\n').map((s) => s.trim()).filter(Boolean);

function fireAnnounce() {
  const list = annList();
  annLast = Date.now();
  if (!list.length) return;
  const text = list[annIndex++ % list.length];
  const out = settings.announce.output;
  if (out !== 'chat') bus.send('alert', { kind: 'announce', name: text });
  if (out !== 'overlay') {
    if (!helix) showError('Анонс в чат: войдите через Twitch.');
    else helix.sendChat(text).catch((e) => showError(`Анонс в чат не ушёл: ${e.message}`));
  }
  renderAnnounceNote();
}

function renderAnnounceNote() {
  const a = settings.announce;
  const n = annList().length;
  if (!n) return ($('announceNote').textContent = 'Впишите хотя бы одно сообщение.');
  const left = Math.max(0, a.every * 60000 - (Date.now() - annLast));
  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  const chat = a.output !== 'overlay' && !helix ? ' Для чата нужен вход через Twitch.' : '';
  $('announceNote').textContent =
    (a.on ? `Сообщений: ${n}. Следующее через ${mm}:${ss}.` : `Сообщений: ${n}. Таймер выключен — только «Показать сейчас».`) + chat;
}

setInterval(() => {
  const a = settings.announce;
  if (a.on && Date.now() - annLast >= a.every * 60000) fireAnnounce();
  renderAnnounceNote();
}, 1000);

$('announceOn').onchange = (e) => {
  settings.announce.on = e.target.checked;
  // включили — отсчёт с этого момента, а не с открытия дока
  annLast = Date.now();
  commit();
};
$('announceOutput').onchange = (e) => {
  settings.announce.output = e.target.value;
  commit();
};
$('announceMessages').oninput = (e) => {
  settings.announce.messages = e.target.value;
  commit();
};
$('announceEvery').oninput = (e) => {
  settings.announce.every = +e.target.value;
  commit();
};
$('announceTitle').oninput = (e) => {
  settings.announce.title = e.target.value;
  commit();
};
$('announceSeconds').oninput = (e) => {
  settings.announce.seconds = +e.target.value;
  commit();
};
$('announcePos').onclick = (e) => {
  const pos = e.target.dataset?.pos;
  if (!pos) return;
  settings.announce.pos = pos;
  commit();
};
$('announceNow').onclick = () => fireAnnounce();

const names = ['LapizWCG', 'котик_в_тапках', 'Neformalization_Official', 'xXSlayerXx'];
let nameN = 0;
$('followTest').onsubmit = (e) => {
  e.preventDefault();
  const name = $('followTestName').value.trim() || names[nameN++ % names.length];
  bus.send('alert', { kind: 'follow', name });
};

// адрес показа для OBS
const url = new URL('./', location.href).href;
$('overlayUrl').textContent = url;
$('copyUrl').onclick = () => {
  // в OBS у страниц нет буфера обмена — тогда выделяем адрес, чтобы скопировать Ctrl+C
  navigator.clipboard?.writeText(url).then(
    () => ($('copyUrl').textContent = 'Скопировано'),
    () => getSelection().selectAllChildren($('overlayUrl')),
  );
};

// ---------- оформление окошек: цвета (только материалы движка), углы, эффект появления ----------

// палитра — цвета материалов по тонам, собрана из движка (KitDesktop --palette); в настройках хранится «материал@тон», не цвет
let palette = [];
fetch('palette.json')
  .then((r) => r.json())
  .then((p) => {
    palette = p;
    render();
  })
  .catch(() => {});
const matOf = (id) => palette.find((m) => m.id === id);
const swatch = (id, tone) => matOf(id)?.rgb[Math.round(Math.min(1, Math.max(0, tone)) * 10)] || '#444';
const parseMt = (v) => {
  const [mat, t] = String(v || '').split('@');
  return { mat, tone: t === undefined ? 0.6 : +t };
};

const LOOK_PARTS = ['follow', 'goal', 'announce'];
const COLORS = [['accent', 'Акцент (заголовок)'], ['text', 'Текст'], ['bg', 'Фон'], ['border', 'Рамка'], ['fill', 'Заливка']];
const FX_AT = [['l+r', 'слева и справа'], ['tl+br', '↖ и ↘'], ['bl+tr', '↙ и ↗'], ['t+b', 'сверху и снизу'], ['center', 'в центре'], ['circle', 'по контуру']];
const FX_SET = [['boom', 'Взрыв'], ['sparks', 'Искры'], ['ring', 'Кольцо'], ['fire', 'Огонь'], ['none', 'Без частиц']];
// шрифты — список из движка (data/fonts.json); образец в доке — сам TTF через @font-face (грузится, только когда показан)
let fonts = [];
fetch('game/data/fonts.json')
  .then((r) => r.json())
  .then((j) => {
    fonts = j.fonts;
    for (const f of fonts) {
      const st = document.createElement('style');
      st.textContent = `@font-face { font-family: 'kit-${f.id}'; src: url('game/ttf/${f.id}/font.ttf'); }`;
      document.head.append(st);
    }
    for (const part of LOOK_PARTS) fillFonts(part);
    render();
  })
  .catch(() => {});
const fontFamily = (id) => `'kit-${id || 'noto'}', 'Segoe UI', sans-serif`;
function fillFonts(part) {
  const groups = [...new Set(fonts.map((f) => f.group))];
  for (const sel of document.querySelectorAll(`[data-look="${part}"] [data-font]`))
    sel.innerHTML = groups
      .map((g) => `<optgroup label="${g}">${fonts.filter((f) => f.group === g).map((f) => `<option value="${f.id}" style="font-family:${fontFamily(f.id).replace(/"/g, '&quot;')}">${f.label} · ${f.kind}</option>`).join('')}</optgroup>`)
      .join('');
}
const CORNER_KINDS = [['round', 'Скругление'], ['bevel', 'Срез'], ['rect', 'Прямой']];
// порядок углов в настройках — по часовой (tl tr br bl), на экране — сетка 2×2 (tl tr / bl br)
const CORNER_CELLS = [[0, '↖'], [1, '↗'], [3, '↙'], [2, '↘']];

function buildLook(part) {
  const box = document.querySelector(`[data-look="${part}"] .look-body`);
  const colors = COLORS.filter(([k]) => k !== 'fill' || part === 'goal');
  const opts = (list) => list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  box.innerHTML = `
    <h4>Шрифт</h4>
    <label class="field"><span class="label">Заголовок</span><select data-font="head"></select></label>
    <div class="font-sample" data-sample="head"></div>
    <label class="field"><span class="label">Текст</span><select data-font="font"></select></label>
    <div class="font-sample" data-sample="font"></div>
    <h4>Цвета</h4>
    ${colors.map(([k, t]) => `<div class="mp-row"><span class="label">${t}</span><button class="mp" data-key="${k}" type="button"><i></i><span></span></button></div>`).join('')}
    <h4>Углы</h4>
    <div class="corners">${CORNER_CELLS.map(([i, a]) => `<select data-corner="${i}" title="угол ${a}">${opts(CORNER_KINDS.map(([v, t]) => [v, `${a} ${t}`]))}</select>`).join('')}</div>
    <div class="chips">${CORNER_KINDS.map(([v, t]) => `<button class="btn ghost small" data-all="${v}" type="button">Все: ${t.toLowerCase()}</button>`).join('')}</div>
    <label class="field"><span class="label">Сила скругления / среза: <b data-val="corner"></b></span><input type="range" data-range="corner" min="0" max="80" step="1"></label>
    <h4>Эффект появления</h4>
    <div class="chips">${FX_AT.map(([v, t]) => `<label><input type="checkbox" data-at="${v}">${t}</label>`).join('')}</div>
    <label class="field"><span class="label">Частицы</span><select data-set>${opts(FX_SET)}</select></label>
    <label class="field"><span class="label">Размер частиц: <b data-val="size"></b></span><input type="range" data-range="size" min="20" max="300" step="5"></label>
    <div class="mp-row"><span class="label">Цвет частиц</span><button class="mp" data-key="fx.mat" type="button"><i></i><span></span></button></div>
    <button class="btn ghost small" data-reset type="button">Сбросить оформление</button>`;

  const look = () => settings[part].look;
  box.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.key) openPop(t, part, t.dataset.key);
    else if (t.dataset.all) {
      look().corners = [0, 1, 2, 3].map(() => t.dataset.all);
      commit();
    } else if (t.hasAttribute('data-reset')) {
      settings[part].look = structuredClone(STYLE);
      commit();
    }
  };
  box.onchange = (e) => {
    const el = e.target;
    if (el.dataset.corner !== undefined) look().corners[+el.dataset.corner] = el.value;
    else if (el.dataset.at) {
      const at = new Set(look().fx.at);
      el.checked ? at.add(el.dataset.at) : at.delete(el.dataset.at);
      look().fx.at = [...at];
    } else if (el.hasAttribute('data-set')) look().fx.set = el.value;
    else if (el.dataset.font) look()[el.dataset.font] = el.value;
    else return;
    commit();
  };
  box.oninput = (e) => {
    const r = e.target.dataset.range;
    if (!r) return;
    if (r === 'corner') look().corner = +e.target.value;
    else look().fx.size = +e.target.value;
    commit();
  };
}

function renderLook(part) {
  const box = document.querySelector(`[data-look="${part}"] .look-body`);
  const lk = settings[part].look;
  for (const b of box.querySelectorAll('.mp')) {
    const key = b.dataset.key;
    if (key === 'fx.mat') {
      b.querySelector('i').style.background = lk.fx.mat ? swatch(lk.fx.mat, 0.75) : 'linear-gradient(135deg,#f6c94a,#e8572a)';
      b.querySelector('span').textContent = lk.fx.mat ? matOf(lk.fx.mat)?.label || lk.fx.mat : 'свой у набора';
    } else {
      const { mat, tone } = parseMt(lk[key]);
      b.querySelector('i').style.background = swatch(mat, tone);
      b.querySelector('span').textContent = `${matOf(mat)?.label || mat} · ${Math.round(tone * 100)}%`;
    }
  }
  for (const sel of box.querySelectorAll('[data-corner]')) sel.value = lk.corners[+sel.dataset.corner];
  box.querySelector('[data-range="corner"]').value = lk.corner;
  box.querySelector('[data-val="corner"]').textContent = `${lk.corner} px`;
  for (const c of box.querySelectorAll('[data-at]')) c.checked = lk.fx.at.includes(c.dataset.at);
  box.querySelector('[data-set]').value = lk.fx.set;
  // образцы: заголовок — заголовком окошка, текст — ником или первым анонсом
  const sample = { head: settings[part].title || 'ЗАГОЛОВОК', font: part === 'announce' ? (settings.announce.messages || '').split('\n')[0] || 'Текст анонса' : part === 'goal' ? '63/100' : 'LapizWCG' };
  for (const k of ['head', 'font']) {
    const id = lk[k] || 'noto';
    const sel = box.querySelector(`[data-font="${k}"]`);
    if (sel.options.length) sel.value = id;
    const s = box.querySelector(`[data-sample="${k}"]`);
    s.style.fontFamily = fontFamily(id);
    s.textContent = sample[k];
  }
  box.querySelector('[data-range="size"]').value = lk.fx.size;
  box.querySelector('[data-val="size"]').textContent = `${lk.fx.size}%`;
}

// окно выбора материала: сетка всех материалов движка в текущем тоне и ползунок тона (у заливки и частиц тон задаёт сам рисунок)
let pop = null;
function openPop(btn, part, key) {
  const el = $('matPop');
  if (pop && pop.btn === btn) return closePop();
  pop = { btn, part, key };
  const withTone = key !== 'fill' && key !== 'fx.mat';
  el.innerHTML = `
    ${key === 'fx.mat' ? '<button class="btn ghost small" data-own type="button">Свой у набора частиц</button>' : ''}
    <div class="grid"></div>
    ${withTone ? '<label class="field"><span class="label">Тон: <b data-tone-val></b></span><input type="range" data-tone min="0" max="1" step="0.05"></label>' : ''}
    <div class="name"></div>`;
  const r = btn.getBoundingClientRect();
  el.style.left = `${Math.max(6, Math.min(innerWidth - 270, r.right - 264 + scrollX))}px`;
  el.style.top = `${r.bottom + 4 + scrollY}px`;
  el.hidden = false;
  renderPop();
}
function closePop() {
  pop = null;
  $('matPop').hidden = true;
}
function popValue() {
  const lk = settings[pop.part].look;
  return pop.key === 'fx.mat' ? { mat: lk.fx.mat, tone: 0.75 } : parseMt(lk[pop.key]);
}
function setPopValue(mat, tone) {
  const lk = settings[pop.part].look;
  if (pop.key === 'fx.mat') lk.fx.mat = mat;
  else lk[pop.key] = `${mat}@${tone}`;
  commit();
  renderPop();
}
function renderPop() {
  if (!pop) return;
  const el = $('matPop');
  const { mat, tone } = popValue();
  el.querySelector('.grid').innerHTML = palette
    .map((m) => `<button type="button" data-mat="${m.id}" title="${m.label}" class="${m.id === mat ? 'active' : ''}" style="background:${swatch(m.id, pop.key === 'fx.mat' || pop.key === 'fill' ? 0.75 : tone)}"></button>`)
    .join('');
  const t = el.querySelector('[data-tone]');
  if (t) {
    t.value = tone;
    el.querySelector('[data-tone-val]').textContent = `${Math.round(tone * 100)}%`;
  }
  el.querySelector('.name').textContent = mat ? matOf(mat)?.label || mat : 'свой у набора частиц';
}
$('matPop').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || !pop) return;
  if (b.dataset.mat) setPopValue(b.dataset.mat, popValue().tone);
  else if (b.hasAttribute('data-own')) setPopValue('', 0.75);
};
$('matPop').oninput = (e) => {
  if (e.target.dataset.tone !== undefined && pop) setPopValue(popValue().mat, +e.target.value);
};
document.addEventListener('mousedown', (e) => {
  if (pop && !$('matPop').contains(e.target) && !pop.btn.contains(e.target)) closePop();
});

for (const part of LOOK_PARTS) buildLook(part);

render();
startTwitch();
