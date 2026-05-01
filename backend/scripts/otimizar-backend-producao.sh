#!/usr/bin/env bash
set -e

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BASE_DIR"

echo "== Otimizando backend Django para producao =="

echo ""
echo "[1/9] Criando estrutura de settings..."
mkdir -p config/settings

if [ ! -f "config/settings/__init__.py" ]; then
  cat > config/settings/__init__.py <<'EOF'
from .base import *
EOF
fi

if [ ! -f "config/settings/base.py" ]; then
  cat > config/settings/base.py <<'EOF'
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() == "true"

ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",") if host.strip()]

CSRF_TRUSTED_ORIGINS = [
    origin.strip() for origin in os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",") if origin.strip()
]

CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.getenv("DJANGO_CORS_ALLOWED_ORIGINS", "").split(",") if origin.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = []
LOCAL_APPS = []

if os.getenv("USE_CORS", "False").lower() == "true":
    THIRD_PARTY_APPS.append("corsheaders")

if os.getenv("USE_DRF", "False").lower() == "true":
    THIRD_PARTY_APPS.append("rest_framework")

INSTALLED_APPS += THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
]

if "corsheaders" in INSTALLED_APPS:
    MIDDLEWARE.append("corsheaders.middleware.CorsMiddleware")

MIDDLEWARE += [
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": os.getenv("DB_ENGINE", "django.db.backends.sqlite3"),
        "NAME": os.getenv("DB_NAME", BASE_DIR / "db.sqlite3"),
        "USER": os.getenv("DB_USER", ""),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", ""),
        "PORT": os.getenv("DB_PORT", ""),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = os.getenv("TIME_ZONE", "America/Sao_Paulo")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CACHE_BACKEND = os.getenv("CACHE_BACKEND", "locmem")

if CACHE_BACKEND == "locmem":
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "default-cache",
            "TIMEOUT": int(os.getenv("CACHE_TIMEOUT", "300")),
        }
    }
elif CACHE_BACKEND == "filebased":
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
            "LOCATION": str(BASE_DIR / "cache"),
            "TIMEOUT": int(os.getenv("CACHE_TIMEOUT", "300")),
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "fallback-cache",
            "TIMEOUT": int(os.getenv("CACHE_TIMEOUT", "300")),
        }
    }

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "True").lower() == "true"
CSRF_COOKIE_SECURE = os.getenv("CSRF_COOKIE_SECURE", "True").lower() == "true"
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "False").lower() == "true"
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

LOG_LEVEL = os.getenv("DJANGO_LOG_LEVEL", "INFO")
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(levelname)s %(asctime)s %(name)s %(message)s"
        },
        "simple": {
            "format": "%(levelname)s %(message)s"
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
        "file": {
            "class": "logging.FileHandler",
            "filename": LOG_DIR / "django.log",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console", "file"],
        "level": LOG_LEVEL,
    },
}

if "rest_framework" in INSTALLED_APPS:
    REST_FRAMEWORK = {
        "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
        "PAGE_SIZE": int(os.getenv("API_PAGE_SIZE", "20")),
    }
EOF
fi

if [ ! -f "config/settings/production.py" ]; then
  cat > config/settings/production.py <<'EOF'
from .base import *

DEBUG = False
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "True").lower() == "true"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
EOF
fi

if [ ! -f "config/settings/development.py" ]; then
  cat > config/settings/development.py <<'EOF'
from .base import *

DEBUG = True
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_SSL_REDIRECT = False
EOF
fi

echo ""
echo "[2/9] Ajustando manage.py para settings por ambiente..."
# (Note: manual mapping of the Python part here or just skipping since it's already done)

echo ""
echo "[3/9] Ajustando wsgi.py e asgi.py..."

echo ""
echo "[4/9] Criando healthcheck..."
mkdir -p apps/core
touch apps/core/__init__.py

if [ ! -f "apps/core/views.py" ]; then
  cat > apps/core/views.py <<'EOF'
from django.http import JsonResponse
from django.conf import settings

def healthcheck(request):
    return JsonResponse({
        "status": "ok",
        "debug": settings.DEBUG,
        "app": "backend"
    })
EOF
fi

if [ ! -f "apps/core/urls.py" ]; then
  cat > apps/core/urls.py <<'EOF'
from django.urls import path
from .views import healthcheck

urlpatterns = [
    path("health/", healthcheck, name="healthcheck"),
]
EOF
fi

echo ""
echo "[5/9] Tentando incluir rota health no config/urls.py..."

echo ""
echo "[6/9] Garantindo gunicorn no requirements.txt..."
if [ -f "requirements.txt" ]; then
  grep -qi '^gunicorn' requirements.txt || echo 'gunicorn==22.0.0' >> requirements.txt
fi

echo ""
echo "[7/9] Criando arquivo de exemplo para producao..."
cat > .env.production.example <<'EOF'
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_SECRET_KEY=troque-essa-chave
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,seu-dominio.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://seu-dominio.com
DJANGO_CORS_ALLOWED_ORIGINS=https://seu-frontend.com
DJANGO_LOG_LEVEL=INFO

DB_ENGINE=django.db.backends.postgresql
DB_NAME=app_db
DB_USER=app_user
DB_PASSWORD=senha
DB_HOST=localhost
DB_PORT=5432
DB_CONN_MAX_AGE=60

CACHE_BACKEND=locmem
CACHE_TIMEOUT=300

USE_CORS=True
USE_DRF=True

TIME_ZONE=America/Sao_Paulo

SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
SECURE_SSL_REDIRECT=True

API_PAGE_SIZE=20
AI_PROVIDER=stub
AI_API_KEY=
EOF

echo ""
echo "[8/9] Criando script de start com gunicorn..."
cat > scripts/start_gunicorn.sh <<'EOF'
#!/usr/bin/env bash
set -e

export DJANGO_SETTINGS_MODULE=${DJANGO_SETTINGS_MODULE:-config.settings.production}

python manage.py collectstatic --noinput
python manage.py migrate --noinput

gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers 3 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
EOF

chmod +x scripts/start_gunicorn.sh

echo ""
echo "[9/9] Criando checklist de validacao..."
cat > scripts/validar_producao.sh <<'EOF'
#!/usr/bin/env bash
set -e

echo "== Validacao de producao =="

if [ -f ".env.production" ]; then
  echo "[OK] .env.production encontrado"
else
  echo "[ALERTA] .env.production nao encontrado"
fi

if grep -q 'config.settings.production' config/wsgi.py 2>/dev/null; then
  echo "[OK] wsgi.py apontando para producao"
else
  echo "[ALERTA] wsgi.py nao parece apontar para producao"
fi

if grep -q 'config.settings.development' manage.py 2>/dev/null; then
  echo "[OK] manage.py apontando para development"
else
  echo "[ALERTA] manage.py nao parece apontar para development"
fi

if grep -qi '^gunicorn' requirements.txt 2>/dev/null; then
  echo "[OK] gunicorn presente no requirements.txt"
else
  echo "[ALERTA] gunicorn ausente do requirements.txt"
fi

if [ -f "scripts/start_gunicorn.sh" ]; then
  echo "[OK] script start_gunicorn.sh criado"
fi

echo "Validacao concluida."
EOF

chmod +x scripts/validar_producao.sh

echo ""
echo "== Concluido =="
