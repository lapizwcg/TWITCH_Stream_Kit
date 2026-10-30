// ЦЕЛЬ ТРАНСЛЯЦИИ: плашка с заголовком, счётом «37 / 100» и полосой прогресса. Полоса доезжает до нового значения плавно, на прибавке
// у её края — искры; по полосе время от времени пробегает блик. Цель достигнута — вспышки вдоль всей полосы, заголовок «ЦЕЛЬ
// ДОСТИГНУТА!» с пульсом, полоса золотая. Значения задаёт док-панель (Configure); подключение к Twitch — следующий шаг
using System;
using Wcg;

namespace Kit;

public sealed class Goal
{
	// шаги (60 в секунду): проявление/скрытие, праздник цели, период блика
	const int FadeSteps = 20, Party = 300, Sheen = 200;

	readonly Shapes sh = new(64); readonly Text tx; readonly Vfx fx = new(); readonly FxBatch light = new(), norm = new();
	float ax = 0.5f, ay = 1, shown, vis;
	string title = "ЦЕЛЬ: ФОЛЛОВЕРЫ";
	int current, target = 100, t, party = -1;
	bool on, configured;

	public Goal(Text tx) { this.tx = tx; }

	public void Configure(bool on, string pos, string head, int cur, int goal)
	{
		goal = Math.Max(1, goal); cur = Math.Max(0, cur);
		(ax, ay) = Layout.Anchor(pos);
		title = string.IsNullOrWhiteSpace(head) ? "ЦЕЛЬ" : head.Trim();
		// первая настройка при запуске — без праздника и искр: значения уже были, их просто показываем
		if (configured && on && this.on)
		{
			if (cur > current) Spark(Math.Min(1f, cur / (float)goal), false);
			if (cur >= goal && current < target) { party = 0; for (int i = 0; i <= 6; i++) Spark(i / 6f, true); }
		}
		if (!configured) shown = cur;
		this.on = on; current = cur; target = goal; configured = true;
		if (cur < goal) party = -1;
	}

	// размер плашки и её место; полоса — внутри с полями
	(float x, float y, float w, float h) Box(int w, int h)
	{
		float u = h / 1080f, bw = 680 * u, bh = 128 * u;
		var (cx, cy) = Layout.Place(ax, ay, w, h, bw, bh, 70 * u, 50 * u);
		return (cx - bw / 2, cy - bh / 2, bw, bh);
	}

	void Spark(float frac, bool big)
	{
		var (x, y, bw, bh) = Box(App.W, App.H);
		float u = App.H / 1080f, pad = 28 * u;
		float px = x + pad + (bw - 2 * pad) * frac, py = y + bh - pad - 17 * u;
		fx.Burst("искры", px, py, scale: (big ? 2.4f : 1.6f) * u);
		fx.Burst("вспышка", px, py, scale: (big ? 2.4f : 1.4f) * u);
		if (big) fx.Burst("кольцо", px, py, scale: 1.6f * u);
	}

	public void Step()
	{
		fx.Step(); t++;
		vis = Math.Clamp(vis + (on ? 1f : -1f) / FadeSteps, 0, 1);
		// доезжает до значения: быстро издали, мягко у цели
		shown += (current - shown) * 0.08f;
		if (Math.Abs(current - shown) < 0.01f) shown = current;
		if (party >= 0 && party < Party) party++;
	}

	public void Draw(int w, int h)
	{
		if (vis > 0) Bar(w, h);
		if (fx.Count > 0) { light.Begin(); norm.Begin(); fx.Draw(light, norm); norm.Flush(1, 0, 0, w, h); light.Flush(1, 0, 0, w, h); }
	}

	void Bar(int w, int h)
	{
		float u = h / 1080f;
		int a = (int)(255 * vis);
		var (x, y, bw, bh) = Box(w, h);
		bool done = current >= target;
		float frac = Math.Clamp(shown / target, 0, 1), pad = 28 * u;
		float tx0 = x + pad, tw = bw - 2 * pad, th = 34 * u, ty = y + bh - pad - th;
		string fillMat = done ? "gold" : "c_azure";

		sh.Begin(); sh.Screen();
		sh.Rect(x, y, bw, bh, Layout.Col("obsidian", 0.12, a * 225 / 255), 24 * u, 4 * u, Layout.Col(done ? "gold" : "c_azure", 0.7, a));
		// дорожка и заполнение; у заполнения — светлая полоска сверху (объём) и бегущий блик
		sh.Rect(tx0, ty, tw, th, Layout.Col("obsidian", 0.04, a), th / 2);
		float fw = Math.Max(th, tw * frac);
		if (frac > 0)
		{
			sh.Rect(tx0, ty, fw, th, Layout.Col(fillMat, 0.55, a), th / 2);
			sh.Rect(tx0 + th * 0.3f, ty + th * 0.18f, fw - th * 0.6f, th * 0.22f, Layout.Col(fillMat, 0.9, a * 120 / 255), th * 0.11f);
			float s = (t % Sheen) / (float)Sheen * 1.6f - 0.3f, sw = 60 * u, sx = tx0 + s * tw;
			// блик — только в пределах заполнения
			float l = Math.Max(sx, tx0 + th * 0.3f), r = Math.Min(sx + sw, tx0 + fw - th * 0.3f);
			if (r > l) sh.Rect(l, ty + th * 0.1f, r - l, th * 0.8f, Layout.Col("pearl", 0.95, a * 70 / 255), th * 0.3f);
		}
		sh.Flush(w, h);

		// заголовок слева, счёт справа; цель достигнута — «ЦЕЛЬ ДОСТИГНУТА!» с пульсом, потом снова заголовок
		bool cheer = party >= 0 && party < Party;
		string head = cheer ? "ЦЕЛЬ ДОСТИГНУТА!" : title;
		float hp = MathF.Round(30 * u * (cheer ? 1 + 0.06f * MathF.Sin(t * 0.2f) : 1));
		string count = $"{(int)MathF.Round(shown)} / {target}";
		float cp = MathF.Round(30 * u), cw = tx.Width(count, cp);
		tx.Begin();
		tx.Draw(head, tx0, y + 22 * u, hp, Layout.Col(cheer || done ? "gold" : "citrine", 0.85, a));
		tx.Draw(count, x + bw - pad - cw, y + 22 * u, cp, Layout.Col("pearl", 0.95, a), 1.5f * u);
		tx.Flush(w, h);
	}
}
