"""
cms/tasks.py
~~~~~~~~~~~~
Celery background tasks for the CMS module.

Phase 1
-------
- task_run_ai_generation: Stub that returns structured placeholder content in
  the correct JSON schema.  Swap _call_ai_api() for a real LLM call in Phase 2.
- task_verify_custom_domain: DNS TXT lookup for ownership verification.
- task_check_domain_ssl: Poll Caddy API for SSL status.

All tasks are idempotent and safe to retry (max_retries=3).
"""
from __future__ import annotations
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


# ── AI Generation ─────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=30, name='cms.task_run_ai_generation')
def task_run_ai_generation(self, job_id: int) -> None:
    """
    Generate website design options for a CMSGenerationJob.

    Phase 1 implementation returns three structured placeholder designs.
    Phase 2: replace _generate_designs_stub() with a real LLM call.

    JSON schema for each design option::

        {
            "theme": {
                "theme_key": "modern-blue",
                "primary_color": "#4F46E5",
                "secondary_color": "#7C3AED",
                "font_family": "Inter"
            },
            "name": "Modern Blue",
            "description": "...",
            "pages": [
                {
                    "page_type": "home",
                    "title": "Home",
                    "slug": "",
                    "show_in_nav": true,
                    "sort_order": 0,
                    "meta_title": "...",
                    "meta_description": "...",
                    "blocks": [
                        {
                            "block_type": "hero",
                            "sort_order": 0,
                            "content": {
                                "headline": "...",
                                "subheadline": "...",
                                "cta_text": "...",
                                "cta_url": "/contact"
                            }
                        },
                        ...
                    ]
                }
            ]
        }
    """
    from .models import CMSGenerationJob
    try:
        job = CMSGenerationJob.objects.get(pk=job_id)
    except CMSGenerationJob.DoesNotExist:
        logger.error("task_run_ai_generation: job %s not found", job_id)
        return

    if job.status not in (CMSGenerationJob.STATUS_QUEUED, CMSGenerationJob.STATUS_GENERATING):
        logger.info("task_run_ai_generation: job %s already in state %s, skipping", job_id, job.status)
        return

    job.status = CMSGenerationJob.STATUS_GENERATING
    job.save(update_fields=['status'])

    try:
        designs = _generate_designs_stub(job.prompt, job.site)
        job.design_options = designs
        job.status = CMSGenerationJob.STATUS_COMPLETED
        job.generated_at = timezone.now()
        job.save(update_fields=['design_options', 'status', 'generated_at'])
        logger.info("task_run_ai_generation: job %s completed with %d designs", job_id, len(designs))
    except Exception as exc:
        logger.error("task_run_ai_generation: job %s failed: %s", job_id, exc, exc_info=True)
        job.status = CMSGenerationJob.STATUS_FAILED
        job.failure_reason = str(exc)
        job.save(update_fields=['status', 'failure_reason'])
        raise self.retry(exc=exc)


def _generate_designs_stub(prompt: str, site) -> list[dict]:
    """
    Phase 1 stub — returns three designs with varied themes.
    Replace this with a real Claude/Gemini API call in Phase 2.

    The prompt is used to seed the business name used in placeholder text.
    """
    business_name = site.site_name or 'Your Business'
    # Extract a keyword from the prompt for minimal personalisation
    words = [w for w in prompt.split() if len(w) > 3]
    keyword = words[0].title() if words else 'Professional'

    themes = [
        {
            'theme_key': 'modern-indigo',
            'primary_color': '#4F46E5',
            'secondary_color': '#7C3AED',
            'font_family': 'Inter',
            'name': 'Modern Indigo',
            'description': 'Clean, professional design with indigo and purple accents.',
        },
        {
            'theme_key': 'corporate-blue',
            'primary_color': '#1D4ED8',
            'secondary_color': '#0EA5E9',
            'font_family': 'Roboto',
            'name': 'Corporate Blue',
            'description': 'Trustworthy corporate aesthetic in blue and sky tones.',
        },
        {
            'theme_key': 'bold-slate',
            'primary_color': '#0F172A',
            'secondary_color': '#F97316',
            'font_family': 'Poppins',
            'name': 'Bold Slate',
            'description': 'Dark slate with vibrant orange accent for a bold, modern feel.',
        },
    ]

    designs = []
    for theme in themes:
        designs.append({
            'theme': {
                'theme_key':       theme['theme_key'],
                'primary_color':   theme['primary_color'],
                'secondary_color': theme['secondary_color'],
                'font_family':     theme['font_family'],
            },
            'name':        theme['name'],
            'description': theme['description'],
            'pages': [
                {
                    'page_type': 'home',
                    'title': 'Home',
                    'slug': '',
                    'show_in_nav': True,
                    'sort_order': 0,
                    'meta_title': f"{business_name} — {keyword} Services",
                    'meta_description': f"Welcome to {business_name}. We provide {keyword.lower()} solutions tailored for you.",
                    'blocks': [
                        {
                            'block_type': 'hero',
                            'sort_order': 0,
                            'content': {
                                'headline': f"{keyword} Solutions You Can Trust",
                                'subheadline': f"{business_name} delivers exceptional service to businesses of all sizes.",
                                'cta_text': 'Get Started',
                                'cta_url': '/contact',
                                'background_type': 'gradient',
                            },
                        },
                        {
                            'block_type': 'services',
                            'sort_order': 1,
                            'content': {
                                'heading': 'Our Services',
                                'items': [
                                    {'title': f'{keyword} Consulting', 'description': 'Expert consulting tailored to your needs.', 'icon': 'briefcase'},
                                    {'title': 'Support & Maintenance', 'description': '24/7 support to keep your business running.', 'icon': 'headset'},
                                    {'title': 'Implementation', 'description': 'Seamless setup and onboarding for your team.', 'icon': 'rocket'},
                                ],
                            },
                        },
                        {
                            'block_type': 'cta',
                            'sort_order': 2,
                            'content': {
                                'heading': 'Ready to get started?',
                                'body': 'Contact us today and let us help your business grow.',
                                'cta_text': 'Contact Us',
                                'cta_url': '/contact',
                            },
                        },
                    ],
                },
                {
                    'page_type': 'standard',
                    'title': 'About Us',
                    'slug': 'about',
                    'show_in_nav': True,
                    'sort_order': 1,
                    'meta_title': f'About {business_name}',
                    'meta_description': f'Learn more about {business_name} and our mission.',
                    'blocks': [
                        {
                            'block_type': 'text',
                            'sort_order': 0,
                            'content': {
                                'heading': f'About {business_name}',
                                'body': f'<p>We are {business_name}, a leading provider of {keyword.lower()} services. '
                                        f'Our team is dedicated to delivering quality solutions that make a difference.</p>',
                            },
                        },
                        {
                            'block_type': 'stats',
                            'sort_order': 1,
                            'content': {
                                'items': [
                                    {'label': 'Happy Clients', 'value': '100+'},
                                    {'label': 'Projects Completed', 'value': '250+'},
                                    {'label': 'Years Experience', 'value': '5+'},
                                    {'label': 'Team Members', 'value': '15+'},
                                ],
                            },
                        },
                    ],
                },
                {
                    'page_type': 'contact',
                    'title': 'Contact',
                    'slug': 'contact',
                    'show_in_nav': True,
                    'sort_order': 2,
                    'meta_title': f'Contact {business_name}',
                    'meta_description': f'Get in touch with {business_name}.',
                    'blocks': [
                        {
                            'block_type': 'contact_form',
                            'sort_order': 0,
                            'content': {
                                'heading': 'Get in Touch',
                                'subheading': 'Fill in the form and we will get back to you shortly.',
                                'success_message': 'Thank you! We will be in touch soon.',
                            },
                        },
                    ],
                },
            ],
        })
    return designs


# ── Custom Domain Verification ────────────────────────────────────────────────

@shared_task(bind=True, max_retries=10, default_retry_delay=300,
             name='cms.task_verify_custom_domain')
def task_verify_custom_domain(self, domain_id: int) -> None:
    """
    Attempt DNS resolution to verify ownership of a custom domain.
    Retries up to 10 times (every 5 minutes = covers 50 min of DNS propagation).
    Fires cms.domain.verified notification when successful.
    """
    from .models import CMSCustomDomain
    from . import services as svc
    try:
        cd = CMSCustomDomain.objects.select_related('site__tenant').get(pk=domain_id)
    except CMSCustomDomain.DoesNotExist:
        logger.error("task_verify_custom_domain: domain %s not found", domain_id)
        return

    if cd.is_verified:
        return  # already verified — idempotent

    verified = svc.verify_custom_domain(cd)
    if verified:
        logger.info("Domain %s verified for site %s", cd.domain, cd.site_id)
        # Fire event stub — wire to notification engine in Phase 2
        logger.debug("cms.domain.verified fired for domain %s", cd.domain)
    else:
        # Retry — DNS hasn't propagated yet
        raise self.retry(exc=Exception(f"Domain {cd.domain} not yet resolvable"))


@shared_task(bind=True, max_retries=5, default_retry_delay=600,
             name='cms.task_check_domain_ssl')
def task_check_domain_ssl(self, domain_id: int) -> None:
    """
    Phase 2 placeholder — poll Caddy admin API for SSL certificate status.
    Caddy on-demand TLS provisions certs automatically; this task just
    reads the status and updates CMSCustomDomain.ssl_status.
    """
    logger.info("task_check_domain_ssl: stub — implement Caddy API call in Phase 2 (domain_id=%s)", domain_id)
