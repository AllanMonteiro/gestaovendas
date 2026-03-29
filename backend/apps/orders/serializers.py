from rest_framework import serializers
from .models import Order, OrderItem

class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'product_name', 'quantity']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'customer_name', 'customer_phone', 'address', 'notes',
            'payment_method', 'order_type', 'source', 'status',
            'subtotal', 'delivery_fee', 'total', 'pix_payload',
            'cep', 'neighborhood', 'created_at', 'items'
        ]
