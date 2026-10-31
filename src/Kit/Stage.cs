// СЦЕНА ПОКАЗА — один источник OBS на весь экран, в нём все показы: оповещение о фолловере, анонс и цель. Один запуск движка на
// всё — меньше памяти и видеокарты, чем по источнику на каждый показ; каждый показ стоит в своём месте (Layout), его выбирают в
// док-панели
using Wcg;

namespace Kit;

public sealed class Stage : IScreen
{
	// фолловер — ник крупно одной строкой; анонс — своё сообщение помельче, с переносом по словам
	public readonly Alerts Alerts, Announce;
	public readonly Goal Goal;

	public Stage(Text tx, bool demo)
	{
		Alerts = new Alerts(tx, demo, "НОВЫЙ ФОЛЛОУЕР", 64, 0);
		Announce = new Alerts(tx, false, "АНОНС", 40, 900);
		Goal = new Goal(tx);
	}

	public void Step() { Goal.Step(); Announce.Step(); Alerts.Step(); }

	// оповещения — поверх цели, фолловер — поверх анонса
	public void Draw(int w, int h, double alpha) { Goal.Draw(w, h); Announce.Draw(w, h); Alerts.Draw(w, h); }

	// щелчок по странице (вне OBS) — тестовое оповещение
	public void Pointer(int id, int kind, float x, float y) { if (kind == 0) Alerts.ShowDemo(); }
}
