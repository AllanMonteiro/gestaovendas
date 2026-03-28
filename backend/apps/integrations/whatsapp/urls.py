from django.urls import path
from .views import webhook
from .endpoints import manual_parse_order

urlpatterns = [
    path("webhook", webhook, name="whatsapp_webhook"),
    path("manual-parse", manual_parse_order, name="whatsapp_manual_parse"),
]
