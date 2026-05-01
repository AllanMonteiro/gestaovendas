import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from apps.sales.models import CashSession

sessions = CashSession.objects.all().order_by('-closed_at')
print(f"Total sessions: {sessions.count()}")
for s in sessions[:10]:
    print(f"ID: {s.id} | Status: {s.status} | Opened: {s.opened_at} | Closed: {s.closed_at}")
