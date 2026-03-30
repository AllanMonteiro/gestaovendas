from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0008_order_sales_order_status_1c53f1_idx'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliveryOrderMeta',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('customer_name', models.CharField(max_length=150)),
                ('customer_phone', models.CharField(blank=True, max_length=30, null=True)),
                ('address', models.TextField(blank=True, null=True)),
                ('payment_method', models.CharField(blank=True, max_length=50, null=True)),
                ('notes', models.TextField(blank=True, null=True)),
                ('cep', models.CharField(blank=True, max_length=15, null=True)),
                ('neighborhood', models.CharField(blank=True, max_length=100, null=True)),
                ('delivery_fee', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('pix_payload', models.TextField(blank=True, null=True)),
                ('source', models.CharField(choices=[('pdv', 'PDV'), ('whatsapp', 'WhatsApp')], default='whatsapp', max_length=20)),
                ('status', models.CharField(choices=[('novo', 'Novo'), ('preparo', 'Em preparo'), ('despachado', 'Saindo para entrega'), ('entregue', 'Entregue')], default='novo', max_length=20)),
                ('raw_items', models.JSONField(blank=True, default=list)),
                ('order', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='delivery_meta', to='sales.order')),
            ],
            options={
                'indexes': [
                    models.Index(fields=['status'], name='sales_deliv_status_93ef2b_idx'),
                    models.Index(fields=['source'], name='sales_deliv_source_528ed3_idx'),
                ],
            },
        ),
    ]
