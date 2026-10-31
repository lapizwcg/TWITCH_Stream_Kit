// ДОК-ПАНЕЛЬ: поля ↔ настройки. Каждое изменение сразу сохраняется и уходит в открытые оверлеи — в OBS видно без перезагрузки.
// Здесь же — связь с Twitch: вход, события канала (новые фолловеры → оповещение в показ), счёт цели по фолловерам или сабам
import { DEFAULTS, loadSettings, saveSettings, createBus } from './kit.js';
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

render();
startTwitch();
