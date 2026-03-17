from django.contrib import admin
from django.urls import path, include
from config.health import health_view

urlpatterns = [
    path('health', health_view),
    path('admin/', admin.site.urls),
    path('api/', include('apps.accounts.urls')),
    path('api/', include('apps.catalog.urls')),
    path('api/', include('apps.sales.urls')),
    path('api/', include('apps.kitchen.urls')),
    path('api/', include('apps.loyalty.urls')),
    path('api/', include('apps.reports.urls')),
    path('api/', include('apps.audit.urls')),
]