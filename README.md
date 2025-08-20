# Демо: Лайки и Комментарии (Supabase + Bun + Hono + VanillaJS)

Мини-приложение с постами, комментариями и лайками. Бэкенд на Bun + Hono, БД и аутентификация — через Supabase, фронтенд — на чистом VanillaJS.

## Назначение проекта

Показать простую, но полноценную интеграцию Bun + Hono с Supabase (Postgres + Auth), включая раздачу статики, REST API, OAuth-вход (Google), RLS-проверки на уровне БД и минимальный фронтенд.

## Общее описание проекта

- **Бэкенд**: `Bun` HTTP-сервер с роутером `Hono`. Раздаёт статику из `public/` и предоставляет REST API для постов, комментариев и лайков.
- **Фронтенд**: одна страница `public/index.html` + `public/app.js` без фреймворков. Взаимодействует с API и выполняет вход через Supabase OAuth.
- **База данных**: Supabase Postgres. Таблицы: `posts`, `comments`, `likes`. RLS-правила ожидаются на стороне Supabase для ограничения изменений только владельцам.
- **Аутентификация**: OAuth (по умолчанию Google) через Supabase Hosted UI или прямую авторизацию по сформированной ссылке.

Дополнительно:
- `/api/health/supabase` — быстрая проверка доступности БД.

## Структура проекта

```
test_supabase_bun_hono_vanilla_cursor_BAY/
  bun.lock
  package.json
  prompt.txt
  public/
    index.html
    app.js
    styles.css
  README.md
  server/
    index.ts
  sql/
    001_schema.sql
    002_seed.sql
  tsconfig.json
```

## Описание каталогов и файлов

- `server/index.ts`: точка входа бэкенда. Настройка `Hono`, CORS/логгер, статика, маршруты API и запуск `serve` (Bun).
- `public/index.html`: простая страница с формами/списками для постов, комментариев и лайков.
- `public/app.js`: логика фронтенда (fetch-запросы к API, отрисовка списков, вход/выход через Supabase).
- `public/styles.css`: базовые стили.
- `sql/001_schema.sql`: схема таблиц и политики (при необходимости — запустить в Supabase SQL Editor).
- `sql/002_seed.sql`: стартовые данные (демо-посты и т.п.).
- `package.json`: зависимости и скрипты запуска (`dev`, `start`).
- `tsconfig.json`: базовая конфигурация TypeScript для Bun.

## Переменные окружения

Создайте `.env` в корне проекта (Bun автоматически подхватывает его):

```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...  # используется только на бэкенде при необходимости
PORT=3000                                 # необязательно, по умолчанию 3000
```

Примечания:
- В Supabase включите провайдера Google и добавьте redirect URL: `http://localhost:3000/`.
- Секретные ключи храните вне репозитория.

## Запуск проекта

1) Установите Bun (инструкции на сайте `https://bun.sh`).

2) Подготовьте БД Supabase:
- Создайте проект в Supabase, получите `SUPABASE_URL` и `SUPABASE_ANON_KEY`.
- В Supabase SQL Editor последовательно выполните содержимое `sql/001_schema.sql` и `sql/002_seed.sql`.

3) Настройте окружение:
- Создайте файл `.env` (см. раздел «Переменные окружения» выше).

4) Установите зависимости и запустите сервер:

```
bun install
bun run dev
```

Откройте в браузере: `http://localhost:3000`.

## Использование проекта

- Нажмите «Войти через Google» и завершите OAuth (или работайте как гость — чтение доступно всем).
- Раздел «Посты» — просмотр демо-постов.
- «Добавить комментарий» — создание комментария (требуется вход).
- «Лайки» — поставить лайк выбранному посту (требуется вход).

Основные REST-эндпоинты:
- `GET /api/posts` — список постов (публично).
- `GET /api/comments?post_id=<id>` — список комментариев.
- `POST /api/comments` — создать комментарий (Authorization: Bearer <JWT>).
- `PATCH /api/comments/:id` — изменить комментарий (только владелец).
- `DELETE /api/comments/:id` — удалить комментарий (только владелец).
- `GET /api/likes?post_id=<id>` — список лайков (или всех).
- `POST /api/likes` — поставить лайк (Authorization: Bearer <JWT>).
- `DELETE /api/likes/:id` — удалить лайк (только владелец).
- `GET /api/auth/url?provider=google&redirect_to=<url>` — сгенерировать ссылку OAuth.
- `GET /api/health/supabase` — проверка связи с БД.

Если обращаетесь к защищённым маршрутам напрямую (без фронтенда), передавайте заголовок `Authorization: Bearer <access_token>`.

