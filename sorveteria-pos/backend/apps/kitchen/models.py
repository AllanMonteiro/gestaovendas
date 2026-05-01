from django.db import models
from apps.sales.models import Order


class KitchenTicket(models.Model):
    STATUS_NEW = 'NEW'
    STATUS_PREPARING = 'PREPARING'
    STATUS_READY = 'READY'
    STATUS_CHOICES = [
        (STATUS_NEW, 'New'),
        (STATUS_PREPARING, 'Preparing'),
        (STATUS_READY, 'Ready'),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_NEW)
    printed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'updated_at']),
        ]