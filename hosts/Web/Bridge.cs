// МОСТ СТРАНИЦЫ: что страница-оверлей (index.html) передаёт в C# — настройки из док-панели и оповещения (событие канала или тест). Сама док-панель —
// отдельная страница (dock.html), с оверлеем она говорит через BroadcastChannel и localStorage, а сюда — уже готовые значения
using System.Runtime.InteropServices.JavaScript;

namespace KitWeb;

public static partial class Bridge
{
	[JSExport] public static void Follow(bool on, string pos, string title, double seconds) => Kit.Boot.Stage?.Alerts.Configure(on, pos, title, seconds);
	[JSExport] public static void ShowFollow(string name) => Kit.Boot.Stage?.Alerts.Show(name);
	[JSExport] public static void Goal(bool on, string pos, string title, int current, int target, string style) => Kit.Boot.Stage?.Goal.Configure(on, pos, title, current, target, style);
	[JSExport] public static void PreviewGoal(double frac) => Kit.Boot.Stage?.Goal.Preview(frac);
}
