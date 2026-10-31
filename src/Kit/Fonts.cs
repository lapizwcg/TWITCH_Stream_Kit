// ШРИФТЫ НА ВЫБОР: основной — Noto Sans (data/font), остальные — data/fonts/<id> (атласы знаков MTSDF, запекает KitDesktop
// --bakefonts из fonts/<id>/font.ttf, список — data/fonts.json). Шрифт грузится при первом обращении: в браузере страница
// докладывает файлы выбранных шрифтов в файловую систему .NET перед настройками (index.html), остальные не качаются. Нет файлов —
// основной (в следующий раз проверит снова)
using System.Collections.Generic;
using System.IO;
using Wcg;

namespace Kit;

public static class Fonts
{
	public const string MainId = "noto";
	public static Text Main { get; private set; }
	static readonly Dictionary<string, Text> got = new();

	public static void Init() => Main = new Text(Paths.Of("data", "font"));

	public static Text Get(string id)
	{
		if (string.IsNullOrEmpty(id) || id == MainId) return Main;
		if (got.TryGetValue(id, out var t)) return t;
		// id — из настроек дока: только имя папки, без путей
		if (id.IndexOfAny(new[] { '/', '\\', '.' }) >= 0) return Main;
		string dir = Paths.Of("data", "fonts", id);
		if (!File.Exists(Path.Combine(dir, "font.bin")) || !File.Exists(Path.Combine(dir, "font.png"))) return Main;
		return got[id] = new Text(dir, 4096);
	}
}
