// ============================================================
// 书签变更监听 — Background 端监听 chrome.bookmarks.* 事件
// ============================================================

import type { BookmarkChangeRecord } from "./types"
import { getCollectionConfig } from "./collection-config"
import { appendBookmarkChange } from "./memory-idb"
import { formatDateKey } from "./collection-config"

/**
 * 生成书签变更事件 ID。
 */
function generateBookmarkEventId(): string {
  return `bm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 注册书签变更监听。
 */
export function setupBookmarkWatchers(): void {
  if (typeof chrome === "undefined" || !chrome.bookmarks) {
    console.warn("[Lumino] chrome.bookmarks API 不可用")
    return
  }

  chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    getCollectionConfig().then((cfg) => {
      if (!cfg.enableBookmarkChanges) return

      const now = Date.now()
      const event: BookmarkChangeRecord = {
        id: generateBookmarkEventId(),
        action: "added",
        timestamp: now,
        dateKey: formatDateKey(now),
        bookmarkId: id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index
      }

      console.log("[Lumino] 书签新增:", bookmark.title, bookmark.url)
      appendBookmarkChange(event).catch((err) => {
        console.warn("[Lumino] 书签新增事件写入失败", err)
      })
    })
  })

  chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    getCollectionConfig().then((cfg) => {
      if (!cfg.enableBookmarkChanges) return

      const now = Date.now()
      const event: BookmarkChangeRecord = {
        id: generateBookmarkEventId(),
        action: "removed",
        timestamp: now,
        dateKey: formatDateKey(now),
        bookmarkId: id,
        title: removeInfo.node.title ?? "",
        url: (removeInfo.node as chrome.bookmarks.BookmarkTreeNode).url,
        parentId: removeInfo.parentId,
        index: removeInfo.index
      }

      console.log("[Lumino] 书签删除:", removeInfo.node.title)
      appendBookmarkChange(event).catch((err) => {
        console.warn("[Lumino] 书签删除事件写入失败", err)
      })
    })
  })

  chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
    getCollectionConfig().then((cfg) => {
      if (!cfg.enableBookmarkChanges) return

      const now = Date.now()
      const event: BookmarkChangeRecord = {
        id: generateBookmarkEventId(),
        action: "changed",
        timestamp: now,
        dateKey: formatDateKey(now),
        bookmarkId: id,
        title: changeInfo.title ?? "",
        url: changeInfo.url
      }

      console.log("[Lumino] 书签变更:", changeInfo.title)
      appendBookmarkChange(event).catch((err) => {
        console.warn("[Lumino] 书签变更事件写入失败", err)
      })
    })
  })
}
