from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loyalty', '0002_loyaltymove'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='last_name',
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
        migrations.AddField(
            model_name='customer',
            name='neighborhood',
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
    ]
