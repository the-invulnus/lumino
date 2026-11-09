import { useT } from "../../lib/i18n"
import { isWebUrl, type PageContext } from "../../lib/workbench/store"
import { NavIcon } from "../IconSidebar"

export function PageReferenceChip({ page, onOpen, onRemove }: {
  page: PageContext
  onOpen?: (page: PageContext) => void
  onRemove?: (page: PageContext) => void
}) {
  const t = useT()
  const title = page.title || page.url
  const content = <><span className="wb-reference-icon" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></svg></span><span className="wb-reference-name">{title}</span></>
  if (onOpen || onRemove) return <span className="wb-reference-chip wb-reference-page" data-reference="page" title={`${title}\n${page.url}`}>
    {onOpen
      ? <button type="button" className="wb-reference-open" aria-label={t("chat.switchPageReference", { title })} onClick={() => onOpen(page)}>{content}</button>
      : <span className="wb-reference-open">{content}</span>}
    {onRemove && <button type="button" className="wb-reference-remove" title={t("chat.removePageReference", { title })} aria-label={t("chat.removePageReference", { title })} onClick={() => onRemove(page)}><span aria-hidden="true">×</span></button>}
  </span>
  return isWebUrl(page.url)
    ? <a className="wb-reference-chip" data-reference="page" href={page.url} target="_blank" rel="noopener noreferrer" title={`${title}\n${page.url}`}>{content}</a>
    : <span className="wb-reference-chip" data-reference="page" title={`${title}\n${page.url}`}>{content}</span>
}

export function ReferenceChips({ pages = [], files = [], onOpenFile, onRemoveFile, className = "" }: {
  pages?: PageContext[]
  files?: string[]
  onOpenFile?: (path: string) => void
  onRemoveFile?: (path: string) => void
  className?: string
}) {
  const t = useT()
  if (!pages.length && !files.length) return null
  return <div className={`wb-reference-chips ${className}`} role="group" aria-label={t("chat.references")}>
    {pages.map(page => <PageReferenceChip key={page.id} page={page}/>)}
    {files.map(path => {
      const content = <><span className="wb-reference-icon" aria-hidden="true"><NavIcon icon="file" /></span><span className="wb-reference-name">{path.split("/").pop()}</span></>
      return <span className="wb-reference-chip wb-reference-file" data-reference="file" title={path} key={path}>
        {onOpenFile
          ? <button type="button" className="wb-reference-open" aria-label={t("chat.previewFileReference", { path })} onClick={() => onOpenFile(path)}>{content}</button>
          : <span className="wb-reference-open">{content}</span>}
        {onRemoveFile && <button type="button" className="wb-reference-remove" title={t("chat.removeFileReference", { path })} aria-label={t("chat.removeFileReference", { path })} onClick={() => onRemoveFile(path)}><span aria-hidden="true">×</span></button>}
      </span>
    })}
  </div>
}
