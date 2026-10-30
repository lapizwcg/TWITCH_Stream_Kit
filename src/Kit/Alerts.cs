// ОПОВЕЩЕНИЯ: карточка «Новый фоллоуер · ник» со вспышками частиц на прозрачном фоне (оверлей OBS).
// Карточка выезжает с отскоком, держится заданное время и тает; без оповещения кадр пустой — рисовать нечего. Пришедшие во время
// показа ждут в очереди — при наплыве фоллоу карточки не налезают друг на друга.
// Настройки (место, заголовок, время, вкл.) задаёт док-панель через мост страницы (hosts/Web/Bridge.cs) — Configure.
// Место — Layout (девять мест); источник в OBS — на весь экран: вспышки разлетаются за карточку и не обрезаются его краем.
// --demo — оповещение само раз в 6 с (проверка без Twitch). Рисует сцена (Stage) — вместе с целью
using System;
using System.Collections.Generic;
using Wcg;

namespace Kit;

public sealed class Alerts
{
	// шаги (60 в секунду): появление, исчезание, пауза между карточками из очереди, период демо
	const int In = 20, Out = 30, Gap = 30, Every = 360;
	static readonly string[] DemoNames = { "LapizWCG", "котик_в_тапках", "Neformalization_Official", "xXSlayerXx", "Gamer2007" };

	readonly Shapes sh = new(64); readonly Text tx; readonly Vfx fx = new(); readonly FxBatch light = new(), norm = new();
	readonly bool demo;
	readonly Queue<string> queue = new();
	// место карточки в кадре: доли свободного места по X и Y (0 — у левого/верхнего края, 1 — у правого/нижнего)
	float ax = 0.5f, ay = 0.5f;
	string title = "НОВЫЙ ФОЛЛОУЕР";
	int hold = 240, t, age = -1, wait, demoN;
	bool enabled = true;
	string name = "";

	public Alerts(Text tx, bool demo) { this.tx = tx; this.demo = demo; }

	public void Configure(bool on, string pos, string head, double seconds)
	{
		enabled = on; (ax, ay) = Layout.Anchor(pos);
		title = string.IsNullOrWhiteSpace(head) ? "НОВЫЙ ФОЛЛОУЕР" : head.Trim();
		hold = (int)(Math.Clamp(seconds, 1, 30) * 60);
		if (!on) queue.Clear();
	}

	// в очередь; показ — в Step, когда освободится место
	public void Show(string who) { if (enabled && !string.IsNullOrWhiteSpace(who)) queue.Enqueue(who.Trim()); }
	public void ShowDemo() => Show(DemoNames[demoN++ % DemoNames.Length]);

	// размер карточки в покое (без отскока) и её середина по месту; поле от края — с запасом под вспышки у боков
	(float cx, float cy, float cw, float ch) Place(int w, int h)
	{
		float u = h / 1080f;
		float cw = Math.Max(tx.Width(title, MathF.Round(26 * u)), tx.Width(name, MathF.Round(64 * u))) + 120 * u, ch = 190 * u;
		var (cx, cy) = Layout.Place(ax, ay, w, h, cw, ch, 110 * u, 70 * u);
		return (cx, cy, cw, ch);
	}

	void Start(string who)
	{
		name = who; age = 0;
		// вспышки — у краёв карточки, не поверх ника; пресеты сделаны под окно в 540 точек высотой — крупнее по размеру кадра
		var (cx, cy, cw, _) = Place(App.W, App.H);
		float u = App.H / 1080f;
		foreach (float x in new[] { cx - cw / 2, cx + cw / 2 })
			foreach (var n in Vfx.Bursts["follow"]) fx.Burst(n, x, cy, scale: 2.2f * u);
	}

	public void Step()
	{
		fx.Step();
		// первое — почти сразу после запуска, чтобы в OBS не ждать
		if (demo && t++ % Every == 30) ShowDemo();
		if (age >= 0 && ++age > In + hold + Out) { age = -1; wait = Gap; }
		if (age < 0 && wait > 0) wait--;
		else if (age < 0 && queue.Count > 0) Start(queue.Dequeue());
	}

	public void Draw(int w, int h)
	{
		if (age >= 0) Card(w, h);
		if (fx.Count > 0) { light.Begin(); norm.Begin(); fx.Draw(light, norm); norm.Flush(1, 0, 0, w, h); light.Flush(1, 0, 0, w, h); }
	}

	void Card(int w, int h)
	{
		float u = h / 1080f;
		// появление — с перелётом (easeOutBack), исчезание — прозрачностью
		float p = Math.Min(1f, age / (float)In), k = 1 + 2.7f * MathF.Pow(p - 1, 3) + 1.7f * MathF.Pow(p - 1, 2);
		float fade = age > In + hold ? 1 - (age - In - hold) / (float)Out : 1;
		int a = (int)(255 * Math.Clamp(fade, 0, 1));
		float tp = MathF.Round(26 * u * k), np = MathF.Round(64 * u * k);
		if (tp < 2 || np < 2) return;
		float tw = tx.Width(title, tp), nw = tx.Width(name, np);
		float cw = Math.Max(tw, nw) + 120 * u * k, ch = 190 * u * k;
		var (cx, cy, _, _) = Place(w, h);
		float x = cx - cw / 2, y = cy - ch / 2;

		sh.Begin(); sh.Screen();
		sh.Rect(x, y, cw, ch, Layout.Col("obsidian", 0.12, a * 225 / 255), 26 * u * k, 4 * u * k, Layout.Col("c_azure", 0.7, a));
		// полоска-акцент под заголовком
		sh.Rect(cx - tw / 2, y + 70 * u * k, tw, 4 * u * k, Layout.Col("citrine", 0.8, a), 2 * u * k);
		sh.Flush(w, h);

		tx.Begin();
		tx.Draw(title, cx - tw / 2, y + 30 * u * k, tp, Layout.Col("citrine", 0.85, a));
		tx.Draw(name, cx - nw / 2, y + 92 * u * k, np, Layout.Col("pearl", 0.95, a), 2 * u);
		tx.Flush(w, h);
	}
}
