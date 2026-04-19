from decimal import Decimal, ROUND_HALF_UP
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=120)
    image_url = models.URLField(null=True, blank=True)
    sort_order = models.IntegerField(default=0)
    active = models.BooleanField(default=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['active', 'sort_order']),
        ]


class Product(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    name = models.CharField(max_length=160)
    description = models.TextField(null=True, blank=True)
    active = models.BooleanField(default=True)
    sold_by_weight = models.BooleanField(default=False)
    image_url = models.URLField(null=True, blank=True)
    stock = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    class Meta:
        indexes = [
            models.Index(fields=['category', 'active']),
            models.Index(fields=['name']),
        ]


class ProductStockEntry(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_entries')
    arrival_date = models.DateField()
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['product', 'arrival_date']),
            models.Index(fields=['-created_at']),
        ]


class ProductBarcode(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    ean = models.CharField(max_length=32, unique=True)

    class Meta:
        indexes = [
            models.Index(fields=['ean']),
        ]


class ProductPrice(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    store_id = models.IntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    cost = models.DecimalField(max_digits=10, decimal_places=2)
    freight = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    other = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_pct = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    overhead_pct = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    margin_pct = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('product', 'store_id')
        indexes = [
            models.Index(fields=['product', 'store_id']),
        ]

    def _q2(self, value: Decimal) -> Decimal:
        return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def cost_base(self) -> Decimal:
        return self._q2(self.cost + self.freight + self.other)

    def ideal_price(self) -> Decimal:
        pct_total = (self.tax_pct + self.overhead_pct + self.margin_pct) / Decimal('100')
        if pct_total >= 1:
            return self._q2(self.price)
        base = self.cost_base()
        return self._q2(base / (Decimal('1') - pct_total))

    def profit(self) -> Decimal:
        return self._q2(self.price - self.cost_base())
