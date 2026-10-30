// МЕСТО НА ЭКРАНЕ — общее для всех показов: девять мест (tl t tr / l c r / bl b br), как клетки в док-панели. Источник в OBS — на весь
// экран, показ сам встаёт в своё место с полем от края; цвет — материал и тон (правило движка)
using System;
using Wcg;

namespace Kit;

public static class Layout
{
	// доли свободного места по X и Y: 0 — у левого/верхнего края, 1 — у правого/нижнего
	public static (float ax, float ay) Anchor(string pos)
	{
		pos = (pos ?? "c").ToLowerInvariant();
		return (pos.Contains('l') ? 0 : pos.Contains('r') ? 1 : 0.5f, pos.Contains('t') ? 0 : pos.Contains('b') ? 1 : 0.5f);
	}

	// середина блока cw×ch на месте (ax, ay) в кадре w×h с полем mx, my от краёв
	public static (float cx, float cy) Place(float ax, float ay, int w, int h, float cw, float ch, float mx, float my) =>
		(mx + cw / 2 + ax * (w - 2 * mx - cw), my + ch / 2 + ay * (h - 2 * my - ch));

	// цвет с умноженной прозрачностью
	public static uint Col(string mat, double tone, int a = 255)
	{
		var c = Mats.Pixel(Mats.Get(mat), 200, tone);
		return Shapes.Pm(c[0], c[1], c[2], a);
	}
}
