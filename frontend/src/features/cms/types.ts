/**
 * frontend/src/features/cms/types.ts
 * TypeScript interfaces mirroring the backend CMS serializers.
 */

// ── Site ─────────────────────────────────────────────────────────────────────

export interface CMSSite {
  id: number
  site_name: string
  tagline: string
  logo: string | null
  favicon: string | null
  theme_key: string
  primary_color: string
  secondary_color: string
  font_family: string
  default_meta_title: string
  default_meta_description: string
  default_og_image: string | null
  custom_head_script: string
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface CMSSiteWritePayload {
  site_name?: string
  tagline?: string
  logo?: string | null
  favicon?: string | null
  theme_key?: string
  primary_color?: string
  secondary_color?: string
  font_family?: string
  default_meta_title?: string
  default_meta_description?: string
  default_og_image?: string | null
  custom_head_script?: string
}

// ── Pages ─────────────────────────────────────────────────────────────────────

export type PageType = 'home' | 'standard' | 'contact' | 'blog_index' | 'landing'

export interface CMSPage {
  id: number
  title: string
  slug: string
  page_type: PageType
  sort_order: number
  show_in_nav: boolean
  meta_title: string
  meta_description: string
  og_image: string | null
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface CMSPageWritePayload {
  title: string
  slug?: string
  page_type?: PageType
  sort_order?: number
  show_in_nav?: boolean
  meta_title?: string
  meta_description?: string
  og_image?: string | null
  is_published?: boolean
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export type BlockType =
  | 'hero' | 'text' | 'services' | 'gallery' | 'testimonials'
  | 'cta' | 'contact_form' | 'pricing' | 'team' | 'faq' | 'html' | 'video' | 'stats'

export interface CMSBlock {
  id: number
  page: number
  block_type: BlockType
  sort_order: number
  is_visible: boolean
  content: Record<string, unknown>
  raw_html: string
  created_at: string
  updated_at: string
}

export interface CMSBlockWritePayload {
  block_type: BlockType
  sort_order?: number
  is_visible?: boolean
  content?: Record<string, unknown>
  raw_html?: string
}

export interface CMSBlockReorderPayload {
  ordered_ids: number[]
}

// ── Blog ──────────────────────────────────────────────────────────────────────

export interface CMSBlogPost {
  id: number
  site: number
  title: string
  slug: string
  excerpt: string
  body: string
  cover_image: string | null
  tags: string[]
  author_name: string
  author_image: string | null
  is_published: boolean
  published_at: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface CMSBlogPostWritePayload {
  title: string
  slug?: string
  excerpt?: string
  body?: string
  cover_image?: string | null
  tags?: string[]
  author_name?: string
  author_image?: string | null
  is_published?: boolean
}

// ── Custom Domain ─────────────────────────────────────────────────────────────

export interface CMSCustomDomain {
  id: number
  site: number
  domain: string
  is_verified: boolean
  txt_record: string
  ssl_status: 'pending' | 'active' | 'failed'
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface CMSCustomDomainWritePayload {
  domain: string
}

// ── AI Generation ─────────────────────────────────────────────────────────────

export type GenerationStatus = 'queued' | 'generating' | 'completed' | 'failed'

export interface DesignOption {
  theme: {
    theme_key: string
    primary_color: string
    secondary_color: string
    font_family: string
  }
  name: string
  description: string
  pages: unknown[]
}

export interface CMSGenerationJob {
  id: number
  site: number
  prompt: string
  status: GenerationStatus
  design_options: DesignOption[]
  selected_design_index: number | null
  generated_at: string | null
  failure_reason: string | null
  created_at: string
}

export interface CMSGenerationStartPayload {
  prompt: string
}

export interface CMSDesignSelectPayload {
  design_index: number
  apply_to_site: boolean
}
