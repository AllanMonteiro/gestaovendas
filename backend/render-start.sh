#!/usr/bin/env sh
set -e

export PGOPTIONS="${PGOPTIONS:--c search_path=public}"

python manage.py migrate
exec gunicorn config.asgi:application -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-2}
