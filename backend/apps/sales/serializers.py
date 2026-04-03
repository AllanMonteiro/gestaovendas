from urllib.parse import urlparse
from django.conf import settings
from rest_framework import serializers
from apps.sales.models import Order, OrderItem, Payment, CashSession, CashMove, StoreConfig


class OrderItemSerializer(serializers.ModelSerializer):
    order = serializers.UUIDField(source='order_id', read_only=True)
    product = serializers.IntegerField(source='product_id', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'order', 'product', 'product_name', 'qty', 'weight_grams', 'unit_price', 'total', 'notes', 'client_request_id']


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'order', 'method', 'amount', 'meta', 'created_at']


class OrderSerializer(serializers.ModelSerializer):
    customer = serializers.IntegerField(source='customer_id', allow_null=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source='customer.phone', allow_null=True, read_only=True)
    display_number = serializers.SerializerMethodField()
    items = OrderItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)

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
            'client_request_id', 'customer_name', 'customer_phone', 'display_number', 'items', 'payments',
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


class CashSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashSession
        fields = ['id', 'opened_at', 'closed_at', 'initial_float', 'status', 'opened_by', 'closed_by', 'reconciliation_data']


class CashMoveSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashMove
        fields = ['id', 'session', 'type', 'amount', 'reason', 'created_at', 'user']


class StoreConfigAssetSerializer(serializers.ModelSerializer):
    def _normalize_media_asset_value(self, value):
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        if not normalized:
            return ''
        if normalized.startswith('data:'):
            return normalized
        parsed = urlparse(normalized)
        if (parsed.scheme or parsed.netloc) and parsed.path.startswith(settings.MEDIA_URL):
            suffix = parsed.path
            if parsed.query:
                suffix = f'{suffix}?{parsed.query}'
            if parsed.fragment:
                suffix = f'{suffix}#{parsed.fragment}'
            return suffix
        return normalized

    def _resolve_asset_url(self, value):
        value = self._normalize_media_asset_value(value)
        if not isinstance(value, str) or not value:
            return value
        if value.startswith('http://') or value.startswith('https://') or value.startswith('data:'):
            return value
        request = self.context.get('request')
        if value.startswith('/') and request is not None:
            return request.build_absolute_uri(value)
        return value

    def validate_logo_url(self, value):
        return self._normalize_media_asset_value(value)

    def validate_category_images(self, value):
        if not isinstance(value, dict):
            return value
        return {
            key: self._normalize_media_asset_value(item)
            for key, item in value.items()
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['logo_url'] = self._resolve_asset_url(data.get('logo_url'))
        category_images = data.get('category_images')
        if isinstance(category_images, dict):
            data['category_images'] = {
                key: self._resolve_asset_url(value)
                for key, value in category_images.items()
            }
        return data


class StoreConfigSerializer(StoreConfigAssetSerializer):
    class Meta:
        model = StoreConfig
        fields = '__all__'


class StoreConfigUiSerializer(StoreConfigAssetSerializer):
    class Meta:
        model = StoreConfig
        fields = [
            'store_name',
            'company_name',
            'logo_url',
            'cnpj',
            'address',
            'whatsapp_number',
            'theme',
            'point_value_real',
            'min_redeem_points',
            'printer',
            'receipt_header_lines',
            'receipt_footer_lines',
            'delivery_fee_default',
            'delivery_fee_rules',
        ]


class StoreConfigPdvSerializer(StoreConfigAssetSerializer):
    class Meta:
        model = StoreConfig
        fields = [
            'store_name',
            'company_name',
            'logo_url',
            'cnpj',
            'address',
            'point_value_real',
            'min_redeem_points',
            'printer',
            'category_images',
            'receipt_header_lines',
            'receipt_footer_lines',
        ]
