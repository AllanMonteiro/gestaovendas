from __future__ import annotations

from typing import Iterable

from apps.accounts.models import Permission, Role, RolePermission, User, UserRole

DEFAULT_PERMISSIONS = [
    ('pdv.operate', 'Operar pedidos e vendas no PDV'),
    ('kitchen.manage', 'Operar fila da cozinha'),
    ('cash.manage', 'Abrir, reforcar, sangrar e fechar caixa'),
    ('catalog.manage', 'Cadastrar e editar produtos e categorias'),
    ('reports.view', 'Visualizar relatorios'),
    ('system.config.manage', 'Alterar configuracoes do sistema'),
    ('system.users.manage', 'Cadastrar usuarios e definir permissoes'),
    ('order.cancel', 'Cancelar pedidos'),
    ('order.delete', 'Excluir pedidos'),
    ('order.discount.override', 'Autorizar desconto acima do limite'),
]

DEFAULT_ROLES: dict[str, list[str]] = {
    'Administrador': [code for code, _ in DEFAULT_PERMISSIONS],
    'Gerente': [
        'pdv.operate',
        'kitchen.manage',
        'cash.manage',
        'catalog.manage',
        'reports.view',
        'order.cancel',
        'order.discount.override',
    ],
    'Operador de Caixa': [
        'pdv.operate',
        'cash.manage',
        'reports.view',
        'order.cancel',
    ],
    'Cozinha': [
        'kitchen.manage',
    ],
}


def ensure_default_security() -> None:
    for code, description in DEFAULT_PERMISSIONS:
        Permission.objects.get_or_create(code=code, defaults={'description': description})

    permissions_by_code = {permission.code: permission for permission in Permission.objects.all()}
    for role_name, permission_codes in DEFAULT_ROLES.items():
        role, _ = Role.objects.get_or_create(name=role_name)
        current_codes = set(
            RolePermission.objects.filter(role=role).values_list('permission__code', flat=True)
        )
        for code in permission_codes:
            if code in current_codes:
                continue
            permission = permissions_by_code.get(code)
            if permission is not None:
                RolePermission.objects.get_or_create(role=role, permission=permission)


def get_user_role_ids(user: User) -> list[int]:
    return list(UserRole.objects.filter(user=user).values_list('role_id', flat=True))


def get_user_permission_codes(user: User) -> list[str]:
    if user.is_superuser:
        return [code for code, _ in DEFAULT_PERMISSIONS]
    role_ids = UserRole.objects.filter(user=user).values_list('role_id', flat=True)
    return list(
        Permission.objects.filter(rolepermission__role_id__in=role_ids)
        .values_list('code', flat=True)
        .distinct()
        .order_by('code')
    )


def sync_user_roles(user: User, role_ids: Iterable[int]) -> None:
    desired_ids = {int(role_id) for role_id in role_ids}
    current_ids = set(UserRole.objects.filter(user=user).values_list('role_id', flat=True))

    for role_id in current_ids - desired_ids:
        UserRole.objects.filter(user=user, role_id=role_id).delete()

    for role_id in desired_ids - current_ids:
        UserRole.objects.get_or_create(user=user, role_id=role_id)


def has_bootstrap_admin() -> bool:
    for user in User.objects.filter(is_active=True):
        if user.has_usable_password():
            return True
    return False
