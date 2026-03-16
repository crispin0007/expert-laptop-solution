import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { ModuleGuard, ModuleLockedScreen } from '@/guards/ModuleGuard'
import { useCMSSiteSummary, useCMSNavPages, useCMSBlogList } from '@/features/cms/useCMS'
import { useTenantStore } from '@/store/tenantStore'

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ published }: { published: boolean }) {
  const theme = useTheme()
  return (
    <View style={{
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
      backgroundColor: published ? '#f0fdf4' : '#fef9c3',
      alignSelf: 'flex-start',
    }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: published ? '#166534' : '#713f12' }}>
        {published ? 'Live' : 'Draft'}
      </Text>
    </View>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

function CMSScreenContent() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const tenant = useTenantStore((s) => s.tenant)
  const [activeTab, setActiveTab] = useState<'overview' | 'pages' | 'blog'>('overview')

  const {
    data: site,
    isLoading: siteLoading,
    refetch: refetchSite,
    isRefetching: siteRefetching,
  } = useCMSSiteSummary()

  const {
    data: pages = [],
    isLoading: pagesLoading,
    refetch: refetchPages,
    isRefetching: pagesRefetching,
  } = useCMSNavPages()

  const {
    data: posts = [],
    isLoading: postsLoading,
    refetch: refetchPosts,
    isRefetching: postsRefetching,
  } = useCMSBlogList()

  const isRefetching = siteRefetching || pagesRefetching || postsRefetching

  function refetchAll() {
    refetchSite()
    refetchPages()
    refetchPosts()
  }

  const TABS = [
    { key: 'overview', label: 'Overview', icon: 'globe-outline' as const },
    { key: 'pages', label: 'Pages', icon: 'document-text-outline' as const },
    { key: 'blog', label: 'Blog', icon: 'newspaper-outline' as const },
  ] as const

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>

      {/* ── Header ── */}
      <View style={{
        paddingTop: insets.top + 14,
        paddingHorizontal: 16,
        paddingBottom: 0,
        backgroundColor: theme.primary[600],
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <DrawerToggle />
          <Ionicons name="globe-outline" size={20} color="rgba(255,255,255,0.85)" />
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>
            Website
          </Text>
          {site && (
            <StatusPill published={site.is_published} />
          )}
        </View>

        {/* Tab bar */}
        <View style={{ flexDirection: 'row' }}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: 'center',
                borderBottomWidth: 3,
                borderBottomColor: activeTab === tab.key ? '#fff' : 'transparent',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.55)'}
              />
              <Text style={{
                fontSize: 13,
                fontWeight: '700',
                color: activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.55)',
                letterSpacing: 0.2,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Tab Content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={theme.primary[500]} />
        }
      >

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <>
            {siteLoading ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <ActivityIndicator size="large" color={theme.primary[500]} />
              </View>
            ) : site ? (
              <>
                {/* Site card */}
                <View style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 16,
                  padding: 18,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  elevation: 2,
                  gap: 14,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 48, height: 48, borderRadius: 12,
                      backgroundColor: theme.primary[100],
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name="globe" size={24} color={theme.primary[600]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text }}>{site.site_name}</Text>
                      {site.tagline ? (
                        <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 2 }} numberOfLines={1}>{site.tagline}</Text>
                      ) : null}
                    </View>
                    <StatusPill published={site.is_published} />
                  </View>

                  {/* Visit site */}
                  {site.is_published && tenant?.slug ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`https://${tenant.slug}.mybms.com`)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        backgroundColor: theme.primary[600],
                        borderRadius: 12,
                        paddingVertical: 12,
                      }}
                    >
                      <Ionicons name="open-outline" size={16} color="#fff" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Visit Live Site</Text>
                    </TouchableOpacity>
                  ) : null}

                  {!site.is_published && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      backgroundColor: '#fef9c3', borderRadius: 10, padding: 12,
                    }}>
                      <Ionicons name="information-circle-outline" size={18} color="#713f12" />
                      <Text style={{ fontSize: 13, color: '#713f12', flex: 1, lineHeight: 18 }}>
                        Your website is not published. Use the web dashboard to publish it.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Theme card */}
                <View style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 16,
                  padding: 16,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 4,
                  elevation: 1,
                  gap: 10,
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' }}>Theme</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: site.primary_color || theme.primary[500],
                      borderWidth: 2,
                      borderColor: theme.colors.border,
                    }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>{site.theme_key || 'Default'}</Text>
                      <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{site.font_family || 'System font'}</Text>
                    </View>
                  </View>
                </View>

                {/* Stats row */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: theme.primary[600] }}>{pages.length}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' }}>Pages</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: theme.primary[600] }}>{posts.length}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' }}>Blog Posts</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: site.is_published ? '#16a34a' : '#d97706' }}>
                      {site.is_published ? '●' : '○'}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' }}>Status</Text>
                  </View>
                </View>

                {/* Manage note */}
                <View style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 14,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <Ionicons name="desktop-outline" size={22} color={theme.primary[500]} />
                  <Text style={{ fontSize: 13, color: theme.colors.textMuted, flex: 1, lineHeight: 19 }}>
                    Full content editing is available in the web dashboard. Use this view to monitor your site status and content.
                  </Text>
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
                <Ionicons name="globe-outline" size={48} color={theme.colors.textMuted} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>No site configured</Text>
                <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 22 }}>
                  Set up your website in the web dashboard to see it here.
                </Text>
              </View>
            )}
          </>
        )}

        {/* ── Pages Tab ── */}
        {activeTab === 'pages' && (
          <>
            {pagesLoading ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <ActivityIndicator size="large" color={theme.primary[500]} />
              </View>
            ) : pages.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
                <Ionicons name="document-text-outline" size={48} color={theme.colors.textMuted} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>No pages yet</Text>
                <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' }}>
                  Create pages in the web dashboard.
                </Text>
              </View>
            ) : (
              pages.map((page) => (
                <View
                  key={page.id}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 14,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 3,
                    elevation: 1,
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="document-text-outline" size={18} color={theme.primary[600]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}>{page.title}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>/{page.slug}</Text>
                  </View>
                  <StatusPill published={page.is_published} />
                </View>
              ))
            )}
          </>
        )}

        {/* ── Blog Tab ── */}
        {activeTab === 'blog' && (
          <>
            {postsLoading ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <ActivityIndicator size="large" color={theme.primary[500]} />
              </View>
            ) : posts.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
                <Ionicons name="newspaper-outline" size={48} color={theme.colors.textMuted} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>No blog posts</Text>
                <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' }}>
                  Write blog posts in the web dashboard.
                </Text>
              </View>
            ) : (
              posts.map((post) => (
                <View
                  key={post.id}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 14,
                    padding: 14,
                    gap: 8,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 3,
                    elevation: 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text, flex: 1 }} numberOfLines={2}>{post.title}</Text>
                    <StatusPill published={post.is_published} />
                  </View>
                  {post.excerpt ? (
                    <Text style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 }} numberOfLines={2}>{post.excerpt}</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="person-outline" size={12} color={theme.colors.textMuted} />
                      <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{post.author_name}</Text>
                    </View>
                    {post.published_at ? (
                      <>
                        <Text style={{ fontSize: 12, color: theme.colors.border }}>·</Text>
                        <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
                          {new Date(post.published_at).toLocaleDateString()}
                        </Text>
                      </>
                    ) : null}
                    {post.tags.length > 0 ? (
                      <>
                        <Text style={{ fontSize: 12, color: theme.colors.border }}>·</Text>
                        <Text style={{ fontSize: 12, color: theme.primary[600], fontWeight: '600' }}>
                          {post.tags.slice(0, 2).join(', ')}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </>
        )}

      </ScrollView>
    </View>
  )
}

export default function CMSScreen() {
  return (
    <ModuleGuard module="cms" fallback={<ModuleLockedScreen module="Website Builder" />}>
      <CMSScreenContent />
    </ModuleGuard>
  )
}
