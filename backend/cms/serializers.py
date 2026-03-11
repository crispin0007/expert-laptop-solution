"""
cms/serializers.py
~~~~~~~~~~~~~~~~~~
Two serializer namespaces:

  PRIVATE (prefix: Cms*) — used by BMS dashboard API.
    Never include these in public-facing endpoints.

  PUBLIC (prefix: Public*) — used by the Next.js website renderer.
    Never include tenant IDs, internal user data, or billing info.

Rule: a view either uses Private OR Public serializers, never both.
"""
from rest_framework import serializers
from .models import CMSSite, CMSPage, CMSBlock, CMSBlogPost, CMSCustomDomain, CMSGenerationJob


# ═══════════════════════════════════════════════════════════════════════════════
# PRIVATE serializers (BMS dashboard)
# ═══════════════════════════════════════════════════════════════════════════════

# ── CMS Block ────────────────────────────────────────────────────────────────

class CmsBlockSerializer(serializers.ModelSerializer):
    """Full block serializer used in page-detail responses."""
    class Meta:
        model  = CMSBlock
        fields = [
            'id', 'block_type', 'sort_order', 'is_visible',
            'content', 'raw_html', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CmsBlockWriteSerializer(serializers.ModelSerializer):
    """Input serializer for create/update of a block."""
    class Meta:
        model  = CMSBlock
        fields = ['block_type', 'sort_order', 'is_visible', 'content', 'raw_html']


# ── CMS Page ─────────────────────────────────────────────────────────────────

class CmsPageListSerializer(serializers.ModelSerializer):
    """Lightweight — for page list endpoint."""
    class Meta:
        model  = CMSPage
        fields = [
            'id', 'page_type', 'title', 'slug',
            'sort_order', 'show_in_nav', 'is_published', 'published_at',
        ]


class CmsPageDetailSerializer(serializers.ModelSerializer):
    """Full page with blocks — for single page endpoint."""
    blocks = CmsBlockSerializer(many=True, read_only=True)

    class Meta:
        model  = CMSPage
        fields = [
            'id', 'page_type', 'title', 'slug',
            'meta_title', 'meta_description',
            'sort_order', 'show_in_nav',
            'is_published', 'published_at',
            'blocks',
            'grapes_data', 'custom_html', 'custom_css',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'blocks']


class CmsPageWriteSerializer(serializers.ModelSerializer):
    """Input serializer for create/update of a page."""
    class Meta:
        model  = CMSPage
        fields = [
            'page_type', 'title', 'slug',
            'meta_title', 'meta_description',
            'sort_order', 'show_in_nav', 'is_published',
        ]

    def validate_slug(self, value: str) -> str:
        from django.utils.text import slugify
        return slugify(value)


class CmsPageGrapesSerializer(serializers.ModelSerializer):
    """Save/load GrapeJS visual editor state for a page (Phase 2)."""
    class Meta:
        model  = CMSPage
        fields = ['grapes_data', 'custom_html', 'custom_css']


# ── CMS Site ─────────────────────────────────────────────────────────────────

class CmsSiteSerializer(serializers.ModelSerializer):
    """Full site detail for dashboard."""
    pages         = CmsPageListSerializer(many=True, read_only=True)
    custom_domain = serializers.SerializerMethodField()
    blog_count    = serializers.SerializerMethodField()

    class Meta:
        model  = CMSSite
        fields = [
            'id', 'site_name', 'tagline', 'logo', 'favicon',
            'theme_key', 'primary_color', 'secondary_color', 'font_family',
            'custom_head_script',
            'is_published', 'published_at',
            'default_meta_title', 'default_meta_description',
            'pages', 'custom_domain', 'blog_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'published_at', 'pages']

    def get_custom_domain(self, obj):
        try:
            return obj.custom_domain.domain if obj.custom_domain else None
        except CMSCustomDomain.DoesNotExist:
            return None

    def get_blog_count(self, obj):
        return obj.blog_posts.filter(is_deleted=False).count()


class CmsSiteWriteSerializer(serializers.ModelSerializer):
    """Input for site settings update."""
    class Meta:
        model  = CMSSite
        fields = [
            'site_name', 'tagline',
            'theme_key', 'primary_color', 'secondary_color', 'font_family',
            'custom_head_script',
            'default_meta_title', 'default_meta_description',
        ]

    def validate_primary_color(self, value: str) -> str:
        if value and (not value.startswith('#') or len(value) not in (4, 7)):
            raise serializers.ValidationError("Must be a valid hex colour, e.g. #4F46E5")
        return value or '#4F46E5'

    def validate_secondary_color(self, value: str) -> str:
        if value and (not value.startswith('#') or len(value) not in (4, 7)):
            raise serializers.ValidationError("Must be a valid hex colour, e.g. #7C3AED")
        return value or '#7C3AED'


# ── CMS Blog Post ─────────────────────────────────────────────────────────────

class CmsBlogPostListSerializer(serializers.ModelSerializer):
    """Lightweight — for blog list endpoint."""
    display_author_name = serializers.SerializerMethodField()

    class Meta:
        model  = CMSBlogPost
        fields = [
            'id', 'title', 'slug', 'excerpt',
            'featured_image', 'author_name', 'display_author_name', 'tags',
            'read_time_minutes', 'is_published', 'published_at', 'created_at',
        ]

    def get_display_author_name(self, obj):
        return obj.author_name or (obj.author.get_full_name() if obj.author else '')


class CmsBlogPostDetailSerializer(serializers.ModelSerializer):
    """Full post for detail / edit view."""
    display_author_name = serializers.SerializerMethodField()

    class Meta:
        model  = CMSBlogPost
        fields = [
            'id', 'title', 'slug', 'excerpt', 'body',
            'featured_image', 'author', 'author_name', 'display_author_name', 'tags',
            'read_time_minutes', 'is_published', 'published_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'published_at', 'display_author_name']

    def get_display_author_name(self, obj):
        """author_name field wins; fall back to linked user's full name."""
        return obj.author_name or (obj.author.get_full_name() if obj.author else '')


class CmsBlogPostWriteSerializer(serializers.ModelSerializer):
    """Input for create / update of a blog post."""
    class Meta:
        model  = CMSBlogPost
        fields = [
            'title', 'slug', 'excerpt', 'body',
            'featured_image', 'author', 'author_name', 'tags', 'is_published',
        ]

    def validate_slug(self, value: str) -> str:
        from django.utils.text import slugify
        return slugify(value)


# ── Custom Domain ─────────────────────────────────────────────────────────────

class CmsCustomDomainSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CMSCustomDomain
        fields = [
            'id', 'domain', 'is_verified', 'verified_at',
            'txt_record', 'ssl_status', 'ssl_updated_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'is_verified', 'verified_at',
            'txt_record', 'ssl_status', 'ssl_updated_at',
            'created_at', 'updated_at',
        ]


# ── Generation Job ────────────────────────────────────────────────────────────

class CmsGenerationJobSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CMSGenerationJob
        fields = [
            'id', 'status', 'prompt',
            'design_options', 'selected_design_index',
            'failure_reason', 'generated_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status', 'design_options',
            'failure_reason', 'generated_at',
            'created_at', 'updated_at',
        ]


class CmsGenerationStartSerializer(serializers.Serializer):
    """Input for starting a new AI generation job."""
    prompt = serializers.CharField(
        min_length=10, max_length=2000,
        help_text="Describe your business, e.g. 'IT support company in Kathmandu serving SMEs'"
    )


class CmsDesignSelectSerializer(serializers.Serializer):
    """Input for choosing a design from completed generation job."""
    design_index = serializers.IntegerField(min_value=0)


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC serializers (Next.js website renderer)
# These MUST NOT expose tenant IDs, internal user data, or BMS internals.
# ═══════════════════════════════════════════════════════════════════════════════

class PublicBlockSerializer(serializers.ModelSerializer):
    """Block data safe to expose to the public website renderer."""
    class Meta:
        model  = CMSBlock
        fields = ['block_type', 'sort_order', 'content', 'raw_html']


class PublicPageSerializer(serializers.ModelSerializer):
    """Page summary used for site navigation listing — no blocks needed."""

    class Meta:
        model  = CMSPage
        fields = [
            'page_type', 'title', 'slug',
            'meta_title', 'meta_description',
            'sort_order', 'show_in_nav',
        ]


class PublicPageDetailSerializer(serializers.ModelSerializer):
    """Full page with blocks for public rendering.

    If grapes_data exists (visual editor was used), custom_html/css are
    served directly. Otherwise blocks are used by the renderer.
    """
    blocks = serializers.SerializerMethodField()

    class Meta:
        model  = CMSPage
        fields = [
            'page_type', 'title', 'slug',
            'meta_title', 'meta_description',
            'blocks',
            'custom_html', 'custom_css',
        ]

    def get_blocks(self, obj):
        # If page has custom GrapeJS HTML, skip block rendering
        if obj.custom_html:
            return []
        qs = obj.blocks.filter(is_visible=True).order_by('sort_order')
        return PublicBlockSerializer(qs, many=True).data


class PublicSiteSerializer(serializers.ModelSerializer):
    """Full public site config — no tenant data."""
    pages        = serializers.SerializerMethodField()
    custom_domain = serializers.SerializerMethodField()

    class Meta:
        model  = CMSSite
        fields = [
            'site_name', 'tagline', 'logo', 'favicon',
            'theme_key', 'primary_color', 'secondary_color', 'font_family',
            'custom_head_script',
            'default_meta_title', 'default_meta_description',
            'pages', 'custom_domain',
        ]

    def get_pages(self, obj):
        pages = obj.pages.filter(is_published=True).order_by('sort_order', 'title')
        return PublicPageSerializer(pages, many=True).data

    def get_custom_domain(self, obj):
        try:
            cd = obj.custom_domain
            return cd.domain if cd and cd.is_verified else None
        except CMSCustomDomain.DoesNotExist:
            return None


class DraftSiteSerializer(serializers.ModelSerializer):
    """Site config for the in-app draft preview — includes ALL pages (published or not)."""
    pages        = serializers.SerializerMethodField()
    custom_domain = serializers.SerializerMethodField()

    class Meta:
        model  = CMSSite
        fields = [
            'site_name', 'tagline', 'logo', 'favicon',
            'theme_key', 'primary_color', 'secondary_color', 'font_family',
            'custom_head_script',
            'default_meta_title', 'default_meta_description',
            'pages', 'custom_domain',
        ]

    def get_pages(self, obj):
        # Show ALL pages (draft or published) in the preview nav
        pages = obj.pages.all().order_by('sort_order', 'title')
        return PublicPageSerializer(pages, many=True).data

    def get_custom_domain(self, obj):
        try:
            cd = obj.custom_domain
            return cd.domain if cd and cd.is_verified else None
        except CMSCustomDomain.DoesNotExist:
            return None


class PublicBlogPostListSerializer(serializers.ModelSerializer):
    """Blog listing — safe for public."""
    author_name = serializers.SerializerMethodField()

    class Meta:
        model  = CMSBlogPost
        fields = [
            'title', 'slug', 'excerpt',
            'featured_image', 'author_name',
            'tags', 'read_time_minutes', 'published_at',
        ]

    def get_author_name(self, obj):
        return obj.author.get_full_name() if obj.author else None


class PublicBlogPostDetailSerializer(serializers.ModelSerializer):
    """Full blog post — safe for public."""
    author_name = serializers.SerializerMethodField()

    class Meta:
        model  = CMSBlogPost
        fields = [
            'title', 'slug', 'excerpt', 'body',
            'featured_image', 'author_name',
            'tags', 'read_time_minutes', 'published_at',
        ]

    def get_author_name(self, obj):
        return obj.author.get_full_name() if obj.author else None


# ── Newsletter ────────────────────────────────────────────────────────────────

class NewsletterSubscribeSerializer(serializers.Serializer):
    """Input for public newsletter subscribe endpoint."""
    email  = serializers.EmailField()
    name   = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    source = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')


class NewsletterUnsubscribeSerializer(serializers.Serializer):
    token = serializers.UUIDField()


# ── Public Product Catalogue ──────────────────────────────────────────────────

class PublicProductSerializer(serializers.Serializer):
    """
    Read-only product data for the public catalogue block.
    Only is_published=True items are returned.
    """
    id          = serializers.IntegerField()
    name        = serializers.CharField()
    description = serializers.CharField()
    sku         = serializers.CharField()
    brand       = serializers.CharField()
    unit_price  = serializers.DecimalField(max_digits=12, decimal_places=2)
    category    = serializers.SerializerMethodField()
    image_url   = serializers.SerializerMethodField()
    in_stock    = serializers.SerializerMethodField()

    def get_category(self, obj):
        return obj.category.name if obj.category else None

    def get_image_url(self, obj):
        return obj.primary_image_url or ''

    def get_in_stock(self, obj):
        stock_qty = getattr(obj, 'stock_qty', None)
        if stock_qty is not None:
            return int(stock_qty) > 0
        return True  # service / non-tracked items are always "in stock"
