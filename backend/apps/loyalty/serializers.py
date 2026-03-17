from rest_framework import serializers
from apps.loyalty.models import Customer, LoyaltyAccount, LoyaltyMove


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ['id', 'name', 'last_name', 'neighborhood', 'phone']


class LoyaltyAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyAccount
        fields = ['id', 'customer', 'points_balance']


class LoyaltyMoveSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyMove
        fields = ['id', 'customer', 'points', 'type', 'reason', 'order', 'created_at']
