from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Category',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('image_url', models.URLField(blank=True, null=True)),
                ('sort_order', models.IntegerField(default=0)),
                ('active', models.BooleanField(default=True)),
            ],
            options={
                'indexes': [models.Index(fields=['active', 'sort_order'], name='catalog_ca_active_0d8ae0_idx')],
            },
        ),
        migrations.CreateModel(
            name='Product',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=160)),
                ('description', models.TextField(blank=True, null=True)),
                ('active', models.BooleanField(default=True)),
                ('sold_by_weight', models.BooleanField(default=False)),
                ('image_url', models.URLField(blank=True, null=True)),
                ('category', models.ForeignKey(on_delete=models.deletion.PROTECT, to='catalog.category')),
            ],
            options={
                'indexes': [
                    models.Index(fields=['category', 'active'], name='catalog_pr_category_0ff31e_idx'),
                    models.Index(fields=['name'], name='catalog_pr_name_ee01f8_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='ProductBarcode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ean', models.CharField(max_length=32, unique=True)),
                ('product', models.ForeignKey(on_delete=models.deletion.CASCADE, to='catalog.product')),
            ],
            options={
                'indexes': [models.Index(fields=['ean'], name='catalog_pr_ean_4c5e16_idx')],
            },
        ),
        migrations.CreateModel(
            name='ProductPrice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('store_id', models.IntegerField(default=1)),
                ('price', models.DecimalField(decimal_places=2, max_digits=10)),
                ('cost', models.DecimalField(decimal_places=2, max_digits=10)),
                ('freight', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('other', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('tax_pct', models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ('overhead_pct', models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ('margin_pct', models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('product', models.ForeignKey(on_delete=models.deletion.CASCADE, to='catalog.product')),
            ],
            options={
                'unique_together': {('product', 'store_id')},
                'indexes': [models.Index(fields=['product', 'store_id'], name='catalog_pr_product_37ed90_idx')],
            },
        ),
    ]