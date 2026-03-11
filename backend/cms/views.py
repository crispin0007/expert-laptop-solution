"""
cms/views.py
~~~~~~~~~~~~
All CMS API endpoints.

Private endpoints (/api/v1/cms/...):
  - Site settings, publish/unpublish
  - Page CRUD, publish/unpublish
  - Block CRUD, reorder
  - Blog post CRUD, publish/unpublish
  - Custom domain setup + verification status
  - AI generation: start, poll, select design

Public endpoints (/api/v1/cms/public/...):
  - Site config, pages, blog — safe for Next.js renderer
  - No authentication required

Rule: private endpoints use CmsXxx serializers.
       public endpoints use PublicXxx serializers.
       These two sets must NEVER be mixed.
"""
import logging

from rest_framework import permissions, status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from core.mixins import TenantMixin
from core.pagination import NexusCursorPagination
from core.permissions import make_role_permission, STAFF_ROLES, MANAGER_ROLES, ALL_ROLES
from core.response import ApiResponse

from . import services
from .models import CMSSite, CMSPage, CMSBlock, CMSBlogPost, CMSCustomDomain, CMSGenerationJob, NewsletterSubscriber
from .serializers import (
    CmsSiteSerializer, CmsSiteWriteSerializer,
    CmsPageListSerializer, CmsPageDetailSerializer, CmsPageWriteSerializer,
    CmsPageGrapesSerializer,
    CmsBlockSerializer, CmsBlockWriteSerializer,
    CmsBlogPostListSerializer, CmsBlogPostDetailSerializer, CmsBlogPostWriteSerializer,
    CmsCustomDomainSerializer,
    CmsGenerationJobSerializer, CmsGenerationStartSerializer, CmsDesignSelectSerializer,
    PublicSiteSerializer, PublicPageDetailSerializer,
    PublicBlogPostListSerializer, PublicBlogPostDetailSerializer,
    NewsletterSubscribeSerializer, PublicProductSerializer,
    DraftSiteSerializer,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# PRIVATE VIEWS
# ═══════════════════════════════════════════════════════════════════════════════

# ── Site ──────────────────────────────────────────────────────────────────────

class CMSSiteView(TenantMixin, APIView):
    """
    GET  /api/v1/cms/site/    — Get (or auto-create) the tenant's site
    PUT  /api/v1/cms/site/    — Update site settings
    POST /api/v1/cms/site/publish/   — Publish site
    POST /api/v1/cms/site/unpublish/ — Take site offline
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_site(self):
        site, _ = services.get_or_create_site(self.request.tenant)
        return site

    def get(self, request):
        site = self._get_site()
        return ApiResponse.success(data=CmsSiteSerializer(site, context={'request': request}).data)

    def put(self, request):
        site = self._get_site()
        site = services.update_site_settings(site, request.data, request.user)
        return ApiResponse.success(data=CmsSiteSerializer(site, context={'request': request}).data)

    def patch(self, request):
        """Partial update — same as PUT but accepts partial payloads."""
        return self.put(request)


class CMSSitePublishView(TenantMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)]

    def post(self, request, action):
        site, _ = services.get_or_create_site(request.tenant)
        if action == 'publish':
            site = services.publish_site(site, request.user)
        elif action == 'unpublish':
            site = services.unpublish_site(site, request.user)
        else:
            return ApiResponse.error('Invalid action.')
        return ApiResponse.success(
            data={'is_published': site.is_published, 'published_at': site.published_at},
            message=f"Site {'published' if site.is_published else 'unpublished'} successfully.",
        )


# ── Pages ─────────────────────────────────────────────────────────────────────

class CMSPageListCreateView(TenantMixin, APIView):
    """
    GET  /api/v1/cms/pages/  — List all pages for the site
    POST /api/v1/cms/pages/  — Create a new page
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def _get_site(self):
        site, _ = services.get_or_create_site(self.request.tenant)
        return site

    def get(self, request):
        site = self._get_site()
        pages = CMSPage.objects.filter(site=site, tenant=request.tenant).order_by('sort_order', 'title')
        return ApiResponse.success(data=CmsPageListSerializer(pages, many=True).data)

    def post(self, request):
        site = self._get_site()
        serializer = CmsPageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        page = services.create_page(site, serializer.validated_data, request.user)
        return ApiResponse.created(data=CmsPageDetailSerializer(page).data)


class CMSPageDetailView(TenantMixin, APIView):
    """
    GET    /api/v1/cms/pages/{pk}/  — Page detail with blocks
    PUT    /api/v1/cms/pages/{pk}/  — Update page
    DELETE /api/v1/cms/pages/{pk}/  — Delete page (hard, cascades blocks)
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def _get_page(self, pk):
        try:
            return CMSPage.objects.get(pk=pk, tenant=self.request.tenant)
        except CMSPage.DoesNotExist:
            return None

    def get(self, request, pk):
        page = self._get_page(pk)
        if not page:
            return ApiResponse.not_found('Page')
        return ApiResponse.success(data=CmsPageDetailSerializer(page).data)

    def put(self, request, pk):
        page = self._get_page(pk)
        if not page:
            return ApiResponse.not_found('Page')
        page = services.update_page(page, request.data, request.user)
        return ApiResponse.success(data=CmsPageDetailSerializer(page).data)

    def delete(self, request, pk):
        page = self._get_page(pk)
        if not page:
            return ApiResponse.not_found('Page')
        services.delete_page(page, request.user)
        return ApiResponse.success(message='Page deleted.')


class CMSPagePublishView(TenantMixin, APIView):
    """POST /api/v1/cms/pages/{pk}/publish|unpublish/"""
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)]

    def post(self, request, pk, action):
        try:
            page = CMSPage.objects.get(pk=pk, tenant=request.tenant)
        except CMSPage.DoesNotExist:
            return ApiResponse.not_found('Page')
        if action == 'publish':
            page = services.publish_page(page, request.user)
        elif action == 'unpublish':
            page = services.unpublish_page(page, request.user)
        else:
            return ApiResponse.error('Invalid action.')
        return ApiResponse.success(
            data={'is_published': page.is_published},
            message=f"Page {'published' if page.is_published else 'unpublished'}.",
        )


class CMSPageGrapesView(TenantMixin, APIView):
    """
    GET  /api/v1/cms/pages/{pk}/grapes/  — Load GrapeJS state for a page
    PUT  /api/v1/cms/pages/{pk}/grapes/  — Save GrapeJS state (components + CSS + rendered HTML)

    Phase 2: Visual page editor powered by GrapeJS.
    The frontend sends grapes_data (JSON), custom_html, and custom_css.
    The public renderer serves custom_html when present instead of block content.
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def _get_page(self, pk):
        try:
            return CMSPage.objects.get(pk=pk, tenant=self.request.tenant)
        except CMSPage.DoesNotExist:
            return None

    def get(self, request, pk):
        page = self._get_page(pk)
        if not page:
            return ApiResponse.not_found('Page')
        data = CmsPageGrapesSerializer(page).data
        # Bootstrap content: when a page has blocks but has never been opened
        # in the GrapeJS editor, pre-render the blocks as inline-styled HTML so
        # the editor starts populated rather than blank.
        if not page.grapes_data and not page.custom_html:
            data['bootstrap_html'] = services.blocks_to_html(page)
        return ApiResponse.success(data=data)

    def put(self, request, pk):
        page = self._get_page(pk)
        if not page:
            return ApiResponse.not_found('Page')
        serializer = CmsPageGrapesSerializer(page, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ApiResponse.success(
            data=CmsPageDetailSerializer(page).data,
            message='Page visual content saved.',
        )


# ── Blocks ────────────────────────────────────────────────────────────────────

class CMSBlockListCreateView(TenantMixin, APIView):
    """
    GET  /api/v1/cms/pages/{page_pk}/blocks/  — Blocks for a page
    POST /api/v1/cms/pages/{page_pk}/blocks/  — Add a new block
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def _get_page(self, page_pk):
        try:
            return CMSPage.objects.get(pk=page_pk, tenant=self.request.tenant)
        except CMSPage.DoesNotExist:
            return None

    def get(self, request, page_pk):
        page = self._get_page(page_pk)
        if not page:
            return ApiResponse.not_found('Page')
        blocks = CMSBlock.objects.filter(page=page, tenant=request.tenant).order_by('sort_order')
        return ApiResponse.success(data=CmsBlockSerializer(blocks, many=True).data)

    def post(self, request, page_pk):
        page = self._get_page(page_pk)
        if not page:
            return ApiResponse.not_found('Page')
        serializer = CmsBlockWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        block = services.create_block(page, serializer.validated_data, request.user)
        return ApiResponse.created(data=CmsBlockSerializer(block).data)


class CMSBlockDetailView(TenantMixin, APIView):
    """
    PUT    /api/v1/cms/blocks/{pk}/                        — Update block
    PATCH  /api/v1/cms/blocks/{pk}/                        — Partial update
    DELETE /api/v1/cms/blocks/{pk}/                        — Delete block
    Also accessible at /api/v1/cms/pages/{page_pk}/blocks/{pk}/
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def _get_block(self, pk):
        try:
            return CMSBlock.objects.get(pk=pk, tenant=self.request.tenant)
        except CMSBlock.DoesNotExist:
            return None

    def put(self, request, pk, page_pk=None):
        block = self._get_block(pk)
        if not block:
            return ApiResponse.not_found('Block')
        block = services.update_block(block, request.data, request.user)
        return ApiResponse.success(data=CmsBlockSerializer(block).data)

    def patch(self, request, pk, page_pk=None):
        """Partial update — same as PUT but accepts partial payloads."""
        return self.put(request, pk, page_pk)

    def delete(self, request, pk, page_pk=None):
        block = self._get_block(pk)
        if not block:
            return ApiResponse.not_found('Block')
        services.delete_block(block)
        return ApiResponse.success(message='Block deleted.')


class CMSMediaUploadView(TenantMixin, APIView):
    """
    POST /api/v1/cms/media/  — Upload an image file for use in block content.

    Returns a public URL that can be stored in block content JSON fields
    (e.g. hero bg_image, team member photo, gallery item url).

    Accepts: multipart/form-data with a single `file` field.
    Returns: { url: "https://…/media/cms/blocks/uuid.jpg" }
    """
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'}
    MAX_SIZE_MB = 10

    def post(self, request):
        import os, uuid
        from django.core.files.storage import default_storage

        file = request.FILES.get('file')
        if not file:
            return ApiResponse.bad_request('No file provided. Send a multipart/form-data request with a "file" field.')

        # Extension check
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in self.ALLOWED_EXTENSIONS:
            return ApiResponse.bad_request(f'File type "{ext}" not allowed. Allowed: {", ".join(self.ALLOWED_EXTENSIONS)}')

        # Size check
        if file.size > self.MAX_SIZE_MB * 1024 * 1024:
            return ApiResponse.bad_request(f'File too large. Maximum size is {self.MAX_SIZE_MB} MB.')

        # Save to tenant-scoped path to avoid collisions
        tenant_slug = getattr(request.tenant, 'slug', 'shared')
        filename = f'cms/blocks/{tenant_slug}/{uuid.uuid4()}{ext}'
        saved_path = default_storage.save(filename, file)
        url = request.build_absolute_uri(default_storage.url(saved_path))

        return ApiResponse.success({'url': url})


class CMSBlockReorderView(TenantMixin, APIView):
    """POST /api/v1/cms/pages/{page_pk}/blocks/reorder/ — Reorder blocks."""
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def post(self, request, page_pk):
        try:
            page = CMSPage.objects.get(pk=page_pk, tenant=request.tenant)
        except CMSPage.DoesNotExist:
            return ApiResponse.not_found('Page')
        ordered_ids = request.data.get('order', [])
        if not isinstance(ordered_ids, list):
            return ApiResponse.error('order must be a list of block IDs.')
        services.reorder_blocks(page, ordered_ids)
        return ApiResponse.success(message='Blocks reordered.')


# ── Blog Posts ────────────────────────────────────────────────────────────────

class CMSBlogPostListCreateView(TenantMixin, APIView):
    """
    GET  /api/v1/cms/blog/  — List blog posts (paginated)
    POST /api/v1/cms/blog/  — Create a blog post
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = NexusCursorPagination

    def get(self, request):
        qs = (
            CMSBlogPost.objects
            .filter(tenant=request.tenant, is_deleted=False)
            .select_related('author', 'site')
            .order_by('-created_at')
        )
        paginator = NexusCursorPagination()
        page = paginator.paginate_queryset(qs, request)
        if page is not None:
            return paginator.get_paginated_response(
                CmsBlogPostListSerializer(page, many=True, context={'request': request}).data
            )
        return ApiResponse.success(data=CmsBlogPostListSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request):
        site, _ = services.get_or_create_site(request.tenant)
        serializer = CmsBlogPostWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = services.create_blog_post(site, serializer.validated_data, request.user)
        return ApiResponse.created(data=CmsBlogPostDetailSerializer(post, context={'request': request}).data)


class CMSBlogPostDetailView(TenantMixin, APIView):
    """
    GET    /api/v1/cms/blog/{pk}/  — Get blog post
    PUT    /api/v1/cms/blog/{pk}/  — Update blog post
    PATCH  /api/v1/cms/blog/{pk}/  — Partial update
    DELETE /api/v1/cms/blog/{pk}/  — Soft delete
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_post(self, pk):
        try:
            return CMSBlogPost.objects.get(pk=pk, tenant=self.request.tenant, is_deleted=False)
        except CMSBlogPost.DoesNotExist:
            return None

    def get(self, request, pk):
        post = self._get_post(pk)
        if not post:
            return ApiResponse.not_found('Blog post')
        return ApiResponse.success(data=CmsBlogPostDetailSerializer(post, context={'request': request}).data)

    def put(self, request, pk):
        post = self._get_post(pk)
        if not post:
            return ApiResponse.not_found('Blog post')
        serializer = CmsBlogPostWriteSerializer(post, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        post = services.update_blog_post(post, serializer.validated_data, request.user)
        return ApiResponse.success(data=CmsBlogPostDetailSerializer(post, context={'request': request}).data)

    def patch(self, request, pk):
        """Partial update — delegates to put."""
        return self.put(request, pk)

    def delete(self, request, pk):
        post = self._get_post(pk)
        if not post:
            return ApiResponse.not_found('Blog post')
        services.soft_delete_blog_post(post, request.user)
        return ApiResponse.success(message='Blog post deleted.')


class CMSBlogPostPublishView(TenantMixin, APIView):
    """POST /api/v1/cms/blog/{pk}/publish|unpublish/"""
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)]

    def post(self, request, pk, action):
        try:
            post = CMSBlogPost.objects.get(pk=pk, tenant=request.tenant, is_deleted=False)
        except CMSBlogPost.DoesNotExist:
            return ApiResponse.not_found('Blog post')
        site = post.site
        if action == 'publish':
            services.update_blog_post(post, {'is_published': True}, request.user)
        elif action == 'unpublish':
            post.is_published = False
            post.save(update_fields=['is_published'])
        else:
            return ApiResponse.error('Invalid action.')
        return ApiResponse.success(data={'is_published': post.is_published})


# ── Custom Domain ─────────────────────────────────────────────────────────────

class CMSCustomDomainView(TenantMixin, APIView):
    """
    GET  /api/v1/cms/domain/  — Get domain status (or 404 if not set)
    POST /api/v1/cms/domain/  — Register / update custom domain
    DELETE /api/v1/cms/domain/ — Remove custom domain
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)]

    def _get_site(self):
        site, _ = services.get_or_create_site(self.request.tenant)
        return site

    def get(self, request):
        site = self._get_site()
        try:
            cd = site.custom_domain
        except CMSCustomDomain.DoesNotExist:
            return ApiResponse.not_found('Custom domain')
        return ApiResponse.success(data=CmsCustomDomainSerializer(cd).data)

    def post(self, request):
        domain = (request.data.get('domain') or '').strip().lower()
        if not domain:
            return ApiResponse.error('domain is required.')
        site = self._get_site()
        cd = services.setup_custom_domain(site, domain, request.user)
        return ApiResponse.created(data=CmsCustomDomainSerializer(cd).data)

    def delete(self, request):
        site = self._get_site()
        try:
            site.custom_domain.delete()
        except CMSCustomDomain.DoesNotExist:
            pass
        return ApiResponse.success(message='Custom domain removed.')


# ── AI Generation ─────────────────────────────────────────────────────────────

class CMSGenerationJobListView(TenantMixin, APIView):
    """
    GET  /api/v1/cms/generate/  — List recent generation jobs
    POST /api/v1/cms/generate/  — Start a new AI generation
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)]

    def get(self, request):
        jobs = (
            CMSGenerationJob.objects
            .filter(tenant=request.tenant)
            .order_by('-created_at')[:20]
        )
        return ApiResponse.success(data=CmsGenerationJobSerializer(jobs, many=True).data)

    def post(self, request):
        serializer = CmsGenerationStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        site, _ = services.get_or_create_site(request.tenant)
        try:
            job = services.start_generation_job(
                site=site,
                prompt=serializer.validated_data['prompt'],
                user=request.user,
            )
        except ValueError as exc:
            return ApiResponse.error(str(exc))
        return ApiResponse.created(data=CmsGenerationJobSerializer(job).data)


class CMSGenerationJobDetailView(TenantMixin, APIView):
    """
    GET  /api/v1/cms/generate/{pk}/         — Poll job status
    POST /api/v1/cms/generate/{pk}/select/  — Select a design
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)]

    def _get_job(self, pk):
        try:
            return CMSGenerationJob.objects.get(pk=pk, tenant=self.request.tenant)
        except CMSGenerationJob.DoesNotExist:
            return None

    def get(self, request, pk):
        job = self._get_job(pk)
        if not job:
            return ApiResponse.not_found('Generation job')
        return ApiResponse.success(data=CmsGenerationJobSerializer(job).data)

    def post(self, request, pk):
        """Select a design from a completed job."""
        job = self._get_job(pk)
        if not job:
            return ApiResponse.not_found('Generation job')
        serializer = CmsDesignSelectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            site = services.apply_generated_design(
                job=job,
                design_index=serializer.validated_data['design_index'],
                user=request.user,
            )
        except ValueError as exc:
            return ApiResponse.error(str(exc))
        return ApiResponse.success(
            data=CmsSiteSerializer(site, context={'request': request}).data,
            message='Design applied. Review your pages and publish when ready.',
        )


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC VIEWS — No auth, Next.js renderer
# ═══════════════════════════════════════════════════════════════════════════════

class PublicSiteView(APIView):
    """
    GET /api/v1/cms/public/site/
    Public site config — no authentication required.
    Resolved by subdomain (TenantMiddleware sets request.tenant).
    Returns 404 if site is not published.
    """
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return ApiResponse.not_found('Site')
        try:
            site = CMSSite.objects.get(tenant=tenant, is_published=True)
        except CMSSite.DoesNotExist:
            return ApiResponse.not_found('Site')
        return ApiResponse.success(data=PublicSiteSerializer(site, context={'request': request}).data)


class PublicPageDetailView(APIView):
    """
    GET /api/v1/cms/public/pages/{slug}/
    Public page content — no authentication required.
    Returns visible blocks only.
    """
    permission_classes = []
    authentication_classes = []

    def get(self, request, slug):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return ApiResponse.not_found('Page')
        try:
            site = CMSSite.objects.get(tenant=tenant, is_published=True)
            page = CMSPage.objects.get(site=site, slug=slug, is_published=True)
        except (CMSSite.DoesNotExist, CMSPage.DoesNotExist):
            return ApiResponse.not_found('Page')
        return ApiResponse.success(data=PublicPageDetailSerializer(page).data)


class PublicBlogListView(APIView):
    """GET /api/v1/cms/public/blog/ — Public blog listing."""
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return ApiResponse.not_found('Site')
        try:
            site = CMSSite.objects.get(tenant=tenant, is_published=True)
        except CMSSite.DoesNotExist:
            return ApiResponse.not_found('Site')
        posts = (
            CMSBlogPost.objects
            .filter(site=site, is_published=True, is_deleted=False)
            .select_related('author')
            .order_by('-published_at')
        )
        paginator = NexusCursorPagination()
        page = paginator.paginate_queryset(posts, request)
        if page is not None:
            return paginator.get_paginated_response(
                PublicBlogPostListSerializer(page, many=True, context={'request': request}).data
            )
        return ApiResponse.success(
            data=PublicBlogPostListSerializer(posts, many=True, context={'request': request}).data
        )


class PublicBlogPostDetailView(APIView):
    """GET /api/v1/cms/public/blog/{slug}/ — Public blog post detail."""
    permission_classes = []
    authentication_classes = []

    def get(self, request, slug):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return ApiResponse.not_found('Blog post')
        try:
            post = CMSBlogPost.objects.get(
                site__tenant=tenant,
                site__is_published=True,
                slug=slug,
                is_published=True,
                is_deleted=False,
            )
        except CMSBlogPost.DoesNotExist:
            return ApiResponse.not_found('Blog post')
        return ApiResponse.success(
            data=PublicBlogPostDetailSerializer(post, context={'request': request}).data
        )


# ── Draft Preview (auth-required, bypasses is_published) ─────────────────────

class DraftSiteView(TenantMixin, APIView):
    """
    GET /api/v1/cms/draft/site/
    Returns CMS site config for authenticated staff — published or not.
    Auto-creates an empty CMSSite if none exists yet so preview never hard-blocks.
    Used by the in-app /preview/* renderer.
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def get(self, request):
        site, _ = CMSSite.objects.get_or_create(
            tenant=request.tenant,
            defaults={'site_name': request.tenant.name},
        )
        return ApiResponse.success(data=DraftSiteSerializer(site, context={'request': request}).data)


class DraftPageByIdView(TenantMixin, APIView):
    """
    GET /api/v1/cms/draft/pages/<pk>/
    Returns a single page by numeric PK for the in-app draft preview.
    Bypasses is_published — used from the block manager Preview button.
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def get(self, request, pk):
        try:
            page = CMSPage.objects.get(pk=pk, site__tenant=request.tenant)
        except CMSPage.DoesNotExist:
            return ApiResponse.not_found('Page')
        return ApiResponse.success(data=PublicPageDetailSerializer(page).data)


class DraftPageDetailView(TenantMixin, APIView):
    """
    GET /api/v1/cms/draft/pages/        → home page (slug='')
    GET /api/v1/cms/draft/pages/<slug>/ → any page, published or draft.
    Used by the in-app /preview/* renderer.
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def get(self, request, slug=''):
        try:
            site = CMSSite.objects.get(tenant=request.tenant)
            if slug:
                page = CMSPage.objects.get(site=site, slug=slug)
            else:
                # Home page — prefer page_type='home' or slug=''
                page = (
                    CMSPage.objects.filter(site=site, page_type='home').first()
                    or CMSPage.objects.filter(site=site, slug='').first()
                    or CMSPage.objects.filter(site=site).first()
                )
                if not page:
                    return ApiResponse.not_found('Page')
        except (CMSSite.DoesNotExist, CMSPage.DoesNotExist):
            return ApiResponse.not_found('Page')
        return ApiResponse.success(data=PublicPageDetailSerializer(page).data)


class DraftBlogListView(TenantMixin, APIView):
    """
    GET /api/v1/cms/draft/blog/
    Returns all blog posts (published or draft) for authenticated staff.
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def get(self, request):
        try:
            site = CMSSite.objects.get(tenant=request.tenant)
        except CMSSite.DoesNotExist:
            return ApiResponse.not_found('Site')
        posts = (
            CMSBlogPost.objects
            .filter(site=site, is_deleted=False)
            .select_related('author')
            .order_by('-published_at', '-created_at')
        )
        return ApiResponse.success(
            data=PublicBlogPostListSerializer(posts, many=True, context={'request': request}).data
        )


class DraftBlogPostDetailView(TenantMixin, APIView):
    """
    GET /api/v1/cms/draft/blog/<slug>/
    Returns a single blog post (published or draft) for authenticated staff.
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)]

    def get(self, request, slug):
        try:
            post = CMSBlogPost.objects.get(
                site__tenant=request.tenant,
                slug=slug,
                is_deleted=False,
            )
        except CMSBlogPost.DoesNotExist:
            return ApiResponse.not_found('Blog post')
        return ApiResponse.success(
            data=PublicBlogPostDetailSerializer(post, context={'request': request}).data
        )


# ── Public Newsletter ─────────────────────────────────────────────────────────

class PublicNewsletterSubscribeView(APIView):
    """
    POST /api/v1/cms/public/newsletter/subscribe/
    Subscribe an email address to the tenant's newsletter list.
    Idempotent — subscribing again with an existing email re-activates it.
    """
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        from .models import NewsletterSubscriber
        from .serializers import NewsletterSubscribeSerializer

        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return ApiResponse.not_found('Site')

        try:
            site = CMSSite.objects.get(tenant=tenant, is_published=True)
        except CMSSite.DoesNotExist:
            return ApiResponse.not_found('Site')

        ser = NewsletterSubscribeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        sub, created = NewsletterSubscriber.objects.get_or_create(
            tenant=tenant,
            site=site,
            email=d['email'],
            defaults={
                'name':   d.get('name', ''),
                'source': d.get('source', ''),
                'status': NewsletterSubscriber.STATUS_ACTIVE,
            },
        )
        if not created and sub.status == NewsletterSubscriber.STATUS_UNSUBSCRIBED:
            sub.status = NewsletterSubscriber.STATUS_ACTIVE
            sub.unsubscribed_at = None
            sub.save(update_fields=['status', 'unsubscribed_at'])

        return ApiResponse.success(message='You have been subscribed. Thank you!')


class PublicNewsletterUnsubscribeView(APIView):
    """
    GET /api/v1/cms/public/newsletter/unsubscribe/?token=<uuid>
    One-click unsubscribe via tokenised link.
    """
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        from .models import NewsletterSubscriber
        from django.utils import timezone as tz

        token = request.query_params.get('token', '')
        if not token:
            return ApiResponse.error('Unsubscribe token is required.')
        try:
            sub = NewsletterSubscriber.objects.get(token=token)
        except NewsletterSubscriber.DoesNotExist:
            return ApiResponse.error('Invalid or expired unsubscribe link.')
        sub.status = NewsletterSubscriber.STATUS_UNSUBSCRIBED
        sub.unsubscribed_at = tz.now()
        sub.save(update_fields=['status', 'unsubscribed_at'])
        return ApiResponse.success(message='You have been unsubscribed.')


# ── Public Product Catalogue ──────────────────────────────────────────────────

class PublicProductCatalogView(APIView):
    """
    GET /api/v1/cms/public/catalog/
    Returns products with is_published=True for this tenant.
    Optional query params:
      ?category=<name>   filter by category name
      ?search=<q>        name/description search
      ?limit=<n>         defaults to 24
    """
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        from inventory.models import Product
        from django.db.models import Sum, Q
        from .serializers import PublicProductSerializer

        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return ApiResponse.not_found('Site')

        qs = (
            Product.objects
            .filter(tenant=tenant, is_published=True, is_active=True, is_deleted=False)
            .select_related('category')
            .prefetch_related('images')
        )

        # Annotate stock quantity from StockMovement aggregation
        try:
            from inventory.models import StockMovement
            from django.db.models import Case, When, IntegerField
            from django.db.models import Sum as DSum
            qs = qs.annotate(
                stock_qty=DSum(
                    Case(
                        When(stock_movements__movement_type__in=['in', 'return', 'adjustment'],
                             then='stock_movements__quantity'),
                        When(stock_movements__movement_type__in=['out', 'return_supplier'],
                             then=-1),
                        default=0,
                        output_field=IntegerField(),
                    )
                )
            )
        except Exception:
            pass  # annotation failure → in_stock defaults to True

        # Filters
        category = request.query_params.get('category', '').strip()
        if category:
            qs = qs.filter(category__name__iexact=category)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))

        try:
            limit = min(int(request.query_params.get('limit', 24)), 100)
        except (ValueError, TypeError):
            limit = 24

        qs = qs.order_by('name')[:limit]

        return ApiResponse.success(data=PublicProductSerializer(qs, many=True).data)
