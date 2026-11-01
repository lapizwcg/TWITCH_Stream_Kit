// РАМКА ЭФИРА (Stream Frame) — полоса по краям кадра, все окошки живут внутри неё (Layout.Inset). Настраивается в доке:
// - толщина, отступ от края экрана, непрозрачность фона;
// - внутренние углы выреза, у каждого свой вид: round (скруглён внутрь), bevel (срез), rect (прямой), scoop (вогнутый — рамка
//   четвертью круга заходит в кадр), notch (ступенька — квадратный выступ рамки), и общий размер;
// - форма внутреннего края: line (прямая), wave (волна), zigzag (зигзаг), scallop (дуги), crenel (зубцы), saw (пила), spikes
//   (шипы), steps (ступени-зиккурат), bulbs (капли на ножке), tee (Т-образные), meander (греческий меандр) — высота и шаг;
//   на каждой стороне — целое число шагов, у углов край сходится к прямой;
// - узор на полосе: line, double (одна или две линии вдоль), dots (точки), diamonds (ромбы), rivets (заклёпки в два ряда),
//   chevrons (уголки) — по шагу края, в свободной от формы края части полосы; у точек, ромбов, заклёпок и уголков — камни в углах;
// - цвета (материалы с тоном): фон рамки и линия по внутреннему краю, её толщина и свечение внутрь кадра.
// Край волн и зубцов уходит в рамку, не в кадр: место окошек — прямоугольник выреза
using System;
using System.Collections.Generic;
using System.Globalization;
using Wcg;

namespace Kit;

public sealed class Frame
{
	public bool On;
	// точки при высоте 1080
	public float Width = 28, Margin, Line = 3, Glow = 18, Corner = 40, Amp = 8, Period = 80;
	public float Opacity = 0.92f;
	public (string mat, double tone) Bg = ("obsidian", 0.12), Border = ("c_azure", 0.7);
	// углы выреза по часовой: tl, tr, br, bl
	public readonly string[] Corners = { "round", "round", "round", "round" };
	public string Edge = "line", Ornament = "none";
	public float OrnSize = 1;
	static readonly HashSet<string> Kinds = new() { "round", "bevel", "rect", "scoop", "notch" };
	static readonly HashSet<string> Ornaments = new() { "none", "line", "double", "dots", "diamonds", "rivets", "chevrons" };
	// края из ломаных: точки одного шага (u — доля шага вдоль стороны, v — доля высоты в рамку), от (0, 0) к (1, 0) без концов.
	// Обход — как у выреза: вырез справа по ходу, ломаная не пересекает себя
	static readonly Dictionary<string, (float u, float v)[]> Cells = new()
	{
		["saw"] = new[] { (1f, 1f) },
		["spikes"] = new[] { (0.32f, 0f), (0.5f, 1f), (0.68f, 0f) },
		["steps"] = new[] { (0.12f, 0f), (0.12f, 0.33f), (0.27f, 0.33f), (0.27f, 0.66f), (0.42f, 0.66f), (0.42f, 1f), (0.58f, 1f), (0.58f, 0.66f), (0.73f, 0.66f), (0.73f, 0.33f), (0.88f, 0.33f), (0.88f, 0f) },
		["tee"] = new[] { (0.42f, 0f), (0.42f, 0.55f), (0.18f, 0.55f), (0.18f, 1f), (0.82f, 1f), (0.82f, 0.55f), (0.58f, 0.55f), (0.58f, 0f) },
		// крюк меандра: канал вверх, вправо, вниз и обратно внутрь витка
		["meander"] = new[] { (0.1f, 0f), (0.1f, 1f), (0.9f, 1f), (0.9f, 0.36f), (0.42f, 0.36f), (0.42f, 0.54f), (0.72f, 0.54f), (0.72f, 0.82f), (0.28f, 0.82f), (0.28f, 0f) },
		["bulbs"] = Bulb(),
	};
	static readonly HashSet<string> Edges = new(Cells.Keys) { "line", "wave", "zigzag", "scallop", "crenel" };

	// капля на ножке: ножка посередине шага, головка — овал над ней (обход через верх)
	static (float, float)[] Bulb()
	{
		var r = new List<(float, float)> { (0.41f, 0f) };
		for (int k = 0; k <= 16; k++)
		{
			float an = (250 - 320 * k / 16f) * MathF.PI / 180;
			r.Add((0.5f + 0.26f * MathF.Cos(an), 0.68f + 0.32f * MathF.Sin(an)));
		}
		r.Add((0.59f, 0f));
		return r.ToArray();
	}

	readonly Polys poly = new(16384);
	readonly Shapes sh = new(16384);
	readonly List<float[]> paths = new();
	readonly List<float> p = new(4096);
	// стороны выреза между углами (начало, направление, длина) — по ним узор на полосе
	readonly List<(float x, float y, float dx, float dy, float len)> sides = new();
	// рамка неподвижна: многоугольники собираются заново только при новых настройках или размере кадра, в кадре — только вывод
	bool dirty = true;
	int lastW, lastH;

	// из JSON дока: { on, width, margin, opacity (%), line, glow, corner, corners: [..4], edge, amp, period, ornament, ornSize (%),
	// look: { bg, border } }
	public void Load(JVal j)
	{
		var d = j.Dict();
		float F(string k, float def, float lo, float hi) => d.ContainsKey(k) ? (float)Math.Clamp(d[k].AsDouble(), lo, hi) : def;
		On = d.ContainsKey("on") && d["on"].AsBool();
		Width = F("width", Width, 0, 200); Margin = F("margin", Margin, 0, 200); Opacity = F("opacity", Opacity * 100, 0, 100) / 100;
		Line = F("line", Line, 0, 16); Glow = F("glow", Glow, 0, 80); Corner = F("corner", Corner, 0, 300);
		Amp = F("amp", Amp, 0, 60); Period = F("period", Period, 12, 400);
		if (d.ContainsKey("edge")) Edge = Edges.Contains(d["edge"].AsString()) ? d["edge"].AsString() : "line";
		if (d.ContainsKey("ornament")) Ornament = Ornaments.Contains(d["ornament"].AsString()) ? d["ornament"].AsString() : "none";
		OrnSize = F("ornSize", OrnSize * 100, 30, 250) / 100;
		var cs = d["corners"].Arr();
		for (int i = 0; i < 4 && i < cs.Count; i++) Corners[i] = Kinds.Contains(cs[i].AsString()) ? cs[i].AsString() : "round";
		var lk = d["look"].Dict();
		Bg = Mt(lk["bg"].AsString(), Bg); Border = Mt(lk["border"].AsString(), Border);
		// окошки — внутри выреза: поле от края экрана — отступ, толщина рамки и половина линии
		Layout.Inset = On ? Margin + Width + Line / 2 : 0;
		dirty = true;
	}

	static (string, double) Mt(string s, (string, double) def)
	{
		if (string.IsNullOrEmpty(s)) return def;
		int at = s.IndexOf('@');
		string id = at < 0 ? s : s[..at];
		if (Mats.Get(id) == null) return def;
		double t = at < 0 ? def.Item2 : double.TryParse(s[(at + 1)..], NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : def.Item2;
		return (id, Math.Clamp(t, 0, 1));
	}

	// ---------- контур выреза ----------

	// форма края: доля высоты (0 — по краю выреза, 1 — на всю высоту в рамку) в точке t (шаги от начала стороны)
	float Shape(float t)
	{
		float f = t - MathF.Floor(t);
		return Edge switch
		{
			"wave" => 0.5f - 0.5f * MathF.Cos(2 * MathF.PI * f),
			"zigzag" => 1 - MathF.Abs(2 * f - 1),
			"scallop" => MathF.Sqrt(Math.Max(0, 1 - (2 * f - 1) * (2 * f - 1))),
			_ => 0,
		};
	}

	// сторона от (sx, sy) по направлению (dx, dy) длиной len; нормаль в рамку — (dy, −dx) (обход по часовой, y вниз). Концы не кладём —
	// их кладут углы
	void Side(float sx, float sy, float dx, float dy, float len, float u, bool shaped)
	{
		float a = Amp * u, nx = dy, ny = -dx;
		if (!shaped || Edge == "line" || a <= 0.1f || len < 4) return;
		void Put(float s, float v) { p.Add(sx + dx * s + nx * v); p.Add(sy + dy * s + ny * v); }
		if (Cells.TryGetValue(Edge, out var cell))
		{
			int cn = Math.Max(1, (int)MathF.Round(len / (Period * u)));
			float cs = len / cn;
			for (int k = 0; k < cn; k++)
			{
				foreach (var (cu, cv) in cell) Put((k + cu) * cs, cv * a);
				if (k + 1 < cn) Put((k + 1) * cs, 0);
			}
			return;
		}
		if (Edge == "crenel")
		{
			// зубцы: нечётное число половин шага — у обоих концов край у выреза
			int m = Math.Max(1, (int)MathF.Round(len / (Period * u / 2))) | 1;
			float hs = len / m;
			for (int j = 0; j + 1 < m; j++)
			{
				float v0 = j % 2 == 1 ? a : 0, v1 = j % 2 == 1 ? 0 : a;
				Put((j + 1) * hs, v0); Put((j + 1) * hs, v1);
			}
			return;
		}
		int n = Math.Max(1, (int)MathF.Round(len / (Period * u)));
		float step = len / n;
		// зигзаг — только вершины; плавные — до 16 точек на шаг, но не чаще 4 точек экрана (меньше точек — быстрее заливка)
		int per = Edge == "zigzag" ? 2 : Math.Clamp((int)(step / (4 * u)), 4, 16);
		for (int i = 1; i < n * per; i++) { float s = i * step / per; Put(s, a * Shape(s / step)); }
	}

	// вырез: прямоугольник (x0, y0)–(x1, y1), углы по видам, края по форме
	// shaped = false — без формы края (ровный вырез: по нему свечение, иначе на волнах и зубцах оно ложится полосами)
	float[] Hole(float x0, float y0, float x1, float y1, float u, bool shaped = true)
	{
		p.Clear();
		if (shaped) sides.Clear();
		float r = Math.Min(Corner * u, Math.Min(x1 - x0, y1 - y0) / 2);
		// угол: вершина, направление входящей стороны (in) и исходящей (out), начало дуги скругления (как у плашки, Style.Path)
		var v = new (float x, float y, float ix, float iy, float ox, float oy, float a0)[]
		{
			(x0, y0, 0, -1, 1, 0, MathF.PI), (x1, y0, 1, 0, 0, 1, -MathF.PI / 2), (x1, y1, 0, 1, -1, 0, 0), (x0, y1, -1, 0, 0, -1, MathF.PI / 2),
		};
		float E(int i) => Corners[i] == "rect" || r < 0.5f ? 0 : r;
		for (int i = 0; i < 4; i++)
		{
			var (cx, cy, ix, iy, ox, oy, a0) = v[i];
			float e = E(i);
			switch (e <= 0 ? "rect" : Corners[i])
			{
				case "rect": p.Add(cx); p.Add(cy); break;
				case "bevel": p.Add(cx - ix * e); p.Add(cy - iy * e); p.Add(cx + ox * e); p.Add(cy + oy * e); break;
				case "notch":
					p.Add(cx - ix * e); p.Add(cy - iy * e); p.Add(cx - ix * e + ox * e); p.Add(cy - iy * e + oy * e); p.Add(cx + ox * e); p.Add(cy + oy * e);
					break;
				case "scoop":
				{
					// вогнутый: дуга с серединой в вершине, короткой стороной — в кадр
					float s0 = MathF.Atan2(-iy, -ix), d = MathF.Atan2(oy, ox) - s0;
					if (d > MathF.PI) d -= 2 * MathF.PI; else if (d < -MathF.PI) d += 2 * MathF.PI;
					for (int k = 0; k <= 12; k++) { float an = s0 + d * k / 12; p.Add(cx + MathF.Cos(an) * e); p.Add(cy + MathF.Sin(an) * e); }
					break;
				}
				default:
				{
					float mx = cx - ix * e + ox * e, my = cy - iy * e + oy * e;
					for (int k = 0; k <= 12; k++) { float an = a0 + k / 12f * MathF.PI / 2; p.Add(mx + MathF.Cos(an) * e); p.Add(my + MathF.Sin(an) * e); }
					break;
				}
			}
			// сторона до следующего угла: от конца этого угла к началу следующего
			int j = (i + 1) % 4;
			float len = MathF.Abs(ox != 0 ? v[j].x - cx : v[j].y - cy) - e - E(j);
			Side(cx + ox * e, cy + oy * e, ox, oy, len, u, shaped);
			if (shaped) sides.Add((cx + ox * e, cy + oy * e, ox, oy, len));
		}
		return p.ToArray();
	}

	// ---------- кадр ----------

	public void Draw(int w, int h)
	{
		if (!On || Width <= 0 && Line <= 0) return;
		if (dirty || w != lastW || h != lastH) { Build(w, h); dirty = false; lastW = w; lastH = h; }
		poly.Flush(w, h);
		sh.Flush(w, h);
	}

	void Build(int w, int h)
	{
		float u = h / 1080f, m = Margin * u, t = (Margin + Width) * u;
		var hole = Hole(t, t, w - t, h - t, u);
		var outer = new[] { m, m, w - m, m, w - m, h - m, m, h - m };
		paths.Clear(); paths.Add(outer); paths.Add(hole);
		poly.Begin();
		if (Opacity > 0 && Width > 0)
		{
			uint bg = Layout.Col(Bg.mat, Bg.tone, (int)(255 * Opacity));
			poly.EvenOdd(paths, bg);
			poly.Feather(paths, bg, 1.2f);
		}
		// свечение линии внутрь кадра: сложением (прозрачность 0) — светится поверх видео
		if (Glow > 0 && Line > 0)
		{
			uint c = Layout.Col(Border.mat, Border.tone);
			uint g = (uint)(((c & 0xFF) * 0.55f)) | (uint)(((c >> 8 & 0xFF) * 0.55f)) << 8 | (uint)(((c >> 16 & 0xFF) * 0.55f)) << 16;
			GlowIn(Hole(t, t, w - t, h - t, u, false), g, Glow * u);
		}
		sh.Begin(); sh.Screen();
		Ornate(t, t, w - t, h - t, u, (t - m));
		// линия по краю выреза — отрезками со скруглёнными концами, ровной толщины на любой форме края
		if (Line > 0)
		{
			uint lc = Layout.Col(Border.mat, Border.tone);
			int n = hole.Length / 2;
			for (int i = 0; i < n; i++)
			{
				int k = (i + 1) % n;
				sh.Line(hole[2 * i], hole[2 * i + 1], hole[2 * k], hole[2 * k + 1], Line * u, lc);
			}
		}
	}

	// свечение внутрь выреза: полоса от края на gw внутрь, цвет к её краю гаснет. Точки сдвигаются по средней нормали соседних
	// рёбер (на углах — со скосом), так полосы соседних рёбер не налегают друг на друга (кромка Polys.Feather на выпуклых углах
	// выреза налегает — сложение даёт полосы)
	void GlowIn(float[] q, uint c, float gw)
	{
		int n = q.Length / 2;
		if (n < 3) return;
		var o = new float[q.Length];
		// нормаль внутрь выреза у ребра i0 → i1: обход по часовой (y вниз) — вырез справа по ходу
		(float x, float y) N(int i0, int i1)
		{
			float dx = q[2 * i1] - q[2 * i0], dy = q[2 * i1 + 1] - q[2 * i0 + 1], l = MathF.Max(1e-4f, MathF.Sqrt(dx * dx + dy * dy));
			return (-dy / l, dx / l);
		}
		for (int i = 0; i < n; i++)
		{
			var (px, py) = N((i + n - 1) % n, i); var (nx, ny) = N(i, (i + 1) % n);
			float mx = px + nx, my = py + ny, ml = MathF.Sqrt(mx * mx + my * my);
			if (ml < 1e-3f) { mx = nx; my = ny; ml = 1; }
			mx /= ml; my /= ml;
			float k = gw / MathF.Max(0.35f, mx * nx + my * ny);
			o[2 * i] = q[2 * i] + mx * k; o[2 * i + 1] = q[2 * i + 1] + my * k;
		}
		for (int i = 0; i < n; i++)
		{
			int b = (i + 1) % n;
			poly.Quad(q[2 * i], q[2 * i + 1], q[2 * b], q[2 * b + 1], o[2 * b], o[2 * b + 1], o[2 * i], o[2 * i + 1], c, c, 0, 0);
		}
	}

	// ---------- узор на полосе ----------

	// вырез (x0, y0)–(x1, y1), толщина полосы band; узор — в части полосы, свободной от формы края, по шагу края на каждой стороне
	void Ornate(float x0, float y0, float x1, float y1, float u, float band)
	{
		if (Ornament == "none") return;
		float a = Edge == "line" ? 0 : Amp * u, free = band - a;
		if (free < 3) return;
		uint oc = Layout.Col(Border.mat, Math.Clamp(Border.tone - 0.05, 0, 1), 235);
		float lw = Math.Max(1.5f * u, Line * u * 0.6f);
		// линия вдоль полосы — прямоугольник на расстоянии off от края выреза
		void Rect(float off)
		{
			float l = x0 - off, t = y0 - off, r = x1 + off, b = y1 + off;
			sh.Line(l, t, r, t, lw, oc); sh.Line(r, t, r, b, lw, oc); sh.Line(r, b, l, b, lw, oc); sh.Line(l, b, l, t, lw, oc);
		}
		void Diamond(float cx, float cy, float dx, float dy, float along, float across, uint c)
		{
			float nx = dy, ny = -dx;
			poly.Quad(cx - dx * along, cy - dy * along, cx + nx * across, cy + ny * across, cx + dx * along, cy + dy * along, cx - nx * across, cy - ny * across, c, c, c, c);
		}
		if (Ornament == "line") { Rect(a + free / 2); return; }
		if (Ornament == "double") { Rect(a + free / 3); Rect(a + free * 2 / 3); return; }
		float mid = a + free / 2, size = 0;
		foreach (var (sx, sy, dx, dy, len) in sides)
		{
			if (len < 8) continue;
			int n = Math.Max(1, (int)MathF.Round(len / (Period * u)));
			float step = len / n, nx = dy, ny = -dx;
			size = Math.Min(free * 0.7f, step * 0.5f) * OrnSize;
			for (int k = 0; k < n; k++)
			{
				float s0 = (k + 0.5f) * step, cx = sx + dx * s0 + nx * mid, cy = sy + dy * s0 + ny * mid;
				switch (Ornament)
				{
					case "dots": sh.Circle(cx, cy, size / 2, oc); break;
					case "diamonds": Diamond(cx, cy, dx, dy, size * 0.6f, size / 2, oc); break;
					case "rivets":
						for (int q = 0; q < 2; q++)
						{
							float off = a + free * (q == 0 ? 0.27f : 0.73f);
							sh.Circle(sx + dx * s0 + nx * off, sy + dy * s0 + ny * off, size * 0.2f, oc);
						}
						break;
					case "chevrons":
					{
						float h = size / 2, l = size / 3;
						sh.Line(cx - dx * l + nx * h, cy - dy * l + ny * h, cx + dx * l, cy + dy * l, Math.Max(1.5f * u, size * 0.14f), oc);
						sh.Line(cx + dx * l, cy + dy * l, cx - dx * l - nx * h, cy - dy * l - ny * h, Math.Max(1.5f * u, size * 0.14f), oc);
						break;
					}
				}
			}
		}
		// камни в углах полосы — крупнее узора
		if (size <= 0) return;
		uint gem = Layout.Col(Border.mat, Math.Clamp(Border.tone + 0.1, 0, 1), 245);
		foreach (var (gx, gy) in new[] { (x0 - mid, y0 - mid), (x1 + mid, y0 - mid), (x1 + mid, y1 + mid), (x0 - mid, y1 + mid) })
			Diamond(gx, gy, 1, 0, Math.Min(free * 0.5f, size * 0.8f), Math.Min(free * 0.5f, size * 0.8f), gem);
	}
}
