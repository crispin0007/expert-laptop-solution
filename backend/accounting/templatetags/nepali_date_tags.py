"""
accounting/templatetags/nepali_date_tags.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Django template filters for Nepali/BS date display in PDF templates.

Usage in templates:
    {% load nepali_date_tags %}
    {{ invoice.created_at|date_to_bs }}      → "2081-09-19" (BS ISO)
    {{ invoice.created_at|fiscal_year_label }} → "2081/082"
"""
import datetime as _dt

from django import template

register = template.Library()


@register.filter(name='date_to_bs')
def date_to_bs(value) -> str:
    """Convert an AD date/datetime to a BS date string (YYYY-MM-DD)."""
    if not value:
        return ''
    try:
        from core.nepali_date import ad_to_bs
        if isinstance(value, _dt.datetime):
            value = value.date()
        bs = ad_to_bs(value)
        return bs.isoformat()
    except Exception:
        return ''


@register.filter(name='fiscal_year_label')
def fiscal_year_label(value) -> str:
    """Return the Nepal fiscal year label (e.g. '2081/082') for an AD date/datetime."""
    if not value:
        return ''
    try:
        from core.nepali_date import fiscal_year_label_for
        if isinstance(value, _dt.datetime):
            value = value.date()
        return fiscal_year_label_for(value)
    except Exception:
        return ''
