"""
cms/apps.py
~~~~~~~~~~~
AppConfig for the CMS & Website Builder module.
"""
from django.apps import AppConfig


class CMSConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'cms'
    verbose_name = 'CMS & Website Builder'

    def ready(self) -> None:
        # Register signals
        import cms.signals    # noqa: F401
        import cms.module     # noqa: F401
        import cms.listeners  # noqa: F401
