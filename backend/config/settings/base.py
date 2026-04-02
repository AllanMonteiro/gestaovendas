import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import dj_database_url
from dotenv import load_dotenv

# BASE_DIR is now three levels up: backend/config/settings/base.py -> backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load local env files so Django respects backend/.env and backend/.env.production.
for env_path in (BASE_DIR / '.env', BASE_DIR / '.env.production'):
    if env_path.exists():
        load_dotenv(env_path, override=False)


def get_env(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value is not None and value != '':
            return value
    return default


def get_bool_env(*names: str, default: bool = False) -> bool:
    value = get_env(*names)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def get_list_env(*names: str) -> list[str]:
    value = get_env(*names, default='') or ''
    return [item.strip() for item in value.split(',') if item.strip()]


SECRET_KEY = get_env('SECRET_KEY', 'DJANGO_SECRET_KEY', default='dev-secret')
DEBUG = get_bool_env('DJANGO_DEBUG', 'DEBUG', default=True)
REQUIRE_AUTH = get_bool_env('REQUIRE_AUTH', 'DJANGO_REQUIRE_AUTH', default=True)

ALLOWED_HOSTS = get_list_env('ALLOWED_HOSTS', 'DJANGO_ALLOWED_HOSTS')
if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ['*'] if DEBUG else ['localhost', '127.0.0.1']

for local_host in ('localhost', '127.0.0.1'):
    if local_host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(local_host)

CORS_ALLOWED_ORIGINS = get_list_env('CORS_ALLOWED_ORIGINS', 'DJANGO_CORS_ALLOWED_ORIGINS')
CSRF_TRUSTED_ORIGINS = get_list_env('CSRF_TRUSTED_ORIGINS', 'DJANGO_CSRF_TRUSTED_ORIGINS')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'channels',
    'apps.accounts',
    'apps.catalog',
    'apps.sales',
    'apps.kitchen',
    'apps.loyalty',
    'apps.reports',
    'apps.audit',
    'apps.core',
    'apps.orders',
    'apps.integrations.whatsapp',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'


def build_database_from_url(url: str) -> dict:
    config = dj_database_url.parse(
        url,
        conn_max_age=int(get_env('DB_CONN_MAX_AGE', default='120') or '120'),
        ssl_require=not DEBUG,
    )
    if config.get('ENGINE') == 'django.db.backends.postgresql':
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        options = config.setdefault('OPTIONS', {})
        options.setdefault('connect_timeout', int(get_env('DB_CONNECT_TIMEOUT', default='5') or '5'))
        options.setdefault('sslmode', query.get('sslmode', ['require' if not DEBUG else 'prefer'])[0])
        options.setdefault('options', query.get('options', ['-c search_path=public'])[0])
    config['CONN_HEALTH_CHECKS'] = True
    return config


DATABASE_URL = get_env('DATABASE_URL')
if DATABASE_URL:
    DATABASES = {'default': build_database_from_url(DATABASE_URL)}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': get_env('POSTGRES_DB', default='sorveteria_pos'),
            'USER': get_env('POSTGRES_USER', default='sorveteria'),
            'PASSWORD': get_env('POSTGRES_PASSWORD', default='sorveteria'),
            'HOST': get_env('POSTGRES_HOST', default='127.0.0.1'),
            'PORT': get_env('POSTGRES_PORT', default='5432'),
            'CONN_MAX_AGE': int(get_env('DB_CONN_MAX_AGE', default='120') or '120'),
            'CONN_HEALTH_CHECKS': True,
            'OPTIONS': {
                'connect_timeout': int(get_env('DB_CONNECT_TIMEOUT', default='5') or '5'),
            },
        }
    }

AUTH_USER_MODEL = 'accounts.User'

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': (
        'config.renderers.UTF8JSONRenderer',
    ),
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated'
        if REQUIRE_AUTH
        else 'rest_framework.permissions.AllowAny',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
}

REDIS_URL = get_env('REDIS_URL')
REDIS_HOST = get_env('REDIS_HOST')
CACHE_BACKEND = os.getenv("CACHE_BACKEND", "redis")

if CACHE_BACKEND == "redis":
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": f"redis://{os.getenv('REDIS_HOST', 'redis')}:{os.getenv('REDIS_PORT', '6379')}/1",
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
            "TIMEOUT": int(os.getenv("CACHE_TIMEOUT", "300")),
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "fallback",
        }
    }

REDIS_PORT = int(get_env('REDIS_PORT', default='6379') or '6379')
if REDIS_URL:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [REDIS_URL],
            },
        },
    }
elif REDIS_HOST:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [(REDIS_HOST, REDIS_PORT)],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }

LANGUAGE_CODE = 'pt-br'
TIME_ZONE = get_env('TIME_ZONE', default='America/Sao_Paulo')
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

APP_CONFIG = {
    'STORE_NAME': get_env('STORE_NAME', default='Sorveteria POS'),
}

# 📲 WhatsApp Cloud API Settings
WHATSAPP_TOKEN = get_env('WHATSAPP_TOKEN')
WHATSAPP_PHONE_ID = get_env('WHATSAPP_PHONE_ID')
WHATSAPP_VERIFY_TOKEN = get_env('WHATSAPP_VERIFY_TOKEN', default='seu_token_secreto')

CORS_ALLOW_CREDENTIALS = True

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_SSL_REDIRECT = get_bool_env('SECURE_SSL_REDIRECT', 'DJANGO_SECURE_SSL_REDIRECT', default=not DEBUG)

LOG_LEVEL = get_env('LOG_LEVEL', 'DJANGO_LOG_LEVEL', default='INFO')
LOG_DIR = BASE_DIR / 'logs'
LOG_DIR.mkdir(exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {
            'format': '[%(levelname)s] %(asctime)s %(name)s: %(message)s'
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'standard'
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': LOG_DIR / 'django.log',
            'formatter': 'standard',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': LOG_LEVEL,
    },
    "loggers": {
        "django.db.backends": {
            "handlers": ["console"],
            "level": "WARNING",
        }
    }
}
