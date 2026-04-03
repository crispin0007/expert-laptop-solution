/**
 * frontend/src/features/cms/hooks.ts
 * React Query hooks for the CMS module.
 * All mutations invalidate relevant query caches automatically.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { CMS } from '../../api/endpoints'
import type {
  CMSSite, CMSSiteWritePayload,
  CMSPage, CMSPageWritePayload, CMSPageGrapesPayload,
  CMSBlock, CMSBlockWritePayload, CMSBlockReorderPayload,
  CMSBlogPost, CMSBlogPostWritePayload,
  CMSCustomDomain, CMSCustomDomainWritePayload,
  CMSGenerationJob, CMSGenerationStartPayload, CMSDesignSelectPayload,
  CMSInquiry, CMSInquiryUpdatePayload,
  CMSAnalyticsSummary,
} from './types'

// Helper — unwrap ApiResponse envelope
const unwrap = <T>(r: { data: { data: T } | T }): T => {
  const d = (r.data as { data: T }).data ?? (r.data as T)
  return d
}

// ── Site ─────────────────────────────────────────────────────────────────────

export function useCMSSite() {
  return useQuery<CMSSite>({
    queryKey: ['cms', 'site'],
    queryFn: () => apiClient.get(CMS.SITE).then(unwrap<CMSSite>),
  })
}

export function useUpdateCMSSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSSiteWritePayload) =>
      apiClient.patch(CMS.SITE, payload).then(unwrap<CMSSite>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'site'] }),
  })
}

export function usePublishCMSSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (action: 'publish' | 'unpublish') =>
      apiClient.post(CMS.SITE_PUBLISH(action)).then(unwrap<CMSSite>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'site'] }),
  })
}

// ── Pages ─────────────────────────────────────────────────────────────────────

export function useCMSPages() {
  return useQuery<CMSPage[]>({
    queryKey: ['cms', 'pages'],
    queryFn: () =>
      apiClient.get(CMS.PAGES).then(r => {
        const d = unwrap<{ results?: CMSPage[] } | CMSPage[]>(r)
        return Array.isArray(d) ? d : (d as { results?: CMSPage[] }).results ?? []
      }),
  })
}

export function useCMSPage(id: number) {
  return useQuery<CMSPage>({
    queryKey: ['cms', 'page', id],
    queryFn: () => apiClient.get(CMS.PAGE_DETAIL(id)).then(unwrap<CMSPage>),
    enabled: !!id,
  })
}

export function useCreateCMSPage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSPageWritePayload) =>
      apiClient.post(CMS.PAGES, payload).then(unwrap<CMSPage>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'pages'] }),
  })
}

export function useUpdateCMSPage(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<CMSPageWritePayload>) =>
      apiClient.patch(CMS.PAGE_DETAIL(id), payload).then(unwrap<CMSPage>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms', 'pages'] })
      qc.invalidateQueries({ queryKey: ['cms', 'page', id] })
    },
  })
}

export function useDeleteCMSPage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(CMS.PAGE_DETAIL(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'pages'] }),
  })
}

export function usePublishCMSPage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'publish' | 'unpublish' }) =>
      apiClient.post(CMS.PAGE_PUBLISH(id, action)).then(unwrap<CMSPage>),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['cms', 'pages'] })
      qc.invalidateQueries({ queryKey: ['cms', 'page', variables.id] })
    },
  })
}

// Phase 2: GrapeJS visual editor — load / save page grapes state
export function useCMSPageGrapes(pageId: number) {
  return useQuery<CMSPageGrapesPayload>({
    queryKey: ['cms', 'page', pageId, 'grapes'],
    queryFn: () => apiClient.get(CMS.PAGE_GRAPES(pageId)).then(unwrap<CMSPageGrapesPayload>),
    enabled: !!pageId,
  })
}

export function useSaveCMSPageGrapes(pageId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSPageGrapesPayload) =>
      apiClient.put(CMS.PAGE_GRAPES(pageId), payload).then(unwrap<CMSPage>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms', 'pages'] })
      qc.invalidateQueries({ queryKey: ['cms', 'page', pageId] })
      qc.invalidateQueries({ queryKey: ['cms', 'page', pageId, 'grapes'] })
    },
  })
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export function useCMSBlocks(pageId: number) {
  return useQuery<CMSBlock[]>({
    queryKey: ['cms', 'blocks', pageId],
    queryFn: () =>
      apiClient.get(CMS.BLOCKS(pageId)).then(r => {
        const d = unwrap<{ results?: CMSBlock[] } | CMSBlock[]>(r)
        return Array.isArray(d) ? d : (d as { results?: CMSBlock[] }).results ?? []
      }),
    enabled: !!pageId,
  })
}

export function useCreateCMSBlock(pageId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSBlockWritePayload) =>
      apiClient.post(CMS.BLOCKS(pageId), payload).then(unwrap<CMSBlock>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'blocks', pageId] }),
  })
}

export function useUpdateCMSBlock(pageId: number, blockId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<CMSBlockWritePayload>) =>
      apiClient.patch(CMS.BLOCK_DETAIL(pageId, blockId), payload).then(unwrap<CMSBlock>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'blocks', pageId] }),
  })
}

/** Patch any block on this page — pass blockId as part of the mutation payload. */
export function usePatchCMSBlock(pageId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ blockId, data }: { blockId: number; data: Partial<CMSBlockWritePayload> }) =>
      apiClient.patch(CMS.BLOCK_DETAIL(pageId, blockId), data).then(unwrap<CMSBlock>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'blocks', pageId] }),
  })
}

export function useDeleteCMSBlock(pageId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (blockId: number) => apiClient.delete(CMS.BLOCK_DETAIL(pageId, blockId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'blocks', pageId] }),
  })
}

export function useReorderCMSBlocks(pageId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSBlockReorderPayload) =>
      apiClient.post(CMS.BLOCK_REORDER(pageId), payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'blocks', pageId] }),
  })
}

// ── Blog ──────────────────────────────────────────────────────────────────────

export function useCMSBlogPosts() {
  return useQuery<CMSBlogPost[]>({
    queryKey: ['cms', 'blog'],
    queryFn: () =>
      apiClient.get(CMS.BLOG).then(r => {
        const d = unwrap<{ results?: CMSBlogPost[] } | CMSBlogPost[]>(r)
        return Array.isArray(d) ? d : (d as { results?: CMSBlogPost[] }).results ?? []
      }),
  })
}

export function useCMSBlogPost(id: number) {
  return useQuery<CMSBlogPost>({
    queryKey: ['cms', 'blog', id],
    queryFn: () => apiClient.get(CMS.BLOG_POST(id)).then(unwrap<CMSBlogPost>),
    enabled: !!id,
  })
}

export function useCreateCMSBlogPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSBlogPostWritePayload | FormData) =>
      apiClient.post(CMS.BLOG, payload, {
        headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
      }).then(unwrap<CMSBlogPost>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'blog'] }),
  })
}

export function useUpdateCMSBlogPost(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<CMSBlogPostWritePayload> | FormData) =>
      apiClient.patch(CMS.BLOG_POST(id), payload, {
        headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
      }).then(unwrap<CMSBlogPost>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms', 'blog'] })
      qc.invalidateQueries({ queryKey: ['cms', 'blog', id] })
    },
  })
}

export function useDeleteCMSBlogPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(CMS.BLOG_POST(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'blog'] }),
  })
}

export function usePublishCMSBlogPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'publish' | 'unpublish' }) =>
      apiClient.post(CMS.BLOG_PUBLISH(id, action)).then(unwrap<CMSBlogPost>),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['cms', 'blog'] })
      qc.invalidateQueries({ queryKey: ['cms', 'blog', variables.id] })
    },
  })
}

// ── Custom Domain ─────────────────────────────────────────────────────────────

export function useCMSCustomDomain() {
  return useQuery<CMSCustomDomain | null>({
    queryKey: ['cms', 'domain'],
    queryFn: () =>
      apiClient
        .get(CMS.DOMAIN)
        .then(unwrap<CMSCustomDomain>)
        .catch((err) => {
          if (err?.response?.status === 404) return null
          throw err
        }),
  })
}

export function useSetupCMSCustomDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSCustomDomainWritePayload) =>
      apiClient.post(CMS.DOMAIN, payload).then(unwrap<CMSCustomDomain>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'domain'] }),
  })
}

export function useVerifyCMSCustomDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post(`${CMS.DOMAIN}verify/`).then(unwrap<CMSCustomDomain>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'domain'] }),
  })
}

// ── AI Generation ─────────────────────────────────────────────────────────────

export function useCMSGenerationJobs() {
  return useQuery<CMSGenerationJob[]>({
    queryKey: ['cms', 'generate'],
    queryFn: () =>
      apiClient.get(CMS.GENERATE).then(r => {
        const d = unwrap<{ results?: CMSGenerationJob[] } | CMSGenerationJob[]>(r)
        return Array.isArray(d) ? d : (d as { results?: CMSGenerationJob[] }).results ?? []
      }),
  })
}

export function useCMSGenerationJob(id: number) {
  return useQuery<CMSGenerationJob>({
    queryKey: ['cms', 'generate', id],
    queryFn: () => apiClient.get(CMS.GENERATE_DETAIL(id)).then(unwrap<CMSGenerationJob>),
    enabled: !!id,
    // Poll while generating (react-query v5: callback receives Query object)
    refetchInterval: (query) =>
      query.state.data?.status === 'queued' || query.state.data?.status === 'generating' ? 3000 : false,
  })
}

export function useStartCMSGeneration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSGenerationStartPayload) =>
      apiClient.post(CMS.GENERATE, payload).then(unwrap<CMSGenerationJob>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'generate'] }),
  })
}

export function useSelectCMSDesign(jobId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSDesignSelectPayload) =>
      apiClient.post(`${CMS.GENERATE_DETAIL(jobId)}select/`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms', 'generate'] })
      qc.invalidateQueries({ queryKey: ['cms', 'site'] })
      qc.invalidateQueries({ queryKey: ['cms', 'pages'] })
    },
  })
}

// ── Inquiries ─────────────────────────────────────────────────────────────────

export function useCMSInquiries(status?: string) {
  return useQuery<CMSInquiry[]>({
    queryKey: ['cms', 'inquiries', status],
    queryFn: () =>
      apiClient.get(CMS.INQUIRIES, { params: status ? { status } : {} }).then(r => {
        const d = (r.data as { data: { results: CMSInquiry[] } }).data
        return d?.results ?? (d as unknown as CMSInquiry[]) ?? []
      }),
  })
}

export function useCMSInquiry(id: number) {
  return useQuery<CMSInquiry>({
    queryKey: ['cms', 'inquiry', id],
    queryFn: () => apiClient.get(CMS.INQUIRY_DETAIL(id)).then(unwrap<CMSInquiry>),
    enabled: !!id,
  })
}

export function useUpdateCMSInquiry(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CMSInquiryUpdatePayload) =>
      apiClient.patch(CMS.INQUIRY_DETAIL(id), payload).then(unwrap<CMSInquiry>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms', 'inquiries'] })
      qc.invalidateQueries({ queryKey: ['cms', 'inquiry', id] })
    },
  })
}

export function useDeleteCMSInquiry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(CMS.INQUIRY_DETAIL(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'inquiries'] }),
  })
}

export function useConvertCMSInquiry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.post(CMS.INQUIRY_CONVERT(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms', 'inquiries'] }),
  })
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export function useCMSAnalytics(days: number = 30) {
  return useQuery<CMSAnalyticsSummary>({
    queryKey: ['cms', 'analytics', days],
    queryFn: () =>
      apiClient.get(CMS.ANALYTICS, { params: { days } }).then(unwrap<CMSAnalyticsSummary>),
  })
}
