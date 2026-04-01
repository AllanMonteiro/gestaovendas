from django.db import migrations


def add_adjust_sale_date_permission(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    Role = apps.get_model('accounts', 'Role')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    permission, _ = Permission.objects.get_or_create(
        code='order.adjust.sale_date',
        defaults={'description': 'Ajustar data de venda finalizada'},
    )

    for role_name in ['Administrador', 'Gerente']:
        role = Role.objects.filter(name=role_name).first()
        if role is not None:
            RolePermission.objects.get_or_create(role=role, permission=permission)


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0003_seed_default_security'),
    ]

    operations = [
        migrations.RunPython(add_adjust_sale_date_permission, migrations.RunPython.noop),
    ]
