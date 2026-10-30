# ЛОКАЛЬНЫЙ СЕРВЕР для OBS: раздаёт pub/web/wwwroot на http://localhost:5600 с запретом на кэш. Браузер OBS держит страницы в кэше,
# и после пересборки источник показывал старую версию (оповещения были, цели — нет); с «no-cache» он каждый раз спрашивает сервер,
# а неизменённые файлы тот отдаёт быстро по дате.
# Запуск из корня проекта: py tools/serve.py [порт]
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pub', 'web', 'wwwroot')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5600


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'text/javascript'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    # журнал каждого запроса не нужен — только ошибки
    def log_message(self, fmt, *args):
        if len(args) > 1 and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    print(f'Stream Kit: http://localhost:{PORT}/dock.html (док), http://localhost:{PORT}/ (показ)')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
