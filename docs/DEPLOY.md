# Развёртывание

Сайт Qazaq — один статический HTML-файл. Сервер для него не нужен: код выполняется в браузере посетителя.

## Быстрый путь: GitHub Pages

1. Слейте ветку с кодом в `main` (workflow запускается при пуше в `main`).
2. В репозитории откройте **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Дождитесь зелёной галочки workflow «Сайт на GitHub Pages» (вкладка Actions). Адрес появится в Settings → Pages.

Если у репозитория основная ветка называется иначе, измените `branches: [main]` в `.github/workflows/pages.yml`.

## Любой другой статический хостинг

```bash
python scripts/build_site.py
```

Файл `site/dist/index.html` самодостаточен: загрузите его на Netlify, Cloudflare Pages, Vercel, S3 или любой веб-сервер.
Единственные внешние запросы — шрифты Google Fonts (есть запасные системные шрифты, сайт работает и без них).

## Серверный режим (по желанию)

Нужен только для функций, которым требуется настоящий Python (`шеш`, `туын`, `интегр` вне многочленов).
**Не размещайте его публично без контейнерной изоляции** — см. [SECURITY.md](SECURITY.md).

```bash
pip install -e ".[server,science]"
python scripts/build_site.py
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

`Dockerfile` в корне описывает тот же запуск в контейнере (образ не проверялся: в среде разработки не было Docker-демона).

## Пакет Python

```bash
python -m build            # создаст dist/qazaq-<версия>-py3-none-any.whl и .tar.gz
pip install dist/*.whl     # даёт команду `qaz`
```

Публикация на PyPI (`twine upload dist/*`) требует вашего аккаунта и токена; без них я её не выполняю.

## Контрольный список перед выкладкой

- [ ] `python -m pytest` зелёный (`export NODE_PATH=$(npm root -g)` для проверки сайта в браузере).
- [ ] `python scripts/build_site.py` без ошибок; страница открывается и запускает пример.
- [ ] Лицензия [LICENSE](../LICENSE) актуальна.
- [ ] Для публичного серверного режима выполнены требования из [SECURITY.md](SECURITY.md) (иначе выкладывайте только статический сайт).
