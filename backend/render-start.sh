#!/usr/bin/env sh
set -e

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"
export PGOPTIONS="${PGOPTIONS:--c search_path=public}"

python manage.py migrate
python manage.py shell -c "
from apps.accounts.models import User
from apps.accounts.services import ensure_default_security
try:
    ensure_default_security()
    if not User.objects.filter(is_superuser=True).exists():
        User.objects.create_user(email='admin@admin.com', name='Administrador', password='admin123', is_staff=True, is_superuser=True)
        print('Administrador padrao criado com sucesso!')
except Exception as e:
    print('Erro ao criar administrador padrao:', e)
"
exec gunicorn config.asgi:application -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}
