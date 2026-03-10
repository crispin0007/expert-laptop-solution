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
    path('pages/<int:pk>/<str:action>/', views.CMSPagePublishView.as_view(), name='cms-page-publish'),

    # ── Blocks ───────────────────────────────────────────────────────────────
    path('pages/<int:page_pk>/blocks/', views.CMSBlockListCreateView.as_view(), name='cms-block-list'),
    path('pages/<int:page_pk>/blocks/reorder/', views.CMSBlockReorderView.as_view(), name='cms-block-reorder'),
    path('blocks/<int:pk>/', views.CMSBlockDetailView.as_view(), name='cms-block-detail'),

    # ── Blog ─────────────────────────────────────────────────────────────────
    path('blog/', views.CMSBlogPostListCreateView.as_view(), name='cms-blog-list'),
    path('blog/<int:pk>/', views.CMSBlogPostDetailView.as_view(), name='cms-blog-detail'),
    path('blog/<int:pk>/<str:action>/', views.CMSBlogPostPublishView.as_view(), name='cms-blog-publish'),

    # ── Custom Domain ─────────────────────────────────────────────────────────
    path('domain/', views.CMSCustomDomainView.as_view(), name='cms-domain'),

    # ── AI Generation ─────────────────────────────────────────────────────────
    path('generate/', views.CMSGenerationJobListView.as_view(), name='cms-generate-list'),
    path('generate/<int:pk>/', views.CMSGenerationJobDetailView.as_view(), name='cms-generate-detail'),
    path('generate/<int:pk>/select/', views.CMSGenerationJobDetailView.as_view(), name='cms-generate-select'),

    # ── Public (Next.js renderer — no auth) ───────────────────────────────────
    path('public/site/', views.PublicSiteView.as_view(), name='cms-public-site'),
    path('public/pages/<slug:slug>/', views.PublicPageDetailView.as_view(), name='cms-public-page'),
    path('public/blog/', views.PublicBlogListView.as_view(), name='cms-public-blog-list'),
    path('public/blog/<slug:slug>/', views.PublicBlogPostDetailView.as_view(), name='cms-public-blog-detail'),
]
