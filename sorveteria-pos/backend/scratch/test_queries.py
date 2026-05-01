import os
import django
from datetime import datetime, time
from django.utils import timezone
from django.utils.dateparse import parse_date

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from apps.reports import queries as report_queries

today = '2026-05-01'
print(f"Testing summary with today={today}")
try:
    res = report_queries.summary(today, today)
    print("Summary result:", res)
except Exception as e:
    print("Summary failed:", e)

print("\nTesting by_payment")
try:
    res = report_queries.by_payment(today, today)
    print("By payment result:", res)
except Exception as e:
    print("By payment failed:", e)
