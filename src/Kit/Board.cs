// ТАБЛИЧКА — постоянная плашка с заголовком и строками, не уходит сама (в отличие от оповещения): на ней карточка челленджа
// («СОЛО ЛЕВЕЛИНГ БЕЗ РЫНКА» · «ДЕНЬ 12») и статистика сессии (убийства, смерти, серебро, слава по видам), которую показывают и
// прячут кнопкой в доке. Строка «название\tзначение» — название слева, значение справа; строка без \t — по середине.
// Место, размер и оформление — как у остальных окошков (Layout, Style); появление — проявлением и вспышками по оформлению
// (кроме самого первого показа при запуске: табличка уже стояла, её просто возвращаем). Строки задаёт док через мост (Configure)
using System;
using System.Collections.Generic;
using Wcg;

namespace Kit;

public sealed class Board
{
	// шаги (60 в секунду) проявления и скрытия
	const int FadeSteps = 20;

	readonly Shapes sh = new(64); readonly Polys poly = new(1024); readonly Vfx fx = new(); readonly FxBatch light = new(), norm = new();
	public readonly Style Style = new();
	Text Head => Fonts.Get(Style.Head);
	Text Body => Fonts.Get(Style.Font);
	float ax = 0.5f, ay = 0, vis;
	// отступ от края экрана (точки при высоте 1080), размер по X/Y (доли), внутренний отступ (проценты высоты кадра)
	float pad = 30, sx = 1, sy = 1, inner = 1;
	string title = "";
	readonly List<(string label, string value)> rows = new();
	bool on, configured;

	// rows — строки через \n, название и значение через \t
	public void Configure(bool on, string pos, string head, string rowsText)
	{
		(ax, ay) = Layout.Anchor(pos);
		title = head?.Trim() ?? "";
		rows.Clear();
		foreach (var line in (rowsText ?? "").Split('\n'))
		{
			if (line.Trim().Length == 0) continue;
			int tab = line.IndexOf('\t');
			rows.Add(tab < 0 ? (line.Trim(), null) : (line[..tab].Trim(), line[(tab + 1)..].Trim()));
		}
		// показали кнопкой — вспышки по оформлению; при запуске страницы табличка просто проявляется
		if (on && !this.on && configured) { var (x, y, w, h) = Box(App.W, App.H); Style.Appear(fx, x, y, w, h, C(App.H)); }
		this.on = on; configured = true;
	}

	public void Size(double margin, double width, double height, double inside)
	{
		pad = (float)Math.Clamp(margin, 0, 400);
		sx = (float)Math.Clamp(width, 0.3, 3); sy = (float)Math.Clamp(height, 0.3, 3);
		inner = (float)Math.Clamp(inside, 0, 10);
	}

	// масштаб содержимого: высота кадра и меньший из размеров (буквы не растягиваются)
	float C(int h) => h / 1080f * Math.Min(sx, sy);
	float P(float c) => 10.8f * inner * c;
	// кегли (точки при высоте 1080): заголовок 28 и строки 26 — умноженные на размер из оформления; зазор между названием и значением
	float HP => 28 * Style.HeadSize;
	float NP => 26 * Style.TextSize;
	const float Gap = 28;
	float Row => NP * 1.4f;
	// заголовок с полоской-акцентом под ним; без заголовка — только строки
	float Top => title.Length > 0 ? 46 * Style.HeadSize : 0;

	// ширина содержимого при масштабе c: заголовок или самая широкая строка
	float ContentW(float c)
	{
		float hp = MathF.Round(HP * c), np = MathF.Round(NP * c), m = title.Length > 0 ? Style.W(Head, title, hp, true) : 0;
		foreach (var (l, v) in rows)
			m = Math.Max(m, v == null ? Style.W(Body, l, np, false) : Style.W(Body, l, np, false) + Gap * c + Style.W(Body, v, np, false));
		return m;
	}

	(float x, float y, float w, float h) Box(int w, int h)
	{
		float c = C(h), U = h / 1080f;
		// по бокам — внутренний отступ и ещё 16 точек: строки «название — значение» не липнут к рамке
		float bw = (ContentW(c) + 2 * P(c) + 32 * c) * sx / Math.Min(sx, sy), bh = (Top + rows.Count * Row + 2 * 10.8f * inner) * U * sy;
		var (cx, cy) = Layout.Place(ax, ay, w, h, bw, bh, pad * U, pad * U);
		return (cx - bw / 2, cy - bh / 2, bw, bh);
	}

	public void Step()
	{
		fx.Step();
		vis = Math.Clamp(vis + (on ? 1f : -1f) / FadeSteps, 0, 1);
	}

	public void Draw(int w, int h)
	{
		if (vis > 0 && (title.Length > 0 || rows.Count > 0)) Plate(w, h);
		if (fx.Count > 0) { light.Begin(); norm.Begin(); fx.Draw(light, norm); norm.Flush(1, 0, 0, w, h); light.Flush(1, 0, 0, w, h); }
	}

	void Plate(int w, int h)
	{
		float c = C(h);
		int a = (int)(255 * vis);
		var (bx, by, bw, bh) = Box(w, h);
		float hp = MathF.Round(HP * c), np = MathF.Round(NP * c);
		// содержимое — посередине по высоте и по ширине (размер больше — поля вокруг)
		float cw = ContentW(c), x0 = bx + (bw - cw) / 2, y = by + (bh - (Top + rows.Count * Row) * c) / 2, cx = bx + bw / 2;

		poly.Begin();
		Style.Plate(poly, bx, by, bw, bh, c, 4 * c, a);
		poly.Flush(w, h);

		var hf = Head; var bf = Body;
		if (title.Length > 0)
		{
			float tw = Style.W(hf, title, hp, true);
			sh.Begin(); sh.Screen();
			sh.Rect(cx - tw / 2, y + 38 * Style.HeadSize * c, tw, 4 * c, Style.Col(Style.Accent, a, -0.05), 2 * c);
			sh.Flush(w, h);
			hf.Begin();
			Style.Ink(hf, title, cx - tw / 2, y, hp, Style.Col(Style.Accent, a), a, c, true);
			hf.Flush(w, h);
			y += Top * c;
		}
		// название — цветом текста потише, значение — цветом текста
		bf.Begin();
		uint lc = Style.Col(Style.Text, a * 190 / 255), vc = Style.Col(Style.Text, a);
		foreach (var (l, v) in rows)
		{
			if (v == null) Style.Ink(bf, l, cx - Style.W(bf, l, np, false) / 2, y, np, vc, a, c, false);
			else
			{
				Style.Ink(bf, l, x0, y, np, lc, a, c, false);
				Style.Ink(bf, v, x0 + cw - Style.W(bf, v, np, false), y, np, vc, a, c, false);
			}
			y += Row * c;
		}
		bf.Flush(w, h);
	}
}
