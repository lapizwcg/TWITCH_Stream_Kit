// ЦЕЛЬ ТРАНСЛЯЦИИ: плашка с заголовком, счётом и прогрессом. Виды (style): ltr — полоса слева направо, rtl — справа налево, ttb —
// столбик сверху вниз, btt — снизу вверх, radial — кольцо по часовой с верхней точки. Заливка — перелив тонов с бликом, у края
// заливки — мягкое свечение, по заливке пробегает блеск; на дорожке — отметки четвертей. Значение доезжает плавно, на прибавке у
// края — искры; цель достигнута — вспышки по всей длине, «ЦЕЛЬ ДОСТИГНУТА!» с пульсом, заливка золотая.
// Тест (Preview) — заливка на долю цели на несколько секунд, настоящий счёт не трогается. Значения задаёт док-панель (Configure)
using System;
using Wcg;

namespace Kit;

public sealed class Goal
{
	// шаги (60 в секунду): проявление/скрытие, праздник цели, период блеска, длина теста
	const int FadeSteps = 20, Party = 300, Sheen = 200, PreviewSteps = 300;

	readonly Shapes sh = new(128); readonly Grads gr = new(64); readonly Text tx; readonly Vfx fx = new(); readonly FxBatch light = new(), norm = new();
	float ax = 0.5f, ay = 1, shown, vis;
	string title = "ЦЕЛЬ: ФОЛЛОВЕРЫ", style = "ltr";
	int current, target = 100, t, party = -1, preview = -1, previewValue;
	bool on, configured;

	public Goal(Text tx) { this.tx = tx; }

	int Value => preview >= 0 ? previewValue : current;

	public void Configure(bool on, string pos, string head, int cur, int goal, string kind)
	{
		goal = Math.Max(1, goal); cur = Math.Max(0, cur);
		(ax, ay) = Layout.Anchor(pos);
		title = string.IsNullOrWhiteSpace(head) ? "ЦЕЛЬ" : head.Trim();
		style = kind is "rtl" or "ttb" or "btt" or "radial" ? kind : "ltr";
		// первая настройка при запуске — без праздника и искр: значения уже были, их просто показываем
		if (configured && on && this.on && preview < 0)
		{
			if (cur > current) Spark(Math.Min(1f, cur / (float)goal), false);
			if (cur >= goal && current < target) Celebrate();
		}
		if (!configured) shown = cur;
		this.on = on; current = cur; target = goal; configured = true;
		if (cur < goal && preview < 0) party = -1;
	}

	// тест из дока: заливка доезжает до доли цели, держится и возвращается к настоящему счёту
	public void Preview(double frac)
	{
		if (!on) return;
		previewValue = (int)Math.Round(target * Math.Clamp(frac, 0, 1));
		preview = 0; party = -1;
		Spark(previewValue / (float)target, false);
	}

	void Celebrate() { party = 0; for (int i = 0; i <= 6; i++) Spark(i / 6f, true); }

	// ---------- раскладка: размер плашки по виду, место, дорожка ----------

	bool Vertical => style is "ttb" or "btt";
	bool Ring => style == "radial";

	(float x, float y, float w, float h) Box(int w, int h)
	{
		float u = h / 1080f;
		var (bw, bh) = Ring ? (320 * u, 372 * u) : Vertical ? (170 * u, 560 * u) : (700 * u, 136 * u);
		var (cx, cy) = Layout.Place(ax, ay, w, h, bw, bh, 70 * u, 50 * u);
		return (cx - bw / 2, cy - bh / 2, bw, bh);
	}

	// дорожка полосы или столбика
	(float x, float y, float w, float h) Track(float bx, float by, float bw, float bh, float u) => Vertical
		? (bx + bw / 2 - 22 * u, by + 72 * u, 44 * u, bh - 72 * u - 76 * u)
		: (bx + 30 * u, by + bh - 30 * u - 38 * u, bw - 60 * u, 38 * u);

	// кольцо: середина, внешний радиус, толщина
	(float cx, float cy, float r, float th) RingOf(float bx, float by, float bw, float bh, float u) => (bx + bw / 2, by + 70 * u + 128 * u, 128 * u, 30 * u);

	// точка края заливки при доле frac — для искр и свечения
	(float x, float y) Head(float frac, int w, int h)
	{
		float u = h / 1080f;
		var (bx, by, bw, bh) = Box(w, h);
		if (Ring)
		{
			var (cx, cy, r, th) = RingOf(bx, by, bw, bh, u);
			float a = -MathF.PI / 2 + frac * MathF.Tau, rc = r - th / 2;
			return (cx + MathF.Cos(a) * rc, cy + MathF.Sin(a) * rc);
		}
		var (x, y, tw, tl) = Track(bx, by, bw, bh, u);
		return style switch
		{
			"rtl" => (x + tw - tw * frac, y + tl / 2),
			"ttb" => (x + tw / 2, y + tl * frac),
			"btt" => (x + tw / 2, y + tl - tl * frac),
			_ => (x + tw * frac, y + tl / 2),
		};
	}

	void Spark(float frac, bool big)
	{
		var (px, py) = Head(frac, App.W, App.H);
		float u = App.H / 1080f;
		fx.Burst("искры", px, py, scale: (big ? 2.4f : 1.6f) * u);
		fx.Burst("вспышка", px, py, scale: (big ? 2.4f : 1.4f) * u);
		if (big) fx.Burst("кольцо", px, py, scale: 1.6f * u);
	}

	public void Step()
	{
		fx.Step(); t++;
		vis = Math.Clamp(vis + (on ? 1f : -1f) / FadeSteps, 0, 1);
		// доезжает до значения: быстро издали, мягко у цели
		shown += (Value - shown) * 0.08f;
		if (Math.Abs(Value - shown) < 0.01f) shown = Value;
		if (party >= 0 && party < Party) party++;
		if (preview >= 0 && ++preview > PreviewSteps) preview = -1;
	}

	public void Draw(int w, int h)
	{
		if (vis > 0) Plate(w, h);
		if (fx.Count > 0) { light.Begin(); norm.Begin(); fx.Draw(light, norm); norm.Flush(1, 0, 0, w, h); light.Flush(1, 0, 0, w, h); }
	}

	// ---------- рисование ----------

	// светящийся цвет: прозрачность 0 — в оверлее ложится на видео сложением (свечение, блеск)
	static uint Add(string mat, double tone, float k)
	{
		var c = Mats.Pixel(Mats.Get(mat), 200, tone);
		k = Math.Clamp(k, 0, 1);
		return (uint)(c[0] * k) | (uint)(c[1] * k) << 8 | (uint)(c[2] * k) << 16;
	}

	void Plate(int w, int h)
	{
		float u = h / 1080f;
		int a = (int)(255 * vis);
		var (bx, by, bw, bh) = Box(w, h);
		bool done = Value >= target;
		float frac = Math.Clamp(shown / target, 0, 1);
		string mat = done ? "gold" : "c_azure";

		// плашка — тёмное стекло с переливом сверху вниз, тонкой кромкой и светлой линией по верху
		gr.Begin(); gr.Screen();
		gr.Linear(bx, by, bw, bh, Layout.Col("obsidian", 0.2, a * 235 / 255), Layout.Col("obsidian", 0.06, a * 235 / 255), 26 * u, soft: 1.5f);
		gr.Flush(w, h);
		sh.Begin(); sh.Screen();
		sh.Rect(bx, by, bw, bh, 0, 26 * u, 2.5f * u, Layout.Col(mat, 0.62, a * 200 / 255));
		sh.Rect(bx + 26 * u, by + 1.5f * u, bw - 52 * u, 1.5f * u, Layout.Col("pearl", 0.95, a * 40 / 255));
		sh.Flush(w, h);

		if (Ring) RingBar(bx, by, bw, bh, u, a, frac, mat, w, h);
		else LineBar(bx, by, bw, bh, u, a, frac, mat, w, h);
		Labels(bx, by, bw, bh, u, a, done, w, h);
	}

	void LineBar(float bx, float by, float bw, float bh, float u, int a, float frac, string mat, int w, int h)
	{
		var (x, y, tw, tl) = Track(bx, by, bw, bh, u);
		float r = Math.Min(tw, tl) / 2, len = Vertical ? tl : tw;

		// дорожка: утопленная — темнее сверху (тень), еле заметная кромка, отметки четвертей
		gr.Begin(); gr.Screen();
		gr.Linear(x, y, tw, tl, Layout.Col("obsidian", 0.02, a), Layout.Col("obsidian", 0.1, a), r);
		gr.Flush(w, h);
		sh.Begin(); sh.Screen();
		sh.Rect(x, y, tw, tl, 0, r, 1.2f * u, Layout.Col("pearl", 0.9, a * 22 / 255));
		for (int q = 1; q < 4; q++)
		{
			if (Vertical) sh.Rect(x + tw * 0.28f, y + tl * q / 4 - u, tw * 0.44f, 2 * u, Layout.Col("pearl", 0.9, a * 30 / 255));
			else sh.Rect(x + tw * q / 4 - u, y + tl * 0.28f, 2 * u, tl * 0.44f, Layout.Col("pearl", 0.9, a * 30 / 255));
		}
		sh.Flush(w, h);
		if (frac <= 0) return;

		// заливка от своего края; длина не меньше толщины — скругление остаётся кругом
		float fl = Math.Max(2 * r, len * frac), pad = 3 * u;
		var (fx0, fy0, fw, fh) = style switch
		{
			"rtl" => (x + tw - fl, y, fl, tl),
			"ttb" => (x, y, tw, fl),
			"btt" => (x, y + tl - fl, tw, fl),
			_ => (x, y, fl, tl),
		};
		gr.Begin(); gr.Screen();
		// перелив сверху вниз: светлее сверху — объём трубки
		gr.Linear(fx0 + pad, fy0 + pad, fw - 2 * pad, fh - 2 * pad, Layout.Col(mat, Vertical ? 0.74 : 0.82, a), Layout.Col(mat, Vertical ? 0.5 : 0.42, a), r - pad);
		// свечение у края заливки, дышит
		var (hx, hy) = Head(frac, w, h);
		float pulse = 0.75f + 0.25f * MathF.Sin(t * 0.08f);
		gr.Spot(hx, hy, 3.2f * r, 3.2f * r, Add(mat, 0.8, 0.55f * pulse * a / 255f));
		gr.Flush(w, h);

		sh.Begin(); sh.Screen();
		// блик: у полосы — поверху, у столбика — слева
		if (Vertical) sh.Rect(fx0 + fw * 0.22f, fy0 + r * 0.6f, fw * 0.18f, Math.Max(0, fh - 1.2f * r), Layout.Col("pearl", 0.97, a * 90 / 255), fw * 0.09f);
		else sh.Rect(fx0 + r * 0.6f, fy0 + fh * 0.2f, Math.Max(0, fw - 1.2f * r), fh * 0.18f, Layout.Col("pearl", 0.97, a * 90 / 255), fh * 0.09f);
		sh.Flush(w, h);

		// блеск бежит по заливке в сторону роста — цепочка мягких пятен, как у кольца (сплошной светлой таблеткой он выглядел
		// посторонним куском). Только в пределах заливки, не на скруглённых концах
		float s = (t % Sheen) / (float)Sheen * 1.5f - 0.25f, sp = r * 0.9f;
		float c0 = style is "ltr" or "ttb" ? s * len : len - s * len;
		float lo = Vertical ? fy0 - y : fx0 - x, hi = lo + (Vertical ? fh : fw);
		gr.Begin(); gr.Screen();
		for (int i = -2; i <= 2; i++)
		{
			float c = c0 + i * r * 0.6f;
			if (c < lo + r || c > hi - r) continue;
			float k = 1 - Math.Abs(i) / 3f;
			var (px, py) = Vertical ? (x + tw / 2, y + c) : (x + c, y + tl / 2);
			gr.Spot(px, py, sp, sp, Add("pearl", 0.95, 0.2f * k * a / 255f));
		}
		gr.Flush(w, h);
	}

	void RingBar(float bx, float by, float bw, float bh, float u, int a, float frac, string mat, int w, int h)
	{
		var (cx, cy, r, th) = RingOf(bx, by, bw, bh, u);
		float rc = r - th / 2, a0 = -MathF.PI / 2, span = frac * MathF.Tau, pad = 3 * u;

		// середина кольца — мягкая подсветка цветом заливки; дорожка — тёмное кольцо с кромкой и отметками четвертей
		gr.Begin(); gr.Screen();
		gr.Radial(cx - r + th, cy - r + th, 2 * (r - th), 2 * (r - th), Layout.Col(mat, 0.3, a * 60 / 255), 0, r - th);
		gr.Flush(w, h);
		sh.Begin(); sh.Screen();
		sh.Ring(cx, cy, r, th, Layout.Col("obsidian", 0.04, a));
		sh.Ring(cx, cy, r + 1.2f * u, 1.2f * u, Layout.Col("pearl", 0.9, a * 22 / 255));
		for (int q = 0; q < 4; q++)
		{
			float qa = a0 + q * MathF.Tau / 4, c = MathF.Cos(qa), s = MathF.Sin(qa);
			sh.Line(cx + c * (r - th * 0.72f), cy + s * (r - th * 0.72f), cx + c * (r - th * 0.28f), cy + s * (r - th * 0.28f), 2 * u, Layout.Col("pearl", 0.9, a * 30 / 255));
		}
		if (frac > 0)
		{
			// заливка — три дуги: тёмное основание, светлая середина, блик ближе к внешнему краю; концы — круглые
			sh.Arc(cx, cy, r - pad, th - 2 * pad, a0, span, Layout.Col(mat, 0.45, a));
			sh.Arc(cx, cy, r - pad - th * 0.18f, th * 0.5f, a0, span, Layout.Col(mat, 0.72, a));
			sh.Arc(cx, cy, r - pad - th * 0.12f, th * 0.12f, a0, span, Layout.Col("pearl", 0.97, a * 80 / 255));
			float cr = (th - 2 * pad) / 2;
			sh.Circle(cx + MathF.Cos(a0) * rc, cy + MathF.Sin(a0) * rc, cr, Layout.Col(mat, 0.55, a));
			sh.Circle(cx + MathF.Cos(a0 + span) * rc, cy + MathF.Sin(a0 + span) * rc, cr, Layout.Col(mat, 0.6, a));
		}
		sh.Flush(w, h);
		if (frac <= 0) return;
		var (hx, hy) = Head(frac, w, h);
		float pulse = 0.75f + 0.25f * MathF.Sin(t * 0.08f);
		gr.Begin(); gr.Screen();
		gr.Spot(hx, hy, 2.4f * th, 2.4f * th, Add(mat, 0.8, 0.55f * pulse * a / 255f));
		// блеск обходит заливку по кругу — цепочка мягких пятен вдоль кольца. Дугой он выходил резким куском с обрубленными
		// концами, нарезка дуги на узкие куски давала полоски на стыках; у пятен краёв нет. Только внутри заливки
		float sc = (t % Sheen) / (float)Sheen * 1.4f * MathF.Tau - 0.3f, edge = th / rc;
		for (int i = -2; i <= 2; i++)
		{
			float sa = sc + i * 0.09f;
			if (sa < edge || sa > span - edge) continue;
			float k = 1 - Math.Abs(i) / 3f;
			gr.Spot(cx + MathF.Cos(a0 + sa) * rc, cy + MathF.Sin(a0 + sa) * rc, th * 0.7f, th * 0.7f, Add("pearl", 0.95, 0.22f * k * a / 255f));
		}
		gr.Flush(w, h);
	}

	// заголовок и счёт: у полосы — заголовок слева, счёт и проценты справа; у столбика — сверху и снизу; у кольца — число в середине
	void Labels(float bx, float by, float bw, float bh, float u, int a, bool done, int w, int h)
	{
		bool cheer = party >= 0 && party < Party;
		string head = cheer ? "ЦЕЛЬ ДОСТИГНУТА!" : title;
		uint headCol = Layout.Col(cheer || done ? "gold" : "citrine", 0.85, a), countCol = Layout.Col("pearl", 0.95, a), dim = Layout.Col("pearl", 0.72, a);
		int value = (int)MathF.Round(shown);
		string count = $"{value} / {target}", pct = $"{Math.Clamp(value * 100 / target, 0, 999)}%";
		float pulse = cheer ? 1 + 0.06f * MathF.Sin(t * 0.2f) : 1;
		// надпись не шире своего места: длинная — мельче
		float Fit(string s, float px, float room) => MathF.Round(Math.Min(px, px * room / Math.Max(1, tx.Width(s, px))));
		void Center(string s, float cx, float y, float px, uint col, float outline = 0) => tx.Draw(s, cx - tx.Width(s, px) / 2, y, px, col, outline);

		tx.Begin();
		if (Ring)
		{
			var (cx, cy, r, th) = RingOf(bx, by, bw, bh, u);
			string v = value.ToString(), sub = $"из {target} · {pct}";
			float hp = Fit(head, 30 * u * pulse, bw - 40 * u), vp = Fit(v, 64 * u, 2 * (r - th) - 34 * u);
			Center(head, bx + bw / 2, by + 22 * u, hp, headCol);
			Center(v, cx, cy - vp * 0.62f, vp, countCol, 1.5f * u);
			Center(sub, cx, cy + vp * 0.45f, Fit(sub, 22 * u, 2 * (r - th) - 20 * u), dim);
		}
		else if (Vertical)
		{
			Center(head, bx + bw / 2, by + 24 * u, Fit(head, 26 * u * pulse, bw - 24 * u), headCol);
			Center(count, bx + bw / 2, by + bh - 62 * u, Fit(count, 26 * u, bw - 20 * u), countCol, 1.5f * u);
			Center(pct, bx + bw / 2, by + bh - 32 * u, 22 * u, dim);
		}
		else
		{
			float cp = 30 * u, cw = tx.Width(count, cp), pp = 22 * u, pw = tx.Width(pct, pp);
			tx.Draw(head, bx + 30 * u, by + 24 * u, Fit(head, 30 * u * pulse, bw - 90 * u - cw - pw), headCol);
			tx.Draw(count, bx + bw - 30 * u - cw, by + 24 * u, cp, countCol, 1.5f * u);
			tx.Draw(pct, bx + bw - 30 * u - cw - 14 * u - pw, by + 30 * u, pp, dim);
		}
		tx.Flush(w, h);
	}
}
