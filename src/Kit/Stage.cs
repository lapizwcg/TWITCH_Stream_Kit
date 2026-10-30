// СЦЕНА ПОКАЗА — один источник OBS на весь экран, в нём все показы: оповещения и цель. Один запуск движка на всё — меньше памяти
// и видеокарты, чем по источнику на каждый показ; каждый показ стоит в своём месте (Layout), его выбирают в док-панели
using Wcg;

namespace Kit;

public sealed class Stage : IScreen
{
	public readonly Alerts Alerts;
	public readonly Goal Goal;

	public Stage(Text tx, bool demo) { Alerts = new Alerts(tx, demo); Goal = new Goal(tx); }

	public void Step() { Goal.Step(); Alerts.Step(); }

	// оповещение — поверх цели
	public void Draw(int w, int h, double alpha) { Goal.Draw(w, h); Alerts.Draw(w, h); }

	// щелчок по странице (вне OBS) — тестовое оповещение
	public void Pointer(int id, int kind, float x, float y) { if (kind == 0) Alerts.ShowDemo(); }
}
