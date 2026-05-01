from decimal import Decimal

from django.db import migrations, models


def default_delivery_fee_rules():
    return [
        {'label': 'CENTRO', 'fee': '5.00'},
        {'label': 'BATISTA CAMPOS', 'fee': '6.00'},
        {'label': 'NAZARE', 'fee': '6.00'},
        {'label': 'UMARIZAL', 'fee': '7.00'},
        {'label': 'MARCO', 'fee': '8.00'},
        {'label': 'PEDREIRA', 'fee': '8.00'},
        {'label': 'TILEGUA', 'fee': '10.00'},
        {'label': 'COQUEIRO', 'fee': '12.00'},
    ]


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0010_storeconfig_whatsapp_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='storeconfig',
            name='delivery_fee_default',
            field=models.DecimalField(decimal_places=2, default=Decimal('10.00'), max_digits=10),
        ),
        migrations.AddField(
            model_name='storeconfig',
            name='delivery_fee_rules',
            field=models.JSONField(default=default_delivery_fee_rules),
        ),
    ]
