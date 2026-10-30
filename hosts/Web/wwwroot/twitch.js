// TWITCH: вход своим аккаунтом и события канала, без сервера.
// Вход — OAuth implicit grant: Twitch возвращает токен в #адресе страницы. Счётчики — Helix, события в реальном времени — EventSub
// по WebSocket. Всё это живёт в док-панели: она одна на OBS, показам она передаёт уже готовые оповещения и счёт цели

// Client ID своего приложения Stream Kit из https://dev.twitch.tv/console/apps — публичный, его можно хранить в репозитории
// (Client Secret — нет). В приложении должен быть разрешён адрес возврата — адрес этой док-панели (redirectUri() ниже), побуквенно
export const CLIENT_ID = 'jp6post1gnldno1wtftsuy36dc6s95';
export const isConfigured = () => CLIENT_ID && !CLIENT_ID.startsWith('PASTE_');
export const SCOPES = [
  'moderator:read:followers', // фолловеры: число и новые
  'channel:read:subscriptions', // сабы: число и новые
];

const TOKEN_KEY = 'kit.token';
const STATE_KEY = 'kit.oauthState';

// Twitch сравнивает адрес возврата побуквенно — всегда без ?…  и #…
export const redirectUri = () => location.origin + location.pathname;

export function login() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    state,
    force_verify: 'true',
  });
  location.href = `https://id.twitch.tv/oauth2/authorize?${params}`;
}

/** Забирает токен из адреса после возврата с Twitch. Возвращает текст ошибки или null. */
export function consumeRedirect() {
  if (!location.hash.includes('access_token') && !location.search.includes('error')) return null;
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  history.replaceState(null, '', location.pathname);
  const error = query.get('error_description') || query.get('error');
  if (error) return error;
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!expected || hash.get('state') !== expected) return 'Ответ Twitch не прошёл проверку. Попробуйте войти ещё раз.';
  localStorage.setItem(TOKEN_KEY, hash.get('access_token'));
  return null;
}

/** Проверяет сохранённый токен. Возвращает { token, userId, login, scopes } или null. */
export async function restoreSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const res = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } });
  if (!res.ok) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  const info = await res.json();
  return { token, userId: info.user_id, login: info.login, scopes: info.scopes || [] };
}

export async function logout(session) {
  localStorage.removeItem(TOKEN_KEY);
  if (!session) return;
  await fetch('https://id.twitch.tv/oauth2/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, token: session.token }),
  }).catch(() => {});
}

export class Helix {
  constructor(session) {
    this.session = session;
  }

  async request(path, { method = 'GET', body } = {}) {
    const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
      method,
      headers: {
        'Client-Id': CLIENT_ID,
        Authorization: `Bearer ${this.session.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || `Twitch API ${res.status}`);
    return json;
  }

  async me() {
    const u = (await this.request(`users?id=${this.session.userId}`)).data[0];
    return u ? { name: u.display_name, avatar: u.profile_image_url } : null;
  }

  /** Сколько всего фолловеров у канала. */
  async followerCount() {
    return (await this.request(`channels/followers?broadcaster_id=${this.session.userId}&first=1`)).total ?? 0;
  }

  /** Сколько сабов у канала (у канала без партнёрки/компаньона — ошибка Twitch, её показываем как есть). */
  async subCount() {
    return (await this.request(`subscriptions?broadcaster_id=${this.session.userId}&first=1`)).total ?? 0;
  }
}

const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';

/**
 * Новые фолловеры и сабы канала в реальном времени. onEvent({ type: 'follow' | 'subscribe', userId, login, name, gift }),
 * onStatus('connected' | 'reconnecting'). Ошибки подписок (например, сабы у канала без партнёрки) — в errors
 */
export class EventSub {
  constructor(helix, onEvent, onStatus = () => {}) {
    this.helix = helix;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.closed = false;
    this.retry = 0;
    this.errors = [];
    this.connect(EVENTSUB_URL, false);
    // Twitch шлёт keepalive; долгая тишина — соединение умерло, переподключаемся
    this.watchdog = setInterval(() => {
      if (this.ws && Date.now() - this.lastMessage > (this.keepalive + 10) * 1000) this.ws.close();
    }, 5000);
  }

  connect(url, isReconnect) {
    const ws = new WebSocket(url);
    this.ws = ws;
    this.lastMessage = Date.now();
    this.keepalive = 30;
    ws.onmessage = async (e) => {
      this.lastMessage = Date.now();
      const msg = JSON.parse(e.data);
      const type = msg.metadata?.message_type;
      if (type === 'session_welcome') {
        this.retry = 0;
        this.keepalive = msg.payload.session.keepalive_timeout_seconds || 30;
        // при переезде по session_reconnect подписки переносятся сами
        if (!isReconnect) await this.subscribe(msg.payload.session.id);
        this.onStatus('connected');
      } else if (type === 'session_reconnect') {
        const old = ws;
        old.onclose = null;
        this.connect(msg.payload.session.reconnect_url, true);
        setTimeout(() => old.close(), 2000);
      } else if (type === 'notification') {
        const ev = msg.payload.event;
        const sub = msg.payload.subscription.type;
        this.onEvent({
          type: sub === 'channel.follow' ? 'follow' : 'subscribe',
          userId: ev.user_id,
          login: ev.user_login,
          name: ev.user_name,
          gift: !!ev.is_gift,
        });
      }
    };
    ws.onclose = () => {
      if (this.closed || this.ws !== ws) return;
      this.onStatus('reconnecting');
      const delay = Math.min(30000, 1000 * 2 ** this.retry++);
      setTimeout(() => !this.closed && this.connect(EVENTSUB_URL, false), delay);
    };
  }

  async subscribe(sessionId) {
    const b = this.helix.session.userId;
    const subs = [
      { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: b, moderator_user_id: b } },
      { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: b } },
    ];
    this.errors = [];
    for (const s of subs) {
      try {
        await this.helix.request('eventsub/subscriptions', {
          method: 'POST',
          body: { ...s, transport: { method: 'websocket', session_id: sessionId } },
        });
      } catch (e) {
        this.errors.push(`${s.type}: ${e.message}`);
      }
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.watchdog);
    this.ws?.close();
  }
}
