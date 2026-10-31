// ОФОРМЛЕНИЕ ОКОШКА (оповещение, анонс, цель) — задаёт док-панель:
// - цвета: акцент (заголовок, полоска), текст, фон, рамка, заливка (у цели) — только материалы с тоном («материал@тон»), без HEX;
// - углы: у каждого свой вид — round (скругление), bevel (срез), rect (прямой), и общая сила скругления/среза;
// - эффект появления: места (l+r, tl+br, bl+tr, t+b, center, circle — по контуру рамки), набор частиц, размер, материал частиц;
// - шрифты заголовка и текста (Fonts.cs);
// - обводка текста: стиль (обводка, мягкая, неон, тень, двойная, объём), материал, толщина, к заголовку и/или к тексту.
// Plate рисует плашку многоугольником: заливка переливом сверху вниз, рамка кольцом, край сглажен
using System;
using System.Collections.Generic;
using System.Globalization;
using Wcg;

namespace Kit;

public sealed class Style
{
	public (string mat, double tone) Accent = ("citrine", 0.85), Text = ("pearl", 0.95), Bg = ("obsidian", 0.12), Border = ("c_azure", 0.7), Fill = ("c_azure", 0.6);
	// углы по часовой: tl, tr, br, bl; сила — точки при высоте 1080
	public string[] Corners = { "round", "round", "round", "round" };
	public float Corner = 16;
	public readonly HashSet<string> FxAt = new() { "l+r" };
	public string FxSet = "boom";
	public float FxSize = 1;
	// материал частиц; null — свой у каждого пресета
	public string FxMat;
	// шрифты заголовка и текста — id из data/fonts.json (Fonts.cs)
	public string Head = Fonts.MainId, Font = Fonts.MainId;
	// обводка текста: стиль, материал, толщина (точки при высоте 1080), к заголовку и к тексту
	public string Stroke = "solid";
	public (string mat, double tone) StrokeCol = ("obsidian", 0.05);
	public float StrokeW = 2;
	public bool StrokeHead, StrokeText = true;
	static readonly HashSet<string> Strokes = new() { "none", "solid", "soft", "neon", "shadow", "double", "extrude" };

	public uint Col((string mat, double tone) c, int a, double toneAdd = 0) => Layout.Col(c.mat, Math.Clamp(c.tone + toneAdd, 0, 1), a);

	// из JSON дока: { accent: "citrine@0.85", text, bg, border, fill, corners: [..4], corner, head, font, fx: { at: [..], set, size, mat } }
	public void Load(JVal j)
	{
		var d = j.Dict();
		(string, double) M(string k, (string, double) def) => Mt(d[k].AsString(), def);
		static (string, double) Mt(string s, (string, double) def)
		{
			if (string.IsNullOrEmpty(s)) return def;
			int at = s.IndexOf('@');
			string id = at < 0 ? s : s[..at];
			if (Mats.Get(id) == null) return def;
			double t = at < 0 ? def.Item2 : double.TryParse(s[(at + 1)..], NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : def.Item2;
			return (id, Math.Clamp(t, 0, 1));
		}
		Accent = M("accent", Accent); Text = M("text", Text); Bg = M("bg", Bg); Border = M("border", Border); Fill = M("fill", Fill);
		var cs = d["corners"].Arr();
		for (int i = 0; i < 4 && i < cs.Count; i++) Corners[i] = cs[i].AsString() is "bevel" or "rect" ? cs[i].AsString() : "round";
		if (d.ContainsKey("corner")) Corner = (float)Math.Clamp(d["corner"].AsDouble(), 0, 80);
		if (d.ContainsKey("head")) Head = d["head"].AsString() ?? Fonts.MainId;
		if (d.ContainsKey("font")) Font = d["font"].AsString() ?? Fonts.MainId;
		var st = d["stroke"].Dict();
		if (st.ContainsKey("style")) Stroke = Strokes.Contains(st["style"].AsString()) ? st["style"].AsString() : "solid";
		if (st.ContainsKey("color")) StrokeCol = Mt(st["color"].AsString(), StrokeCol);
		if (st.ContainsKey("width")) StrokeW = (float)Math.Clamp(st["width"].AsDouble(), 0, 12);
		if (st.ContainsKey("head")) StrokeHead = st["head"].AsBool();
		if (st.ContainsKey("text")) StrokeText = st["text"].AsBool();
		var fx = d["fx"].Dict();
		if (fx.ContainsKey("at")) { FxAt.Clear(); foreach (var a in fx["at"].Arr()) FxAt.Add(a.AsString()); }
		if (fx.ContainsKey("set")) FxSet = Vfx.Bursts.ContainsKey(fx["set"].AsString()) ? fx["set"].AsString() : "boom";
		if (fx.ContainsKey("size")) FxSize = (float)Math.Clamp(fx["size"].AsDouble(), 0.2, 4);
		if (fx.ContainsKey("mat")) FxMat = Mats.Get(fx["mat"].AsString()) != null ? fx["mat"].AsString() : null;
	}

	// ---------- обводка текста ----------

	// строка с обводкой окошка; head — заголовок (иначе текст), u — масштаб (точки при высоте 1080), a — прозрачность окошка.
	// Обводка, мягкая, неон — шейдером знаков (Text.Ink); тень, двойная, объём — ещё копии строки под ней в том же пакете
	public void Ink(Text f, string s, float x, float y, float px, uint col, int a, float u, bool head)
	{
		if (!(head ? StrokeHead : StrokeText) || Stroke == "none" || StrokeW <= 0) { f.Draw(s, x, y, px, col); return; }
		float w = StrokeW * u;
		uint lc = Col(StrokeCol, a);
		switch (Stroke)
		{
			case "soft":
				f.Draw(s, x, y, px, col, new Text.Ink { Line = w * 0.4f, Glow = w * 1.6f, GlowA = 1, LineRgba = lc });
				break;
			case "neon":
				// свечение сложением: светится поверх видео, а не закрывает его
				f.Draw(s, x, y, px, col, new Text.Ink { Line = w * 0.35f, Glow = w * 3, GlowA = 0.3f, LineRgba = Col(StrokeCol, a, 0.1) });
				break;
			case "shadow":
				f.Draw(s, x + w * 0.9f, y + w * 0.9f, px, lc, new Text.Ink { Blur = w * 0.8f });
				f.Draw(s, x, y, px, col);
				break;
			case "double":
			{
				// внешняя — противоположного тона: у тёмной обводки светлая, у светлой тёмная
				uint outer = Col(StrokeCol, a, StrokeCol.tone > 0.5 ? -0.65 : 0.65);
				f.Draw(s, x, y, px, outer, new Text.Ink { Line = w * 2, LineRgba = outer });
				f.Draw(s, x, y, px, col, new Text.Ink { Line = w, LineRgba = lc });
				break;
			}
			case "extrude":
			{
				// объём: слои вниз и чуть вправо, дальние — темнее; сверху — строка с тонкой обводкой того же цвета
				int n = Math.Clamp((int)MathF.Round(StrokeW * 1.5f), 2, 14);
				float step = w / n * 1.6f;
				for (int i = n; i >= 1; i--)
				{
					uint c = Col(StrokeCol, a, -0.03 * i);
					f.Draw(s, x + i * step * 0.45f, y + i * step, px, c, new Text.Ink { Line = 0.6f * u, LineRgba = c });
				}
				f.Draw(s, x, y, px, col, new Text.Ink { Line = 0.8f * u, LineRgba = lc });
				break;
			}
			default:
				f.Draw(s, x, y, px, col, new Text.Ink { Line = w, LineRgba = lc });
				break;
		}
	}

	// ---------- плашка ----------

	// контур плашки по часовой с отступом внутрь inset (для внутреннего края рамки); углы — по виду, размер — не больше половины стороны
	public float[] Path(float x, float y, float w, float h, float u, float inset)
	{
		float cs = Math.Min(Corner * u, Math.Min(w, h) / 2);
		x += inset; y += inset; w -= 2 * inset; h -= 2 * inset;
		var p = new List<float>(64);
		// угол: вершина (cx, cy), направления вдоль сторон к соседним углам (по часовой: входящая сторона, затем исходящая)
		void Vertex(string kind, float cx, float cy, float inX, float inY, float outX, float outY, float a0)
		{
			if (kind == "rect" || cs <= inset) { p.Add(cx); p.Add(cy); return; }
			if (kind == "bevel")
			{
				// срез: при отступе внутрь срез короче на inset·(√2−1) — линии рамки остаются параллельными
				float c = Math.Max(0.5f, cs - inset * 0.4142f);
				p.Add(cx - inX * c); p.Add(cy - inY * c); p.Add(cx + outX * c); p.Add(cy + outY * c);
				return;
			}
			float r = Math.Max(0.5f, cs - inset), ox = cx - inX * r + outX * r, oy = cy - inY * r + outY * r;
			for (int i = 0; i <= 10; i++)
			{
				float a = a0 + i / 10f * MathF.PI / 2;
				p.Add(ox + MathF.Cos(a) * r); p.Add(oy + MathF.Sin(a) * r);
			}
		}
		// tl: пришли снизу (вверх по левой стороне), уходим вправо; дуга от 180° до 270° (экран: y вниз)
		Vertex(Corners[0], x, y, 0, -1, 1, 0, MathF.PI);
		Vertex(Corners[1], x + w, y, 1, 0, 0, 1, -MathF.PI / 2);
		Vertex(Corners[2], x + w, y + h, 0, 1, -1, 0, 0);
		Vertex(Corners[3], x, y + h, -1, 0, 0, -1, MathF.PI / 2);
		return p.ToArray();
	}

	readonly List<float[]> paths = new();

	// плашка: заливка переливом фона (светлее сверху), рамка шириной bw, край сглажен
	public void Plate(Polys poly, float x, float y, float w, float h, float u, float bw, int a, (string mat, double tone)? edge = null)
	{
		var outer = Path(x, y, w, h, u, 0);
		int n = outer.Length / 2;
		Span<uint> cols = n <= 128 ? stackalloc uint[n] : new uint[n];
		uint top = Col(Bg, a * 235 / 255, 0.08), bottom = Col(Bg, a * 235 / 255, -0.06);
		for (int i = 0; i < n; i++) cols[i] = Lerp(top, bottom, (outer[2 * i + 1] - y) / Math.Max(1, h));
		poly.Poly(outer, cols);
		var inner = Path(x, y, w, h, u, bw);
		uint bc = Col(edge ?? Border, a * 220 / 255);
		paths.Clear(); paths.Add(outer); paths.Add(inner);
		poly.EvenOdd(paths, bc);
		poly.Feather(paths, bc, 1.2f);
	}

	static uint Lerp(uint a, uint b, float t)
	{
		t = Math.Clamp(t, 0, 1);
		uint C(int s) => (uint)Math.Round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
		return C(0) | C(8) | C(16) | C(24);
	}

	// ---------- эффект появления ----------

	// точки вспышек по выбранным местам (кроме circle — его точки по контуру даёт Appear)
	public List<(float x, float y)> FxPoints(float x, float y, float w, float h)
	{
		var res = new List<(float, float)>();
		float cx = x + w / 2, cy = y + h / 2;
		foreach (var at in FxAt)
			switch (at)
			{
				case "l+r": res.Add((x, cy)); res.Add((x + w, cy)); break;
				case "tl+br": res.Add((x, y)); res.Add((x + w, y + h)); break;
				case "bl+tr": res.Add((x, y + h)); res.Add((x + w, y)); break;
				case "t+b": res.Add((cx, y)); res.Add((cx, y + h)); break;
				case "center": res.Add((cx, cy)); break;
			}
		return res;
	}

	static void AlongPath(float[] p, int count, List<(float, float)> res)
	{
		int n = p.Length / 2;
		float total = 0;
		for (int i = 0; i < n; i++) total += Seg(p, i, n);
		float step = total / count, next = 0, run = 0;
		for (int i = 0; i < n && res.Count < 1000; i++)
		{
			float len = Seg(p, i, n);
			while (next <= run + len && count-- > 0)
			{
				float t = len > 0 ? (next - run) / len : 0;
				int j = (i + 1) % n;
				res.Add((p[2 * i] + (p[2 * j] - p[2 * i]) * t, p[2 * i + 1] + (p[2 * j + 1] - p[2 * i + 1]) * t));
				next += step;
			}
			run += len;
		}
	}

	static float Seg(float[] p, int i, int n)
	{
		int j = (i + 1) % n;
		float dx = p[2 * j] - p[2 * i], dy = p[2 * j + 1] - p[2 * i + 1];
		return MathF.Sqrt(dx * dx + dy * dy);
	}

	// вспышки набора частиц в точках; по контуру — мельче, иначе сливаются в одно облако
	public void Burst(Vfx fx, List<(float x, float y)> at, float c, bool contour = false)
	{
		if (!Vfx.Bursts.TryGetValue(FxSet, out var set)) return;
		float k = 2.2f * c * FxSize * (contour ? 0.55f : 1);
		foreach (var (px, py) in at)
			foreach (var name in set) fx.Burst(name, px, py, FxMat, scale: k);
	}

	// появление окошка: все выбранные места; по контуру (circle) — равномерно по рамке, мельче
	public void Appear(Vfx fx, float x, float y, float w, float h, float u)
	{
		Burst(fx, FxPoints(x, y, w, h), u);
		if (!FxAt.Contains("circle")) return;
		var pts = new List<(float, float)>();
		AlongPath(Path(x, y, w, h, u, 0), 14, pts);
		Burst(fx, pts, u, true);
	}
}
