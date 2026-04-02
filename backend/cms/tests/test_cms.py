"""
cms/tests/test_cms.py
======================
Unit and integration tests for the CMS module.

Run inside Docker:
    docker exec nexus_bms-web-1 python -m pytest cms/tests/test_cms.py -v
"""
import pytest
from decimal import Decimal
from unittest.mock import patch

from django.test import override_settings

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership
from cms.models import CMSSite, CMSPage, CMSBlogPost, CMSInquiry, CMSPageView
from cms import services


# ─── Fixtures ─────────────────────────────────────────────────────────────────

def _plan():
    return Plan.objects.get_or_create(
        slug='basic-cms',
        defaults={'name': 'Basic CMS', 'description': 'CMS test plan'},
    )[0]


def _tenant(slug='cmstest'):
    return Tenant.objects.create(
        name=f'CMS Tenant {slug}',
        slug=slug,
        plan=_plan(),
        is_active=True,
        coin_to_money_rate=Decimal('10.00'),
        vat_enabled=False,
    )


def _user(email, password='Pass1234!'):
    return User.objects.create_user(
        username=email.replace('@', '_').replace('.', '_'),
        email=email,
        password=password,
    )


def _member(user, tenant, role='admin', is_admin=False):
    return TenantMembership.objects.create(
        user=user, tenant=tenant, role=role,
        is_active=True, is_admin=is_admin,
    )


# ─── CMSSite ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCMSSite:
    def test_get_or_create_site_creates_once(self):
        tenant = _tenant('site-create')
        site1, _ = services.get_or_create_site(tenant)
        site2, _ = services.get_or_create_site(tenant)
        assert site1.pk == site2.pk

    def test_get_or_create_site_sets_tenant(self):
        tenant = _tenant('site-tenant')
        site, _ = services.get_or_create_site(tenant)
        assert site.tenant_id == tenant.pk

    def test_update_site_settings(self):
        tenant = _tenant('site-update')
        user = _user('siteupdate@test.com')
        site, _ = services.get_or_create_site(tenant)
        services.update_site_settings(
            site,
            {'site_name': 'Acme', 'primary_color': '#FF0000'},
            user=user,
        )
        site.refresh_from_db()
        assert site.site_name == 'Acme'
        assert site.primary_color == '#FF0000'

    def test_publish_unpublish_site(self):
        tenant = _tenant('site-publish')
        user = _user('sitepublish@test.com')
        site, _ = services.get_or_create_site(tenant)
        services.publish_site(site, user)
        site.refresh_from_db()
        assert site.is_published is True
        services.unpublish_site(site, user)
        site.refresh_from_db()
        assert site.is_published is False

    def test_nav_fields_stored_as_json(self):
        tenant = _tenant('site-nav')
        user = _user('sitenav@test.com')
        site, _ = services.get_or_create_site(tenant)
        nav = [{'label': 'Home', 'url': '/', 'open_new_tab': False}]
        services.update_site_settings(site, {'header_nav': nav}, user=user)
        site.refresh_from_db()
        assert site.header_nav == nav

    def test_announcement_fields_stored(self):
        tenant = _tenant('site-ann')
        user = _user('siteann@test.com')
        site, _ = services.get_or_create_site(tenant)
        services.update_site_settings(site, {
            'announcement_text': 'Free delivery!',
            'announcement_active': True,
            'announcement_color': '#10B981',
        }, user=user)
        site.refresh_from_db()
        assert site.announcement_text == 'Free delivery!'
        assert site.announcement_active is True
        assert site.announcement_color == '#10B981'


# ─── CMS Pages ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCMSPage:
    def test_create_page(self):
        tenant = _tenant('page-create')
        user = _user('pagecreate@test.com')
        site, _ = services.get_or_create_site(tenant)
        page = services.create_page(site, {
            'title': 'About Us',
            'slug': 'about',
            'page_type': 'standard',
        }, user=user)
        assert page.site_id == site.pk
        assert page.title == 'About Us'
        assert page.slug == 'about'
        assert page.is_published is False

    def test_publish_page(self):
        tenant = _tenant('page-pub')
        user = _user('pagepub@test.com')
        site, _ = services.get_or_create_site(tenant)
        page = services.create_page(site, {'title': 'Services', 'slug': 'services', 'page_type': 'standard'}, user=user)
        services.publish_page(page, user)
        page.refresh_from_db()
        assert page.is_published is True
        assert page.published_at is not None

    def test_delete_page_soft(self):
        tenant = _tenant('page-del')
        user = _user('pagedel@test.com')
        site, _ = services.get_or_create_site(tenant)
        page = services.create_page(site, {'title': 'Old', 'slug': 'old', 'page_type': 'standard'}, user=user)
        services.delete_page(page, user)
        assert CMSPage.objects.filter(pk=page.pk).exists()  # soft delete keeps row


# ─── CMS Blog Posts ───────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCMSBlogPost:
    def test_create_blog_post(self):
        tenant = _tenant('blog-create')
        user = _user('blogcreate@test.com')
        _member(user, tenant)
        site, _ = services.get_or_create_site(tenant)
        post = services.create_blog_post(site, {
            'title': 'First Post',
            'slug': 'first-post',
            'body': 'Hello world',
        }, user=user)
        assert post.site_id == site.pk
        assert post.is_published is False

    def test_publish_blog_post(self):
        tenant = _tenant('blog-pub')
        user = _user('blogpub@test.com')
        _member(user, tenant)
        site, _ = services.get_or_create_site(tenant)
        post = services.create_blog_post(site, {
            'title': 'Published Post',
            'slug': 'published-post',
            'body': 'Content here',
        }, user=user)
        # publish_blog_post is done via update_blog_post with is_published=True
        services.update_blog_post(post, {'is_published': True}, user=user)
        post.refresh_from_db()
        assert post.is_published is True


# ─── CMSInquiry ───────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCMSInquiry:
    def _site(self, slug):
        tenant = _tenant(slug)
        site, _ = services.get_or_create_site(tenant)
        return site, tenant

    def test_submit_inquiry_creates_record(self):
        site, _ = self._site('inq-create')
        with patch('cms.services._notify_inquiry'):
            inq = services.submit_inquiry(site, {
                'name': 'John Doe',
                'email': 'john@example.com',
                'message': 'I need help',
            })
        assert inq.pk is not None
        assert inq.name == 'John Doe'
        assert inq.status == CMSInquiry.STATUS_NEW

    def test_submit_inquiry_stores_ip(self):
        site, _ = self._site('inq-ip')
        with patch('cms.services._notify_inquiry'):
            inq = services.submit_inquiry(
                site,
                {'name': 'A', 'email': 'a@b.com', 'message': 'Hi'},
                ip='192.168.1.100',
            )
        assert inq.submitter_ip == '192.168.1.100'

    def test_mark_inquiry_read(self):
        site, _ = self._site('inq-read')
        with patch('cms.services._notify_inquiry'):
            inq = services.submit_inquiry(site, {'name': 'B', 'email': 'b@b.com', 'message': 'Hi'})
        assert inq.status == CMSInquiry.STATUS_NEW
        services.mark_inquiry_read(inq)
        inq.refresh_from_db()
        assert inq.status == CMSInquiry.STATUS_READ

    def test_mark_read_idempotent(self):
        site, _ = self._site('inq-idem')
        with patch('cms.services._notify_inquiry'):
            inq = services.submit_inquiry(site, {'name': 'C', 'email': 'c@c.com', 'message': 'Hi'})
        inq.status = CMSInquiry.STATUS_REPLIED
        inq.save(update_fields=['status'])
        services.mark_inquiry_read(inq)
        inq.refresh_from_db()
        assert inq.status == CMSInquiry.STATUS_REPLIED  # not overwritten

    def test_update_inquiry_status(self):
        site, _ = self._site('inq-update')
        with patch('cms.services._notify_inquiry'):
            inq = services.submit_inquiry(site, {'name': 'D', 'email': 'd@d.com', 'message': 'Hi'})
        services.update_inquiry(inq, {'status': 'replied', 'reply_note': 'Called back'})
        inq.refresh_from_db()
        assert inq.status == 'replied'
        assert inq.reply_note == 'Called back'

    def test_update_inquiry_invalid_status_raises(self):
        site, _ = self._site('inq-invalid')
        with patch('cms.services._notify_inquiry'):
            inq = services.submit_inquiry(site, {'name': 'E', 'email': 'e@e.com', 'message': 'Hi'})
        with pytest.raises(ValueError):
            services.update_inquiry(inq, {'status': 'nonexistent'})

    def test_convert_inquiry_to_customer(self):
        site, tenant = self._site('inq-convert')
        user = _user('inqconv@test.com')
        _member(user, tenant, is_admin=True)
        with patch('cms.services._notify_inquiry'):
            inq = services.submit_inquiry(site, {
                'name': 'Sarah Smith',
                'email': 'sarah@example.com',
                'phone': '9800000001',
                'message': 'Looking for support',
            })
        inq2, customer = services.convert_inquiry_to_customer(inq, user)
        assert inq2.status == CMSInquiry.STATUS_CONVERTED
        assert inq2.converted_customer_id == customer.pk
        assert customer.name == 'Sarah Smith'
        assert customer.email == 'sarah@example.com'

    def test_convert_inquiry_idempotent(self):
        site, tenant = self._site('inq-conv-idem')
        user = _user('inqconvidem@test.com')
        with patch('cms.services._notify_inquiry'):
            inq = services.submit_inquiry(site, {'name': 'F', 'email': 'f@f.com', 'message': 'Hi'})
        inq2, c1 = services.convert_inquiry_to_customer(inq, user)
        inq3, c2 = services.convert_inquiry_to_customer(inq2, user)
        assert c1.pk == c2.pk  # same customer returned

    def test_delete_inquiry_soft(self):
        site, _ = self._site('inq-del')
        with patch('cms.services._notify_inquiry'):
            inq = services.submit_inquiry(site, {'name': 'G', 'email': 'g@g.com', 'message': 'Hi'})
        services.delete_inquiry(inq)
        inq.refresh_from_db()
        assert inq.is_deleted is True

    def test_list_inquiries_excludes_deleted(self):
        site, _ = self._site('inq-list')
        with patch('cms.services._notify_inquiry'):
            inq1 = services.submit_inquiry(site, {'name': 'H', 'email': 'h@h.com', 'message': 'H'})
            inq2 = services.submit_inquiry(site, {'name': 'I', 'email': 'i@i.com', 'message': 'I'})
        services.delete_inquiry(inq1)
        listed = list(services.list_inquiries(site))
        pks = [i.pk for i in listed]
        assert inq1.pk not in pks
        assert inq2.pk in pks

    def test_list_inquiries_filters_by_status(self):
        site, _ = self._site('inq-filter')
        with patch('cms.services._notify_inquiry'):
            inq1 = services.submit_inquiry(site, {'name': 'J', 'email': 'j@j.com', 'message': 'J'})
            inq2 = services.submit_inquiry(site, {'name': 'K', 'email': 'k@k.com', 'message': 'K'})
        services.update_inquiry(inq2, {'status': 'archived'})
        new_only = list(services.list_inquiries(site, status='new'))
        assert inq1.pk in [i.pk for i in new_only]
        assert inq2.pk not in [i.pk for i in new_only]


# ─── Analytics ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCMSAnalytics:
    def test_record_page_view_creates_row(self):
        tenant = _tenant('analytics-create')
        site, _ = services.get_or_create_site(tenant)
        services.record_page_view(site, 'about')
        from django.utils.timezone import now
        today = now().date()
        pv = CMSPageView.objects.get(site=site, page_slug='about', view_date=today)
        assert pv.view_count == 1

    def test_record_page_view_increments(self):
        tenant = _tenant('analytics-incr')
        site, _ = services.get_or_create_site(tenant)
        services.record_page_view(site, 'home')
        services.record_page_view(site, 'home')
        services.record_page_view(site, 'home')
        from django.utils.timezone import now
        today = now().date()
        pv = CMSPageView.objects.get(site=site, page_slug='home', view_date=today)
        assert pv.view_count == 3

    def test_analytics_summary_counts_inquiries(self):
        tenant = _tenant('analytics-inq')
        site, _ = services.get_or_create_site(tenant)
        with patch('cms.services._notify_inquiry'):
            services.submit_inquiry(site, {'name': 'L', 'email': 'l@l.com', 'message': 'L'})
            services.submit_inquiry(site, {'name': 'M', 'email': 'm@m.com', 'message': 'M'})
        summary = services.get_analytics_summary(site, days=30)
        assert summary['total_inquiries'] == 2
        assert summary['new_inquiries'] == 2

    def test_analytics_summary_structure(self):
        tenant = _tenant('analytics-struct')
        site, _ = services.get_or_create_site(tenant)
        services.record_page_view(site, '')
        services.record_page_view(site, 'services')
        summary = services.get_analytics_summary(site, days=30)
        assert 'total_views' in summary
        assert 'views_by_day' in summary
        assert 'top_pages' in summary
        assert 'total_inquiries' in summary
        assert 'new_inquiries' in summary
        assert summary['total_views'] == 2


# ─── Sitemap + Robots ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestSitemapRobots:
    def test_sitemap_unpublished_empty(self):
        tenant = _tenant('sitemap-unpub')
        site, _ = services.get_or_create_site(tenant)
        xml = services.generate_sitemap_xml(site, 'https://example.com')
        assert '<url>' in xml  # at least home
        assert 'xmlns=' in xml

    def test_sitemap_includes_published_pages(self):
        tenant = _tenant('sitemap-pages')
        user = _user('sitemap@test.com')
        site, _ = services.get_or_create_site(tenant)
        page = services.create_page(site, {
            'title': 'Contact',
            'slug': 'contact',
            'page_type': 'contact',
        }, user=user)
        services.publish_page(page, user)
        xml = services.generate_sitemap_xml(site, 'https://example.com')
        assert '/contact' in xml

    def test_robots_txt_disallow_unpublished(self):
        tenant = _tenant('robots-unpub')
        site, _ = services.get_or_create_site(tenant)
        txt = services.generate_robots_txt(site, 'https://example.com')
        assert 'Disallow: /' in txt
        assert 'Allow: /' not in txt

    def test_robots_txt_allow_published(self):
        tenant = _tenant('robots-pub')
        user = _user('robotspub@test.com')
        site, _ = services.get_or_create_site(tenant)
        services.publish_site(site, user)
        txt = services.generate_robots_txt(site, 'https://example.com')
        assert 'Allow: /' in txt
        assert 'Sitemap: https://example.com/sitemap.xml' in txt
