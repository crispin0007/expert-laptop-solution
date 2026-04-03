from core.registry import BMSModule, register_module


@register_module
class HrmModule(BMSModule):
    id = 'hrm'
    name = 'HRM'
    description = 'Leave management, staff profiles, attendance, and performance reviews'
    icon = 'users'
    version = '1.0.0'
    is_premium = True
    base_price = 0
    requires = ['core']
    permissions = [
        'hrm.view',
        'hrm.manage',
        'hrm.leave.apply',
        'hrm.leave.approve',
        'hrm.attendance.view',
        'hrm.attendance.manage',
        'hrm.performance.view',
        'hrm.performance.manage',
    ]
    nav = {
        'label': 'HRM',
        'icon': 'users',
        'order': 6,
        'url': '/hrm',
        'mobile': True,
    }
