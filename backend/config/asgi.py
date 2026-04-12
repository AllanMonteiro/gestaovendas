import os
import django
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from dotenv import load_dotenv
from pathlib import Path

# Fix: Ensure env is loaded before django.setup()
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from config.routing import websocket_urlpatterns
from config.ws_auth import JwtQueryAuthMiddlewareStack

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': JwtQueryAuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
})
