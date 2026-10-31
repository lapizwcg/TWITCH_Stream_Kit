// РАМКА ЭФИРА (Stream Frame) — полоса по краям кадра, все окошки живут внутри неё (Layout.Inset). Настраивается в доке:
// - толщина, отступ от края экрана, непрозрачность фона;
// - внутренние углы выреза, у каждого свой вид: round (скруглён внутрь), bevel (срез), rect (прямой), scoop (вогнутый — рамка
//   четвертью круга заходит в кадр), notch (ступенька — квадратный выступ рамки), и общий размер;
// - форма внутреннего края: line (прямая), wave (волна), zigzag (зигзаг), scallop (дуги), crenel (зубцы) — высота и шаг;
//   на каждой стороне — целое число шагов, у углов край сходится к прямой;
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
	public string Edge = "line";
	static readonly HashSet<string> Kinds = new() { "round", "bevel", "rect", "scoop", "notch" };
	static readonly HashSet<string> Edges = new() { "line", "wave", "zigzag", "scallop", "crenel" };

	readonly Polys poly = new(16384);
	readonly Shapes sh = new(16384);
	readonly List<float[]> paths = new();
	readonly List<float> p = new(4096);
	// рамка неподвижна: многоугольники собираются заново только при новых настройках или размере кадра, в кадре — только вывод
	bool dirty = true;
	int lastW, lastH;

	// из JSON дока: { on, width, margin, opacity (%), line, glow, corner, corners: [..4], edge, amp, period, look: { bg, border } }
	public void Load(JVal j)
	{
		var d = j.Dict();
		float F(string k, float def, float lo, float hi) => d.ContainsKey(k) ? (float)Math.Clamp(d[k].AsDouble(), lo, hi) : def;
		On = d.ContainsKey("on") && d["on"].AsBool();
		Width = F("width", Width, 0, 200); Margin = F("margin", Margin, 0, 200); Opacity = F("opacity", Opacity * 100, 0, 100) / 100;
		Line = F("line", Line, 0, 16); Glow = F("glow", Glow, 0, 80); Corner = F("corner", Corner, 0, 300);
		Amp = F("amp", Amp, 0, 60); Period = F("period", Period, 12, 400);
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
		}
		return p.ToArray();
	}

	// ---------- кадр ----------

	public void Draw(int w, int h)
	{
		if (!On || Width <= 0 && Line <= 0) return;
		if (dirty || w != lastW || h != lastH) { Build(w, h); dirty = false; lastW = w; lastH = h; }
		poly.Flush(w, h);
		if (Line > 0) sh.Flush(w, h);
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
			var glow = new List<float[]> { outer, Hole(t, t, w - t, h - t, u, false) };
			poly.Feather(glow, g, Glow * u);
		}
		// линия по краю выреза — отрезками со скруглёнными концами, ровной толщины на любой форме края
		if (Line > 0)
		{
			uint lc = Layout.Col(Border.mat, Border.tone);
			sh.Begin(); sh.Screen();
			int n = hole.Length / 2;
			for (int i = 0; i < n; i++)
			{
				int k = (i + 1) % n;
				sh.Line(hole[2 * i], hole[2 * i + 1], hole[2 * k], hole[2 * k + 1], Line * u, lc);
			}
		}
	}
}
