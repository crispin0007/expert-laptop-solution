from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'inventory'
    verbose_name = 'Inventory'

    def ready(self):
        import inventory.signals   # noqa: F401
        import inventory.module    # noqa: F401
        import inventory.listeners  # noqa: F401
