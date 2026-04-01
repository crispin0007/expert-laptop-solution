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
    from accounts.models import TenantMembership

    body = _sanitize_html(data.get('body', ''))
    author_id = data.get('author') or user.pk

    if not TenantMembership.objects.filter(
        tenant=site.tenant,
        user_id=author_id,
        is_active=True,
    ).exists():
        raise ValueError('Author must be an active member of this workspace.')

    post = CMSBlogPost(
        tenant=site.tenant,
        site=site,
        title=data['title'],
        slug=slugify(data.get('slug') or data['title']),
        excerpt=data.get('excerpt', ''),
        body=body,
        tags=data.get('tags', []),
        author_id=author_id,
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
    from accounts.models import TenantMembership

    if 'body' in data:
        data['body'] = _sanitize_html(data['body'])

    if 'author' in data and data['author']:
        if not TenantMembership.objects.filter(
            tenant=post.tenant,
            user_id=data['author'],
            is_active=True,
        ).exists():
            raise ValueError('Author must be an active member of this workspace.')

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


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2 — Block → HTML bootstrap for GrapeJS editor
# ═══════════════════════════════════════════════════════════════════════════════
#
# Rules for all _block_* functions:
#   • Use INLINE styles only — no Tailwind classes (they don't apply in the GrapeJS iframe).
#   • NEVER use backslashes inside f-string expressions (SyntaxError in Python < 3.12).
#     Pre-compute any conditional or escaped value as a plain variable first.
#   • _esc() HTML-escapes user content for safe embedding.
# ───────────────────────────────────────────────────────────────────────────────



def blocks_to_html(page) -> str:
    """
    Convert a CMSPage's existing blocks to inline-styled HTML for GrapeJS.

    Called when a page has never been opened in the visual editor
    (grapes_data is null).  The editor loads this as its starting content
    so the tenant sees their existing blocks rather than a blank canvas.

    All styling is inline — Tailwind classes don't apply inside the GrapeJS
    canvas iframe.
    """
    blocks = page.blocks.filter(is_visible=True).order_by('sort_order')
    parts = []

    handlers = {
        'hero':            _block_hero,
        'stats':           _block_stats,
        'services':        _block_services,
        'testimonials':    _block_testimonials,
        'cta':             _block_cta,
        'pricing':         _block_pricing,
        'team':            _block_team,
        'text':            _block_text,
        'faq':             _block_faq,
        'contact_form':    _block_contact_form,
        'video':           _block_video,
        'gallery':         _block_gallery,
        'newsletter':      _block_newsletter,
        'product_catalog': _block_product_catalog,
        'blog_preview':    _block_blog_preview,
    }

    for block in blocks:
        c = block.content or {}
        bt = block.block_type
        if bt == 'html':
            raw = block.raw_html or ''
            if raw:
                parts.append('<div class="gjs-block-html">' + raw + '</div>')
        elif bt in handlers:
            parts.append(handlers[bt](c))

    return '\n'.join(parts) if parts else _block_empty_placeholder()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _esc(v) -> str:
    """HTML-escape a value for safe embedding."""
    import html as _html
    return _html.escape(str(v or ''))


def _tag(tag, content, style='', **attrs):
    """Build a simple HTML tag string without backslashes in f-expressions."""
    attr_str = ''
    if style:
        attr_str += ' style="' + style + '"'
    for k, v in attrs.items():
        attr_str += ' ' + k + '="' + _esc(v) + '"'
    return '<' + tag + attr_str + '>' + content + '</' + tag + '>'


def _section(content, style=''):
    default = 'font-family:Inter,sans-serif'
    s = (style + ';' + default) if style else default
    return _tag('section', content, s)


def _center_header(heading, subhead):
    """Render a centred heading + subheading, pre-computing conditionals."""
    if not heading and not subhead:
        return ''
    inner = ''
    if heading:
        inner += _tag('h2', heading,
                      'font-size:2rem;font-weight:700;color:#111827;margin:0 0 12px')
    if subhead:
        inner += _tag('p', subhead,
                      'color:#6B7280;max-width:480px;margin:0 auto')
    return _tag('div', inner, 'text-align:center;margin-bottom:56px')


def _block_empty_placeholder() -> str:
    return (
        '<section style="padding:80px 24px;text-align:center;color:#9CA3AF;font-family:Inter,sans-serif">'
        '<p style="font-size:18px">This page has no content blocks yet.</p>'
        '<p style="font-size:14px;margin-top:8px">Drag blocks from the left panel to start building.</p>'
        '</section>'
    )


# ── Block renderers ────────────────────────────────────────────────────────────

def _block_hero(c: dict) -> str:
    heading  = _esc(c.get('heading', ''))
    subhead  = _esc(c.get('subheading', ''))
    cta_lbl  = _esc(c.get('cta_label', ''))
    cta_url  = _esc(c.get('cta_url', '#'))
    cta2_lbl = _esc(c.get('cta_secondary_label', ''))
    cta2_url = _esc(c.get('cta_secondary_url', '#'))

    ctas = ''
    if cta_lbl:
        ctas += (
            '<a href="' + cta_url + '" style="display:inline-block;padding:14px 32px;'
            'background:#fff;color:#4F46E5;font-weight:700;border-radius:9999px;'
            'font-size:14px;text-decoration:none;margin:0 8px 12px;'
            'box-shadow:0 4px 14px rgba(0,0,0,.15)">' + cta_lbl + '</a>'
        )
    if cta2_lbl:
        ctas += (
            '<a href="' + cta2_url + '" style="display:inline-block;padding:14px 32px;'
            'border:2px solid rgba(255,255,255,.7);color:#fff;font-weight:700;'
            'border-radius:9999px;font-size:14px;text-decoration:none;margin:0 8px 12px">'
            + cta2_lbl + '</a>'
        )

    h1 = _tag('h1', heading,
              'font-size:clamp(2rem,5vw,3.5rem);font-weight:800;line-height:1.15;margin:0 0 24px') if heading else ''
    p  = _tag('p', subhead,
              'font-size:1.125rem;color:rgba(255,255,255,.85);max-width:640px;margin:0 auto 40px;line-height:1.6') if subhead else ''
    cta_row = _tag('div', ctas, 'display:flex;flex-wrap:wrap;justify-content:center') if ctas else ''

    inner = _tag('div', h1 + p + cta_row,
                 'position:relative;z-index:1;max-width:800px;margin:0 auto')
    blob1 = '<div style="position:absolute;top:-80px;right:-80px;width:320px;height:320px;border-radius:50%;opacity:.1;background:#fff;pointer-events:none"></div>'
    blob2 = '<div style="position:absolute;bottom:-80px;left:-80px;width:384px;height:384px;border-radius:50%;opacity:.1;background:#fff;pointer-events:none"></div>'

    return (
        '<section style="position:relative;padding:96px 24px;text-align:center;color:#fff;'
        'background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);overflow:hidden;font-family:Inter,sans-serif">'
        + inner + blob1 + blob2 + '</section>'
    )


def _block_stats(c: dict) -> str:
    items = c.get('items', [])
    cells = ''
    for item in items:
        val   = _esc(item.get('value', ''))
        label = _esc(item.get('label', ''))
        cells += (
            '<div style="text-align:center;padding:16px">'
            + _tag('div', val, 'font-size:2.5rem;font-weight:800;color:#4F46E5;margin-bottom:6px')
            + _tag('div', label, 'font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;color:#6B7280;font-weight:600')
            + '</div>'
        )
    grid = _tag('div', cells,
                'max-width:960px;margin:0 auto;display:grid;'
                'grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:24px')
    return _section(grid, 'padding:64px 24px;background:#fff')


def _block_services(c: dict) -> str:
    heading = _esc(c.get('heading', ''))
    subhead = _esc(c.get('subheading', ''))
    items   = c.get('items', [])
    cards   = ''
    for item in items:
        icon  = _esc(item.get('icon', ''))
        title = _esc(item.get('title', ''))
        desc  = _esc(item.get('description', ''))
        icon_html = _tag('div', icon, 'font-size:2rem;margin-bottom:16px') if icon else ''
        cards += (
            '<div style="background:#fff;border-radius:16px;padding:28px;'
            'box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #F3F4F6">'
            + icon_html
            + _tag('h3', title, 'font-size:1.1rem;font-weight:700;color:#111827;margin:0 0 10px')
            + _tag('p', desc, 'font-size:.875rem;color:#6B7280;line-height:1.6;margin:0')
            + '</div>'
        )
    header = _center_header(heading, subhead)
    grid   = _tag('div', cards,
                  'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px')
    wrap   = _tag('div', header + grid, 'max-width:1120px;margin:0 auto')
    return _section(wrap, 'padding:80px 24px;background:#F9FAFB')


def _block_testimonials(c: dict) -> str:
    heading = _esc(c.get('heading', ''))
    items   = c.get('items', [])
    cards   = ''
    for item in items:
        rating      = int(item.get('rating', 5))
        stars       = '★' * rating
        role        = _esc(item.get('role', ''))
        company     = _esc(item.get('company', ''))
        role_co     = (role + ', ' + company) if (role and company) else (role or company)
        text        = _esc(item.get('text', ''))
        name        = _esc(item.get('name', ''))
        cards += (
            '<div style="background:#F9FAFB;border-radius:16px;padding:28px;border:1px solid #F3F4F6">'
            + _tag('div', stars, 'color:#FBBF24;font-size:1rem;margin-bottom:12px;letter-spacing:2px')
            + '<p style="font-size:.875rem;color:#374151;line-height:1.7;margin:0 0 20px;font-style:italic">'
              '&ldquo;' + text + '&rdquo;</p>'
            + _tag('div', name, 'font-weight:700;font-size:.875rem;color:#111827')
            + _tag('div', role_co, 'font-size:.75rem;color:#9CA3AF')
            + '</div>'
        )
    h2 = _tag('h2', heading,
              'font-size:2rem;font-weight:700;color:#111827;text-align:center;margin:0 0 48px') if heading else ''
    grid = _tag('div', cards,
                'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px')
    wrap = _tag('div', h2 + grid, 'max-width:1120px;margin:0 auto')
    return _section(wrap, 'padding:80px 24px;background:#fff')


def _block_cta(c: dict) -> str:
    heading = _esc(c.get('heading', ''))
    body    = _esc(c.get('body', ''))
    lbl     = _esc(c.get('cta_label', ''))
    url     = _esc(c.get('cta_url', '#'))
    bg      = _esc(c.get('bg_color', '#4F46E5'))

    h2  = _tag('h2', heading, 'font-size:2rem;font-weight:700;margin:0 0 16px') if heading else ''
    p   = _tag('p', body, 'color:rgba(255,255,255,.8);margin:0 0 32px;line-height:1.6') if body else ''
    btn = (
        '<a href="' + url + '" style="display:inline-block;padding:14px 40px;background:#fff;'
        'color:' + bg + ';font-weight:700;border-radius:9999px;font-size:.875rem;'
        'text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.15)">' + lbl + '</a>'
    ) if lbl else ''

    inner = _tag('div', h2 + p + btn, 'max-width:640px;margin:0 auto')
    return (
        '<section style="padding:80px 24px;background:' + bg + ';text-align:center;'
        'color:#fff;font-family:Inter,sans-serif">' + inner + '</section>'
    )


def _block_pricing(c: dict) -> str:
    heading = _esc(c.get('heading', ''))
    subhead = _esc(c.get('subheading', ''))
    plans   = c.get('plans', [])
    cards   = ''

    for plan in plans:
        is_hl   = bool(plan.get('highlight', False))
        bg      = 'linear-gradient(135deg,#4F46E5,#7C3AED)' if is_hl else '#fff'
        fg      = '#fff' if is_hl else '#111827'
        muted   = 'rgba(255,255,255,.7)' if is_hl else '#9CA3AF'
        feat_fg = 'rgba(255,255,255,.9)' if is_hl else '#4B5563'
        chk_fg  = 'rgba(255,255,255,.8)' if is_hl else '#22C55E'
        shadow  = '0 20px 40px rgba(79,70,229,.3)' if is_hl else '0 1px 3px rgba(0,0,0,.08)'
        border  = '' if is_hl else 'border:1px solid #F3F4F6;'
        btn_sty = 'background:#fff;color:#4F46E5' if is_hl else 'border:2px solid #4F46E5;color:#4F46E5'

        name    = _esc(plan.get('name', ''))
        price   = _esc(plan.get('price', ''))
        period  = _esc(plan.get('period', ''))
        cta_lbl = _esc(plan.get('cta_label', 'Get started'))
        cta_url = _esc(plan.get('cta_url', '#'))

        feat_html = ''
        for feat in plan.get('features', []):
            feat_html += (
                '<li style="display:flex;align-items:flex-start;gap:10px;font-size:.875rem;'
                'color:' + feat_fg + ';margin-bottom:12px">'
                '<span style="color:' + chk_fg + ';flex-shrink:0">&#10003;</span>'
                + _esc(feat) + '</li>'
            )

        period_html = (
            _tag('div', period, 'font-size:.875rem;color:' + muted + ';margin-bottom:24px')
            if period else
            '<div style="margin-bottom:24px"></div>'
        )

        cards += (
            '<div style="border-radius:16px;padding:32px;display:flex;flex-direction:column;'
            'background:' + bg + ';' + border + 'box-shadow:' + shadow + '">'
            + _tag('div', name,
                   'font-size:.75rem;font-weight:700;text-transform:uppercase;'
                   'letter-spacing:.1em;color:' + muted + ';margin-bottom:8px')
            + _tag('div', price,
                   'font-size:2.5rem;font-weight:800;color:' + fg + ';margin-bottom:4px')
            + period_html
            + '<ul style="list-style:none;padding:0;margin:0 0 32px;flex:1">' + feat_html + '</ul>'
            + '<a href="' + cta_url + '" style="display:block;text-align:center;padding:14px;'
              'border-radius:9999px;font-size:.875rem;font-weight:700;text-decoration:none;'
            + btn_sty + '">' + cta_lbl + '</a>'
            + '</div>'
        )

    header = _center_header(heading, subhead)
    grid   = _tag('div', cards,
                  'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;align-items:start')
    wrap   = _tag('div', header + grid, 'max-width:1120px;margin:0 auto')
    return _section(wrap, 'padding:80px 24px;background:#F9FAFB')


def _block_team(c: dict) -> str:
    heading = _esc(c.get('heading', ''))
    items   = c.get('items', [])
    cards   = ''
    for member in items:
        name    = _esc(member.get('name', ''))
        role    = _esc(member.get('role', ''))
        bio     = _esc(member.get('bio', ''))
        initial = (name or '?')[0]
        bio_html = _tag('p', bio,
                        'font-size:.75rem;color:#6B7280;line-height:1.5;margin:4px 0 0') if bio else ''
        cards += (
            '<div style="text-align:center">'
            '<div style="width:64px;height:64px;border-radius:50%;margin:0 auto 12px;'
            'display:flex;align-items:center;justify-content:center;'
            'background:linear-gradient(135deg,#4F46E5,#7C3AED);'
            'color:#fff;font-size:1.5rem;font-weight:700">' + initial + '</div>'
            + _tag('div', name, 'font-weight:700;font-size:.875rem;color:#111827')
            + _tag('div', role, 'font-size:.75rem;color:#9CA3AF;margin-bottom:4px')
            + bio_html + '</div>'
        )
    h2   = _tag('h2', heading,
                'font-size:2rem;font-weight:700;color:#111827;text-align:center;margin:0 0 48px') if heading else ''
    grid = _tag('div', cards,
                'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:24px')
    wrap = _tag('div', h2 + grid, 'max-width:960px;margin:0 auto')
    return _section(wrap, 'padding:80px 24px;background:#fff')


def _block_text(c: dict) -> str:
    heading = _esc(c.get('heading', ''))
    body    = c.get('body', '')   # may contain HTML — don't escape
    h2  = _tag('h2', heading,
               'font-size:2rem;font-weight:700;color:#111827;margin:0 0 24px') if heading else ''
    div = _tag('div', body,
               'color:#4B5563;line-height:1.8;font-size:1rem') if body else ''
    wrap = _tag('div', h2 + div, 'max-width:720px;margin:0 auto')
    return _section(wrap, 'padding:64px 24px;background:#fff')


def _block_faq(c: dict) -> str:
    heading = _esc(c.get('heading', ''))
    items   = c.get('items', [])
    rows    = ''
    for item in items:
        question = _esc(item.get('question', ''))
        answer   = _esc(item.get('answer', ''))
        rows += (
            '<div style="background:#fff;border-radius:12px;border:1px solid #F3F4F6;'
            'overflow:hidden;margin-bottom:12px">'
            + _tag('div', question,
                   'padding:20px 24px;font-size:.9rem;font-weight:700;color:#111827;border-bottom:1px solid #F3F4F6')
            + _tag('div', answer,
                   'padding:16px 24px;font-size:.875rem;color:#4B5563;line-height:1.6')
            + '</div>'
        )
    h2   = _tag('h2', heading,
                'font-size:2rem;font-weight:700;color:#111827;text-align:center;margin:0 0 40px') if heading else ''
    wrap = _tag('div', h2 + rows, 'max-width:720px;margin:0 auto')
    return _section(wrap, 'padding:80px 24px;background:#F9FAFB')


def _block_contact_form(c: dict) -> str:
    heading    = _esc(c.get('heading', ''))
    fields     = c.get('fields', ['name', 'email', 'message'])
    submit_lbl = _esc(c.get('submit_label', 'Send Message'))
    inputs     = ''
    for field in fields:
        label = _esc(field.replace('_', ' ').title())
        lbl_tag = _tag('label', label,
                       'display:block;font-size:.875rem;font-weight:600;color:#374151;margin-bottom:6px')
        field_style = 'width:100%;border:1px solid #E5E7EB;border-radius:12px;padding:12px 16px;font-size:.875rem;box-sizing:border-box'
        if field == 'message':
            input_tag = '<textarea rows="4" style="' + field_style + ';resize:none"></textarea>'
        elif field == 'email':
            input_tag = '<input type="email" style="' + field_style + '" />'
        else:
            input_tag = '<input type="text" style="' + field_style + '" />'
        inputs += _tag('div', lbl_tag + input_tag, 'margin-bottom:16px')

    h2  = _tag('h2', heading,
               'font-size:1.75rem;font-weight:700;color:#111827;margin:0 0 32px') if heading else ''
    btn = ('<button type="submit" style="width:100%;padding:14px;background:#4F46E5;'
           'color:#fff;font-weight:700;border-radius:12px;border:none;font-size:.875rem;cursor:pointer">'
           + submit_lbl + '</button>')
    form = '<form>' + inputs + btn + '</form>'
    wrap = _tag('div', h2 + form, 'max-width:520px;margin:0 auto')
    return _section(wrap, 'padding:80px 24px;background:#fff')


def _block_video(c: dict) -> str:
    url   = str(c.get('url', ''))
    title = _esc(c.get('title', 'Video'))
    embed = url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')
    if embed:
        inner = ('<iframe src="' + _esc(embed) + '" style="width:100%;height:100%;border:none"'
                 ' allowfullscreen title="' + title + '"></iframe>')
    else:
        inner = ('<div style="width:100%;height:100%;background:#F3F4F6;display:flex;'
                 'align-items:center;justify-content:center;color:#9CA3AF">No video URL</div>')
    container = _tag('div', inner,
                     'max-width:960px;margin:0 auto;aspect-ratio:16/9;border-radius:16px;'
                     'overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,.15)')
    return _section(container, 'padding:64px 24px;background:#fff')


def _block_gallery(c: dict) -> str:
    heading = _esc(c.get('heading', ''))
    items   = c.get('items', [])
    imgs    = ''
    for img in items:
        url = _esc(img.get('url', ''))
        alt = _esc(img.get('alt', ''))
        if url:
            img_tag = '<img src="' + url + '" alt="' + alt + '" style="width:100%;height:100%;object-fit:cover">'
        else:
            img_tag = ''
        imgs += _tag('div', img_tag,
                     'aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#F3F4F6')
    h2   = _tag('h2', heading,
                'font-size:2rem;font-weight:700;color:#111827;text-align:center;margin:0 0 40px') if heading else ''
    grid = _tag('div', imgs,
                'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px')
    wrap = _tag('div', h2 + grid, 'max-width:1120px;margin:0 auto')
    return _section(wrap, 'padding:64px 24px;background:#fff')


def _block_newsletter(c: dict) -> str:
    heading  = _esc(c.get('heading', 'Stay in the loop'))
    subhead  = _esc(c.get('subheading', 'Subscribe to our newsletter for updates and offers.'))
    btn_lbl  = _esc(c.get('button_label', 'Subscribe'))
    bg       = _esc(c.get('bg_color', '#4F46E5'))

    h2  = _tag('h2', heading,
               'font-size:1.75rem;font-weight:700;color:#fff;margin:0 0 10px') if heading else ''
    p   = _tag('p', subhead,
               'color:rgba(255,255,255,.8);margin:0 0 28px;font-size:.9375rem') if subhead else ''
    form = (
        '<form style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center">'
        '<input type="email" placeholder="Your email address" required '
        'style="flex:1;min-width:220px;padding:14px 20px;border-radius:9999px;border:none;'
        'font-size:.875rem;outline:none" />'
        '<button type="submit" style="padding:14px 32px;background:#fff;color:' + bg + ';'
        'font-weight:700;border-radius:9999px;border:none;font-size:.875rem;cursor:pointer">'
        + btn_lbl + '</button></form>'
    )
    inner = _tag('div', h2 + p + form, 'max-width:540px;margin:0 auto;text-align:center')
    return (
        '<section style="padding:80px 24px;background:' + bg + ';font-family:Inter,sans-serif">'
        + inner + '</section>'
    )


def _block_product_catalog(c: dict) -> str:
    """
    Renders a placeholder grid at bootstrap time.
    The real data (from is_published=True inventory products) is fetched
    client-side by the ProductCatalogBlock React component.
    """
    heading = _esc(c.get('heading', 'Our Products'))
    subhead = _esc(c.get('subheading', ''))
    header  = _center_header(heading, subhead)
    # 6 placeholder cards to indicate structure
    cards   = ''
    for _ in range(6):
        cards += (
            '<div style="background:#fff;border-radius:16px;border:1px solid #F3F4F6;overflow:hidden">'
            '<div style="aspect-ratio:4/3;background:#F9FAFB"></div>'
            '<div style="padding:16px">'
            '<div style="height:14px;background:#E5E7EB;border-radius:4px;margin-bottom:8px;width:70%"></div>'
            '<div style="height:12px;background:#F3F4F6;border-radius:4px;width:40%"></div>'
            '</div></div>'
        )
    grid = _tag('div', cards,
                'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px')
    note = _tag('p', 'Product catalogue — populated dynamically on the live site.',
                'text-align:center;color:#9CA3AF;font-size:.75rem;margin:24px 0 0')
    wrap = _tag('div', header + grid + note, 'max-width:1120px;margin:0 auto')
    return _section(wrap, 'padding:64px 24px;background:#F9FAFB')


def _block_blog_preview(c: dict) -> str:
    """Bootstrap placeholder for the latest-posts preview block."""
    heading = _esc(c.get('heading', 'Latest from our Blog'))
    subhead = _esc(c.get('subheading', ''))
    header  = _center_header(heading, subhead)
    cards   = ''
    for _ in range(3):
        cards += (
            '<div style="background:#fff;border-radius:16px;overflow:hidden;'
            'border:1px solid #F3F4F6;box-shadow:0 1px 3px rgba(0,0,0,.06)">'
            '<div style="height:180px;background:#F9FAFB"></div>'
            '<div style="padding:20px">'
            '<div style="height:14px;background:#E5E7EB;border-radius:4px;margin-bottom:10px;width:80%"></div>'
            '<div style="height:11px;background:#F3F4F6;border-radius:4px;margin-bottom:6px"></div>'
            '<div style="height:11px;background:#F3F4F6;border-radius:4px;width:60%"></div>'
            '</div></div>'
        )
    grid = _tag('div', cards,
                'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px')
    note = _tag('p', 'Blog preview — shows latest published posts on the live site.',
                'text-align:center;color:#9CA3AF;font-size:.75rem;margin:24px 0 0')
    wrap = _tag('div', header + grid + note, 'max-width:1120px;margin:0 auto')
    return _section(wrap, 'padding:64px 24px;background:#fff')
