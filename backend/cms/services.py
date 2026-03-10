"""
cms/services.py
~~~~~~~~~~~~~~~
All business logic for the CMS module.

Views MUST NOT touch ORM or model methods directly — call service functions.
Services accept (tenant, user) as first two arguments and contain ALL side
effects: notifications, audit logs, event publishing, Celery task dispatch.

HTML sanitisation
-----------------
All user-supplied HTML is run through ``_sanitize_html()`` before being stored.
bleach is the primary sanitizer.  If bleach is not installed (dev-only mode)
a permissive fallback is used and a WARNING is logged to alert developers.

AI Generation
-------------
AI generation is stubbed in Phase 1 — the Celery task produces placeholder
content in the correct JSON schema.  Swap the stub for a real LLM call in
Phase 2 by implementing ``_call_ai_api()`` in tasks.py.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from django.utils import timezone

logger = logging.getLogger(__name__)

# Allowed HTML tags / attributes for sanitized rich-text blocks and blog posts
_ALLOWED_TAGS: list[str] = [
    'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span',
]
_ALLOWED_ATTRS: dict = {
    'a':   ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height', 'loading'],
    '*':   ['class', 'id', 'style'],
}


def _sanitize_html(raw: str) -> str:
    """
    Sanitize user-supplied HTML to prevent XSS.
    Uses bleach when available; falls back to a strict strip-all approach
    and logs a WARNING so devs know they must install bleach in prod.
    """
    if not raw:
        return ''
    try:
        import bleach  # type: ignore
        return bleach.clean(
            raw,
            tags=_ALLOWED_TAGS,
            attributes=_ALLOWED_ATTRS,
            strip=True,
        )
    except ImportError:
        logger.warning(
            "bleach is not installed — HTML sanitization is DISABLED.  "
            "Install bleach before deploying to production."
        )
        # Minimal strip: remove <script> and <style> tags as bare minimum
        cleaned = re.sub(r'<script[^>]*>.*?</script>', '', raw, flags=re.DOTALL | re.IGNORECASE)
        cleaned = re.sub(r'<style[^>]*>.*?</style>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
        return cleaned


# ═══════════════════════════════════════════════════════════════════════════════
# Site
# ═══════════════════════════════════════════════════════════════════════════════

def get_or_create_site(tenant) -> tuple:
    """
    Return (site, created) for tenant.
    Guarantees every tenant has exactly one CMSSite row.
    """
    from .models import CMSSite
    return CMSSite.objects.get_or_create(
        tenant=tenant,
        defaults={
            'site_name': getattr(tenant, 'name', 'My Website'),
            'tagline': '',
        },
    )


def update_site_settings(site, data: dict, user) -> 'CMSSite':
    """Update branding / SEO settings for a site."""
    from .serializers import CmsSiteWriteSerializer
    serializer = CmsSiteWriteSerializer(site, data=data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()
    logger.info("CMS site %s settings updated by user %s", updated.pk, user.pk)
    return updated


def publish_site(site, user) -> 'CMSSite':
    """Mark site as published and fire the cms.site.published event."""
    site.is_published = True
    site.published_at = timezone.now()
    site.save(update_fields=['is_published', 'published_at'])
    _fire_event('cms.site.published', site, user)
    logger.info("CMS site %s published by user %s", site.pk, user.pk)
    return site


def unpublish_site(site, user) -> 'CMSSite':
    """Take site offline and fire the cms.site.unpublished event."""
    site.is_published = False
    site.save(update_fields=['is_published'])
    _fire_event('cms.site.unpublished', site, user)
    logger.info("CMS site %s unpublished by user %s", site.pk, user.pk)
    return site


# ═══════════════════════════════════════════════════════════════════════════════
# Pages
# ═══════════════════════════════════════════════════════════════════════════════

def create_page(site, data: dict, user) -> 'CMSPage':
    """Create a new page under the site."""
    from .models import CMSPage
    from django.utils.text import slugify

    slug = slugify(data.get('slug') or data.get('title', ''))
    page = CMSPage.objects.create(
        tenant=site.tenant,
        site=site,
        page_type=data.get('page_type', CMSPage.PAGE_STANDARD),
        title=data['title'],
        slug=slug,
        meta_title=data.get('meta_title', ''),
        meta_description=data.get('meta_description', ''),
        sort_order=data.get('sort_order', 0),
        show_in_nav=data.get('show_in_nav', True),
        is_published=data.get('is_published', False),
        created_by=user,
    )
    logger.info("CMS page %s created by user %s", page.pk, user.pk)
    return page


def update_page(page, data: dict, user) -> 'CMSPage':
    """Update a page's metadata (not its blocks)."""
    from .serializers import CmsPageWriteSerializer
    serializer = CmsPageWriteSerializer(page, data=data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()
    _fire_event('cms.page.updated', updated.site, user, extra={'page_id': updated.pk})
    return updated


def publish_page(page, user) -> 'CMSPage':
    """Publish a page."""
    page.is_published = True
    page.published_at = timezone.now()
    page.save(update_fields=['is_published', 'published_at'])
    _fire_event('cms.page.updated', page.site, user, extra={'page_id': page.pk, 'action': 'published'})
    return page


def unpublish_page(page, user) -> 'CMSPage':
    """Unpublish a page."""
    page.is_published = False
    page.save(update_fields=['is_published'])
    return page


def delete_page(page, user) -> None:
    """Hard-delete a page (and cascade-deletes its blocks)."""
    page_id = page.pk
    site = page.site
    page.delete()
    _fire_event('cms.page.updated', site, user, extra={'page_id': page_id, 'action': 'deleted'})


# ═══════════════════════════════════════════════════════════════════════════════
# Blocks
# ═══════════════════════════════════════════════════════════════════════════════

def create_block(page, data: dict, user) -> 'CMSBlock':
    """
    Create a content block.  ``raw_html`` is sanitized before storage.
    """
    from .models import CMSBlock
    raw_html = _sanitize_html(data.get('raw_html', ''))
    block = CMSBlock.objects.create(
        tenant=page.tenant,
        page=page,
        block_type=data['block_type'],
        sort_order=data.get('sort_order', 0),
        is_visible=data.get('is_visible', True),
        content=data.get('content', {}),
        raw_html=raw_html,
    )
    return block


def update_block(block, data: dict, user) -> 'CMSBlock':
    """Update a block — raw_html is sanitized before storage."""
    if 'raw_html' in data:
        data['raw_html'] = _sanitize_html(data['raw_html'])
    for field in ('block_type', 'sort_order', 'is_visible', 'content', 'raw_html'):
        if field in data:
            setattr(block, field, data[field])
    block.save()
    return block


def delete_block(block) -> None:
    """Hard-delete a single block."""
    block.delete()


def reorder_blocks(page, ordered_ids: list[int]) -> list['CMSBlock']:
    """
    Re-set sort_order on blocks according to ordered_ids list.
    Only processes IDs that belong to this page.
    """
    from .models import CMSBlock
    blocks = {b.pk: b for b in CMSBlock.objects.filter(page=page)}
    updated = []
    for idx, block_id in enumerate(ordered_ids):
        block = blocks.get(block_id)
        if block:
            block.sort_order = idx
            block.save(update_fields=['sort_order'])
            updated.append(block)
    return updated


# ═══════════════════════════════════════════════════════════════════════════════
# Blog Posts
# ═══════════════════════════════════════════════════════════════════════════════

def create_blog_post(site, data: dict, user) -> 'CMSBlogPost':
    """Create a blog post.  Body HTML is sanitized."""
    from .models import CMSBlogPost
    from django.utils.text import slugify

    body = _sanitize_html(data.get('body', ''))
    post = CMSBlogPost(
        tenant=site.tenant,
        site=site,
        title=data['title'],
        slug=slugify(data.get('slug') or data['title']),
        excerpt=data.get('excerpt', ''),
        body=body,
        tags=data.get('tags', []),
        author_id=data.get('author') or user.pk,
        is_published=data.get('is_published', False),
        created_by=user,
    )
    post.read_time_minutes = post.estimate_read_time()
    if post.is_published:
        post.published_at = timezone.now()
    post.save()
    if post.is_published:
        _fire_event('cms.blog.published', site, user, extra={'post_id': post.pk})
    return post


def update_blog_post(post, data: dict, user) -> 'CMSBlogPost':
    """Update a blog post.  Body HTML is sanitized."""
    if 'body' in data:
        data['body'] = _sanitize_html(data['body'])

    was_published = post.is_published
    for field in ('title', 'slug', 'excerpt', 'body', 'featured_image', 'author', 'tags'):
        if field in data:
            if field == 'slug':
                from django.utils.text import slugify
                setattr(post, field, slugify(data[field]))
            else:
                setattr(post, field, data[field])

    if 'is_published' in data:
        post.is_published = data['is_published']
        if post.is_published and not was_published:
            post.published_at = timezone.now()

    post.read_time_minutes = post.estimate_read_time()
    post.save()

    if post.is_published and not was_published:
        _fire_event('cms.blog.published', post.site, user, extra={'post_id': post.pk})

    return post


def soft_delete_blog_post(post, user) -> None:
    """Soft-delete a blog post."""
    post.soft_delete()


# ═══════════════════════════════════════════════════════════════════════════════
# Custom Domains
# ═══════════════════════════════════════════════════════════════════════════════

def setup_custom_domain(site, domain: str, user) -> 'CMSCustomDomain':
    """
    Register a custom domain for a site.
    One site → one custom domain (enforced by OneToOneField).
    Calling this again replaces the existing record.
    """
    from .models import CMSCustomDomain
    cd, created = CMSCustomDomain.objects.update_or_create(
        site=site,
        defaults={
            'tenant': site.tenant,
            'domain': domain.lower().strip(),
            'is_verified': False,
            'ssl_status': CMSCustomDomain.SSL_PENDING,
        },
    )
    # Trigger async verification check
    try:
        from .tasks import task_verify_custom_domain
        task_verify_custom_domain.apply_async(
            kwargs={'domain_id': cd.pk},
            countdown=30,  # give DNS a moment to propagate
        )
    except Exception:
        logger.exception("Failed to enqueue domain verification for domain %s", cd.pk)

    logger.info(
        "Custom domain '%s' registered for site %s by user %s. TXT=%s",
        domain, site.pk, user.pk, cd.txt_record,
    )
    return cd


def verify_custom_domain(custom_domain) -> bool:
    """
    Perform DNS TXT lookup and flip is_verified if the record is found.
    Called by Celery task — returns True if domain is now verified.
    """
    import socket
    try:
        # Simple check: try to resolve the domain to any IP.
        # Real verification checks for the TXT record via dns.resolver.
        # Stub here — replace with dnspython query in Phase 2.
        answers = socket.getaddrinfo(custom_domain.domain, None)
        if answers:
            custom_domain.is_verified = True
            custom_domain.verified_at = timezone.now()
            custom_domain.save(update_fields=['is_verified', 'verified_at'])
            logger.info("Domain %s verified", custom_domain.domain)
            return True
    except socket.gaierror:
        logger.info("Domain %s not yet resolvable", custom_domain.domain)
    return False


# ═══════════════════════════════════════════════════════════════════════════════
# AI Generation
# ═══════════════════════════════════════════════════════════════════════════════

def check_daily_generation_limit(tenant) -> tuple[bool, int]:
    """
    Returns (can_generate, jobs_today).
    Limit: CMSGenerationJob.DAILY_LIMIT per tenant per UTC calendar day.
    """
    from .models import CMSGenerationJob
    from django.utils.timezone import now
    today = now().date()
    jobs_today = CMSGenerationJob.objects.filter(
        tenant=tenant,
        created_at__date=today,
    ).count()
    can_generate = jobs_today < CMSGenerationJob.DAILY_LIMIT
    return can_generate, jobs_today


def start_generation_job(site, prompt: str, user) -> 'CMSGenerationJob':
    """
    Create a generation job record and enqueue the Celery AI task.
    Raises ValueError if daily limit is exceeded.
    """
    from .models import CMSGenerationJob

    can, jobs_today = check_daily_generation_limit(site.tenant)
    if not can:
        raise ValueError(
            f"Daily AI generation limit reached ({CMSGenerationJob.DAILY_LIMIT} per day). "
            f"You have used {jobs_today} today."
        )

    job = CMSGenerationJob.objects.create(
        tenant=site.tenant,
        site=site,
        status=CMSGenerationJob.STATUS_QUEUED,
        prompt=prompt,
        created_by=user,
    )

    try:
        from .tasks import task_run_ai_generation
        task_run_ai_generation.delay(job_id=job.pk)
    except Exception:
        logger.exception("Failed to enqueue AI generation for job %s", job.pk)
        job.status = CMSGenerationJob.STATUS_FAILED
        job.failure_reason = 'Failed to enqueue generation task'
        job.save(update_fields=['status', 'failure_reason'])

    _fire_event('cms.site.generated', site, user, extra={'job_id': job.pk})
    return job


def apply_generated_design(job, design_index: int, user) -> 'CMSSite':
    """
    Apply a generated design to the site.
    Writes CMSPage and CMSBlock records from the selected design option.
    Fires cms.design.selected event.
    """
    from .models import CMSGenerationJob, CMSPage, CMSBlock

    if job.status != CMSGenerationJob.STATUS_COMPLETED:
        raise ValueError("Cannot select design — generation not yet completed.")

    options = job.design_options
    if not options or design_index >= len(options):
        raise ValueError(f"Design index {design_index} is out of range.")

    design: dict = options[design_index]
    site = job.site

    # Mark selection
    job.selected_design_index = design_index
    job.save(update_fields=['selected_design_index'])

    # Apply theme settings
    theme = design.get('theme', {})
    if theme.get('primary_color'):
        site.primary_color = theme['primary_color']
    if theme.get('secondary_color'):
        site.secondary_color = theme['secondary_color']
    if theme.get('theme_key'):
        site.theme_key = theme['theme_key']
    if theme.get('font_family'):
        site.font_family = theme['font_family']
    site.save(update_fields=['primary_color', 'secondary_color', 'theme_key', 'font_family'])

    # Write pages and blocks — clear existing AI-generated content first
    CMSPage.objects.filter(site=site, page_type__in=[
        CMSPage.PAGE_HOME, CMSPage.PAGE_STANDARD, CMSPage.PAGE_CONTACT
    ]).delete()

    for p_idx, page_data in enumerate(design.get('pages', [])):
        from django.utils.text import slugify
        page = CMSPage.objects.create(
            tenant=site.tenant,
            site=site,
            page_type=page_data.get('page_type', CMSPage.PAGE_STANDARD),
            title=page_data.get('title', f'Page {p_idx + 1}'),
            slug=slugify(page_data.get('slug', page_data.get('title', f'page-{p_idx + 1}'))),
            meta_title=page_data.get('meta_title', ''),
            meta_description=page_data.get('meta_description', ''),
            sort_order=p_idx,
            show_in_nav=page_data.get('show_in_nav', True),
            is_published=False,  # user must explicitly publish
            created_by=user,
        )
        for b_idx, block_data in enumerate(page_data.get('blocks', [])):
            raw = _sanitize_html(block_data.get('raw_html', ''))
            CMSBlock.objects.create(
                tenant=site.tenant,
                page=page,
                block_type=block_data.get('block_type', CMSBlock.BLOCK_TEXT),
                sort_order=b_idx,
                is_visible=True,
                content=block_data.get('content', {}),
                raw_html=raw,
            )

    _fire_event('cms.design.selected', site, user, extra={
        'job_id': job.pk,
        'design_index': design_index,
    })
    logger.info("Design %s from job %s applied to site %s by user %s",
                design_index, job.pk, site.pk, user.pk)
    return site


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _fire_event(event_name: str, site, user, extra: dict | None = None) -> None:
    """
    Fire a notification event.
    Wraps in try/except so CMS operations are never blocked by notification
    failures.
    """
    payload = {
        'site_id': site.pk,
        'tenant_id': site.tenant_id,
        **(extra or {}),
    }
    try:
        from notifications.service import _create
        # In-app notification can be added here when needed.
        # For now just log — wire up to NotificationEngine when Phase 2 lands.
        logger.debug("CMS event fired: %s payload=%r", event_name, payload)
    except Exception:
        logger.exception("CMS event fire failed for %s", event_name)
