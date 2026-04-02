"""
cms/models.py
~~~~~~~~~~~~~
CMS & Website Builder module for NEXUS BMS.

One tenant → one CMSSite → many CMSPages → many CMSBlocks.
Blog is an optional section attached to the same site.
Custom domains are provisioned via Caddy on-demand TLS.

Phase 1 scope
-------------
- Site / Page / Block CRUD
- Blog posts
- AI generation jobs (rate-limited to 10/day per tenant)
- Custom domain management (stub — Caddy provisioning in Phase 2)

Phase 2
-------
- GrapeJS visual editor integration
- Product catalogue published from Inventory

Phase 3
-------
- Claude AI chat editor
- Multi-language page variants
"""
import uuid
from django.db import models
from django.conf import settings
from core.models import TenantModel


# ── Site ──────────────────────────────────────────────────────────────────────

class CMSSite(TenantModel):
    """
    One website per tenant.  Created empty on first access — never via a
    migration or signal so super-admin records (tenant=None) stay clean.
    """

    site_name           = models.CharField(max_length=255, default='My Website')
    tagline             = models.CharField(max_length=512, blank=True)
    logo                = models.ImageField(upload_to='cms/logos/', null=True, blank=True)
    favicon             = models.ImageField(upload_to='cms/favicons/', null=True, blank=True)

    # Design / branding
    theme_key           = models.CharField(max_length=64, blank=True,
                              help_text='Theme identifier selected from AI-generated options or library')
    primary_color       = models.CharField(max_length=7, default='#4F46E5',
                              help_text='Hex colour, e.g. #4F46E5')
    secondary_color     = models.CharField(max_length=7, default='#7C3AED',
                              help_text='Hex colour, e.g. #7C3AED')
    font_family         = models.CharField(max_length=64, default='Inter',
                              help_text='Google Font name')

    # Head injection — for analytics, chat widgets, etc.
    custom_head_script  = models.TextField(blank=True,
                              help_text='HTML/JS injected into <head> on every page')

    # Publishing
    is_published        = models.BooleanField(default=False, db_index=True)
    published_at        = models.DateTimeField(null=True, blank=True)

    # SEO defaults (overridden per-page)
    default_meta_title       = models.CharField(max_length=255, blank=True)
    default_meta_description = models.TextField(blank=True)

    # Navigation — list of {label, url, open_new_tab} dicts
    header_nav  = models.JSONField(default=list, blank=True,
                      help_text='Header navigation links: [{label, url, open_new_tab}]')
    footer_nav  = models.JSONField(default=list, blank=True,
                      help_text='Footer navigation links: [{label, url}]')

    # Social links
    social_facebook  = models.URLField(blank=True)
    social_instagram = models.URLField(blank=True)
    social_twitter   = models.URLField(blank=True)
    social_linkedin  = models.URLField(blank=True)
    social_youtube   = models.URLField(blank=True)
    social_tiktok    = models.URLField(blank=True)

    # Announcement bar
    announcement_text   = models.CharField(max_length=500, blank=True,
                              help_text='Site-wide announcement banner text')
    announcement_active = models.BooleanField(default=False,
                              help_text='Show the announcement bar on the public site')
    announcement_color  = models.CharField(max_length=7, default='#4F46E5',
                              help_text='Background hex colour for the announcement bar')

    class Meta:
        ordering = ['-created_at']
        verbose_name     = 'CMS Site'
        verbose_name_plural = 'CMS Sites'
        indexes = [
            models.Index(fields=['tenant', 'is_published'], name='cms_site_tenant_pub_idx'),
        ]

    def __str__(self):
        return f"{self.site_name} (tenant={self.tenant_id})"


# ── Pages ─────────────────────────────────────────────────────────────────────

class CMSPage(TenantModel):
    """A single page on the website."""

    PAGE_HOME       = 'home'
    PAGE_STANDARD   = 'standard'
    PAGE_CONTACT    = 'contact'
    PAGE_BLOG_INDEX = 'blog_index'
    PAGE_LANDING    = 'landing'

    PAGE_TYPE_CHOICES = [
        (PAGE_HOME,       'Home'),
        (PAGE_STANDARD,   'Standard'),
        (PAGE_CONTACT,    'Contact'),
        (PAGE_BLOG_INDEX, 'Blog Index'),
        (PAGE_LANDING,    'Landing Page'),
    ]

    site              = models.ForeignKey(CMSSite, on_delete=models.CASCADE, related_name='pages')
    page_type         = models.CharField(max_length=20, choices=PAGE_TYPE_CHOICES, default=PAGE_STANDARD)
    title             = models.CharField(max_length=255)
    slug              = models.SlugField(max_length=128,
                            help_text='URL segment, e.g. "about".  Home page = ""')
    meta_title        = models.CharField(max_length=255, blank=True)
    meta_description  = models.TextField(blank=True)
    sort_order        = models.PositiveSmallIntegerField(default=0,
                            help_text='Order in navigation menu')
    show_in_nav       = models.BooleanField(default=True)
    is_published      = models.BooleanField(default=False, db_index=True)
    published_at      = models.DateTimeField(null=True, blank=True)
    created_by        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='cms_pages_created',
    )

    # ── Phase 2: GrapeJS visual editor data ────────────────────────────────────
    # grapes_data stores the GrapeJS JSON state (components + styles).
    # custom_html / custom_css hold the rendered output used by the public renderer.
    # When set, the public renderer serves custom_html instead of block-based content.
    grapes_data       = models.JSONField(
        null=True, blank=True,
        help_text='GrapeJS editor state (components + styles JSON). Phase 2.'
    )
    custom_html       = models.TextField(
        blank=True,
        help_text='Rendered HTML from GrapeJS. Overrides block content in public renderer.'
    )
    custom_css        = models.TextField(
        blank=True,
        help_text='Rendered CSS from GrapeJS.'
    )
    is_deleted        = models.BooleanField(default=False)
    deleted_at        = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering           = ['sort_order', 'title']
        unique_together    = [('site', 'slug')]
        verbose_name       = 'CMS Page'
        verbose_name_plural = 'CMS Pages'
        indexes = [
            models.Index(fields=['tenant', 'site', 'is_published'], name='cms_page_tenant_pub_idx'),
        ]

    def __str__(self):
        return f"{self.site.site_name} / {self.title}"


# ── Blocks ────────────────────────────────────────────────────────────────────

class CMSBlock(TenantModel):
    """
    A content block within a page.

    All block-specific configuration lives in ``content`` (JSONField).
    ``raw_html`` is available for advanced users — MUST be sanitized via
    bleach before storing (enforced in CMSBlockService.save_block).
    """

    BLOCK_HERO            = 'hero'
    BLOCK_TEXT            = 'text'
    BLOCK_SERVICES        = 'services'
    BLOCK_GALLERY         = 'gallery'
    BLOCK_TESTIMONIALS    = 'testimonials'
    BLOCK_CTA             = 'cta'
    BLOCK_CONTACT_FORM    = 'contact_form'
    BLOCK_PRICING         = 'pricing'
    BLOCK_TEAM            = 'team'
    BLOCK_FAQ             = 'faq'
    BLOCK_HTML            = 'html'
    BLOCK_VIDEO           = 'video'
    BLOCK_STATS           = 'stats'
    # Phase 2 additions
    BLOCK_NEWSLETTER      = 'newsletter'      # email subscribe CTA
    BLOCK_PRODUCT_CATALOG = 'product_catalog' # inventory items with is_published=True
    BLOCK_BLOG_PREVIEW    = 'blog_preview'    # latest N posts from the site's blog

    BLOCK_TYPE_CHOICES = [
        (BLOCK_HERO,            'Hero Banner'),
        (BLOCK_TEXT,            'Rich Text'),
        (BLOCK_SERVICES,        'Services Grid'),
        (BLOCK_GALLERY,         'Image Gallery'),
        (BLOCK_TESTIMONIALS,    'Testimonials'),
        (BLOCK_CTA,             'Call to Action'),
        (BLOCK_CONTACT_FORM,    'Contact Form'),
        (BLOCK_PRICING,         'Pricing Table'),
        (BLOCK_TEAM,            'Team Members'),
        (BLOCK_FAQ,             'FAQ Accordion'),
        (BLOCK_HTML,            'Custom HTML'),
        (BLOCK_VIDEO,           'Video Embed'),
        (BLOCK_STATS,           'Stats / Numbers'),
        (BLOCK_NEWSLETTER,      'Newsletter Signup'),
        (BLOCK_PRODUCT_CATALOG, 'Product Catalogue'),
        (BLOCK_BLOG_PREVIEW,    'Blog Preview'),
    ]

    page        = models.ForeignKey(CMSPage, on_delete=models.CASCADE, related_name='blocks')
    block_type  = models.CharField(max_length=32, choices=BLOCK_TYPE_CHOICES, db_index=True)
    sort_order  = models.PositiveSmallIntegerField(default=0)
    is_visible  = models.BooleanField(default=True)

    # JSON payload — schema varies by block_type (documented in services.py)
    content     = models.JSONField(default=dict, blank=True,
                      help_text='Block-specific data payload (schema per block_type)')

    # Raw HTML override — only populated for BLOCK_HTML type.
    # Always run through bleach.clean() before storing — enforced in service.
    raw_html    = models.TextField(blank=True,
                      help_text='Sanitized custom HTML (BLOCK_HTML type only)')

    class Meta:
        ordering           = ['sort_order']
        verbose_name       = 'CMS Block'
        verbose_name_plural = 'CMS Blocks'
        indexes = [
            models.Index(fields=['tenant', 'page', 'is_visible'], name='cms_block_tenant_vis_idx'),
        ]

    def __str__(self):
        return f"{self.page.title} / {self.get_block_type_display()} #{self.sort_order}"


# ── Blog Posts ────────────────────────────────────────────────────────────────

class CMSBlogPost(TenantModel):
    """A blog / news post published under the site."""

    site            = models.ForeignKey(CMSSite, on_delete=models.CASCADE, related_name='blog_posts')
    title           = models.CharField(max_length=255)
    slug            = models.SlugField(max_length=128)
    excerpt         = models.TextField(blank=True, help_text='Short summary (used in listing cards)')
    # Full HTML body — must be sanitized via bleach in the service before saving
    body            = models.TextField(blank=True)
    featured_image  = models.ImageField(upload_to='cms/blog/', null=True, blank=True)
    author_name     = models.CharField(max_length=150, blank=True, default='',
                          help_text='Display name for the post author (overrides user full name)')
    author          = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='cms_blog_posts',
    )
    tags            = models.JSONField(default=list, blank=True,
                          help_text='List of string tags, e.g. ["news", "update"]')
    read_time_minutes = models.PositiveSmallIntegerField(default=1)
    is_published    = models.BooleanField(default=False, db_index=True)
    published_at    = models.DateTimeField(null=True, blank=True)
    is_deleted      = models.BooleanField(default=False)
    deleted_at      = models.DateTimeField(null=True, blank=True)
    created_by      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='cms_blog_posts_created',
    )

    class Meta:
        ordering            = ['-published_at', '-created_at']
        unique_together     = [('site', 'slug')]
        verbose_name        = 'CMS Blog Post'
        verbose_name_plural = 'CMS Blog Posts'
        indexes = [
            models.Index(fields=['tenant', 'site', 'is_published'], name='cms_blog_tenant_pub_idx'),
            models.Index(fields=['tenant', 'is_deleted'],            name='cms_blog_tenant_del_idx'),
        ]

    def __str__(self):
        return self.title

    def soft_delete(self):
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])

    def estimate_read_time(self) -> int:
        """Rough estimate: 200 words per minute."""
        words = len(self.body.split()) if self.body else 0
        return max(1, round(words / 200))


# ── Custom Domains ────────────────────────────────────────────────────────────

class CMSCustomDomain(TenantModel):
    """
    Custom domain mapping for a tenant's website.

    Verification flow:
    1. Tenant adds domain → we generate a TXT record.
    2. Tenant adds TXT to their DNS.
    3. Celery task ``task_verify_domain`` polls and flips is_verified=True.
    4. Caddy on-demand TLS picks up the domain automatically.

    SSL status tracks Caddy certificate provisioning state.
    """

    SSL_PENDING  = 'pending'
    SSL_ACTIVE   = 'active'
    SSL_FAILED   = 'failed'

    SSL_STATUS_CHOICES = [
        (SSL_PENDING, 'Pending'),
        (SSL_ACTIVE,  'Certificate Active'),
        (SSL_FAILED,  'Provisioning Failed'),
    ]

    site        = models.OneToOneField(
        CMSSite, on_delete=models.CASCADE, related_name='custom_domain',
        null=True, blank=True,
    )
    domain      = models.CharField(max_length=255, unique=True, db_index=True,
                      help_text='e.g. www.mycompany.com')
    is_verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)
    # Random TXT value the tenant must add to their DNS for ownership proof
    txt_record  = models.CharField(max_length=64, blank=True,
                      help_text='DNS TXT value for domain ownership verification')
    ssl_status  = models.CharField(max_length=16, choices=SSL_STATUS_CHOICES,
                      default=SSL_PENDING)
    ssl_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name        = 'CMS Custom Domain'
        verbose_name_plural = 'CMS Custom Domains'
        indexes = [
            models.Index(fields=['tenant', 'is_verified'], name='cms_domain_tenant_verified_idx'),
        ]

    def __str__(self):
        return self.domain

    def save(self, *args, **kwargs):
        """Generate txt_record on first save."""
        if not self.txt_record:
            self.txt_record = f"nexus-verify={uuid.uuid4().hex}"
        super().save(*args, **kwargs)


# ── AI Generation Jobs ────────────────────────────────────────────────────────

class CMSGenerationJob(TenantModel):
    """
    Tracks an AI website-generation request.

    Rate limit: 10 jobs per tenant per calendar day (enforced in service).
    The AI generates a structured JSON payload which the frontend renders
    as a preview; the tenant selects a design and we write it to
    CMSSite / CMSPage / CMSBlock records.

    Body content from AI is sanitized via bleach before any HTML is stored.
    """

    STATUS_QUEUED     = 'queued'
    STATUS_GENERATING = 'generating'
    STATUS_COMPLETED  = 'completed'
    STATUS_FAILED     = 'failed'

    STATUS_CHOICES = [
        (STATUS_QUEUED,     'Queued'),
        (STATUS_GENERATING, 'Generating'),
        (STATUS_COMPLETED,  'Completed'),
        (STATUS_FAILED,     'Failed'),
    ]

    DAILY_LIMIT = 10  # enforced per tenant per UTC day

    site                  = models.ForeignKey(CMSSite, on_delete=models.CASCADE,
                                related_name='generation_jobs')
    status                = models.CharField(max_length=16, choices=STATUS_CHOICES,
                                default=STATUS_QUEUED, db_index=True)
    # The natural-language brief from the user, e.g. "IT company in Kathmandu"
    prompt                = models.TextField(help_text="User's description of their business / desired site")
    # Raw AI structured output (list of design options)
    design_options        = models.JSONField(default=list, blank=True,
                                help_text='List of AI-generated design variants')
    # Which design the tenant chose (index into design_options)
    selected_design_index = models.SmallIntegerField(null=True, blank=True)
    # Error message on failure
    failure_reason        = models.TextField(blank=True)
    generated_at          = models.DateTimeField(null=True, blank=True)
    created_by            = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='cms_generation_jobs',
    )

    class Meta:
        ordering            = ['-created_at']
        verbose_name        = 'CMS Generation Job'
        verbose_name_plural = 'CMS Generation Jobs'
        indexes = [
            models.Index(fields=['tenant', 'status'],     name='cms_genjob_tenant_status_idx'),
            models.Index(fields=['tenant', 'created_at'], name='cms_genjob_tenant_created_idx'),
        ]

    def __str__(self):
        return f"GenerationJob#{self.pk} [{self.status}] tenant={self.tenant_id}"


# ── Newsletter Subscribers ────────────────────────────────────────────────────

class NewsletterSubscriber(TenantModel):
    """
    Email addresses collected via the Newsletter block on the public site.

    Each row is scoped to the tenant's site.  Duplicate emails per-tenant are
    prevented by the unique_together constraint.  Subscribers can unsubscribe
    at any time via the token link (no auth required).
    """
    STATUS_ACTIVE      = 'active'
    STATUS_UNSUBSCRIBED = 'unsubscribed'
    STATUS_CHOICES = [
        (STATUS_ACTIVE,       'Active'),
        (STATUS_UNSUBSCRIBED, 'Unsubscribed'),
    ]

    site       = models.ForeignKey(
        CMSSite,
        on_delete=models.CASCADE,
        related_name='newsletter_subscribers',
    )
    email      = models.EmailField()
    name       = models.CharField(max_length=200, blank=True)
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    # UUID token used in one-click unsubscribe links — never expose in list API
    token      = models.UUIDField(unique=True, editable=False)
    subscribed_at   = models.DateTimeField(auto_now_add=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)
    source     = models.CharField(max_length=100, blank=True, help_text='Which page/block captured this email')

    class Meta:
        ordering        = ['-subscribed_at']
        unique_together = ('tenant', 'site', 'email')
        verbose_name        = 'Newsletter Subscriber'
        verbose_name_plural = 'Newsletter Subscribers'
        indexes = [
            models.Index(fields=['tenant', 'site', 'status'], name='cms_nl_tenant_site_status_idx'),
        ]

    def save(self, *args, **kwargs):
        if not self.token:
            import uuid
            self.token = uuid.uuid4()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} [{self.status}]"


# ── Inquiries ────────────────────────────────────────────────────────────────

class CMSInquiry(TenantModel):
    """
    Contact/inquiry form submission captured from the public website.

    On submission the site fires a notification to admin staff.
    Optionally converted to a Customer record via convert_to_customer().
    Never hard-deleted — soft delete only.
    """
    STATUS_NEW         = 'new'
    STATUS_READ        = 'read'
    STATUS_REPLIED     = 'replied'
    STATUS_CONVERTED   = 'converted'
    STATUS_ARCHIVED    = 'archived'

    STATUS_CHOICES = [
        (STATUS_NEW,       'New'),
        (STATUS_READ,      'Read'),
        (STATUS_REPLIED,   'Replied'),
        (STATUS_CONVERTED, 'Converted to Customer'),
        (STATUS_ARCHIVED,  'Archived'),
    ]

    site                = models.ForeignKey(
        CMSSite, on_delete=models.CASCADE, related_name='inquiries',
    )
    name                = models.CharField(max_length=200)
    email               = models.EmailField()
    phone               = models.CharField(max_length=30, blank=True)
    subject             = models.CharField(max_length=255, blank=True)
    message             = models.TextField()
    source_page         = models.CharField(max_length=128, blank=True,
                              help_text='Page slug where the form was submitted')
    status              = models.CharField(max_length=20, choices=STATUS_CHOICES,
                              default=STATUS_NEW, db_index=True)
    # If converted, link to the created customer
    converted_customer  = models.ForeignKey(
        'customers.Customer',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='cms_inquiry_source',
    )
    converted_at        = models.DateTimeField(null=True, blank=True)
    reply_note          = models.TextField(blank=True,
                              help_text='Internal note from staff when replying')
    # Soft delete
    is_deleted          = models.BooleanField(default=False)
    deleted_at          = models.DateTimeField(null=True, blank=True)
    # IP for spam detection (never expose in API)
    submitter_ip        = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering            = ['-created_at']
        verbose_name        = 'CMS Inquiry'
        verbose_name_plural = 'CMS Inquiries'
        indexes = [
            models.Index(fields=['tenant', 'site', 'status'], name='cms_inq_tenant_status_idx'),
            models.Index(fields=['tenant', 'is_deleted'],     name='cms_inq_tenant_del_idx'),
        ]

    def __str__(self):
        return f"{self.name} <{self.email}> — {self.subject or self.message[:40]}"

    def soft_delete(self):
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])


# ── Analytics ────────────────────────────────────────────────────────────────

class CMSPageView(TenantModel):
    """
    Lightweight page-view counter for the public website.

    One row per (tenant, site, date, page_slug).  Count is incremented
    atomically via F() expression rather than creating a new row per hit,
    keeping table size manageable.

    Product views are tracked separately on the same model with a special
    slug convention: 'product:<product_id>'.
    """
    site        = models.ForeignKey(CMSSite, on_delete=models.CASCADE, related_name='page_views')
    page_slug   = models.CharField(max_length=200, db_index=True,
                      help_text="Page slug, '' for home, 'product:42' for product views")
    view_date   = models.DateField(db_index=True)
    view_count  = models.PositiveIntegerField(default=0)

    class Meta:
        ordering        = ['-view_date', '-view_count']
        unique_together = [('tenant', 'site', 'page_slug', 'view_date')]
        verbose_name        = 'CMS Page View'
        verbose_name_plural = 'CMS Page Views'
        indexes = [
            models.Index(fields=['tenant', 'site', 'view_date'], name='cms_pv_tenant_date_idx'),
        ]

    def __str__(self):
        return f"{self.page_slug} {self.view_date} × {self.view_count}"
