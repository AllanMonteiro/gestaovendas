from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.accounts'

    def ready(self):
        # Register DB connection hooks (e.g. search_path fix for pooled connections).
        from . import db_signals  # noqa: F401
