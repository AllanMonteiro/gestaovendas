#!/usr/bin/env sh
set -e

pip install --no-cache-dir -r requirements.txt
python manage.py collectstatic --noinput
