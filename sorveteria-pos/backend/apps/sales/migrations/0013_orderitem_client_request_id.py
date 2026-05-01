from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('sales', '0012_rename_sales_deliv_status_93ef2b_idx_sales_deliv_status_d14794_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderitem',
            name='client_request_id',
            field=models.UUIDField(blank=True, null=True, unique=True),
        ),
    ]
