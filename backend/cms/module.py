from core.registry import BMSModule, register_module


@register_module
class CMSModule(BMSModule):
    """Phase 3 stub — CMS & Website Builder."""

    id = 'cms'
    name = 'CMS & Website Builder'
    description = 'AI-powered website generation, page builder, blog, and custom domain management. (Phase 3)'
    icon = 'globe'
    version = '0.1.0'
    is_premium = True
    base_price = 0
    requires = ['core']
    permissions = [
        'cms.view',
        'cms.create',
        'cms.update',
        'cms.delete',
        'cms.publish',
    ]
    nav = {
        'label': 'Website',
        'icon': 'globe',
        'order': 10,
        'url': '/cms',
        'mobile': False,
    }
