import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from apps.sales.models import Order
from django.utils import timezone

orders = Order.objects.filter(status=Order.STATUS_PAID).order_by('-closed_at')
print(f"Total paid orders: {orders.count()}")
for o in orders[:10]:
    print(f"ID: {o.id} | Status: {o.status} | Closed: {o.closed_at} | Total: {o.total}")

print(f"Local now: {timezone.localtime()}")
