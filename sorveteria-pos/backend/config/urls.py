from django.contrib import admin
from django.conf import settings
from django.urls import path, include
from django.views.static import serve
from config.health import health_view

urlpatterns = [
    path('health', health_view),
    path("core/", include("apps.core.urls")),
    path('admin/', admin.site.urls),
    path('api/', include('apps.accounts.urls')),
    path('api/', include('apps.catalog.urls')),
    path('api/', include('apps.sales.urls')),
    path('api/', include('apps.kitchen.urls')),
    path('api/loyalty/', include('apps.loyalty.urls')),
    path('api/orders/', include('apps.orders.urls')),
    path('api/', include('apps.reports.urls')),
    path('api/', include('apps.audit.urls')),
    path('media/<path:path>', serve, {'document_root': settings.MEDIA_ROOT}),
]
