// СЦЕНА ПОКАЗА — один источник OBS на весь экран, в нём все показы: оповещение о фолловере, анонс, цель и таблички челленджа. Один запуск движка на
// всё — меньше памяти и видеокарты, чем по источнику на каждый показ; каждый показ стоит в своём месте (Layout), его выбирают в
// док-панели
using Wcg;

namespace Kit;

public sealed class Stage : IScreen
{
	// фолловер — ник крупно одной строкой; анонс — своё сообщение помельче, с переносом по словам
	public readonly Alerts Alerts, Announce;
	public readonly Goal Goal;
	// таблички: карточка челленджа (название и день) — всегда на экране, статистика — по кнопке в доке
	public readonly Board Badge = new(), Stats = new();
	// рамка эфира — под всеми окошками
	public readonly Frame Frame = new();

	public Stage(bool demo)
	{
		Alerts = new Alerts(demo, "НОВЫЙ ФОЛЛОУЕР", 64, 0);
		Announce = new Alerts(false, "АНОНС", 40, 900);
		Goal = new Goal();
	}

	public void Step() { Goal.Step(); Badge.Step(); Stats.Step(); Announce.Step(); Alerts.Step(); }

	// рамка — снизу, оповещения — поверх цели и табличек, фолловер — поверх анонса
	public void Draw(int w, int h, double alpha) { Frame.Draw(w, h); Goal.Draw(w, h); Badge.Draw(w, h); Stats.Draw(w, h); Announce.Draw(w, h); Alerts.Draw(w, h); }

	// щелчок по странице (вне OBS) — тестовое оповещение
	public void Pointer(int id, int kind, float x, float y) { if (kind == 0) Alerts.ShowDemo(); }
}
