import { useCallback, useRef, useState, type SetStateAction } from "react"

/** File attachments belong to a draft, independently of automatic browser tab selection. */
export function useFileContext() {
  const [files, renderFiles] = useState<string[]>([])
  const current = useRef<string[]>([])
  const saved = useRef<Record<string, string[]>>({})
  const setFiles = useCallback((update: SetStateAction<string[]>) => {
    const next = typeof update === "function" ? update(current.current) : update
    current.current = [...new Set(next)].filter(Boolean)
    renderFiles(current.current)
  }, [])
  const remember = useCallback((key: string) => { saved.current[key] = [...current.current] }, [])
  const restore = useCallback((key: string) => { setFiles(saved.current[key] ?? []) }, [setFiles])
  const reset = useCallback(() => { setFiles([]) }, [setFiles])
  const appendSaved = useCallback((key: string, paths: string[]) => {
    saved.current[key] = [...new Set([...(saved.current[key] ?? []), ...paths])]
  }, [])
  const removePath = useCallback((path: string, recursive = false) => {
    const keep = (file: string) => file !== path && !(recursive && file.startsWith(path + "/"))
    setFiles(prev => prev.filter(keep))
    for (const key of Object.keys(saved.current)) saved.current[key] = saved.current[key].filter(keep)
  }, [setFiles])
  return { files, setFiles, remember, restore, reset, appendSaved, removePath }
}
