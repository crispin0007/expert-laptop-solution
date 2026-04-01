from core.registry import BMSModule, register_module


@register_module
class AccountingModule(BMSModule):
    id = 'accounting'
    name = 'Accounting'
    description = 'Invoices, bills, payments, payroll, journal entries, and financial reports'
    icon = 'calculator'
    version = '1.0.0'
    is_premium = False
    base_price = 0
    requires = ['core']
    permissions = [
        'accounting.view',
        'accounting.create',
        'accounting.update',
        'accounting.delete',
        'accounting.manage',
        'accounting.approve',
    ]
    nav = {
        'label': 'Accounting',
        'icon': 'calculator',
        'order': 5,
        'url': '/accounting',
        'mobile': False,
    }
