from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0015_storeconfig_card_fee_rates'),
    ]

    operations = [
        migrations.AddField(
            model_name='storeconfig',
            name='public_menu_url',
            field=models.TextField(blank=True, null=True),
        ),
    ]
