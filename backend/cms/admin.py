"""
cms/admin.py
~~~~~~~~~~~~
Django admin registrations for the CMS module.

All models are tenant-scoped.  The tenant column is shown in list views but
is read-only — tenant is set automatically via TenantModel.save().
"""
from django.contrib import admin
from .models import (
    CMSSite, CMSPage, CMSBlock,
    CMSBlogPost, CMSCustomDomain, CMSGenerationJob,
)


# ── Inlines ───────────────────────────────────────────────────────────────────

class CMSBlockInline(admin.TabularInline):
    model = CMSBlock
    extra = 0
    fields = ('block_type', 'sort_order', 'is_visible')
    ordering = ('sort_order',)
    show_change_link = True


class CMSPageInline(admin.TabularInline):
    model = CMSPage
    extra = 0
    fields = ('title', 'slug', 'page_type', 'sort_order', 'is_published')
    ordering = ('sort_order',)
    show_change_link = True


# ── CMSSite ───────────────────────────────────────────────────────────────────

@admin.register(CMSSite)
class CMSSiteAdmin(admin.ModelAdmin):
    list_display  = ('site_name', 'tenant', 'is_published', 'published_at', 'created_at')
    list_filter   = ('is_published',)
    search_fields = ('site_name', 'tenant__name')
    readonly_fields = ('tenant', 'created_at', 'updated_at', 'published_at')
    inlines       = [CMSPageInline]

    fieldsets = (
        ('Identity', {
            'fields': ('tenant', 'site_name', 'tagline', 'logo', 'favicon'),
        }),
        ('Theme', {
            'fields': ('theme_key', 'primary_color', 'secondary_color', 'font_family'),
        }),
        ('SEO Defaults', {
            'fields': ('default_meta_title', 'default_meta_description', 'default_og_image'),
        }),
        ('Scripts', {
            'fields': ('custom_head_script',),
            'classes': ('collapse',),
        }),
        ('Publishing', {
            'fields': ('is_published', 'published_at'),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )


# ── CMSPage ───────────────────────────────────────────────────────────────────

@admin.register(CMSPage)
class CMSPageAdmin(admin.ModelAdmin):
    list_display  = ('title', 'slug', 'page_type', 'site', 'sort_order', 'is_published')
    list_filter   = ('page_type', 'is_published')
    search_fields = ('title', 'slug', 'site__site_name')
    readonly_fields = ('tenant', 'created_at', 'updated_at', 'created_by')
    inlines       = [CMSBlockInline]

    fieldsets = (
        ('Page', {
            'fields': ('tenant', 'site', 'title', 'slug', 'page_type', 'sort_order', 'show_in_nav'),
        }),
        ('SEO', {
            'fields': ('meta_title', 'meta_description', 'og_image'),
        }),
        ('Publishing', {
            'fields': ('is_published', 'published_at'),
        }),
        ('Audit', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )


# ── CMSBlock ──────────────────────────────────────────────────────────────────

@admin.register(CMSBlock)
class CMSBlockAdmin(admin.ModelAdmin):
    list_display  = ('block_type', 'page', 'sort_order', 'is_visible')
    list_filter   = ('block_type', 'is_visible')
    search_fields = ('page__title', 'page__site__site_name')
    readonly_fields = ('tenant', 'created_at', 'updated_at', 'created_by')


# ── CMSBlogPost ───────────────────────────────────────────────────────────────

@admin.register(CMSBlogPost)
class CMSBlogPostAdmin(admin.ModelAdmin):
    list_display  = ('title', 'slug', 'site', 'is_published', 'published_at', 'is_deleted')
    list_filter   = ('is_published', 'is_deleted')
    search_fields = ('title', 'slug', 'site__site_name')
    readonly_fields = ('tenant', 'created_at', 'updated_at', 'created_by', 'deleted_at')
    date_hierarchy = 'published_at'

    def get_queryset(self, request):
        # Show deleted posts in admin for recovery
        return super().get_queryset(request)


# ── CMSCustomDomain ───────────────────────────────────────────────────────────

@admin.register(CMSCustomDomain)
class CMSCustomDomainAdmin(admin.ModelAdmin):
    list_display  = ('domain', 'site', 'is_verified', 'ssl_status', 'created_at')
    list_filter   = ('is_verified', 'ssl_status')
    search_fields = ('domain', 'site__site_name')
    readonly_fields = ('tenant', 'txt_record', 'verified_at', 'created_at', 'updated_at', 'created_by')

    fieldsets = (
        ('Domain', {
            'fields': ('tenant', 'site', 'domain'),
        }),
        ('Verification', {
            'fields': ('is_verified', 'txt_record', 'verified_at'),
        }),
        ('SSL', {
            'fields': ('ssl_status',),
        }),
        ('Audit', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )


# ── CMSGenerationJob ──────────────────────────────────────────────────────────

@admin.register(CMSGenerationJob)
class CMSGenerationJobAdmin(admin.ModelAdmin):
    list_display  = ('pk', 'site', 'status', 'created_by', 'generated_at', 'selected_design_index')
    list_filter   = ('status',)
    search_fields = ('site__site_name', 'prompt')
    readonly_fields = (
        'tenant', 'site', 'prompt', 'status', 'design_options',
        'selected_design_index', 'generated_at', 'failure_reason',
        'created_by', 'created_at', 'updated_at',
    )

    fieldsets = (
        ('Job', {
            'fields': ('tenant', 'site', 'prompt', 'status', 'failure_reason'),
        }),
        ('Output', {
            'fields': ('design_options', 'selected_design_index', 'generated_at'),
        }),
        ('Audit', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    def has_add_permission(self, request):
        # Generation jobs are created via API only
        return False
