// ЗАПУСК — один для ПК и браузера: данные, материалы, эффекты, окно (холст), шрифт, сцена показа (оповещения и цель).
// Ключи: --demo — оповещение само раз в 6 с (проверка в OBS без Twitch); проверка на ПК без док-панели: --pos=tl…br — место
// карточки, --goal=37/100 — цель [--goalstyle=ltr|rtl|ttb|btt|radial] [--goalpos=b]; снимки — --shot=файл.png [--frames=K]
// [--size=ШxВ] [--scale=1.5x0.8 — размер показов по X и по Y] [--announce=текст — анонс вверху]
using System;
using Wcg;

namespace Kit;

public static class Boot
{
	// сцена — для моста страницы (настройки и тест из док-панели); до запуска — null
	public static Stage Stage { get; private set; }

	public static int Start(string[] args)
	{
		string Arg(string k) => Array.Find(args, a => a.StartsWith(k))?.Substring(k.Length);
		string shot = Arg("--shot="); int frames = int.TryParse(Arg("--frames="), out int f) ? f : 50;
		Data.Load(Paths.Of("data"));
		if (Data.Get("mats").VariantType == JType.Nil) { Console.WriteLine("данные не прочитались: " + Data.Error); return 1; }
		Mats.Load(Data.Get("mats"));
		if (Arg("--palette=") is string palette) { Palette.Write(palette); Console.WriteLine("палитра: " + palette); return 0; }
		Vfx.SetPresets(Data.Get("fx"));
		// наборы частиц для оформления окошек (выбор в доке). Без дыма: тёмный дым поверх чужого видео выглядит грязью, светящееся
		// ложится на него сложением
		Vfx.Bursts["boom"] = new[] { "вспышка", "кольцо", "огонь", "искры" };
		Vfx.Bursts["sparks"] = new[] { "искры", "вспышка" };
		Vfx.Bursts["ring"] = new[] { "кольцо", "вспышка" };
		Vfx.Bursts["fire"] = new[] { "огонь", "вспышка" };
		Vfx.Bursts["none"] = Array.Empty<string>();
		// оверлей: фон кадра пустой — в OBS под ним видео
		App.BgR = App.BgG = App.BgB = 0; App.BgA = 0;
		// размер — как у источника в OBS; --size=ШxВ — свой
		int w = 1280, h = 720; var size = Arg("--size=")?.Split('x');
		if (size?.Length == 2 && int.TryParse(size[0], out int sw) && int.TryParse(size[1], out int sh) && sw > 0 && sh > 0) { w = sw; h = sh; }
		if (!App.Open("Stream Kit — оповещения", w, h, hidden: shot != null)) return 1;
		Stage = new Stage(new Text(Paths.Of("data", "font")), Array.IndexOf(args, "--demo") >= 0 || shot != null);
		if (Arg("--pos=") is string pos) Stage.Alerts.Configure(true, pos, null, 4);
		// анонс для проверки: --announce="текст" — показ сразу, вверху по центру
		if (Arg("--announce=") is string ann) { Stage.Announce.Configure(true, "t", null, 8); Stage.Announce.Show(ann); }
		var goal = Arg("--goal=")?.Split('/');
		if (goal?.Length == 2 && int.TryParse(goal[0], out int cur) && int.TryParse(goal[1], out int max)) Stage.Goal.Configure(true, Arg("--goalpos=") ?? "b", null, cur, max, Arg("--goalstyle="));
		// размер обоим показам: --scale=1.5x0.8 (по X и по Y, доли)
		var scale = Arg("--scale=")?.Split('x');
		var inv = System.Globalization.CultureInfo.InvariantCulture;
		if (scale?.Length == 2 && double.TryParse(scale[0], System.Globalization.NumberStyles.Float, inv, out double kx) && double.TryParse(scale[1], System.Globalization.NumberStyles.Float, inv, out double ky))
		{
			Stage.Goal.Size(50, kx, ky, 1); Stage.Alerts.Size(70, kx, ky, 1);
		}
		// оформление всем окошкам: --style={JSON как в доке} (Style.Load)
		if (Arg("--style=") is string style)
		{
			var j = Data.Parse(System.Text.Encoding.UTF8.GetBytes(style));
			Stage.Alerts.Style.Load(j); Stage.Announce.Style.Load(j); Stage.Goal.Style.Load(j);
		}
		return App.Run(Stage, shot, frames);
	}
}
