import { listWorkspaceDir, readWorkspaceFile, writeWorkspaceFile } from "../fs/workspace"
import { getLocale } from "../i18n"

export type SavedSource = { id: string; title: string; url: string; text: string; kind: "selection" | "page" | "link"; createdAt: number }
const SOURCE_PREFIX = "lumino_source:"
const MIGRATED_PREFIX = "lumino_source_file:"
const FAVORITE_LOCK = "lumino.workspace.favorite"

function safeName(value: string): string {
  return Array.from(value.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_").replace(/\s+/g, " ").trim()).slice(0, 60).join("") || "Untitled"
}

const markdownText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_{}\[\]#])/g, "\\$1")

export function sourceMarkdown(source: SavedSource): string {
  const labels = getLocale() === "zh"
    ? { source: "来源", saved: "收藏时间", type: "类型", selection: "选中摘录", page: "网页摘录", link: "网页链接" }
    : { source: "Source", saved: "Saved", type: "Type", selection: "Selected excerpt", page: "Page excerpt", link: "Page link" }
  const kind = labels[source.kind] || labels.link
  const url = /^https?:\/\//i.test(source.url) ? source.url.replace(/[<>\s]/g, char => encodeURIComponent(char)) : ""
  return `# ${markdownText(source.title)}\n\n${labels.source}: ${url ? `<${url}>` : markdownText(source.url)}\n\n${labels.saved}: ${new Date(source.createdAt).toISOString()}\n\n${labels.type}: ${kind}\n\n---\n\n${markdownText(source.text)}\n`
}

/** Call under the favorite lock; collisions must never overwrite another file. */
async function writeFavorite(stem: string, content: string, reuseIdentical = false): Promise<string> {
  const entries = new Map((await listWorkspaceDir("favorite")).map(entry => [entry.name, entry.kind]))
  for (let suffix = 1; ; suffix++) {
    const name = `${stem}${suffix === 1 ? "" : ` (${suffix})`}.md`
    const path = `favorite/${name}`
    if (entries.has(name)) {
      // A prior migration may have written its file before the storage marker failed.
      if (reuseIdentical && entries.get(name) === "file" && await readWorkspaceFile(path) === content) return path
      continue
    }
    await writeWorkspaceFile(path, content)
    return path
  }
}

export async function saveSource(source: SavedSource): Promise<string> {
  return navigator.locks.request(FAVORITE_LOCK, () => writeFavorite(safeName(source.title), sourceMarkdown(source)))
}

export async function saveFavoriteAnswer(title: string, content: string): Promise<string> {
  return navigator.locks.request(FAVORITE_LOCK, () => writeFavorite(safeName(title), `# ${markdownText(title)}\n\n${content}\n`))
}

/** Keep old records as backups; a durable marker prevents deleted favorites reappearing. */
export async function migrateLegacySources(): Promise<void> {
  await navigator.locks.request(FAVORITE_LOCK, async () => {
    const records = await chrome.storage.local.get()
    for (const [key, value] of Object.entries(records)) {
      if (!key.startsWith(SOURCE_PREFIX)) continue
      const marker = MIGRATED_PREFIX + key.slice(SOURCE_PREFIX.length)
      if (records[marker]) continue
      const source = value as SavedSource
      if (!source || typeof source.id !== "string" || typeof source.title !== "string" || typeof source.url !== "string" || typeof source.text !== "string" || !Number.isFinite(source.createdAt)) continue
      const stem = safeName(source.title)
      const path = await writeFavorite(stem, sourceMarkdown(source), true)
      await chrome.storage.local.set({ [marker]: { path } })
    }
  })
}
