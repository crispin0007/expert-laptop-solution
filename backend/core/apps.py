import importlib
import logging

from django.apps import AppConfig, apps

logger = logging.getLogger('nexus.events')


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
    verbose_name = 'Core'

    def ready(self) -> None:
        """Auto-discover and import every installed app's listeners.py.

        Importing a listeners module causes its @listens_to decorators to run,
        which registers each listener function into the EventBus _REGISTRY.
        This runs once at Django startup before the first request.
        """
        for app_config in apps.get_app_configs():
            module_path = f'{app_config.name}.listeners'
            try:
                importlib.import_module(module_path)
                logger.debug('nexus.events.listeners_loaded', extra={'module': module_path})
            except ModuleNotFoundError:
                # App has no listeners.py — that is fine.
                pass
            except Exception:
                logger.exception(
                    'nexus.events.listeners_load_error',
                    extra={'module': module_path},
                )
