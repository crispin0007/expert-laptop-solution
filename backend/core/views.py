from django.http import JsonResponse


def health_check(request):
    """Simple health endpoint returning basic service status."""
    return JsonResponse({
        "status": "ok",
        "services": {
            "db": True,
            "redis": True,
        },
    })
