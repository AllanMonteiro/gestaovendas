import uuid
from django.db import models
from django.conf import settings
from apps.catalog.models import Product
from apps.loyalty.models import Customer


def default_delivery_fee_rules():
    return [
        {'label': 'CENTRO', 'fee': '5.00'},
        {'label': 'BATISTA CAMPOS', 'fee': '6.00'},
        {'label': 'NAZARE', 'fee': '6.00'},
        {'label': 'UMARIZAL', 'fee': '7.00'},
        {'label': 'MARCO', 'fee': '8.00'},
        {'label': 'PEDREIRA', 'fee': '8.00'},
        {'label': 'TILEGUA', 'fee': '10.00'},
        {'label': 'COQUEIRO', 'fee': '12.00'},
    ]


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
            models.Index(fields=['status', 'closed_at']),
            models.Index(fields=['created_at']),
        ]


class DeliveryOrderMeta(models.Model):
    SOURCE_PDV = 'pdv'
    SOURCE_WEB = 'web'
    SOURCE_WHATSAPP = 'whatsapp'
    SOURCE_CHOICES = [
        (SOURCE_PDV, 'PDV'),
        (SOURCE_WEB, 'Web'),
        (SOURCE_WHATSAPP, 'WhatsApp'),
    ]

    STATUS_NEW = 'novo'
    STATUS_PREPARATION = 'preparo'
    STATUS_DISPATCHED = 'despachado'
    STATUS_DELIVERED = 'entregue'
    STATUS_CHOICES = [
        (STATUS_NEW, 'Novo'),
        (STATUS_PREPARATION, 'Em preparo'),
        (STATUS_DISPATCHED, 'Saindo para entrega'),
        (STATUS_DELIVERED, 'Entregue'),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='delivery_meta')
    customer_name = models.CharField(max_length=150)
    customer_phone = models.CharField(max_length=30, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    payment_method = models.CharField(max_length=50, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    cep = models.CharField(max_length=15, blank=True, null=True)
    neighborhood = models.CharField(max_length=100, blank=True, null=True)
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pix_payload = models.TextField(blank=True, null=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_WHATSAPP)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_NEW)
    raw_items = models.JSONField(default=list, blank=True)
    external_provider = models.CharField(max_length=40, blank=True, default='')
    external_order_id = models.CharField(max_length=120, blank=True, default='')
    external_sync_status = models.CharField(max_length=20, blank=True, default='pending')
    external_sync_error = models.TextField(blank=True, default='')

    class Meta:
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['source']),
        ]


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    qty = models.DecimalField(max_digits=10, decimal_places=3, default=1)
    weight_grams = models.IntegerField(null=True, blank=True)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.TextField(null=True, blank=True)
    client_request_id = models.UUIDField(null=True, blank=True, unique=True)

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
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+', null=True, blank=True)
    reconciliation_data = models.JSONField(null=True, blank=True)

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
    whatsapp_number = models.CharField(max_length=30, null=True, blank=True)
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
    pix_key = models.CharField(max_length=100, null=True, blank=True)
    delivery_fee_default = models.DecimalField(max_digits=10, decimal_places=2, default=10)
    delivery_fee_rules = models.JSONField(default=default_delivery_fee_rules)
    delivery_integration = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = 'Store Config'
