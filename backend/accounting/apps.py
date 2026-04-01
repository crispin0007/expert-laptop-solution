from django.apps import AppConfig


class AccountingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounting'
    verbose_name = 'Accounting'

    def ready(self):
        import accounting.signals   # noqa: F401
        import accounting.module    # noqa: F401
        import accounting.listeners  # noqa: F401
