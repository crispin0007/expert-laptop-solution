"""cms/urls.py — URL routing for the CMS module."""
from django.urls import path
from . import views

urlpatterns = [
    # ── Site ────────────────────────────────────────────────────────────────
    path('site/', views.CMSSiteView.as_view(), name='cms-site'),
    path('site/<str:action>/', views.CMSSitePublishView.as_view(), name='cms-site-publish'),

    # ── Pages ────────────────────────────────────────────────────────────────
    path('pages/', views.CMSPageListCreateView.as_view(), name='cms-page-list'),
    path('pages/<int:pk>/', views.CMSPageDetailView.as_view(), name='cms-page-detail'),
    path('pages/<int:pk>/grapes/', views.CMSPageGrapesView.as_view(), name='cms-page-grapes'),
    # ── Blocks — must be defined BEFORE pages/<int:pk>/<str:action>/ to avoid
    #    clash: pages/1/blocks/ would otherwise match the publish route with
    #    pk=1, action='blocks', causing CMSPagePublishView to receive block GET
    #    requests and return 405 Method Not Allowed.
    path('pages/<int:page_pk>/blocks/', views.CMSBlockListCreateView.as_view(), name='cms-block-list'),
    path('pages/<int:page_pk>/blocks/reorder/', views.CMSBlockReorderView.as_view(), name='cms-block-reorder'),
    path('pages/<int:page_pk>/blocks/<int:pk>/', views.CMSBlockDetailView.as_view(), name='cms-block-detail-nested'),
    path('blocks/<int:pk>/', views.CMSBlockDetailView.as_view(), name='cms-block-detail'),
    path('pages/<int:pk>/<str:action>/', views.CMSPagePublishView.as_view(), name='cms-page-publish'),

    # ── Blog ─────────────────────────────────────────────────────────────────
    path('blog/', views.CMSBlogPostListCreateView.as_view(), name='cms-blog-list'),
    path('blog/<int:pk>/', views.CMSBlogPostDetailView.as_view(), name='cms-blog-detail'),
    path('blog/<int:pk>/<str:action>/', views.CMSBlogPostPublishView.as_view(), name='cms-blog-publish'),

    # ── Media upload (images for block content) ─────────────────────────────
    path('media/', views.CMSMediaUploadView.as_view(), name='cms-media-upload'),

    # ── Custom Domain ─────────────────────────────────────────────────────────
    path('domain/', views.CMSCustomDomainView.as_view(), name='cms-domain'),

    # ── AI Generation ─────────────────────────────────────────────────────────
    path('generate/', views.CMSGenerationJobListView.as_view(), name='cms-generate-list'),
    path('generate/<int:pk>/', views.CMSGenerationJobDetailView.as_view(), name='cms-generate-detail'),
    path('generate/<int:pk>/select/', views.CMSGenerationJobDetailView.as_view(), name='cms-generate-select'),

    # ── Public (no auth) ──────────────────────────────────────────────────────
    path('public/site/', views.PublicSiteView.as_view(), name='cms-public-site'),
    path('public/pages/', views.PublicPageDetailView.as_view(), {'slug': ''}, name='cms-public-home'),
    path('public/pages/<slug:slug>/', views.PublicPageDetailView.as_view(), name='cms-public-page'),
    path('public/blog/', views.PublicBlogListView.as_view(), name='cms-public-blog-list'),
    path('public/blog/<slug:slug>/', views.PublicBlogPostDetailView.as_view(), name='cms-public-blog-detail'),
    # Newsletter
    path('public/newsletter/subscribe/', views.PublicNewsletterSubscribeView.as_view(), name='cms-public-newsletter-sub'),
    path('public/newsletter/unsubscribe/', views.PublicNewsletterUnsubscribeView.as_view(), name='cms-public-newsletter-unsub'),
    # Product catalogue
    path('public/catalog/', views.PublicProductCatalogView.as_view(), name='cms-public-catalog'),

    # ── Draft preview (auth-required, bypasses is_published) ──────────────────
    path('draft/site/', views.DraftSiteView.as_view(), name='cms-draft-site'),
    path('draft/pages/', views.DraftPageDetailView.as_view(), name='cms-draft-home'),
    path('draft/pages/<int:pk>/', views.DraftPageByIdView.as_view(), name='cms-draft-page-by-id'),
    path('draft/pages/<slug:slug>/', views.DraftPageDetailView.as_view(), name='cms-draft-page'),
    path('draft/blog/', views.DraftBlogListView.as_view(), name='cms-draft-blog-list'),
    path('draft/blog/<slug:slug>/', views.DraftBlogPostDetailView.as_view(), name='cms-draft-blog-detail'),

    # ── Inquiries (private) ───────────────────────────────────────────────────
    path('inquiries/', views.CMSInquiryListView.as_view(), name='cms-inquiry-list'),
    path('inquiries/<int:pk>/', views.CMSInquiryDetailView.as_view(), name='cms-inquiry-detail'),
    path('inquiries/<int:pk>/convert/', views.CMSInquiryConvertView.as_view(), name='cms-inquiry-convert'),

    # ── Analytics (private) ───────────────────────────────────────────────────
    path('analytics/', views.CMSAnalyticsView.as_view(), name='cms-analytics'),

    # ── Public: contact form, page tracking, sitemap, robots ──────────────────
    path('public/inquiry/', views.PublicInquirySubmitView.as_view(), name='cms-public-inquiry'),
    path('public/track/', views.PublicRecordPageViewView.as_view(), name='cms-public-track'),
    path('public/sitemap.xml', views.PublicSitemapView.as_view(), name='cms-public-sitemap'),
    path('public/robots.txt', views.PublicRobotsView.as_view(), name='cms-public-robots'),
]
