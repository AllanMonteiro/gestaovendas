from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Customer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(blank=True, max_length=120, null=True)),
                ('phone', models.CharField(max_length=20, unique=True)),
            ],
            options={
                'indexes': [models.Index(fields=['phone'], name='loyalty_cu_phone_3e5a5a_idx')],
            },
        ),
        migrations.CreateModel(
            name='LoyaltyAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('points_balance', models.IntegerField(default=0)),
                ('customer', models.OneToOneField(on_delete=models.deletion.CASCADE, to='loyalty.customer')),
            ],
        ),
    ]
