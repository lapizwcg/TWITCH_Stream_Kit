// ПАЛИТРА ДЛЯ ДОК-ПАНЕЛИ: цвета всех материалов движка (Mats) по тонам — в файл, чтобы пульт показывал выбор материала настоящими
// цветами (формулу Mats он не считает). Цвета в показе по-прежнему только материалы: пульт хранит «материал@тон», не цвет.
// Запуск: KitDesktop --palette=hosts/Web/wwwroot/palette.json (после изменения таблицы материалов)
using System.Globalization;
using System.IO;
using System.Text;
using Wcg;

namespace Kit;

public static class Palette
{
	// тона 0, 0.1 … 1 — пульт берёт ближайший
	const int Tones = 11;

	public static void Write(string path)
	{
		var info = new System.Collections.Generic.Dictionary<string, (string label, string group)>();
		foreach (var v in Data.Get("mats").Arr())
		{
			var d = v.Dict();
			info[d["id"].AsString()] = (d["label"].AsString(), d["group"].AsString());
		}
		var sb = new StringBuilder("[\n");
		bool first = true;
		foreach (var id in Mats.Ids)
		{
			var (label, group) = info.TryGetValue(id, out var x) ? x : (id, "");
			sb.Append(first ? "" : ",\n").Append("  {\"id\":\"").Append(id).Append("\",\"label\":\"").Append(label).Append("\",\"group\":\"").Append(group).Append("\",\"rgb\":[");
			first = false;
			for (int i = 0; i < Tones; i++)
			{
				var c = Mats.Pixel(Mats.Get(id), 200, i / (double)(Tones - 1));
				sb.Append(i > 0 ? "," : "").Append(string.Format(CultureInfo.InvariantCulture, "\"#{0:x2}{1:x2}{2:x2}\"", c[0], c[1], c[2]));
			}
			sb.Append("]}");
		}
		sb.Append("\n]\n");
		File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
	}
}
