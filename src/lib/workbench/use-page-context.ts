import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react"
import { getContextTabs, getCurrentContextPage, type PageContext } from "./store"

type Selection = {
  pages: PageContext[]
  pinnedIds: number[]
  currentId: number | null
  suppressedId: number | null
  suppressInitialPage: boolean
}
const emptySelection = (): Selection => ({ pages: [], pinnedIds: [], currentId: null, suppressedId: null, suppressInitialPage: false })

/** Follow the active tab while retaining pages explicitly added through the picker. */
export function usePageContext() {
  const [pages, renderPages] = useState<PageContext[]>([])
  const selection = useRef<Selection>(emptySelection())
  const saved = useRef<Record<string, Selection>>({})
  const revision = useRef(0)
  const mounted = useRef(false)
  const apply = useCallback((next: Selection) => {
    selection.current = next
    renderPages(next.pages)
  }, [])
  const refresh = useCallback(async (followTabSwitch = false) => {
    const version = ++revision.current
    const previous = selection.current
    try {
      const [current, available] = await Promise.all([getCurrentContextPage(), getContextTabs()])
      const pinned = previous.pinnedIds.flatMap(id => {
        const page = available.find(tab => tab.id === id)
        return page ? [page] : []
      })
      // Removing the current chip hides it only while that tab remains active.
      // A different active tab is automatically attached on the next refresh.
      const suppressedId = previous.suppressInitialPage && !followTabSwitch
        ? current?.id ?? null
        : current?.id === previous.currentId ? previous.suppressedId : null
      const active = current && current.id !== suppressedId ? [current] : []
      const next = [...active, ...pinned.filter(page => !active.some(tab => tab.id === page.id))]
      if (mounted.current && version === revision.current) apply({
        pages: next,
        pinnedIds: pinned.map(page => page.id),
        currentId: current?.id ?? null,
        suppressedId,
        suppressInitialPage: false
      })
    } catch { /* Keep the visible selection if the browser temporarily cannot be queried. */ }
  }, [apply])
  const setPages = useCallback((update: SetStateAction<PageContext[]>) => {
    ++revision.current
    const next = typeof update === "function" ? update(selection.current.pages) : update
    const previous = selection.current
    const unique = next.filter((page, index) => next.findIndex(p => p.id === page.id) === index)
    apply({
      pages: unique,
      pinnedIds: unique.filter(page => page.id !== previous.currentId || previous.pinnedIds.includes(page.id)).map(page => page.id),
      currentId: previous.currentId,
      suppressedId: unique.some(page => page.id === previous.currentId) ? null : previous.currentId,
      suppressInitialPage: false
    })
  }, [apply])
  const remember = useCallback((key: string) => {
    saved.current[key] = { ...selection.current, pages: [...selection.current.pages], pinnedIds: [...selection.current.pinnedIds] }
  }, [])
  const restore = useCallback((key: string) => {
    ++revision.current
    apply(saved.current[key] ?? emptySelection())
    void refresh()
  }, [apply, refresh])
  const reset = useCallback(({ includeCurrentPage = true }: { includeCurrentPage?: boolean } = {}) => {
    ++revision.current
    apply({ ...emptySelection(), suppressInitialPage: !includeCurrentPage })
    void refresh()
  }, [apply, refresh])
  useEffect(() => {
    mounted.current = true
    // A real tab switch resumes automatic references, even while reset's lookup is pending.
    const activated = () => { void refresh(true) }
    const removed = () => { void refresh() }
    const updated = (_id: number, change: chrome.tabs.TabChangeInfo) => {
      if (change.url !== undefined || change.title !== undefined || change.status === "complete") void refresh()
    }
    chrome.tabs.onActivated.addListener(activated)
    chrome.tabs.onUpdated.addListener(updated)
    chrome.tabs.onRemoved.addListener(removed)
    void refresh()
    return () => {
      mounted.current = false
      ++revision.current
      chrome.tabs.onActivated.removeListener(activated)
      chrome.tabs.onUpdated.removeListener(updated)
      chrome.tabs.onRemoved.removeListener(removed)
    }
  }, [refresh])
  return { pages, setPages, remember, restore, reset }
}
