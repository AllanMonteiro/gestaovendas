from decimal import Decimal

from rest_framework import serializers


def _serialize_quantity(value):
    if isinstance(value, Decimal):
        integral_value = value.to_integral_value()
        if value == integral_value:
            return int(integral_value)
        return float(value)
    return value


class OrderItemSerializer(serializers.Serializer):
    product_name = serializers.CharField()
    quantity = serializers.JSONField()
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)


class OrderSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()
    notes = serializers.SerializerMethodField()
    payment_method = serializers.SerializerMethodField()
    order_type = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    delivery_fee = serializers.SerializerMethodField()
    total = serializers.DecimalField(max_digits=10, decimal_places=2)
    pix_payload = serializers.SerializerMethodField()
    cep = serializers.SerializerMethodField()
    neighborhood = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()
    items = serializers.SerializerMethodField()

    def _meta(self, obj):
        return getattr(obj, 'delivery_meta', None)

    def _include_items(self):
        return self.context.get('include_items', True)

    def get_customer_name(self, obj):
        meta = self._meta(obj)
        if meta and meta.customer_name:
            return meta.customer_name
        customer = getattr(obj, 'customer', None)
        return getattr(customer, 'name', None)

    def get_customer_phone(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'customer_phone', None)

    def get_address(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'address', None)

    def get_notes(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'notes', None)

    def get_payment_method(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'payment_method', None)

    def get_order_type(self, obj):
        return 'delivery'

    def get_source(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'source', None)

    def get_status(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'status', None)

    def get_delivery_fee(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'delivery_fee', Decimal('0.00'))

    def get_pix_payload(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'pix_payload', None)

    def get_cep(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'cep', None)

    def get_neighborhood(self, obj):
        meta = self._meta(obj)
        return getattr(meta, 'neighborhood', None)

    def get_items(self, obj):
        if not self._include_items():
            return []
        items = []
        for item in obj.items.all():
            product_name = item.product.name if getattr(item, 'product', None) is not None else None
            items.append({
                'product_name': product_name or 'Item',
                'quantity': _serialize_quantity(item.qty),
                'unit_price': item.unit_price,
                'total': item.total,
            })
        if items:
            return OrderItemSerializer(items, many=True).data

        meta = self._meta(obj)
        raw_items = getattr(meta, 'raw_items', []) or []
        normalized_items = [
            {
                'product_name': item.get('product_name', 'Item'),
                'quantity': item.get('quantity', 1),
                'unit_price': item.get('unit_price'),
                'total': item.get('total'),
            }
            for item in raw_items
        ]
        return OrderItemSerializer(normalized_items, many=True).data
