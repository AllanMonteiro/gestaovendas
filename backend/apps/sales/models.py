import uuid
from django.db import models
from django.conf import settings
from apps.catalog.models import Product
from apps.loyalty.models import Customer


class Order(models.Model):
    STATUS_OPEN = 'OPEN'
    STATUS_SENT = 'SENT'
    STATUS_READY = 'READY'
    STATUS_PAID = 'PAID'
    STATUS_CANCELED = 'CANCELED'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_SENT, 'Sent'),
        (STATUS_READY, 'Ready'),
        (STATUS_PAID, 'Paid'),
        (STATUS_CANCELED, 'Canceled'),
    ]

    TYPE_COUNTER = 'COUNTER'
    TYPE_TABLE = 'TABLE'
    TYPE_DELIVERY = 'DELIVERY'
    TYPE_CHOICES = [
        (TYPE_COUNTER, 'Counter'),
        (TYPE_TABLE, 'Table'),
        (TYPE_DELIVERY, 'Delivery'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business_date = models.DateField(null=True, blank=True)
    daily_number = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_OPEN)
    type = models.CharField(max_length=12, choices=TYPE_CHOICES, default=TYPE_COUNTER)
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL)
    table_label = models.CharField(max_length=40, null=True, blank=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    canceled_reason = models.TextField(null=True, blank=True)
    client_request_id = models.UUIDField(null=True, blank=True, unique=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['business_date', 'daily_number'], name='sales_order_daily_number_unique'),
        ]
        indexes = [
            models.Index(fields=['business_date', 'daily_number']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['created_at']),
        ]


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    qty = models.DecimalField(max_digits=10, decimal_places=3, default=1)
    weight_grams = models.IntegerField(null=True, blank=True)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['order', 'product']),
        ]


class Payment(models.Model):
    METHOD_CASH = 'CASH'
    METHOD_PIX = 'PIX'
    METHOD_CARD = 'CARD'
    METHOD_CHOICES = [
        (METHOD_CASH, 'Cash'),
        (METHOD_PIX, 'Pix'),
        (METHOD_CARD, 'Card'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='payments')
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    meta = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['order', 'method']),
            models.Index(fields=['created_at']),
        ]


class CashSession(models.Model):
    STATUS_OPEN = 'OPEN'
    STATUS_CLOSED = 'CLOSED'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_CLOSED, 'Closed'),
    ]

    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    initial_float = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN)
    opened_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'opened_at']),
        ]


class CashMove(models.Model):
    TYPE_SANGRIA = 'SANGRIA'
    TYPE_REFORCO = 'REFORCO'
    TYPE_CHOICES = [
        (TYPE_SANGRIA, 'Sangria'),
        (TYPE_REFORCO, 'Reforco'),
    ]

    session = models.ForeignKey(CashSession, on_delete=models.CASCADE, related_name='moves')
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        indexes = [
            models.Index(fields=['session', 'created_at']),
        ]


class StoreConfig(models.Model):
    store_name = models.CharField(max_length=120, default='Sorveteria POS')
    company_name = models.CharField(max_length=160, null=True, blank=True)
    logo_url = models.TextField(null=True, blank=True)
    cnpj = models.CharField(max_length=32, null=True, blank=True)
    address = models.CharField(max_length=255, null=True, blank=True)
    theme = models.CharField(max_length=20, default='light')
    points_per_real = models.IntegerField(default=1)
    point_value_real = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    min_redeem_points = models.IntegerField(default=0)
    max_discount_pct = models.DecimalField(max_digits=6, decimal_places=2, default=10)
    printer = models.JSONField(default=dict)
    scale = models.JSONField(default=dict)
    category_images = models.JSONField(default=dict)
    receipt_header_lines = models.JSONField(default=list)
    receipt_footer_lines = models.JSONField(default=list)

    class Meta:
        verbose_name = 'Store Config'
