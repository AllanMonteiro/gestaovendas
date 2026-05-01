from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0004_category_price'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductStockEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('arrival_date', models.DateField()),
                ('quantity', models.DecimalField(decimal_places=3, max_digits=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('product', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='stock_entries', to='catalog.product')),
            ],
            options={
                'indexes': [
                    models.Index(fields=['product', 'arrival_date'], name='catalog_pro_product_2be1b8_idx'),
                    models.Index(fields=['-created_at'], name='catalog_pro_created_aa4c1e_idx'),
                ],
            },
        ),
    ]
