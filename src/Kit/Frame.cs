// РАМКА ЭФИРА (Stream Frame) — рамка по краям кадра, все окошки живут внутри неё (Layout.Inset). Настраивается в доке:
// - толщина — сколько места рамка забирает у кадра (окошки встают внутри), отступ от края экрана, непрозрачность фона полосы;
// - размер узора — сам по себе, не от толщины: при тонкой рамке (и даже нулевой) узор не пропадает — линия с узором отходит от
//   края экрана настолько, чтобы узор поместился;
// - внутренние углы выреза, у каждого свой вид: round (скруглён), bevel (срез), rect (прямой), scoop (вогнутый — рамка
//   четвертью круга заходит в кадр), notch (ступенька — квадратный выступ рамки), и общий размер;
// - стиль — Sci-Fi или простая: только чёткие фигуры (линии, многоугольники), без свечения и размытия; тонкая линия по вырезу и
//   акценты в углах и серединах сторон, в полосе рамки:
//   plain — одна линия;
//   esports — киберспорт: толстые акцентные отрезки у левого верхнего и правого нижнего угла и косые штрихи за ними;
//   blades — клинки: у всех четырёх углов планки со срезанными под 45° концами вдоль обеих сторон, на срезе угла — ромб;
//   panels — панели: в середине верхней и нижней стороны трапеция-вкладка со скошенными боками и штрихи по бокам от неё,
//   у углов — короткие планки;
// - цвета (материалы с тоном): фон полосы и линии, толщина линии.
// Украшения — в полосе рамки, не в кадре: место окошек — прямоугольник выреза
using System;
using System.Collections.Generic;
using System.Globalization;
using Wcg;

namespace Kit;

public sealed class Frame
{
	public bool On;
	// точки при высоте 1080
	public float Width = 36, Margin, Line = 2, Corner = 24;
	// размер узора, доля обычного
	public float Scale = 1;
	public float Opacity = 0.35f;
	public (string mat, double tone) Bg = ("obsidian", 0.12), Border = ("citrine", 0.75);
	// углы выреза по часовой: tl, tr, br, bl
	public readonly string[] Corners = { "bevel", "bevel", "bevel", "bevel" };
	public string Style = "esports";
	static readonly HashSet<string> Kinds = new() { "round", "bevel", "rect", "scoop", "notch" };
	static readonly HashSet<string> Styles = new() { "plain", "esports", "blades", "panels" };

	readonly Polys poly = new(16384);
	readonly Shapes sh = new(4096);
	readonly List<float[]> paths = new();
	readonly List<float> p = new(256);
	// рамка неподвижна: многоугольники собираются заново только при новых настройках или размере кадра, в кадре — только вывод
	bool dirty = true;
	int lastW, lastH;

	// из JSON дока: { on, width, margin, opacity (%), line, corner, corners: [..4], style, scale (%), look: { bg, border } }
	public void Load(JVal j)
	{
		var d = j.Dict();
		float F(string k, float def, float lo, float hi) => d.ContainsKey(k) ? (float)Math.Clamp(d[k].AsDouble(), lo, hi) : def;
		On = d.ContainsKey("on") && d["on"].AsBool();
		Width = F("width", Width, 0, 200); Margin = F("margin", Margin, 0, 200); Opacity = F("opacity", Opacity * 100, 0, 100) / 100;
		Line = F("line", Line, 0, 16); Corner = F("corner", Corner, 0, 300); Scale = F("scale", Scale * 100, 30, 300) / 100;
		if (d.ContainsKey("style")) Style = Styles.Contains(d["style"].AsString()) ? d["style"].AsString() : "esports";
		var cs = d["corners"].Arr();
		for (int i = 0; i < 4 && i < cs.Count; i++) Corners[i] = Kinds.Contains(cs[i].AsString()) ? cs[i].AsString() : "bevel";
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

	// вырез: прямоугольник (x0, y0)–(x1, y1), углы по видам размером r, стороны прямые; по часовой
	float[] Base(float x0, float y0, float x1, float y1, float r)
	{
		p.Clear();
		r = Math.Min(r, Math.Min(x1 - x0, y1 - y0) / 2);
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
		float u = h / 1080f, m = Margin * u, r = Corner * u;
		// край выреза: по толщине рамки, но не ближе к краю экрана, чем нужно узору (украшения — снаружи линии)
		float t = Math.Max((Margin + Width) * u, Reach(u));
		var hole = Base(t, t, w - t, h - t, r);
		var outer = new[] { m, m, w - m, m, w - m, h - m, m, h - m };
		paths.Clear(); paths.Add(outer); paths.Add(hole);
		poly.Begin();
		if (Opacity > 0 && Width > 0)
		{
			uint bg = Layout.Col(Bg.mat, Bg.tone, (int)(255 * Opacity));
			poly.EvenOdd(paths, bg);
			poly.Feather(paths, bg, 1.2f);
		}
		sh.Begin(); sh.Screen();
		if (Line > 0) Decor(hole, t, t, w - t, h - t, r, u);
	}

	// ---------- стили ----------

	// насколько украшения стиля выходят наружу от линии выреза (точки экрана): планки, вкладки, штрихи — до 13 · k, плюс линия
	float Reach(float u) => Line <= 0 ? 0 : Style == "plain" ? Line * u : 13 * Scale * u + Line * u * 1.2f;

	// украшения стиля: вырез hole по прямоугольнику (x0, y0)–(x1, y1) с углами r; украшения — наружу от выреза, размер — Scale
	void Decor(float[] hole, float x0, float y0, float x1, float y1, float r, float u)
	{
		float lw = Line * u, k = Scale * u, thin = Math.Max(1 * u, lw * 0.5f);
		float cx = (x0 + x1) / 2;
		uint lc = Col(0, 255), bright = Col(0.12, 255);
		// планка вдоль стороны: от (ax, ay) по направлению (dx, dy) длиной len, толщиной th наружу от выреза (нормаль nx, ny);
		// дальний конец срезан под 45° (cut — со стороны выреза короче)
		void Bar(float ax, float ay, float dx, float dy, float nx, float ny, float len, float th, uint c, bool cutStart = false)
		{
			float s0 = cutStart ? th : 0;
			poly.Quad(ax + dx * s0, ay + dy * s0, ax + dx * len, ay + dy * len,
				ax + dx * (len - th) + nx * th, ay + dy * (len - th) + ny * th, ax + nx * th, ay + ny * th, c, c, c, c);
		}
		// косые штрихи: n параллелограммов от (ax, ay) вдоль (dx, dy), наружу по (nx, ny), каждый бледнее
		void Slashes(float ax, float ay, float dx, float dy, float nx, float ny, int n)
		{
			float sw = 10 * k, sh2 = 8 * k, sl = 6 * k, step = 18 * k, gap = 4 * k;
			for (int i = 0; i < n; i++)
			{
				uint c = Col(0.05 - 0.12 * i, 230 - 60 * i);
				float xa = ax + dx * i * step + nx * gap, ya = ay + dy * i * step + ny * gap;
				poly.Quad(xa, ya, xa + dx * sw, ya + dy * sw, xa + dx * (sw + sl) + nx * sh2, ya + dy * (sw + sl) + ny * sh2, xa + dx * sl + nx * sh2, ya + dy * sl + ny * sh2, c, c, c, c);
			}
		}
		// углы: вершина и направления вдоль верхней/нижней стороны (hx) и левой/правой (vy) от угла, нормали наружу
		var corners = new[] { (x0, y0, 1f, 1f), (x1, y0, -1f, 1f), (x1, y1, -1f, -1f), (x0, y1, 1f, -1f) };
		switch (Style)
		{
			case "blades":
			{
				Stroke(hole, thin, lc);
				float th = 6 * k;
				foreach (var (vx, vy, sx, sy) in corners)
				{
					// планки вдоль горизонтальной и вертикальной стороны — от конца среза угла, наружу от выреза; длинная и короткая
					Bar(vx + sx * r, vy, sx, 0, 0, -sy, 150 * k, th, bright, true);
					Bar(vx, vy + sy * r, 0, sy, -sx, 0, 80 * k, th, bright, true);
					// вторая тонкая планка рядом — ритм
					Bar(vx + sx * (r + 160 * k), vy, sx, 0, 0, -sy, 30 * k, th * 0.6f, lc, true);
					// ромб на срезе угла, чуть снаружи
					float d = r * 0.5f + 8 * k;
					Diamond(vx - sx * 6 * k + sx * (r * 0.5f) - sx * d * 0.3f, vy - sy * 6 * k + sy * (r * 0.5f) - sy * d * 0.3f, 5 * k, 5 * k, bright);
				}
				break;
			}
			case "panels":
			{
				Stroke(hole, thin, lc);
				// вкладки-трапеции в середине верхней и нижней стороны: широкая у выреза, бока скошены
				float hw = 170 * k, th = 9 * k, sl = 14 * k;
				foreach (var (y, ny) in new[] { (y0, -1f), (y1, 1f) })
				{
					poly.Quad(cx - hw, y, cx + hw, y, cx + hw - sl, y + ny * th, cx - hw + sl, y + ny * th, bright, bright, bright, bright);
					// штрихи по бокам от вкладки — наружу от неё
					Slashes(cx + hw + 10 * k, y, 1, 0, 0, ny, 3);
					Slashes(cx - hw - 10 * k, y, -1, 0, 0, ny, 3);
				}
				// короткие планки у углов
				foreach (var (vx, vy, sx, sy) in corners)
				{
					Bar(vx + sx * r, vy, sx, 0, 0, -sy, 60 * k, 4 * k, lc, true);
					Bar(vx, vy + sy * r, 0, sy, -sx, 0, 60 * k, 4 * k, lc, true);
				}
				break;
			}
			case "esports":
			{
				Stroke(hole, thin, lc);
				// толстые акцентные отрезки у левого верхнего и правого нижнего угла, по горизонтали длиннее
				float L1 = 180 * k, L2 = 90 * k, bw = lw * 2.2f + 1.5f * u, o = bw / 2;
				sh.Line(x0 + r, y0 - o, x0 + r + L1, y0 - o, bw, bright);
				sh.Line(x0 - o, y0 + r, x0 - o, y0 + r + L2, bw, bright);
				sh.Line(x1 - r - L1, y1 + o, x1 - r, y1 + o, bw, bright);
				sh.Line(x1 + o, y1 - r - L2, x1 + o, y1 - r, bw, bright);
				// косые штрихи за отрезками
				Slashes(x0 + r + L1 + 14 * k, y0, 1, 0, 0, -1, 3);
				Slashes(x1 - r - L1 - 14 * k, y1, -1, 0, 0, 1, 3);
				break;
			}
			default:
				Stroke(hole, lw, lc);
				break;
		}
	}

	// цвет линии: тон линии со сдвигом, прозрачность
	uint Col(double toneAdd, int a) => Layout.Col(Border.mat, Math.Clamp(Border.tone + toneAdd, 0, 1), a);

	// линия по контуру q отрезками со скруглёнными концами
	void Stroke(float[] q, float width, uint c)
	{
		int n = q.Length / 2;
		for (int i = 0; i < n; i++)
		{
			int b = (i + 1) % n;
			sh.Line(q[2 * i], q[2 * i + 1], q[2 * b], q[2 * b + 1], width, c);
		}
	}

	// ромб с серединой (x, y): полуширина hw, полувысота hh
	void Diamond(float x, float y, float hw, float hh, uint c) => poly.Quad(x - hw, y, x, y - hh, x + hw, y, x, y + hh, c, c, c, c);
}
