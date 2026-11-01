// РАМКА ЭФИРА (Stream Frame) — полоса по краям кадра, все окошки живут внутри неё (Layout.Inset). Настраивается в доке:
// - толщина, отступ от края экрана, непрозрачность фона;
// - внутренние углы выреза, у каждого свой вид: round (скруглён внутрь), bevel (срез), rect (прямой), scoop (вогнутый — рамка
//   четвертью круга заходит в кадр), notch (ступенька — квадратный выступ рамки), и общий размер;
// - узор контура — сам внутренний край рамки: line (прямой), wave (волна), zigzag (зигзаг), scallop (дуги), crenel (зубцы), saw
//   (пила), spikes (шипы), steps (ступени-зиккурат), bulbs (капли на ножке), tee (Т-образный), meander (греческий меандр); высота —
//   доля толщины рамки, шаг — точки. Узор идёт по всему контуру выреза, в том числе по углам: по скруглению он плавно огибает угол,
//   на срезе, вогнутом угле и ступеньке — свои звенья. Контур делится на участки по острым изломам, на каждом — целое число
//   звеньев, у излома край сходится к основе;
// - цвета (материалы с тоном): фон рамки и линия по контуру, её толщина и свечение внутрь кадра.
// Узор уходит в рамку, не в кадр: место окошек — прямоугольник выреза
using System;
using System.Collections.Generic;
using System.Globalization;
using Wcg;

namespace Kit;

public sealed class Frame
{
	public bool On;
	// точки при высоте 1080; Amp — высота узора, доля толщины рамки
	public float Width = 36, Margin, Line = 3, Glow = 18, Corner = 60, Amp = 0.7f, Period = 60;
	public float Opacity = 0.92f;
	public (string mat, double tone) Bg = ("obsidian", 0.12), Border = ("c_azure", 0.7);
	// углы выреза по часовой: tl, tr, br, bl
	public readonly string[] Corners = { "round", "round", "round", "round" };
	public string Edge = "line";
	static readonly HashSet<string> Kinds = new() { "round", "bevel", "rect", "scoop", "notch" };
	// звено узора — ломаная одного шага: u — доля шага вдоль основы, v — доля высоты в рамку; от (0, 0) к (1, 0) без концов.
	// Обход — как у выреза (по часовой): вырез справа по ходу, ломаная не пересекает себя
	static readonly Dictionary<string, (float u, float v)[]> Cells = new()
	{
		["wave"] = Curve(f => 0.5f - 0.5f * MathF.Cos(2 * MathF.PI * f)),
		["scallop"] = Curve(f => MathF.Sqrt(Math.Max(0, 1 - (2 * f - 1) * (2 * f - 1)))),
		["zigzag"] = new[] { (0.5f, 1f) },
		["crenel"] = new[] { (0.25f, 0f), (0.25f, 1f), (0.75f, 1f), (0.75f, 0f) },
		["saw"] = new[] { (1f, 1f) },
		["spikes"] = new[] { (0.3f, 0f), (0.5f, 1f), (0.7f, 0f) },
		["steps"] = new[] { (0.12f, 0f), (0.12f, 0.33f), (0.27f, 0.33f), (0.27f, 0.66f), (0.42f, 0.66f), (0.42f, 1f), (0.58f, 1f), (0.58f, 0.66f), (0.73f, 0.66f), (0.73f, 0.33f), (0.88f, 0.33f), (0.88f, 0f) },
		["tee"] = new[] { (0.4f, 0f), (0.4f, 0.5f), (0.12f, 0.5f), (0.12f, 1f), (0.88f, 1f), (0.88f, 0.5f), (0.6f, 0.5f), (0.6f, 0f) },
		// крюк меандра: канал вверх, вправо, вниз и обратно внутрь витка
		["meander"] = new[] { (0.06f, 0f), (0.06f, 1f), (0.94f, 1f), (0.94f, 0.3f), (0.4f, 0.3f), (0.4f, 0.52f), (0.72f, 0.52f), (0.72f, 0.78f), (0.28f, 0.78f), (0.28f, 0f) },
		["bulbs"] = Bulb(),
	};
	static readonly HashSet<string> Edges = new(Cells.Keys) { "line" };

	// плавное звено: высота f(доля шага), 24 точки
	static (float, float)[] Curve(Func<float, float> f)
	{
		var r = new (float, float)[23];
		for (int k = 1; k <= 23; k++) r[k - 1] = (k / 24f, f(k / 24f));
		return r;
	}
	// капля на ножке: ножка посередине шага, головка — овал над ней (обход через верх)
	static (float, float)[] Bulb()
	{
		var r = new List<(float, float)> { (0.4f, 0f) };
		for (int k = 0; k <= 20; k++)
		{
			float an = (250 - 320 * k / 20f) * MathF.PI / 180;
			r.Add((0.5f + 0.3f * MathF.Cos(an), 0.64f + 0.36f * MathF.Sin(an)));
		}
		r.Add((0.6f, 0f));
		return r.ToArray();
	}

	readonly Polys poly = new(16384);
	readonly Shapes sh = new(16384);
	readonly List<float[]> paths = new();
	readonly List<float> p = new(4096);
	// рамка неподвижна: многоугольники собираются заново только при новых настройках или размере кадра, в кадре — только вывод
	bool dirty = true;
	int lastW, lastH;

	// из JSON дока: { on, width, margin, opacity (%), line, glow, corner, corners: [..4], edge, amp (% толщины), period,
	// look: { bg, border } }
	public void Load(JVal j)
	{
		var d = j.Dict();
		float F(string k, float def, float lo, float hi) => d.ContainsKey(k) ? (float)Math.Clamp(d[k].AsDouble(), lo, hi) : def;
		On = d.ContainsKey("on") && d["on"].AsBool();
		Width = F("width", Width, 0, 200); Margin = F("margin", Margin, 0, 200); Opacity = F("opacity", Opacity * 100, 0, 100) / 100;
		Line = F("line", Line, 0, 16); Glow = F("glow", Glow, 0, 80); Corner = F("corner", Corner, 0, 300);
		Amp = F("amp", Amp * 100, 0, 100) / 100; Period = F("period", Period, 12, 400);
		if (d.ContainsKey("edge")) Edge = Edges.Contains(d["edge"].AsString()) ? d["edge"].AsString() : "line";
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

	// основа выреза: прямоугольник (x0, y0)–(x1, y1), углы по видам, стороны прямые; по часовой
	float[] Base(float x0, float y0, float x1, float y1, float u)
	{
		p.Clear();
		float r = Math.Min(Corner * u, Math.Min(x1 - x0, y1 - y0) / 2);
		// угол: вершина, направление входящей стороны (in) и исходящей (out), начало дуги скругления (как у плашки, Style.Path)
		var v = new (float x, float y, float ix, float iy, float ox, float oy, float a0)[]
		{
			(x0, y0, 0, -1, 1, 0, MathF.PI), (x1, y0, 1, 0, 0, 1, -MathF.PI / 2), (x1, y1, 0, 1, -1, 0, 0), (x0, y1, -1, 0, 0, -1, MathF.PI / 2),
		};
		for (int i = 0; i < 4; i++)
		{
			var (cx, cy, ix, iy, ox, oy, a0) = v[i];
			float e = r;
			switch (e < 0.5f ? "rect" : Corners[i])
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
					for (int k = 0; k <= 16; k++) { float an = s0 + d * k / 16; p.Add(cx + MathF.Cos(an) * e); p.Add(cy + MathF.Sin(an) * e); }
					break;
				}
				default:
				{
					float mx = cx - ix * e + ox * e, my = cy - iy * e + oy * e;
					for (int k = 0; k <= 16; k++) { float an = a0 + k / 16f * MathF.PI / 2; p.Add(mx + MathF.Cos(an) * e); p.Add(my + MathF.Sin(an) * e); }
					break;
				}
			}
		}
		return p.ToArray();
	}

	// узор по всему контуру основы b: контур режется на участки по острым изломам (больше 25°), на участке — целое число звеньев
	// узора длиной около шага, высота a в рамку по нормали основы (на дуге нормаль поворачивается плавно — узор огибает угол)
	float[] Pattern(float[] b, float a, float u)
	{
		var cell = Cells[Edge];
		int n = b.Length / 2;
		var dir = new (float x, float y)[n];
		for (int i = 0; i < n; i++)
		{
			int k = (i + 1) % n;
			float dx = b[2 * k] - b[2 * i], dy = b[2 * k + 1] - b[2 * i + 1], l = MathF.Max(1e-4f, MathF.Sqrt(dx * dx + dy * dy));
			dir[i] = (dx / l, dy / l);
		}
		// излом в вершине i — между ребром i−1 и ребром i
		var sharp = new bool[n];
		int first = -1;
		for (int i = 0; i < n; i++)
		{
			var (px, py) = dir[(i + n - 1) % n]; var (qx, qy) = dir[i];
			sharp[i] = px * qx + py * qy < 0.906f;
			if (sharp[i] && first < 0) first = i;
		}
		// вогнутый для рамки излом (вырез здесь поворачивает налево — рамка выступает в кадр клином): звенья с двух сторон смотрят
		// друг на друга — у такого излома звенья не ставим на длину высоты узора
		bool Inward(int i) { var (px, py) = dir[(i + n - 1) % n]; var (qx, qy) = dir[i]; return sharp[i] && px * qy - py * qx < 0; }
		var res = new List<float>(8192);
		// без изломов (все углы скруглены) — один замкнутый участок от вершины 0
		int start = first < 0 ? 0 : first, done = 0;
		while (done < n)
		{
			var run = new List<int> { start };
			int i = start;
			do { i = (i + 1) % n; run.Add(i); done++; } while (!sharp[i] && i != start && done < n);
			Run(b, run, cell, a, u, res, Inward(start) ? a : 0, Inward(i) ? a : 0);
			start = i;
		}
		return res.ToArray();
	}

	// участок контура по вершинам run (концы — изломы или начало обхода): звенья узора между полями m0 и m1 у концов; кладёт всё,
	// кроме последней точки (она — начало следующего участка)
	void Run(float[] b, List<int> run, (float u, float v)[] cell, float a, float u, List<float> res, float m0, float m1)
	{
		int m = run.Count;
		var L = new float[m];
		for (int k = 1; k < m; k++)
		{
			float dx = b[2 * run[k]] - b[2 * run[k - 1]], dy = b[2 * run[k] + 1] - b[2 * run[k - 1] + 1];
			L[k] = L[k - 1] + MathF.Sqrt(dx * dx + dy * dy);
		}
		float total = L[m - 1];
		// вогнутая для рамки дуга (вогнутый угол) — без узора: нормали на ней сходятся, звенья сжимаются и повисают над дугой; гладкая
		// дуга читается как медальон угла
		for (int k = 1; k + 1 < m; k++)
		{
			float ax = b[2 * run[k]] - b[2 * run[k - 1]], ay = b[2 * run[k] + 1] - b[2 * run[k - 1] + 1];
			float bx = b[2 * run[k + 1]] - b[2 * run[k]], by = b[2 * run[k + 1] + 1] - b[2 * run[k] + 1];
			if (ax * by - ay * bx < -1e-3f * MathF.Sqrt((ax * ax + ay * ay) * (bx * bx + by * by))) { a = 0; break; }
		}
		float span = total - m0 - m1;
		if (span < Period * u * 0.5f || a < 0.5f)
		{
			for (int k = 0; k < m - 1; k++) { res.Add(b[2 * run[k]]); res.Add(b[2 * run[k] + 1]); }
			return;
		}
		// нормали в рамку: у рёбер — (dy, −dx); в вершинах внутри участка — средняя соседних, на концах — своего ребра
		var en = new (float x, float y)[m - 1];
		for (int k = 0; k + 1 < m; k++)
		{
			float dx = b[2 * run[k + 1]] - b[2 * run[k]], dy = b[2 * run[k + 1] + 1] - b[2 * run[k] + 1], l = MathF.Max(1e-4f, MathF.Sqrt(dx * dx + dy * dy));
			en[k] = (dy / l, -dx / l);
		}
		var vn = new (float x, float y)[m];
		for (int k = 0; k < m; k++)
		{
			var e0 = en[Math.Max(0, k - 1)]; var e1 = en[Math.Min(m - 2, k)];
			float x = e0.x + e1.x, y = e0.y + e1.y, l = MathF.Max(1e-4f, MathF.Sqrt(x * x + y * y));
			vn[k] = (x / l, y / l);
		}
		void Put(float s, float v)
		{
			s = Math.Clamp(s, 0, total);
			int k = Array.BinarySearch(L, s);
			if (k < 0) k = ~k - 1;
			k = Math.Clamp(k, 0, m - 2);
			float t = (s - L[k]) / MathF.Max(1e-4f, L[k + 1] - L[k]);
			float x = b[2 * run[k]] + (b[2 * run[k + 1]] - b[2 * run[k]]) * t, y = b[2 * run[k] + 1] + (b[2 * run[k + 1] + 1] - b[2 * run[k] + 1]) * t;
			float nx = vn[k].x + (vn[k + 1].x - vn[k].x) * t, ny = vn[k].y + (vn[k + 1].y - vn[k].y) * t, nl = MathF.Max(1e-4f, MathF.Sqrt(nx * nx + ny * ny));
			res.Add(x + nx / nl * v); res.Add(y + ny / nl * v);
		}
		int cn = Math.Max(1, (int)MathF.Round(span / (Period * u)));
		float cs = span / cn, piece = 5 * u;
		// поле у начала — основой (вершины основы до начала звеньев)
		for (int k = 0; k < m - 1 && L[k] < m0; k++) { res.Add(b[2 * run[k]]); res.Add(b[2 * run[k] + 1]); }
		for (int c = 0; c < cn; c++)
		{
			// звено от (0, 0) до (1, 0); рёбра звена — частыми точками, чтобы на дуге основы ложились по ней, а не хордой
			float pu = 0, pv = 0;
			Put(m0 + c * cs, 0);
			for (int q = 0; q <= cell.Length; q++)
			{
				var (cu, cv) = q < cell.Length ? cell[q] : (1f, 0f);
				int steps = Math.Max(1, (int)MathF.Ceiling(MathF.Max(MathF.Abs(cu - pu) * cs, MathF.Abs(cv - pv) * a) / piece));
				int last = q < cell.Length ? steps : steps - 1;
				for (int st = 1; st <= last; st++)
				{
					float f = st / (float)steps;
					Put(m0 + (c + pu + (cu - pu) * f) * cs, (pv + (cv - pv) * f) * a);
				}
				pu = cu; pv = cv;
			}
		}
		// поле у конца — основой
		if (m1 > 0)
		{
			Put(total - m1, 0);
			for (int k = 1; k < m - 1; k++) if (L[k] > total - m1) { res.Add(b[2 * run[k]]); res.Add(b[2 * run[k] + 1]); }
		}
	}

	float[] Hole(float x0, float y0, float x1, float y1, float u, bool shaped)
	{
		var b = Base(x0, y0, x1, y1, u);
		float a = Amp * Width * u;
		return !shaped || Edge == "line" || a < 0.5f ? b : Pattern(b, a, u);
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
		var hole = Hole(t, t, w - t, h - t, u, true);
		var outer = new[] { m, m, w - m, m, w - m, h - m, m, h - m };
		paths.Clear(); paths.Add(outer); paths.Add(hole);
		poly.Begin();
		if (Opacity > 0 && Width > 0)
		{
			uint bg = Layout.Col(Bg.mat, Bg.tone, (int)(255 * Opacity));
			poly.EvenOdd(paths, bg);
			poly.Feather(paths, bg, 1.2f);
		}
		// свечение линии внутрь кадра: сложением (прозрачность 0) — светится поверх видео; по основе выреза, без узора (на зубцах
		// и витках свечение легло бы пятнами)
		if (Glow > 0 && Line > 0)
		{
			uint c = Layout.Col(Border.mat, Border.tone);
			uint g = (uint)((c & 0xFF) * 0.55f) | (uint)((c >> 8 & 0xFF) * 0.55f) << 8 | (uint)((c >> 16 & 0xFF) * 0.55f) << 16;
			GlowIn(Hole(t, t, w - t, h - t, u, false), g, Glow * u);
		}
		sh.Begin(); sh.Screen();
		// линия по контуру — отрезками со скруглёнными концами, ровной толщины на любом узоре
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
}
