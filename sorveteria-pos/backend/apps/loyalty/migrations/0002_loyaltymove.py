from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('loyalty', '0001_initial'),
        ('sales', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='LoyaltyMove',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('points', models.IntegerField()),
                ('type', models.CharField(choices=[('EARN', 'Earn'), ('REDEEM', 'Redeem'), ('ADJUST', 'Adjust'), ('REVERT', 'Revert')], max_length=10)),
                ('reason', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('customer', models.ForeignKey(on_delete=models.deletion.CASCADE, to='loyalty.customer')),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to='sales.order')),
            ],
            options={
                'indexes': [models.Index(fields=['customer', 'created_at'], name='loyalty_lo_customer_168399_idx')],
            },
        ),
    ]