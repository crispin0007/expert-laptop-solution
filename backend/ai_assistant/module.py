from core.registry import BMSModule, register_module


@register_module
class AiAssistantModule(BMSModule):
    """Phase 3 stub — AI Assistant (natural language commands)."""

    id = 'ai_assistant'
    name = 'AI Assistant'
    description = 'Natural language commands for tickets, customers, and expenses. (Phase 3)'
    icon = 'bot'
    version = '0.1.0'
    is_premium = True
    base_price = 0
    requires = ['core']
    permissions = [
        'ai_assistant.use',
        'ai_assistant.manage',
    ]
    nav = {
        'label': 'AI Assistant',
        'icon': 'bot',
        'order': 11,
        'url': '/ai-assistant',
        'mobile': True,
    }
