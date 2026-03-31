from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0009_deliveryordermeta'),
    ]

    operations = [
        migrations.AddField(
            model_name='storeconfig',
            name='whatsapp_number',
            field=models.CharField(blank=True, max_length=30, null=True),
        ),
    ]
