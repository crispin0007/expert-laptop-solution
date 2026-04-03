from django.apps import AppConfig


class HrmConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'hrm'
    verbose_name = 'HRM'

    def ready(self):
        import hrm.signals   # noqa: F401
        import hrm.module    # noqa: F401
        import hrm.listeners  # noqa: F401
