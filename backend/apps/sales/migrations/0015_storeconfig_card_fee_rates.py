from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0014_delivery_integration_settings'),
    ]

    operations = [
        migrations.AddField(
            model_name='storeconfig',
            name='pix_fee_pct',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
        migrations.AddField(
            model_name='storeconfig',
            name='card_fee_credit_pct',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
        migrations.AddField(
            model_name='storeconfig',
            name='card_fee_debit_pct',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
    ]
