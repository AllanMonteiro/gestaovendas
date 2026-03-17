from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
        ('catalog', '0001_initial'),
        ('loyalty', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Order',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('status', models.CharField(choices=[('OPEN', 'Open'), ('SENT', 'Sent'), ('READY', 'Ready'), ('PAID', 'Paid'), ('CANCELED', 'Canceled')], default='OPEN', max_length=12)),
                ('type', models.CharField(choices=[('COUNTER', 'Counter'), ('TABLE', 'Table'), ('DELIVERY', 'Delivery')], default='COUNTER', max_length=12)),
                ('table_label', models.CharField(blank=True, max_length=40, null=True)),
                ('subtotal', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('discount', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('closed_at', models.DateTimeField(blank=True, null=True)),
                ('canceled_reason', models.TextField(blank=True, null=True)),
                ('client_request_id', models.UUIDField(blank=True, null=True, unique=True)),
                ('customer', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to='loyalty.customer')),
            ],
            options={
                'indexes': [
                    models.Index(fields=['status', 'created_at'], name='sales_ord_status_1d22ab_idx'),
                    models.Index(fields=['created_at'], name='sales_ord_created_90260f_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='CashSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('opened_at', models.DateTimeField(auto_now_add=True)),
                ('closed_at', models.DateTimeField(blank=True, null=True)),
                ('initial_float', models.DecimalField(decimal_places=2, max_digits=10)),
                ('status', models.CharField(choices=[('OPEN', 'Open'), ('CLOSED', 'Closed')], default='OPEN', max_length=10)),
                ('opened_by', models.ForeignKey(on_delete=models.deletion.PROTECT, to='accounts.user')),
            ],
            options={
                'indexes': [models.Index(fields=['status', 'opened_at'], name='sales_cas_status_8b5b46_idx')],
            },
        ),
        migrations.CreateModel(
            name='CashMove',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('type', models.CharField(choices=[('SANGRIA', 'Sangria'), ('REFORCO', 'Reforco')], max_length=10)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('reason', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('session', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='moves', to='sales.cashsession')),
                ('user', models.ForeignKey(on_delete=models.deletion.PROTECT, to='accounts.user')),
            ],
            options={
                'indexes': [models.Index(fields=['session', 'created_at'], name='sales_cas_session_35b7f3_idx')],
            },
        ),
        migrations.CreateModel(
            name='OrderItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qty', models.DecimalField(decimal_places=3, default=1, max_digits=10)),
                ('weight_grams', models.IntegerField(blank=True, null=True)),
                ('unit_price', models.DecimalField(decimal_places=2, max_digits=10)),
                ('total', models.DecimalField(decimal_places=2, max_digits=10)),
                ('notes', models.TextField(blank=True, null=True)),
                ('order', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='items', to='sales.order')),
                ('product', models.ForeignKey(on_delete=models.deletion.PROTECT, to='catalog.product')),
            ],
            options={
                'indexes': [models.Index(fields=['order', 'product'], name='sales_ord_order_i_6a4d7f_idx')],
            },
        ),
        migrations.CreateModel(
            name='Payment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('method', models.CharField(choices=[('CASH', 'Cash'), ('PIX', 'Pix'), ('CARD', 'Card')], max_length=10)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('meta', models.JSONField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('order', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='payments', to='sales.order')),
            ],
            options={
                'indexes': [
                    models.Index(fields=['order', 'method'], name='sales_pay_order_i_6b3f32_idx'),
                    models.Index(fields=['created_at'], name='sales_pay_created_0d8c84_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='StoreConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('store_name', models.CharField(default='Sorveteria POS', max_length=120)),
                ('company_name', models.CharField(blank=True, max_length=160, null=True)),
                ('cnpj', models.CharField(blank=True, max_length=32, null=True)),
                ('address', models.CharField(blank=True, max_length=255, null=True)),
                ('theme', models.CharField(default='light', max_length=20)),
                ('points_per_real', models.IntegerField(default=1)),
                ('point_value_real', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('min_redeem_points', models.IntegerField(default=0)),
                ('max_discount_pct', models.DecimalField(decimal_places=2, default=10, max_digits=6)),
                ('printer', models.JSONField(default=dict)),
                ('scale', models.JSONField(default=dict)),
                ('receipt_header_lines', models.JSONField(default=list)),
                ('receipt_footer_lines', models.JSONField(default=list)),
            ],
        ),
    ]