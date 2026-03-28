from rest_framework import serializers
from apps.catalog.models import Category, Product, ProductPrice


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'image_url', 'sort_order', 'active', 'price']


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'category', 'name', 'description', 'active', 'sold_by_weight', 'image_url', 'stock']


class ProductPriceSerializer(serializers.ModelSerializer):
    ideal_price = serializers.SerializerMethodField()
    cost_base = serializers.SerializerMethodField()
    profit = serializers.SerializerMethodField()

    class Meta:
        model = ProductPrice
        fields = [
            'id', 'product', 'store_id', 'price', 'cost', 'freight', 'other',
            'tax_pct', 'overhead_pct', 'margin_pct', 'updated_at',
            'ideal_price', 'cost_base', 'profit',
        ]

    def get_ideal_price(self, obj):
        return obj.ideal_price()

    def get_cost_base(self, obj):
        return obj.cost_base()

    def get_profit(self, obj):
        return obj.profit()