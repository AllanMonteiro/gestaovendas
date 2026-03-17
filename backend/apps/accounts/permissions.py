import os
from rest_framework.permissions import BasePermission
from apps.accounts.models import RolePermission, UserRole


def auth_is_required() -> bool:
    debug_enabled = os.environ.get('DJANGO_DEBUG', '1') == '1'
    default_value = '0' if debug_enabled else '1'
    return os.environ.get('DJANGO_REQUIRE_AUTH', default_value) == '1'


def user_has_permission(user, code: str) -> bool:
    # Loja local: sem autenticacao estrita para permitir operacao offline.
    if not auth_is_required():
        return True
    if user is None:
        return False
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser:
        return True
    role_ids = UserRole.objects.filter(user=user).values_list('role_id', flat=True)
    return RolePermission.objects.filter(role_id__in=role_ids, permission__code=code).exists()


class HasPermissionCode(BasePermission):
    required_code = ''

    def has_permission(self, request, view):
        if not self.required_code:
            return True
        return user_has_permission(request.user, self.required_code)
