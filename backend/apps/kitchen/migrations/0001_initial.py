from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('sales', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='KitchenTicket',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('NEW', 'New'), ('PREPARING', 'Preparing'), ('READY', 'Ready')], default='NEW', max_length=12)),
                ('printed_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('order', models.OneToOneField(on_delete=models.deletion.CASCADE, to='sales.order')),
            ],
            options={
                'indexes': [models.Index(fields=['status', 'updated_at'], name='kitchen_ki_status_68f8f0_idx')],
            },
        ),
    ]