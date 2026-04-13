#!/usr/bin/env sh
set -eu

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"

echo "Python version:"
python --version

echo "Pip version:"
python -m pip --version

echo "Installing backend dependencies..."
python -m pip install --no-cache-dir -r requirements.txt

echo "Running collectstatic..."
python manage.py collectstatic --noinput --verbosity 2
