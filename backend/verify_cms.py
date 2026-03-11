import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()
from tenants.models import Tenant
from cms.models import CMSSite, CMSPage, CMSBlock, CMSBlogPost
t = Tenant.objects.get(slug='pro')
site = CMSSite.objects.get(tenant=t)
print('Site:', site.site_name, '| published:', site.is_published)
print('Pages:', CMSPage.objects.filter(site=site).count())
print('Blocks:', CMSBlock.objects.filter(page__site=site).count())
print('Blog posts:', CMSBlogPost.objects.filter(site=site).count())
for p in CMSPage.objects.filter(site=site).order_by('sort_order'):
    bc = CMSBlock.objects.filter(page=p).count()
    types = list(CMSBlock.objects.filter(page=p).values_list('block_type', flat=True))
    print(' ', p.page_type.ljust(12), p.title.ljust(20), 'blocks:', bc, types)
