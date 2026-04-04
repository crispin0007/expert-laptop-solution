from core.registry import BMSModule, register_module


@register_module
class TicketsModule(BMSModule):
    id = 'tickets'
    name = 'Tickets'
    description = 'Full ticket lifecycle management — creation, assignment, SLA tracking, transfers, and product usage.'
    icon = 'ticket'
    version = '1.0.0'
    is_premium = False
    base_price = 0
    requires = ['core']
    permissions = [
        'tickets.view',
        'tickets.create',
        'tickets.update',
        'tickets.delete',
        'tickets.assign',
        'tickets.comment',
    ]
    nav = {
        'label': 'Tickets',
        'icon': 'ticket',
        'order': 2,
        'url': '/tickets',
        'mobile': True,
    }
