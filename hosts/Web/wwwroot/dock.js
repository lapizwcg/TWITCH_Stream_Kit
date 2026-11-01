// ДОК-ПАНЕЛЬ: поля ↔ настройки. Каждое изменение сразу сохраняется и уходит в открытые оверлеи — в OBS видно без перезагрузки.
// Здесь же — связь с Twitch: вход, события канала (новые фолловеры → оповещение в показ), счёт цели по фолловерам или сабам
import { DEFAULTS, STYLE, LOGOS, logoOf, loadSettings, saveSettings, createBus } from './kit.js';
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

  renderFrame();
  renderLogo();

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
  // прогресс ранга челленджа ведёт цель — счёт и заголовок её, руками не трогаем
  const byRank = settings.challenge.goal;
  $('goalSource').disabled = $('goalTitle').disabled = byRank;
  for (const id of ['goalCurrent', 'goalPlus', 'goalMinus', 'goalReset']) $(id).disabled = auto || byRank;
  $('goalNote').textContent = byRank
    ? 'Счёт ведёт челлендж: отмеченные вехи текущего ранга.'
    : !auto
    ? 'Счёт ведёте вы: кнопками или числом.'
    : !helix
      ? 'Войдите через Twitch — счёт будет вестись сам.'
      : g.source === 'subs'
        ? 'Считает Twitch: все сабы канала, новые прибавляются сами.'
        : 'Считает Twitch: все фолловеры канала, новые прибавляются сами.';
  renderChallenge();
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
const STROKES = [['none', 'Без обводки'], ['solid', 'Обводка'], ['soft', 'Мягкая'], ['neon', 'Неон'], ['shadow', 'Тень'], ['double', 'Двойная'], ['extrude', 'Объём']];
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
    <div class="row2 type"><label class="field"><span class="label">Размер: <b data-val="headSize"></b></span><input type="range" data-range="headSize" min="50" max="250" step="5"></label><label class="field"><span class="label">Между буквами: <b data-val="headTrack"></b></span><input type="range" data-range="headTrack" min="-10" max="60" step="1"></label></div>
    <label class="field"><span class="label">Текст</span><select data-font="font"></select></label>
    <div class="font-sample" data-sample="font"></div>
    <div class="row2 type"><label class="field"><span class="label">Размер: <b data-val="textSize"></b></span><input type="range" data-range="textSize" min="50" max="250" step="5"></label><label class="field"><span class="label">Между буквами: <b data-val="textTrack"></b></span><input type="range" data-range="textTrack" min="-10" max="60" step="1"></label></div>
    <h4>Обводка текста</h4>
    <label class="field"><span class="label">Стиль</span><select data-stroke-style></select></label>
    <div class="mp-row"><span class="label">Цвет обводки</span><button class="mp" data-key="stroke.color" type="button"><i></i><span></span></button></div>
    <label class="field"><span class="label">Толщина: <b data-val="stroke"></b></span><input type="range" data-range="stroke" min="0" max="12" step="0.5"></label>
    <div class="chips"><label><input type="checkbox" data-stroke-on="head">к заголовку</label><label><input type="checkbox" data-stroke-on="text">к тексту</label></div>
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
    else if (el.hasAttribute('data-stroke-style')) look().stroke.style = el.value;
    else if (el.dataset.strokeOn) look().stroke[el.dataset.strokeOn] = el.checked;
    else return;
    commit();
  };
  box.oninput = (e) => {
    const r = e.target.dataset.range;
    if (!r) return;
    if (r === 'corner') look().corner = +e.target.value;
    else if (/^(head|text)(Size|Track)$/.test(r)) look()[r] = +e.target.value;
    else if (r === 'stroke') look().stroke.width = +e.target.value;
    else look().fx.size = +e.target.value;
    commit();
  };
}

function renderLook(part) {
  const box = document.querySelector(`[data-look="${part}"] .look-body`);
  const lk = settings[part].look;
  // оформление, сохранённое до появления обводки, — с обводкой по умолчанию
  lk.stroke ??= structuredClone(STYLE.stroke);
  const sts = box.querySelector('[data-stroke-style]');
  if (!sts.options.length) sts.innerHTML = STROKES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  sts.value = lk.stroke.style;
  box.querySelector('[data-range="stroke"]').value = lk.stroke.width;
  box.querySelector('[data-val="stroke"]').textContent = `${lk.stroke.width} px`;
  for (const c of box.querySelectorAll('[data-stroke-on]')) c.checked = !!lk.stroke[c.dataset.strokeOn];
  for (const b of box.querySelectorAll('.mp')) {
    const key = b.dataset.key;
    if (key === 'fx.mat') {
      b.querySelector('i').style.background = lk.fx.mat ? swatch(lk.fx.mat, 0.75) : 'linear-gradient(135deg,#f6c94a,#e8572a)';
      b.querySelector('span').textContent = lk.fx.mat ? matOf(lk.fx.mat)?.label || lk.fx.mat : 'свой у набора';
    } else {
      const { mat, tone } = parseMt(key === 'stroke.color' ? lk.stroke.color : lk[key]);
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
    // размер и разрядка — в образце тоже: кегль от 20 точек, разрядка — в долях кегля, как в показе
    const t = k === 'head' ? 'head' : 'text';
    const size = lk[`${t}Size`] ?? 100, track = lk[`${t}Track`] ?? 0;
    s.style.fontSize = `${Math.round(20 * size / 100)}px`;
    s.style.letterSpacing = `${track / 100}em`;
    box.querySelector(`[data-range="${t}Size"]`).value = size;
    box.querySelector(`[data-val="${t}Size"]`).textContent = `${size}%`;
    box.querySelector(`[data-range="${t}Track"]`).value = track;
    box.querySelector(`[data-val="${t}Track"]`).textContent = `${track}%`;
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
  if (pop.key === 'stroke.color') return parseMt(lk.stroke.color);
  return pop.key === 'fx.mat' ? { mat: lk.fx.mat, tone: 0.75 } : parseMt(lk[pop.key]);
}
function setPopValue(mat, tone) {
  const lk = settings[pop.part].look;
  if (pop.key === 'fx.mat') lk.fx.mat = mat;
  else if (pop.key === 'stroke.color') lk.stroke.color = `${mat}@${tone}`;
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

// ---------- рамка эфира ----------

const FRAME_CORNERS = [['round', 'Скругление'], ['bevel', 'Срез'], ['rect', 'Прямой'], ['scoop', 'Вогнутый'], ['notch', 'Ступенька']];
// стили по группам (в списке — разделы)
const FRAME_STYLES = [
  ['Sci-Fi', [['esports', 'Киберспорт — акцентные отрезки, штрихи'], ['blades', 'Клинки — планки со срезами у всех углов'],
    ['panels', 'Панели — вкладки сверху и снизу']]],
  ['Без украшений', [['plain', 'Простая — одна линия']]],
];
// ползунки: ключ, подпись, мин, макс, шаг, единица
const FRAME_RANGES = {
  scale: ['Размер узора', 30, 300, 5, '%'],
  width: ['Толщина (сколько места забирает у кадра)', 0, 120, 1, 'px'], margin: ['Отступ от края экрана', 0, 100, 1, 'px'], opacity: ['Непрозрачность фона', 0, 100, 1, '%'],
  line: ['Толщина линии', 0, 12, 0.5, 'px'], corner: ['Размер углов', 0, 200, 1, 'px'],
};
function buildFrame() {
  const box = document.querySelector('#tab-frame .frame-body');
  const opts = (list) => list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  const range = (k) => `<label class="field"><span class="label">${FRAME_RANGES[k][0]}: <b data-val="${k}"></b></span><input type="range" data-range="${k}" min="${FRAME_RANGES[k][1]}" max="${FRAME_RANGES[k][2]}" step="${FRAME_RANGES[k][3]}"></label>`;
  box.innerHTML = `
    <label class="field"><span class="label">Стиль</span><select data-style>${FRAME_STYLES.map(([g, list]) => `<optgroup label="${g}">${opts(list)}</optgroup>`).join("")}</select></label>
    ${range('scale')}
    <p class="note">Размер узора — сам по себе: при тонкой или нулевой рамке узор остаётся у края экрана. Толщина — сколько места рамка забирает у кадра, окошки встают внутри.</p>
    <h4>Полоса</h4>
    ${range('width')}${range('margin')}${range('opacity')}
    <div class="mp-row"><span class="label">Фон рамки</span><button class="mp" data-key="bg" type="button"><i></i><span></span></button></div>
    <h4>Линия по краю</h4>
    <div class="mp-row"><span class="label">Цвет линии</span><button class="mp" data-key="border" type="button"><i></i><span></span></button></div>
    ${range('line')}
    <h4>Внутренние углы</h4>
    <div class="corners">${CORNER_CELLS.map(([i, a]) => `<select data-corner="${i}" title="угол ${a}">${opts(FRAME_CORNERS.map(([v, t]) => [v, `${a} ${t}`]))}</select>`).join('')}</div>
    <div class="chips">${FRAME_CORNERS.map(([v, t]) => `<button class="btn ghost small" data-all="${v}" type="button">Все: ${t.toLowerCase()}</button>`).join('')}</div>
    ${range('corner')}
    <button class="btn ghost small" data-reset type="button">Сбросить рамку</button>`;
  const fr = () => settings.frame;
  $('frameOn').onchange = (e) => {
    fr().on = e.target.checked;
    commit();
  };
  box.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.key) openPop(t, 'frame', t.dataset.key);
    else if (t.dataset.all) {
      fr().corners = [0, 1, 2, 3].map(() => t.dataset.all);
      commit();
    } else if (t.hasAttribute('data-reset')) {
      settings.frame = { ...structuredClone(DEFAULTS.frame), on: fr().on };
      commit();
    }
  };
  box.onchange = (e) => {
    const el = e.target;
    if (el.dataset.corner !== undefined) fr().corners[+el.dataset.corner] = el.value;
    else if (el.hasAttribute('data-style')) fr().style = el.value;
    else return;
    commit();
  };
  box.oninput = (e) => {
    const r = e.target.dataset.range;
    if (!r) return;
    fr()[r] = +e.target.value;
    commit();
  };
}
function renderFrame() {
  const box = document.querySelector('#tab-frame .frame-body');
  if (!box.firstElementChild) return;
  const fr = settings.frame;
  fr.look ??= structuredClone(DEFAULTS.frame.look);
  $('frameOn').checked = fr.on;
  for (const k of Object.keys(FRAME_RANGES)) {
    box.querySelector(`[data-range="${k}"]`).value = fr[k] ?? DEFAULTS.frame[k];
    box.querySelector(`[data-val="${k}"]`).textContent = `${fr[k] ?? DEFAULTS.frame[k]} ${FRAME_RANGES[k][4]}`;
  }
  for (const b of box.querySelectorAll('.mp')) {
    const { mat, tone } = parseMt(fr.look[b.dataset.key]);
    b.querySelector('i').style.background = swatch(mat, tone);
    b.querySelector('span').textContent = `${matOf(mat)?.label || mat} · ${Math.round(tone * 100)}%`;
  }
  for (const sel of box.querySelectorAll('[data-corner]')) sel.value = fr.corners[+sel.dataset.corner];
  box.querySelector('[data-style]').value = fr.style ?? 'esports';
}
buildFrame();

// ---------- челлендж «Соло Левелинг без рынка» ----------
// ранг и его вехи, счётчики, достижения и нарушения — в журнал и карточкой окошком анонса (со своим заголовком), прогресс ранга —
// целью, если включено. Вехи отмечаются по тексту («Т1|текст»), поэтому правка списка не сдвигает отметки

// частые нарушения — по правилам (rules.html); помощь в бою — не нарушение
const VIO_PRESETS = ['Покупка на рынке', 'Продажа на рынке', 'Группа вне города', 'Обмен с игроком', 'Подарок от игрока', 'Не своя вещь, еда или зелье'];
const CARD_TITLE = { ach: 'achTitle', vio: 'vioTitle', rank: 'rankTitle', death: 'deathTitle', kill: 'killTitle' };
// поля заголовков карточек: id поля — ключ в настройках
const CH_TITLES = [['chAchTitle', 'achTitle'], ['chVioTitle', 'vioTitle'], ['chRankTitle', 'rankTitle'], ['chDeathTitle', 'deathTitle'], ['chKillTitle', 'killTitle']];
const ch = () => settings.challenge;
const rankOf = (i = ch().rank) => ch().ranks[Math.max(0, Math.min(i, ch().ranks.length - 1))];
const itemsOf = (r) => r.items.split('\n').map((s) => s.trim()).filter(Boolean);
const doneKey = (r, text) => `${r.id}|${text}`;
const rankDone = (r) => itemsOf(r).filter((t) => ch().done.includes(doneKey(r, t))).length;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function chCard(kind, text) {
  const c = ch();
  // смерть и убийство из игры — своим переключателем
  if (kind === 'death' || kind === 'kill' ? c.gameCards : c.cards) bus.send('card', { title: c[CARD_TITLE[kind]] || DEFAULTS.challenge[CARD_TITLE[kind]], text });
}
function chLog(kind, text) {
  const c = ch();
  c.log.unshift({ t: Date.now(), day: c.day, kind, text });
  c.log.length = Math.min(c.log.length, 500);
}
// прогресс ранга целью: «РАНГ Т2 · УЧЕНИК», отмечено из всех вех ранга
function chCommit() {
  const c = ch();
  if (c.goal) {
    const r = rankOf();
    Object.assign(settings.goal, { source: 'manual', title: `РАНГ ${r.id} · ${r.name.toUpperCase()}`, current: rankDone(r), target: Math.max(1, itemsOf(r).length) });
  }
  commit();
}

function buildChallenge() {
  $('chVioPresets').innerHTML = VIO_PRESETS.map((t) => `<button class="btn ghost small" type="button" data-preset="${esc(t)}">${esc(t)}</button>`).join('');
  $('chRanksEdit').innerHTML = ch().ranks
    .map((r, i) => `<label class="field"><span class="label">Ранг ${esc(r.id)} — название</span><input type="text" maxlength="40" data-rank-name="${i}"></label>
      <label class="field"><span class="label">Вехи ранга ${esc(r.id)} — по одной на строку</span><textarea rows="3" maxlength="1000" data-rank-items="${i}"></textarea></label>`)
    .join('') + '<button class="btn ghost small" type="button" id="chRanksReset">Вернуть вехи по умолчанию</button>';
}

function renderChallenge() {
  const c = ch();
  const r = rankOf();
  const items = itemsOf(r);
  const got = rankDone(r);
  $('chRank').innerHTML = c.ranks.map((x, i) => `<option value="${i}">${esc(x.id)} · ${esc(x.name)}</option>`).join('');
  $('chRank').value = String(c.rank);
  $('chRankBadge').textContent = r.id;
  $('chRankName').textContent = `«${r.name}»`;
  $('chRankProgress').textContent = items.length ? `вехи: ${got} из ${items.length}` : 'у ранга нет вех';
  $('chItems').innerHTML = items
    .map((t) => `<label class="check"><input type="checkbox" data-item="${esc(t)}"${c.done.includes(doneKey(r, t)) ? ' checked' : ''}><span>${esc(t)}</span></label>`)
    .join('');
  const next = c.ranks[c.rank + 1];
  $('chRankUp').disabled = !next;
  $('chRankUp').textContent = next ? `Повысить ранг → ${next.id} «${next.name}»` : 'Высший ранг';
  // все вехи ранга взяты — кнопка повышения горит
  $('chRankUp').classList.toggle('ready', !!next && items.length > 0 && got === items.length);
  for (const b of document.querySelectorAll('[data-val-stat]')) b.textContent = c[b.dataset.valStat];
  $('chVioCount').textContent = c.log.filter((e) => e.kind === 'vio').length;
  const when = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const mark = { vio: '⚠', ach: '★', rank: '▲' };
  $('chLog').innerHTML = c.log.length
    ? c.log.slice(0, 100).map((e, i) => `<li class="${e.kind}"><i>${mark[e.kind] || ''}</i><span><b>${esc(e.text)}</b><small>день ${e.day} · ${when(e.t)}</small></span><button type="button" class="del" data-del="${i}" title="Убрать из журнала">×</button></li>`).join('')
    : '<li class="empty">Пока пусто</li>';
  $('chCards').checked = c.cards;
  $('chGoal').checked = c.goal;
  $('chGameCards').checked = c.gameCards;
  $('chStatsOn').checked = c.statsOn;
  if (document.activeElement !== $('chStatsPort')) $('chStatsPort').value = c.statsPort;
  renderGame();
  for (const [id, k] of CH_TITLES)
    if (document.activeElement !== $(id)) $(id).value = c[k];
  for (const el of document.querySelectorAll('[data-rank-name]')) if (document.activeElement !== el) el.value = c.ranks[+el.dataset.rankName]?.name ?? '';
  for (const el of document.querySelectorAll('[data-rank-items]')) if (document.activeElement !== el) el.value = c.ranks[+el.dataset.rankItems]?.items ?? '';
}

$('chRank').onchange = (e) => {
  ch().rank = +e.target.value;
  chCommit();
};
// отметили веху — достижение: в журнал и карточкой; сняли отметку — тихо
$('chItems').onchange = (e) => {
  const t = e.target.dataset.item;
  if (t === undefined) return;
  const c = ch();
  const key = doneKey(rankOf(), t);
  c.done = c.done.filter((k) => k !== key);
  if (e.target.checked) {
    c.done.push(key);
    chLog('ach', t);
    chCard('ach', t);
  }
  chCommit();
};
$('chRankUp').onclick = () => {
  const c = ch();
  if (!c.ranks[c.rank + 1]) return;
  c.rank++;
  const r = rankOf();
  const text = `${r.id} · «${r.name}»`;
  chLog('rank', `Ранг ${text}`);
  chCard('rank', text);
  chCommit();
};
$('tab-challenge').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const c = ch();
  if (b.dataset.stat) {
    c[b.dataset.stat] = Math.max(b.dataset.stat === 'day' ? 1 : 0, c[b.dataset.stat] + +b.dataset.d);
    commit();
  } else if (b.dataset.preset) {
    $('chVioText').value = b.dataset.preset;
    $('chVioText').focus();
  } else if (b.dataset.del !== undefined) {
    c.log.splice(+b.dataset.del, 1);
    commit();
  } else if (b.id === 'chRanksReset') {
    c.ranks = structuredClone(DEFAULTS.challenge.ranks);
    chCommit();
  }
});
$('chAch').onsubmit = (e) => {
  e.preventDefault();
  const t = $('chAchText').value.trim();
  if (!t) return $('chAchText').focus();
  chLog('ach', t);
  chCard('ach', t);
  $('chAchText').value = '';
  commit();
};
$('chVio').onsubmit = (e) => {
  e.preventDefault();
  const t = $('chVioText').value.trim() || 'Нарушение правил';
  chLog('vio', t);
  chCard('vio', t);
  $('chVioText').value = '';
  commit();
};
$('chCards').onchange = (e) => {
  ch().cards = e.target.checked;
  commit();
};
$('chGoal').onchange = (e) => {
  ch().goal = e.target.checked;
  if (e.target.checked) settings.goal.on = true;
  chCommit();
};
for (const [id, k] of CH_TITLES)
  $(id).oninput = (e) => {
    ch()[k] = e.target.value;
    commit();
  };
$('chRanksEdit').oninput = (e) => {
  const el = e.target;
  const c = ch();
  if (el.dataset.rankName !== undefined) c.ranks[+el.dataset.rankName].name = el.value;
  else if (el.dataset.rankItems !== undefined) c.ranks[+el.dataset.rankItems].items = el.value;
  else return;
  chCommit();
};
// заново: ранг, отметки, счётчики и журнал — с нуля; вехи и заголовки карточек остаются
$('chReset').onclick = () => {
  if (!confirm('Начать челлендж заново? Ранг, отметки, счётчики и журнал сбросятся.')) return;
  Object.assign(ch(), { rank: 0, done: [], day: 1, deaths: 0, kills: 0, log: [] });
  chCommit();
};
// ---------- статистика из игры: AoMarket --stats-port (AO-Auras) на этом компьютере ----------
// поток событий (SSE): «stats» — счёт сессии после каждого изменения, «death» / «kill» — сразу, для карточки. Смерти и убийства
// прибавляются к счётчикам челленджа по разнице со счётом, увиденным в прошлый раз (sync): док, закрытый на время боя, догонит
// при подключении; перезапуск AoMarket (новое since) начинает отсчёт заново, ничего не прибавляя

let game = null; // последний счёт сессии из AoMarket
let gameState = 'off'; // off | wait | on
let gameSource = null;
const gameUrl = (path) => `http://127.0.0.1:${ch().statsPort}${path}`;

function connectGame() {
  gameSource?.close();
  gameSource = null;
  game = null;
  gameState = ch().statsOn ? 'wait' : 'off';
  renderGame();
  if (!ch().statsOn) return;
  // EventSource переподключается сам, пока AoMarket не запущен — раз в несколько секунд
  gameSource = new EventSource(gameUrl('/events'));
  gameSource.onerror = () => {
    gameState = 'wait';
    renderGame();
  };
  const on = (kind, fn) => gameSource.addEventListener(kind, (e) => {
    try {
      fn(JSON.parse(e.data));
    } catch {}
  });
  on('stats', onGameStats);
  on('death', (d) => chCard('death', d.mob ? `${d.killer} (моб)` : d.killer ? `от ${d.killer}` : 'Персонаж погиб'));
  on('kill', (d) => chCard('kill', d.victim));
}

function onGameStats(s) {
  game = s;
  gameState = 'on';
  const c = ch();
  const sy = c.sync;
  if (sy && sy.since === s.since) {
    c.deaths += Math.max(0, s.deaths - sy.deaths);
    c.kills += Math.max(0, s.kills - sy.kills);
  }
  // настройки сохраняем, только когда сдвинулись смерти, убийства или сессия — серебро идёт часто
  if (!sy || sy.since !== s.since || sy.deaths !== s.deaths || sy.kills !== s.kills) {
    c.sync = { since: s.since, deaths: s.deaths, kills: s.kills };
    commit();
  } else renderGame();
}

function renderGame() {
  const link = $('chStatsLink');
  link.className = `link ${gameState === 'on' ? 'on' : 'off'}`;
  link.textContent = { off: 'выключено', wait: 'AoMarket не отвечает', on: game?.player ? `${game.player} · подключено` : 'подключено' }[gameState];
  const num = (v) => (game ? Math.round(v).toLocaleString('ru-RU') : '—');
  // ключ — путь в ответе AoMarket («totals.fame»); общей славы персонажа может ещё не быть — прочерк, а не 0
  for (const b of document.querySelectorAll('[data-game]')) {
    const v = b.dataset.game.split('.').reduce((o, k) => o?.[k], game);
    b.textContent = v == null && b.dataset.game.includes('.') ? '—' : num(v ?? 0);
  }
  $('chStatsReset').disabled = gameState !== 'on';
  $('chStatsNote').textContent =
    gameState === 'off'
      ? 'Статистика из игры выключена — «Связь с игрой» ниже.'
      : gameState === 'wait'
        ? `Нет связи с AoMarket на порту ${ch().statsPort}: запустите AO-Profiter (start.ps1) или AoMarket --stats-port ${ch().statsPort}. Док переподключится сам.`
        : game?.since
          ? `Сессия с ${new Date(game.since).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Смерти и убийства идут в счётчики выше.`
          : '';
}

// новая сессия в AoMarket: серебро, слава, крафт и сбор — с нуля; счётчики челленджа не трогаются
$('chStatsReset').onclick = () => {
  fetch(gameUrl('/reset'), { method: 'POST', body: '' }).catch(() => {});
};
$('chStatsOn').onchange = (e) => {
  ch().statsOn = e.target.checked;
  commit();
  connectGame();
};
$('chStatsPort').onchange = (e) => {
  const port = Math.floor(+e.target.value);
  if (port > 0 && port < 65536) ch().statsPort = port;
  commit();
  connectGame();
};
$('chGameCards').onchange = (e) => {
  ch().gameCards = e.target.checked;
  commit();
};
buildChallenge();

// ---------- логотип ----------

$('logoFile').innerHTML = LOGOS.map(([g, list]) => `<optgroup label="${g}">${list.map(([v, t]) => `<option value="${v}">${g}: ${t}</option>`).join('')}</optgroup>`).join('');
const LOGO_RANGES = [['logoSize', 'size', 'px'], ['logoDx', 'dx', 'px'], ['logoDy', 'dy', 'px'], ['logoOpacity', 'opacity', '%']];
function renderLogo() {
  const L = (settings.logo ??= structuredClone(DEFAULTS.logo));
  $('logoOn').checked = L.on;
  $('logoFile').value = logoOf(L.file)[0];
  const src = `logos/${logoOf(L.file)[0]}.svg`;
  if (!$('logoPreview').src.endsWith(src)) $('logoPreview').src = src;
  for (const b of $('logoPos').children) b.classList.toggle('active', b.dataset.pos === L.pos);
  for (const [el, k, unit] of LOGO_RANGES) {
    const v = L[k] ?? DEFAULTS.logo[k];
    $(el).value = v;
    $(`${el}Val`).textContent = `${v} ${unit}`;
  }
}
$('logoOn').onchange = (e) => {
  settings.logo.on = e.target.checked;
  commit();
};
$('logoFile').onchange = (e) => {
  settings.logo.file = e.target.value;
  commit();
};
$('logoPos').onclick = (e) => {
  const pos = e.target.dataset?.pos;
  if (!pos) return;
  settings.logo.pos = pos;
  commit();
};
for (const [el, k] of LOGO_RANGES)
  $(el).oninput = (e) => {
    settings.logo[k] = +e.target.value;
    commit();
  };
$('logoReset').onclick = () => {
  settings.logo = { ...structuredClone(DEFAULTS.logo), on: settings.logo.on, file: settings.logo.file };
  commit();
};

render();
connectGame();
startTwitch();
