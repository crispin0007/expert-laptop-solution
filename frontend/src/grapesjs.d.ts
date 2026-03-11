/**
 * Type shims for GrapeJS packages that don't ship @types.
 * Placed here so TypeScript doesn't error on dynamic imports.
 */
declare module 'grapesjs' {
  interface EditorConfig {
    container: HTMLElement | string
    height?: string
    width?: string
    storageManager?: boolean | object
    undoManager?: object
    plugins?: unknown[]
    pluginsOpts?: Record<string, object>
    styleManager?: object
    blockManager?: object
    layerManager?: object
    canvas?: object
  }

  interface Editor {
    getHtml: () => string
    getCss: (opts?: { avoidProtected?: boolean }) => string
    getProjectData: () => Record<string, unknown>
    loadProjectData: (data: Record<string, unknown>) => void
    setComponents: (html: string) => void
    destroy: () => void
    on: (event: string, cb: () => void) => void
  }

  export function init(config: EditorConfig): Editor
  const _default: { init: typeof init }
  export default _default
}

declare module 'grapesjs-blocks-basic' {
  const plugin: unknown
  export default plugin
}

declare module 'grapesjs-preset-webpage' {
  const plugin: unknown
  export default plugin
}
