from rest_framework import serializers
from apps.sales.models import Order, OrderItem, Payment, CashSession, CashMove, StoreConfig


class OrderItemSerializer(serializers.ModelSerializer):
    order = serializers.UUIDField(source='order_id', read_only=True)
    product = serializers.IntegerField(source='product_id', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'order', 'product', 'product_name', 'qty', 'weight_grams', 'unit_price', 'total', 'notes']


class OrderSerializer(serializers.ModelSerializer):
    customer = serializers.IntegerField(source='customer_id', allow_null=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source='customer.phone', allow_null=True, read_only=True)
    display_number = serializers.SerializerMethodField()
    items = OrderItemSerializer(many=True, read_only=True)

    def get_customer_name(self, obj):
        if not obj.customer_id:
            return None
        first = (obj.customer.name or '').strip()
        last = (obj.customer.last_name or '').strip()
        full = f'{first} {last}'.strip()
        return full or None

    def get_display_number(self, obj):
        if obj.business_date and obj.daily_number:
            return f'{obj.daily_number:03d}'
        return str(obj.id)[:8]

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'type', 'customer', 'table_label', 'subtotal',
            'discount', 'total', 'created_at', 'closed_at', 'canceled_reason',
            'client_request_id', 'customer_name', 'customer_phone', 'display_number', 'items',
        ]


class OrderSummarySerializer(serializers.ModelSerializer):
    customer = serializers.IntegerField(source='customer_id', allow_null=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source='customer.phone', allow_null=True, read_only=True)
    display_number = serializers.SerializerMethodField()

    def get_customer_name(self, obj):
        if not obj.customer_id:
            return None
        first = (obj.customer.name or '').strip()
        last = (obj.customer.last_name or '').strip()
        full = f'{first} {last}'.strip()
        return full or None

    def get_display_number(self, obj):
        if obj.business_date and obj.daily_number:
            return f'{obj.daily_number:03d}'
        return str(obj.id)[:8]

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'type', 'customer', 'table_label', 'subtotal',
            'discount', 'total', 'created_at', 'closed_at', 'canceled_reason',
            'client_request_id', 'customer_name', 'customer_phone', 'display_number',
        ]


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'order', 'method', 'amount', 'meta', 'created_at']


class CashSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashSession
        fields = ['id', 'opened_at', 'closed_at', 'initial_float', 'status', 'opened_by', 'closed_by', 'reconciliation_data']


class CashMoveSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashMove
        fields = ['id', 'session', 'type', 'amount', 'reason', 'created_at', 'user']


class StoreConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreConfig
        fields = '__all__'


class StoreConfigUiSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreConfig
        fields = [
            'store_name',
            'company_name',
            'logo_url',
            'cnpj',
            'address',
            'theme',
            'point_value_real',
            'min_redeem_points',
            'printer',
            'receipt_header_lines',
            'receipt_footer_lines',
            'pix_key',
        ]


class StoreConfigPdvSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreConfig
        fields = [
            'store_name',
            'company_name',
            'cnpj',
            'address',
            'point_value_real',
            'min_redeem_points',
            'printer',
            'category_images',
            'receipt_header_lines',
            'receipt_footer_lines',
        ]
