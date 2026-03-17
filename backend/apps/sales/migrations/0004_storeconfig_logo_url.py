from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0003_storeconfig_category_images'),
    ]

    operations = [
        migrations.AddField(
            model_name='storeconfig',
            name='logo_url',
            field=models.TextField(blank=True, null=True),
        ),
    ]

