from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0004_storeconfig_logo_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='business_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='daily_number',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['business_date', 'daily_number'], name='sales_order_busines_b2e5b4_idx'),
        ),
        migrations.AddConstraint(
            model_name='order',
            constraint=models.UniqueConstraint(fields=('business_date', 'daily_number'), name='sales_order_daily_number_unique'),
        ),
    ]
