from django.http import JsonResponse
from django.conf import settings

def healthcheck(request):
    return JsonResponse({
        "status": "ok",
        "debug": settings.DEBUG,
        "app": "backend"
    })
