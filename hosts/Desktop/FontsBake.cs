// ЗАПЕКАНИЕ ШРИФТОВ НА ВЫБОР (только ПК): fonts/<id>/font.ttf (OFL, Google Fonts) → data/fonts/<id>/font.png, font.bin — атлас
// знаков MTSDF движка (Bake.FontBake). Список — data/fonts.json. Знаков, которых
// в шрифте нет, берутся из Noto Sans движка — строка не теряет букв. Основной (noto) — из Noto Sans движка в data/font. Запас поля —
// Range точек атласа: обводка и свечение текста (Text.Ink) не шире его половины в долях кегля
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Wcg;

namespace Kit.Desktop;

public static class FontsBake
{
	const int Size = 48, Range = 32;
	// латиница, кириллица, знаки препинания, тире и кавычки, №
	const string Chars = "[0x20, 0x7e], [0xa0, 0xbf], 0xd7, 0x401, [0x410, 0x44f], 0x451, [0x2010, 0x2026], 0x2116";

	// коды знаков набора Chars (запись msdf-atlas-gen: «[a, b]» — промежуток, «0x..» — знак)
	static IEnumerable<int> Wanted()
	{
		foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(Chars, @"\[(0x[0-9a-f]+), (0x[0-9a-f]+)\]|0x[0-9a-f]+"))
		{
			int a = Convert.ToInt32(m.Groups[1].Success ? m.Groups[1].Value : m.Value, 16), b = m.Groups[2].Success ? Convert.ToInt32(m.Groups[2].Value, 16) : a;
			for (int c = a; c <= b; c++) yield return c;
		}
	}

	public static int Run()
	{
		Data.Load(Paths.Of("data"));
		string noto = Path.GetFullPath(Path.Combine(Paths.Root, "..", "WCGEngine", "fonts", "NotoSans.ttf"));
		int bad = 0;
		foreach (var f in Data.Get("fonts").Dict()["fonts"].Arr())
		{
			string id = f.Dict()["id"].AsString();
			bool main = id == "noto";
			string ttf = main ? noto : Paths.Of("fonts", id, "font.ttf"), outDir = main ? Paths.Of("data", "font") : Paths.Of("data", "fonts", id);
			Console.Write(id + ": ");
			if (!Bake.FontBake(outDir, new[] { (ttf, Chars) }, Size, Range)) { bad++; continue; }
			// чего в шрифте нет — допечь из Noto Sans только эти знаки (весь набор Noto раздул бы атлас вдвое)
			var has = new HashSet<int>();
			foreach (var g in Data.Parse(File.ReadAllBytes(Path.Combine(outDir, "font.json"))).Dict()["glyphs"].Arr()) has.Add(g.Dict()["unicode"].AsInt32());
			var miss = Wanted().Where(c => !has.Contains(c)).ToList();
			if (miss.Count > 0 && !main)
			{
				Console.Write($"из Noto {miss.Count} знаков; ");
				if (!Bake.FontBake(outDir, new[] { (ttf, Chars), (noto, string.Join(", ", miss.Select(c => "0x" + c.ToString("x")))) }, Size, Range)) { bad++; continue; }
			}
			File.Delete(Path.Combine(outDir, "font.json"));
		}
		return bad == 0 ? 0 : 1;
	}
}
