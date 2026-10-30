// WCG ENGINE — ВЕБ-ХОСТ: движок на C# в браузере через .NET WebAssembly.
// Здесь только то, чего .NET в браузере не умеет сам: холст WebGL2, мост «функции OpenGL → WebGL2» (Gl.Web.cs зовёт их по тем же
// именам), ввод одним потоком (мышь, пальцы, клавиши по месту — как SDL scancode) и цикл кадров от requestAnimationFrame.
// Данные для WebGL читаются прямо из памяти wasm по адресу — без копий (замер: мост стоит сотые доли миллисекунды за кадр).
import { dotnet } from './_framework/dotnet.js';

// files — адрес списка файлов игры (строка — путь от корня, «data/mats.json»): до запуска C# они скачиваются и кладутся в виртуальную
// файловую систему .NET по тем же путям, что на ПК, — код загрузки игры один (File, Directory работают как на ПК)
// alpha — холст с прозрачностью (оверлей: страница поверх видео, например источник-браузер OBS; фон кадра — App.BgA = 0).
// Цвета в кадре — с умноженной прозрачностью: светящееся (сложение, прозрачность 0) так и ложится на видео сложением
export async function boot({ canvas, maxDpr = 2, args = [], files = null, alpha = false }) {
	const rt = await dotnet.withApplicationArguments(...args).create();
	if (files) {
		const base = files.substring(0, files.lastIndexOf('/') + 1);
		// с перепроверкой у сервера: файлы игры без отпечатков в имени — иначе браузер отдаёт прежнюю версию из кэша
		const list = (await (await fetch(files, { cache: 'no-cache' })).text()).split('\n').map((s) => s.trim()).filter((s) => s);
		const got = await Promise.all(list.map(async (f) => new Uint8Array(await (await fetch(base + f, { cache: 'no-cache' })).arrayBuffer())));
		list.forEach((f, i) => {
			const parts = f.split('/'), name = parts.pop(), dir = '/' + parts.join('/');
			if (parts.length) rt.Module.FS_createPath('/', parts.join('/'), true, true);
			rt.Module.FS_createDataFile(dir, name, got[i], true, true, true);
		});
	}
	const gl = canvas.getContext('webgl2', { antialias: false, alpha, depth: true, stencil: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
	if (!gl) throw new Error('нет WebGL2');
	// все расширения — сразу включены: в OpenGL расширение есть, если его отдаёт драйвер; в WebGL — только после getExtension
	const exts = gl.getSupportedExtensions() || [];
	for (const e of exts) gl.getExtension(e);

	const u8 = () => rt.localHeapViewU8(), u32 = () => rt.localHeapViewU32(), i32 = () => rt.localHeapViewI32(), f32 = () => rt.localHeapViewF32();
	const cstr = (p) => { const h = u8(); let e = p; while (h[e]) e++; return new TextDecoder().decode(h.subarray(p, e)); };

	// таблицы «номер OpenGL ↔ объект WebGL»: 0 — пусто, как в OpenGL
	const T = { buf: [null], tex: [null], vao: [null], fbo: [null], rbo: [null], prog: [null], sh: [null], q: [null], loc: [null] };
	const put = (t, o) => { T[t].push(o); return T[t].length - 1; };
	const get = (t, id) => (id ? T[t][id] : null);
	const MAKE = { buf: () => gl.createBuffer(), tex: () => gl.createTexture(), vao: () => gl.createVertexArray(), fbo: () => gl.createFramebuffer(), rbo: () => gl.createRenderbuffer(), q: () => gl.createQuery() };
	const KILL = { buf: (o) => gl.deleteBuffer(o), tex: (o) => gl.deleteTexture(o), vao: (o) => gl.deleteVertexArray(o), fbo: (o) => gl.deleteFramebuffer(o), rbo: (o) => gl.deleteRenderbuffer(o), q: (o) => gl.deleteQuery(o) };
	const KIND = ['buf', 'tex', 'vao', 'fbo', 'rbo', 'q'];
	// размер точки картинки по формату и типу — чтобы взять из памяти ровно столько байт
	const comps = (f) => ({ 0x1903: 1, 0x8D94: 1, 0x8227: 2, 0x8228: 2, 0x1907: 3, 0x8D98: 3, 0x1908: 4, 0x8D99: 4, 0x1902: 1 }[f] || 4);
	const view = (type, p, n) => {
		const b = u8().buffer;
		if (type === 0x1406) return new Float32Array(b, p, n);
		if (type === 0x140B || type === 0x8D61 || type === 0x1403) return new Uint16Array(b, p, n);
		if (type === 0x1405) return new Uint32Array(b, p, n);
		return new Uint8Array(b, p, n);
	};
	const bpc = (type) => (type === 0x1406 || type === 0x1405 ? 4 : type === 0x140B || type === 0x8D61 || type === 0x1403 ? 2 : 1);

	const glApi = {
		clear: (m) => gl.clear(m),
		clearColor: (r, g, b, a) => gl.clearColor(r, g, b, a),
		viewport: (x, y, w, h) => gl.viewport(x, y, w, h),
		scissor: (x, y, w, h) => gl.scissor(x, y, w, h),
		getString: (n) => String(gl.getParameter(n)),
		extensions: () => exts.join(' '),
		getError: () => gl.getError(),
		createShader: (t) => put('sh', gl.createShader(t)),
		deleteShader: (s) => { gl.deleteShader(get('sh', s)); T.sh[s] = null; },
		shaderSource: (s, src) => gl.shaderSource(get('sh', s), src),
		compileShader: (s) => gl.compileShader(get('sh', s)),
		shaderParam: (s, p) => { const v = gl.getShaderParameter(get('sh', s), p); return typeof v === 'boolean' ? (v ? 1 : 0) : (v | 0); },
		shaderLog: (s) => gl.getShaderInfoLog(get('sh', s)) || '',
		createProgram: () => put('prog', gl.createProgram()),
		deleteProgram: (p) => { gl.deleteProgram(get('prog', p)); T.prog[p] = null; },
		attachShader: (p, s) => gl.attachShader(get('prog', p), get('sh', s)),
		linkProgram: (p) => gl.linkProgram(get('prog', p)),
		programParam: (p, n) => { const v = gl.getProgramParameter(get('prog', p), n); return typeof v === 'boolean' ? (v ? 1 : 0) : (v | 0); },
		programLog: (p) => gl.getProgramInfoLog(get('prog', p)) || '',
		useProgram: (p) => gl.useProgram(get('prog', p)),
		uniformLocation: (p, name) => { const l = gl.getUniformLocation(get('prog', p), name); return l ? put('loc', l) : -1; },
		uniform1i: (l, a) => gl.uniform1i(get('loc', l), a),
		uniform3i: (l, a, b, c) => gl.uniform3i(get('loc', l), a, b, c),
		uniform4i: (l, a, b, c, d) => gl.uniform4i(get('loc', l), a, b, c, d),
		uniform4ui: (l, a, b, c, d) => gl.uniform4ui(get('loc', l), a >>> 0, b >>> 0, c >>> 0, d >>> 0),
		uniform1f: (l, a) => gl.uniform1f(get('loc', l), a),
		uniform2f: (l, a, b) => gl.uniform2f(get('loc', l), a, b),
		uniform3f: (l, a, b, c) => gl.uniform3f(get('loc', l), a, b, c),
		uniform4f: (l, a, b, c, d) => gl.uniform4f(get('loc', l), a, b, c, d),
		uniformfv: (k, l, n, p) => { const v = new Float32Array(u8().buffer, p, n * k); if (k === 2) gl.uniform2fv(get('loc', l), v); else if (k === 3) gl.uniform3fv(get('loc', l), v); else gl.uniform4fv(get('loc', l), v); },
		uniform1iv: (l, n, p) => gl.uniform1iv(get('loc', l), new Int32Array(u8().buffer, p, n)),
		uniformMatrix4fv: (l, n, tr, p) => gl.uniformMatrix4fv(get('loc', l), !!tr, new Float32Array(u8().buffer, p, n * 16)),
		gen: (k, n, p) => { const kind = KIND[k], o = u32(); for (let i = 0; i < n; i++) o[(p >> 2) + i] = put(kind, MAKE[kind]()); },
		del: (k, n, p) => { const kind = KIND[k], o = u32(); for (let i = 0; i < n; i++) { const id = o[(p >> 2) + i]; if (id) { KILL[kind](T[kind][id]); T[kind][id] = null; } } },
		bindBuffer: (t, b) => gl.bindBuffer(t, get('buf', b)),
		bufferData: (t, size, p, usage) => (p ? gl.bufferData(t, new Uint8Array(u8().buffer, p, size), usage) : gl.bufferData(t, size, usage)),
		bufferSubData: (t, off, size, p) => gl.bufferSubData(t, off, new Uint8Array(u8().buffer, p, size)),
		getBufferSubData: (t, off, size, p) => gl.getBufferSubData(t, off, new Uint8Array(u8().buffer, p, size)),
		bindBufferBase: (t, i, b) => gl.bindBufferBase(t, i, get('buf', b)),
		bindVertexArray: (v) => gl.bindVertexArray(get('vao', v)),
		vertexAttribPointer: (i, n, t, norm, stride, off) => gl.vertexAttribPointer(i, n, t, !!norm, stride, off),
		vertexAttribIPointer: (i, n, t, stride, off) => gl.vertexAttribIPointer(i, n, t, stride, off),
		enableVertexAttribArray: (i) => gl.enableVertexAttribArray(i),
		vertexAttribDivisor: (i, d) => gl.vertexAttribDivisor(i, d),
		drawArrays: (m, f, c) => gl.drawArrays(m, f, c),
		drawArraysInstanced: (m, f, c, n) => gl.drawArraysInstanced(m, f, c, n),
		drawElements: (m, c, t, off) => gl.drawElements(m, c, t, off),
		drawElementsInstanced: (m, c, t, off, n) => gl.drawElementsInstanced(m, c, t, off, n),
		bindTexture: (t, x) => gl.bindTexture(t, get('tex', x)),
		activeTexture: (u) => gl.activeTexture(u),
		texImage2D: (t, lv, fmt, w, h, b, f, ty, p) => {
			if (!p) { gl.texImage2D(t, lv, fmt, w, h, b, f, ty, null); return; }
			gl.texImage2D(t, lv, fmt, w, h, b, f, ty, view(ty, p, w * h * comps(f) * (bpc(ty) === 1 ? 1 : 1)));
		},
		compressedTexImage2D: (t, lv, fmt, w, h, b, size, p) => gl.compressedTexImage2D(t, lv, fmt, w, h, b, new Uint8Array(u8().buffer, p, size)),
		texParameteri: (t, n, v) => gl.texParameteri(t, n, v),
		generateMipmap: (t) => gl.generateMipmap(t),
		pixelStorei: (n, v) => gl.pixelStorei(n, v),
		bindFramebuffer: (t, f) => gl.bindFramebuffer(t, get('fbo', f)),
		framebufferTexture2D: (t, a, tt, x, lv) => gl.framebufferTexture2D(t, a, tt, get('tex', x), lv),
		drawBuffers: (n, p) => { const o = u32(), a = []; for (let i = 0; i < n; i++) a.push(o[(p >> 2) + i]); gl.drawBuffers(a); },
		bindRenderbuffer: (t, r) => gl.bindRenderbuffer(t, get('rbo', r)),
		renderbufferStorage: (t, f, w, h) => gl.renderbufferStorage(t, f, w, h),
		framebufferRenderbuffer: (t, a, rt2, r) => gl.framebufferRenderbuffer(t, a, rt2, get('rbo', r)),
		readPixels: (x, y, w, h, f, ty, p) => gl.readPixels(x, y, w, h, f, ty, view(ty, p, w * h * comps(f))),
		enable: (c) => gl.enable(c),
		disable: (c) => gl.disable(c),
		colorMask: (r, g, b, a) => gl.colorMask(!!r, !!g, !!b, !!a),
		depthMask: (m) => gl.depthMask(!!m),
		blendFunc: (s, d) => gl.blendFunc(s, d),
		blendEquation: (m) => gl.blendEquation(m),
		depthFunc: (f) => gl.depthFunc(f),
		cullFace: (m) => gl.cullFace(m),
		frontFace: (m) => gl.frontFace(m),
		getIntegerv: (n, p) => {
			const v = gl.getParameter(n), o = i32();
			if (v && typeof v === 'object' && 'length' in v) { for (let i = 0; i < v.length; i++) o[(p >> 2) + i] = v[i] | 0; }
			else o[p >> 2] = (typeof v === 'boolean' ? (v ? 1 : 0) : v | 0);
		},
		beginQuery: (t, q) => gl.beginQuery(t, get('q', q)),
		endQuery: (t) => gl.endQuery(t),
		queryResult: (q, n) => { const v = gl.getQueryParameter(get('q', q), n); return typeof v === 'boolean' ? (v ? 1 : 0) : Number(v); },
		finish: () => gl.finish(),
	};

	// КЛАВИШИ — по месту на клавиатуре, номера SDL (scancode): игра пишет одну проверку на ПК и в браузере
	const SC = { Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44, Minus: 45, Equal: 46, BracketLeft: 47, BracketRight: 48, Backslash: 49,
		Semicolon: 51, Quote: 52, Backquote: 53, Comma: 54, Period: 55, Slash: 56, CapsLock: 57, Insert: 73, Home: 74, PageUp: 75, Delete: 76, End: 77,
		PageDown: 78, ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81, ArrowUp: 82, ControlLeft: 224, ShiftLeft: 225, AltLeft: 226, ControlRight: 228,
		ShiftRight: 229, AltRight: 230 };
	for (let i = 0; i < 26; i++) SC['Key' + String.fromCharCode(65 + i)] = 4 + i;
	for (let i = 1; i <= 9; i++) SC['Digit' + i] = 29 + i;
	SC.Digit0 = 39;
	for (let i = 1; i <= 12; i++) SC['F' + i] = 57 + i;

	let ex = null, dpr = 1, running = false;
	const size = () => {
		dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
		const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
		if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
	};
	let typingOn = false, sent = '';
	const field = document.createElement('input');
	field.type = 'text'; field.autocomplete = 'off'; field.setAttribute('autocapitalize', 'words'); field.setAttribute('aria-hidden', 'true');
	field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;';
	document.body.appendChild(field);
	field.addEventListener('input', () => {
		const now = field.value; let p = 0;
		while (p < now.length && p < sent.length && now[p] === sent[p]) p++;
		for (let i = p; i < sent.length; i++) ex.Wcg.App.WebKey(42, 1), ex.Wcg.App.WebKey(42, 0);
		if (p < now.length) ex.Wcg.App.WebText(now.substring(p));
		sent = now;
	});
	const appApi = {
		open: () => { size(); return canvas.width * 65536 + canvas.height; },
		run: () => {
			if (running) return; running = true;
			const frame = (t) => { size(); ex.Wcg.App.WebFrame(t, canvas.width, canvas.height); requestAnimationFrame(frame); };
			requestAnimationFrame(frame);
		},
		// ВВОД ТЕКСТА: невидимое поле страницы — на телефоне фокус в нём поднимает экранную клавиатуру (браузер может и не поднять
		// без касания — тогда набор с клавиатуры ПК всё равно дойдёт). Набор (и подсказки клавиатуры, что меняют слово целиком)
		// сводится к «стереть столько-то, дописать такое-то» — как у SDL: текст кусками, стирание — Backspace
		typing: (on) => {
			typingOn = on;
			if (!on) { field.blur(); return; }
			field.value = ''; sent = ''; field.focus({ preventScroll: true });
		},
	};
	// ХРАНИЛИЩЕ: localStorage (частный режим может его закрыть — тогда пусто)
	const storeApi = {
		get: (k) => { try { return localStorage.getItem('wcg.' + k) ?? ''; } catch { return ''; } },
		set: (k, v) => { try { localStorage.setItem('wcg.' + k, v); } catch { } },
	};
	// ЗВУК: WebAudio; клип — буфер (номер в списке), запуск — свой источник с громкостью. Браузер не даёт звук до касания —
	// первое касание (клавиша) будит его
	let actx = null; const clips = [];
	const audio = () => { if (!actx) { try { actx = new AudioContext(); } catch { actx = null; } } if (actx && actx.state === 'suspended') actx.resume(); return actx; };
	window.addEventListener('pointerdown', () => audio()); window.addEventListener('keydown', () => audio());
	const soundApi = {
		add: (data, rate) => {
			const a = audio(); if (!a) return -1;
			const b = a.createBuffer(1, data.length, rate); b.copyToChannel(Float32Array.from(data), 0);
			clips.push(b); return clips.length - 1;
		},
		play: (id, vol) => {
			const a = audio(); if (!a || !clips[id]) return;
			const src = a.createBufferSource(), g = a.createGain(); g.gain.value = vol;
			src.buffer = clips[id]; src.connect(g).connect(a.destination); src.start();
		},
	};
	rt.setModuleImports('wcg', { gl: glApi, app: appApi, store: storeApi, sound: soundApi });
	ex = await rt.getAssemblyExports('WcgEngine');

	// ВВОД ОДНИМ ПОТОКОМ, как на ПК: мышь — палец −2 (правая кнопка — −3, средняя — −4), пальцы — свои номера; место — в пикселях кадра
	canvas.style.touchAction = 'none';
	canvas.addEventListener('contextmenu', (e) => e.preventDefault());
	const at = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
	const pid = (e) => {
		if (e.pointerType !== 'mouse') return e.pointerId & 0x7fffffff;
		const mv = e.type === 'pointermove';
		if (e.button === 2 || (mv && (e.buttons & 2) && !(e.buttons & 1))) return -3;
		if (e.button === 1 || (mv && (e.buttons & 4) && !(e.buttons & 3))) return -4;
		return -2;
	};
	// ВЗГЛЯД МЫШЬЮ (App.Look): курсор заперт в холсте (pointer lock), ход мыши — в App.WebLook; Esc отпускает сам браузер.
	// Запереть можно только по действию человека — игра зовёт это из щелчка (вызов идёт внутри события pointerdown)
	appApi.look = (on) => {
		if (!on) { if (document.pointerLockElement === canvas) document.exitPointerLock(); return; }
		try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch { }
	};
	document.addEventListener('pointerlockchange', () => ex.Wcg.App.WebLooking(document.pointerLockElement === canvas));
	canvas.addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) ex.Wcg.App.WebLook(e.movementX, e.movementY); });
	canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch { } const [x, y] = at(e); ex.Wcg.App.WebPointer(pid(e), 0, x, y); e.preventDefault(); });
	canvas.addEventListener('pointerup', (e) => { const [x, y] = at(e); ex.Wcg.App.WebPointer(pid(e), 2, x, y); e.preventDefault(); });
	canvas.addEventListener('pointercancel', (e) => { const [x, y] = at(e); ex.Wcg.App.WebPointer(pid(e), 2, x, y); });
	canvas.addEventListener('pointermove', (e) => {
		const [x, y] = at(e);
		if (e.pointerType === 'mouse' && e.buttons === 0) ex.Wcg.App.WebHover(x, y); else ex.Wcg.App.WebPointer(pid(e), 1, x, y);
	});
	canvas.addEventListener('wheel', (e) => { ex.Wcg.App.WebWheel(e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0); e.preventDefault(); }, { passive: false });
	// поле ввода открыто — буквы идут в него (событие input), клавише — только место; Backspace и Enter — клавишами, поле их не видит
	window.addEventListener('keydown', (e) => {
		const c = SC[e.code]; if (c === undefined) return; if (!e.repeat) ex.Wcg.App.WebKey(c, 1);
		if (typingOn && e.key.length === 1 && !e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
	});
	window.addEventListener('keyup', (e) => { const c = SC[e.code]; if (c === undefined) return; ex.Wcg.App.WebKey(c, 0); e.preventDefault(); });
	// «НАЗАД» БРАУЗЕРА — как кнопка телефона в приложении: своя запись в истории; «назад» снимает её, экран решает (меню, шаг
	// назад) — и запись ставится снова; экран вернул false (главная) — уходим со страницы. Запись — после первого касания или
	// клавиши: без действия человека браузер такие записи «назад» пропускает
	let trap = false;
	const arm = () => { if (trap) return; trap = true; history.pushState({ wcg: 1 }, ''); };
	window.addEventListener('pointerdown', arm); window.addEventListener('keydown', arm);
	window.addEventListener('popstate', () => {
		if (!trap) return;
		trap = false;
		if (ex.Wcg.App.WebBack()) arm(); else history.back();
	});
	// вкладку прячут или закрывают — экран сохраняет (IScreen.Leave); закрытие тоже проходит через «скрыта»
	document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ex.Wcg.App.WebLeave(); });

	await rt.runMain();
	return { rt, ex, gl };
}
