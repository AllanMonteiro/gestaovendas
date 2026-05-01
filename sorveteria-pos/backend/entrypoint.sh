#!/usr/bin/env sh
set -e

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"
export PGOPTIONS="${PGOPTIONS:--c search_path=public}"

python manage.py migrate

if [ "${RUN_SEED:-0}" = "1" ]; then
  python manage.py seed_demo_data || true
fi

if [ "${RUN_COLLECTSTATIC:-1}" = "1" ]; then
  python manage.py collectstatic --noinput
fi

gunicorn config.asgi:application -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 -w ${WEB_CONCURRENCY:-1}
