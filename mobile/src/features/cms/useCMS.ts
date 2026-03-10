/**
 * mobile/src/features/cms/useCMS.ts
 * React Query hooks for the CMS module — mobile-optimised.
 *
 * Focus: read-heavy (preview site, pages, blog).
 * Write operations (editing content) are handled in the web dashboard.
 *
 * Phase 1: Authenticated hooks (site info, blog list for staff).
 * Phase 2: Add offline caching, public preview screen.
 */
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { CMS } from '@/api/endpoints'

// ── Types (minimal — mirrors backend CMS serializers) ─────────────────────────

export interface CMSSiteSummary {
  id: number
  site_name: string
  tagline: string
  logo: string | null
  is_published: boolean
  theme_key: string
  primary_color: string
  secondary_color: string
  font_family: string
  published_at: string | null
}

export interface CMSPageSummary {
  id: number
  title: string
  slug: string
  page_type: string
  sort_order: number
  is_published: boolean
  show_in_nav: boolean
}

export interface CMSBlogSummary {
  id: number
  title: string
  slug: string
  excerpt: string
  cover_image: string | null
  tags: string[]
  author_name: string
  is_published: boolean
  published_at: string | null
}

// ── Helper ────────────────────────────────────────────────────────────────────

const unwrap = <T>(r: { data: { data: T } | T }): T => {
  const d = (r.data as { data: T }).data ?? (r.data as T)
  return d
}

const toArray = <T>(d: { results?: T[] } | T[]): T[] =>
  Array.isArray(d) ? d : (d as { results?: T[] }).results ?? []

// ── Site ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the tenant's CMS site summary.
 * Useful for showing a "Your Website" card on the dashboard.
 */
export function useCMSSiteSummary() {
  return useQuery<CMSSiteSummary>({
    queryKey: ['cms', 'site'],
    queryFn: () => apiClient.get(CMS.SITE).then(unwrap<CMSSiteSummary>),
    staleTime: 60_000, // 1 min — site settings don't change often
  })
}

// ── Pages ─────────────────────────────────────────────────────────────────────

/**
 * Fetch published nav pages for mobile site preview.
 */
export function useCMSNavPages() {
  return useQuery<CMSPageSummary[]>({
    queryKey: ['cms', 'pages'],
    queryFn: () =>
      apiClient
        .get(CMS.PAGES, { params: { is_published: true, show_in_nav: true } })
        .then(r => toArray<CMSPageSummary>(unwrap(r))),
    staleTime: 60_000,
  })
}

// ── Blog ──────────────────────────────────────────────────────────────────────

/**
 * Fetch published blog posts (for staff to review from mobile).
 */
export function useCMSBlogList() {
  return useQuery<CMSBlogSummary[]>({
    queryKey: ['cms', 'blog'],
    queryFn: () =>
      apiClient
        .get(CMS.BLOG, { params: { is_published: true } })
        .then(r => toArray<CMSBlogSummary>(unwrap(r))),
    staleTime: 30_000,
  })
}

// ── Public (no auth — for preview screens) ────────────────────────────────────

/**
 * Fetch the public site info by subdomain.
 * Does NOT require authentication — safe for public preview screens.
 */
export function usePublicSite(subdomain: string) {
  return useQuery({
    queryKey: ['cms', 'public', subdomain, 'site'],
    queryFn: () => apiClient.get(CMS.PUBLIC_SITE(subdomain)).then(unwrap),
    enabled: !!subdomain,
    staleTime: 120_000,
  })
}

/**
 * Fetch public blog posts for a given subdomain.
 */
export function usePublicBlog(subdomain: string) {
  return useQuery({
    queryKey: ['cms', 'public', subdomain, 'blog'],
    queryFn: () =>
      apiClient
        .get(CMS.PUBLIC_BLOG(subdomain))
        .then(r => toArray(unwrap(r))),
    enabled: !!subdomain,
    staleTime: 60_000,
  })
}
