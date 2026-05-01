from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('sales', '0013_orderitem_client_request_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='deliveryordermeta',
            name='external_order_id',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='deliveryordermeta',
            name='external_provider',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='deliveryordermeta',
            name='external_sync_error',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='deliveryordermeta',
            name='external_sync_status',
            field=models.CharField(blank=True, default='pending', max_length=20),
        ),
        migrations.AddField(
            model_name='storeconfig',
            name='delivery_integration',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
