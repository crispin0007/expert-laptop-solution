from core.registry import BMSModule, register_module


@register_module
class ProjectsModule(BMSModule):
    """Self-registering module descriptor for Projects."""

    id = 'projects'
    name = 'Projects'
    description = 'Project and task management with milestones, team scheduling, and product tracking.'
    icon = 'folder-open'
    version = '1.0.0'
    is_premium = False
    base_price = 0
    requires = ['core']
    permissions = [
        'projects.view',
        'projects.create',
        'projects.update',
        'projects.delete',
    ]
    nav = {
        'label': 'Projects',
        'icon': 'folder-open',
        'order': 6,
        'url': '/projects',
        'mobile': True,
    }
