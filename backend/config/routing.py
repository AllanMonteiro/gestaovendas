from django.urls import re_path
from apps.kitchen.consumers import KitchenConsumer
from apps.sales.consumers import PDVConsumer

websocket_urlpatterns = [
    re_path(r'^ws/kitchen$', KitchenConsumer.as_asgi()),
    re_path(r'^ws/pdv$', PDVConsumer.as_asgi()),
]