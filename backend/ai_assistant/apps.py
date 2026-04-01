from django.apps import AppConfig


class AiAssistantConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ai_assistant'
    verbose_name = 'AI Assistant'

    def ready(self) -> None:
        import ai_assistant.module     # noqa: F401
        import ai_assistant.listeners  # noqa: F401
