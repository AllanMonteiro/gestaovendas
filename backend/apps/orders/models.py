from django.db import models

class Order(models.Model):
    STATUS_CHOICES = [
        ("novo", "Novo"),
        ("preparo", "Em preparo"),
        ("despachado", "Saindo para entrega"),
        ("entregue", "Entregue"),
    ]

    SOURCE_CHOICES = [
        ("pdv", "PDV"),
        ("whatsapp", "WhatsApp"),
    ]

    TYPE_CHOICES = [
        ("balcao", "Balcao"),
        ("delivery", "Delivery"),
    ]

    customer_name = models.CharField(max_length=150)
    customer_phone = models.CharField(max_length=30, blank=True, null=True)
    address = models.TextField(blank=True, null=True)

    payment_method = models.CharField(max_length=50, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    cep = models.CharField(max_length=15, blank=True, null=True)
    neighborhood = models.CharField(max_length=100, blank=True, null=True)
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    source = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    order_type = models.CharField(max_length=20, choices=TYPE_CHOICES)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="novo")

    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pix_payload = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Order {self.id} - {self.customer_name} ({self.status})"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name="items", on_delete=models.CASCADE)
    product_name = models.CharField(max_length=150)
    quantity = models.IntegerField(default=1)

    def __str__(self):
        return f"{self.quantity}x {self.product_name}"
