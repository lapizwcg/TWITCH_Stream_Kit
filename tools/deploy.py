# ВЫКЛАДКА НА GITHUB PAGES: собрать веб-версию здесь и отправить готовые файлы в ветку gh-pages — оттуда их раздаёт GitHub
# (https://lapizwcg.github.io/TWITCH_Stream_Kit/). Собираем у себя, а не в GitHub Actions: движок (../WCGEngine) — закрытый
# репозиторий, на GitHub его не собрать.
# Номер версии (время и коммит) вписывается в страницы и version.json — по нему страницы в OBS обновляются сами.
# Запуск из корня проекта: py tools/deploy.py  [--no-push — только собрать и закоммитить в gh-pages]
import os
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'pub', 'web', 'wwwroot')
BRANCH = 'gh-pages'


def run(*args, cwd=ROOT, check=True):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and r.returncode != 0:
        sys.exit(f'не вышло: {" ".join(args)}\n{r.stdout}\n{r.stderr}')
    return r.stdout.strip()


def main():
    push = '--no-push' not in sys.argv
    if run('git', 'status', '--porcelain'):
        print('внимание: есть незакоммиченные правки — выкладывается то, что сейчас в папке')
    commit = run('git', 'rev-parse', '--short', 'HEAD')
    version = time.strftime('%Y%m%d-%H%M%S') + '-' + commit

    print('сборка веб-версии…')
    run('dotnet', 'publish', 'hosts/Web', '-c', 'Release', '-o', 'pub/web')

    tmp = tempfile.mkdtemp(prefix='kit-pages-')
    try:
        # ветка gh-pages — отдельная история только с готовыми файлами; первый раз её ещё нет
        run('git', 'fetch', 'origin', BRANCH, check=False)
        has_remote = bool(run('git', 'ls-remote', '--heads', 'origin', BRANCH))
        if has_remote:
            run('git', 'worktree', 'add', '-B', BRANCH, tmp, f'origin/{BRANCH}')
        else:
            run('git', 'worktree', 'add', '--detach', tmp)
            run('git', 'checkout', '--orphan', BRANCH, cwd=tmp)
        for name in os.listdir(tmp):
            if name != '.git':
                p = os.path.join(tmp, name)
                shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)

        # сжатые копии (.br, .gz) Pages не раздаёт — лишний вес; браузер берёт обычные файлы
        for base, _, files in os.walk(OUT):
            for f in files:
                if f.endswith(('.br', '.gz')):
                    continue
                src = os.path.join(base, f)
                dst = os.path.join(tmp, os.path.relpath(src, OUT))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
        for page in ('index.html', 'dock.html'):
            p = os.path.join(tmp, page)
            with open(p, encoding='utf-8') as fh:
                s = fh.read()
            with open(p, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(s.replace('__KIT_VERSION__', version))
        with open(os.path.join(tmp, 'version.json'), 'w', encoding='utf-8') as fh:
            fh.write('{ "v": "%s" }\n' % version)
        # без .nojekyll GitHub прогоняет сайт через Jekyll, а он выбрасывает папки с «_» — то есть _framework с .NET
        open(os.path.join(tmp, '.nojekyll'), 'w').close()

        run('git', 'add', '-A', cwd=tmp)
        run('git', 'commit', '-m', f'Выкладка {version}', cwd=tmp)
        if push:
            print('отправка на GitHub…')
            run('git', 'push', 'origin', BRANCH, cwd=tmp)
        print(f'готово: версия {version}')
        print('док:   https://lapizwcg.github.io/TWITCH_Stream_Kit/dock.html')
        print('показ: https://lapizwcg.github.io/TWITCH_Stream_Kit/')
    finally:
        run('git', 'worktree', 'remove', '--force', tmp, check=False)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
