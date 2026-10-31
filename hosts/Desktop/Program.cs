// ХОСТ ПК — ключи запуска из командной строки (Boot.cs); --bakefonts — запечь шрифты на выбор (FontsBake.cs)
if (System.Array.IndexOf(args, "--bakefonts") >= 0) return Kit.Desktop.FontsBake.Run();
return Kit.Boot.Start(args);
