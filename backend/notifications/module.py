from core.registry import BMSModule, register_module


@register_module
class NotificationsModule(BMSModule):
    """Self-registering module descriptor for Notifications."""

    id = 'notifications'
    name = 'Notifications'
    description = 'In-app, email, and push notifications with per-user channel preferences.'
    icon = 'bell'
    version = '1.0.0'
    is_premium = False
    base_price = 0
    requires = ['core']
    permissions = [
        'notifications.view',
        'notifications.manage',
    ]
    nav = {
        'label': 'Notifications',
        'icon': 'bell',
        'order': 99,
        'url': '/notifications',
        'mobile': True,
    }
