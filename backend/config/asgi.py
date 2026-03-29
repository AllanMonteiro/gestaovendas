import os
import django
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from config.routing import websocket_urlpatterns
from config.ws_auth import JwtQueryAuthMiddlewareStack

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")
django.setup()

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': JwtQueryAuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
})
