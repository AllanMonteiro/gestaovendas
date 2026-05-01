from django.db import migrations


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

DEFAULT_ROLES = {
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


def seed_default_security(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Role = apps.get_model('accounts', 'Role')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    permissions_by_code = {}
    for code, description in DEFAULT_PERMISSIONS:
        permission, _ = Permission.objects.get_or_create(code=code, defaults={'description': description})
        permissions_by_code[code] = permission

    for role_name, permission_codes in DEFAULT_ROLES.items():
        role, _ = Role.objects.get_or_create(name=role_name)
        for code in permission_codes:
            permission = permissions_by_code.get(code)
            if permission is not None:
                RolePermission.objects.get_or_create(role=role, permission=permission)


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_alter_user_managers_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_default_security, migrations.RunPython.noop),
    ]
