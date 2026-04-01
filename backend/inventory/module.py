from core.registry import BMSModule, register_module


@register_module
class InventoryModule(BMSModule):
    id = 'inventory'
    name = 'Inventory'
    description = 'Product catalog, stock management, purchase orders, and supplier tracking'
    icon = 'package'
    version = '1.0.0'
    is_premium = False
    base_price = 0
    requires = ['core']
    permissions = [
        'inventory.view',
        'inventory.create',
        'inventory.update',
        'inventory.delete',
        'inventory.manage',
    ]
    nav = {
        'label': 'Inventory',
        'icon': 'package',
        'order': 4,
        'url': '/inventory',
        'mobile': True,
    }
