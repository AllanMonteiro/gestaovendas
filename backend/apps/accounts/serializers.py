from __future__ import annotations

from rest_framework import serializers

from apps.accounts.models import Permission, Role, User
from apps.accounts.services import get_user_permission_codes, get_user_role_ids, sync_user_roles


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'code', 'description']


class RoleSerializer(serializers.ModelSerializer):
    permission_codes = serializers.SerializerMethodField()

    def get_permission_codes(self, obj):
        return list(obj.rolepermission_set.select_related('permission').values_list('permission__code', flat=True))

    class Meta:
        model = Role
        fields = ['id', 'name', 'permission_codes']


class UserSerializer(serializers.ModelSerializer):
    role_ids = serializers.SerializerMethodField()
    permission_codes = serializers.SerializerMethodField()

    def get_role_ids(self, obj):
        return get_user_role_ids(obj)

    def get_permission_codes(self, obj):
        return get_user_permission_codes(obj)

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'is_active', 'is_staff', 'is_superuser', 'role_ids', 'permission_codes']


class UserUpsertSerializer(serializers.ModelSerializer):
    password = serializers.CharField(required=False, allow_blank=False, write_only=True)
    role_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'password', 'is_active', 'is_staff', 'role_ids']

    def create(self, validated_data):
        role_ids = validated_data.pop('role_ids', [])
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        sync_user_roles(user, role_ids)
        return user

    def update(self, instance, validated_data):
        role_ids = validated_data.pop('role_ids', None)
        password = validated_data.pop('password', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        if role_ids is not None:
            sync_user_roles(instance, role_ids)
        return instance


class BootstrapSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=120)
    password = serializers.CharField(min_length=4)
