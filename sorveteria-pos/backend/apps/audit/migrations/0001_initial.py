from django.db import migrations, models
from django.conf import settings


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(max_length=80)),
                ('entity', models.CharField(max_length=80)),
                ('entity_id', models.CharField(max_length=80)),
                ('before', models.JSONField(blank=True, null=True)),
                ('after', models.JSONField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [
                    models.Index(fields=['entity', 'entity_id'], name='audit_aud_entity_4c9d06_idx'),
                    models.Index(fields=['created_at'], name='audit_aud_created_f9a2a8_idx'),
                ],
            },
        ),
    ]