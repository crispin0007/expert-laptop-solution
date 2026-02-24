from django.apps import AppConfig


class TicketsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tickets'
    verbose_name = 'Tickets'

    def ready(self):
        import tickets.signals  # noqa: F401
        # Inventory signals listen to TicketProduct and Ticket models
        import inventory.signals  # noqa: F401
        import accounting.signals  # noqa: F401

