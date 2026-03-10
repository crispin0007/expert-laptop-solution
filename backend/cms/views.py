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
from .models import CMSSite, CMSPage, CMSBlock, CMSBlogPost, CMSCustomDomain, CMSGenerationJob
from .serializers import (
    CmsSiteSerializer, CmsSiteWriteSerializer,
    CmsPageListSerializer, CmsPageDetailSerializer, CmsPageWriteSerializer,
    CmsBlockSerializer, CmsBlockWriteSerializer,
    CmsBlogPostListSerializer, CmsBlogPostDetailSerializer, CmsBlogPostWriteSerializer,
    CmsCustomDomainSerializer,
    CmsGenerationJobSerializer, CmsGenerationStartSerializer, CmsDesignSelectSerializer,
    PublicSiteSerializer, PublicPageDetailSerializer,
    PublicBlogPostListSerializer, PublicBlogPostDetailSerializer,
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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)()]
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


class CMSSitePublishView(TenantMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)()]

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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)()]

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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)()]

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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)()]

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


# ── Blocks ────────────────────────────────────────────────────────────────────

class CMSBlockListCreateView(TenantMixin, APIView):
    """
    GET  /api/v1/cms/pages/{page_pk}/blocks/  — Blocks for a page
    POST /api/v1/cms/pages/{page_pk}/blocks/  — Add a new block
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)()]

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
    PUT    /api/v1/cms/blocks/{pk}/  — Update block
    DELETE /api/v1/cms/blocks/{pk}/  — Delete block
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)()]

    def _get_block(self, pk):
        try:
            return CMSBlock.objects.get(pk=pk, tenant=self.request.tenant)
        except CMSBlock.DoesNotExist:
            return None

    def put(self, request, pk):
        block = self._get_block(pk)
        if not block:
            return ApiResponse.not_found('Block')
        block = services.update_block(block, request.data, request.user)
        return ApiResponse.success(data=CmsBlockSerializer(block).data)

    def delete(self, request, pk):
        block = self._get_block(pk)
        if not block:
            return ApiResponse.not_found('Block')
        services.delete_block(block)
        return ApiResponse.success(message='Block deleted.')


class CMSBlockReorderView(TenantMixin, APIView):
    """POST /api/v1/cms/pages/{page_pk}/blocks/reorder/ — Reorder blocks."""
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)()]

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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)()]
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
    DELETE /api/v1/cms/blog/{pk}/  — Soft delete
    """
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*STAFF_ROLES)()]

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

    def delete(self, request, pk):
        post = self._get_post(pk)
        if not post:
            return ApiResponse.not_found('Blog post')
        services.soft_delete_blog_post(post, request.user)
        return ApiResponse.success(message='Blog post deleted.')


class CMSBlogPostPublishView(TenantMixin, APIView):
    """POST /api/v1/cms/blog/{pk}/publish|unpublish/"""
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)()]

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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)()]

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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)()]

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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)()]

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
