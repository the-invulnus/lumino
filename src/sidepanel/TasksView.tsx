import { useEffect, useState } from "react"
import { loadCustomAgents, type AgentConfig } from "../lib/chat/mode-config"
import { listTasks, removeTask, saveTask, type SavedTask } from "../lib/workbench/store"
import { starters, useW } from "../lib/workbench/i18n"
import { NavIcon } from "./IconSidebar"
import { useConfirmDialog } from "./components/ConfirmDialog"

export function TasksView({ visible, seed, onUse }: { visible: boolean; seed?: { id: number; prompt: string }; onUse: (prompt: string, tabs?: boolean) => void }) {
  const w = useW()
  const { confirm, dialog } = useConfirmDialog(visible)
  const [tasks, setTasks] = useState<SavedTask[]>([])
  const [legacy, setLegacy] = useState<AgentConfig[]>([])
  const [form, setForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    Promise.all([listTasks(), loadCustomAgents()]).then(([saved, agents]) => { if (!cancelled) { setTasks(saved); setLegacy(agents) } }).catch(() => { if (!cancelled) setError(w("loadError")) })
    return () => { cancelled = true }
  }, [visible, version])
  useEffect(() => { if (seed) { setPrompt(seed.prompt); setTitle(""); setEditingId(null); setForm(true) } }, [seed])
  async function submit() {
    if (!title.trim() || !prompt.trim()) return
    setBusy(true); setError("")
    try {
      await saveTask({ id: editingId || crypto.randomUUID(), title: title.trim(), prompt: prompt.trim(), createdAt: tasks.find(t => t.id === editingId)?.createdAt || Date.now() })
      setVersion(v => v + 1); setForm(false); setTitle(""); setPrompt(""); setEditingId(null)
    } catch { setError(w("actionError")) } finally { setBusy(false) }
  }
  function newTask() {
    setTitle(""); setPrompt(""); setEditingId(null); setForm(true)
  }
  return <div className="wb-page wb-tasks">
    <div className="wb-page-header">
      <header className="wb-page-heading">
        <div className="wb-page-title-row"><h1>{w("tasks")}</h1>{!form && <button className="wb-button" type="button" onClick={newTask}><span aria-hidden="true">＋</span>{w("newTask")}</button>}</div>
        <p>{w("tasksDesc")}</p>
      </header>
    </div>
    <div className="wb-page-scroll">
      {error && <p className="wb-error" role="alert">{error}</p>}
      {form ? <form className="wb-task-form" onSubmit={e => { e.preventDefault(); void submit() }}>
        <div className="wb-task-form-heading"><span className="wb-task-icon" aria-hidden="true"><NavIcon icon="automate"/></span><h2>{w(editingId ? "edit" : "newTask")}</h2></div>
        <label>{w("taskName")}<input required maxLength={100} placeholder={w("taskPlaceholder")} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>{w("taskInstructions")}<textarea required rows={8} placeholder={w("instructionsPlaceholder")} value={prompt} onChange={e => setPrompt(e.target.value)} /></label>
        <div className="wb-actions"><button className="wb-button wb-button--primary" disabled={busy || !title.trim() || !prompt.trim()} type="submit">{w("create")}</button><button className="wb-text-button" type="button" onClick={() => setForm(false)}>{w("cancel")}</button></div>
      </form> : <>
        <section className="wb-task-section wb-task-section--starters">
          <div className="wb-section-heading"><h2>{w("builtIn")}</h2></div>
          <div className="wb-task-list">{starters.map(({ id, icon }) => <button key={id} className={`wb-task-starter wb-task-starter--${id}`} type="button" onClick={() => onUse(w(`${id}Prompt`), id === "compare")}>
            <span className="wb-task-icon" aria-hidden="true"><NavIcon icon={icon}/></span><span className="wb-task-arrow" aria-hidden="true">↗</span>
            <span className="wb-task-copy"><strong>{w(id)}</strong><small>{w(`${id}Desc`)}</small></span>
          </button>)}</div>
        </section>
        <section className="wb-task-section wb-task-section--saved">
          <div className="wb-section-heading"><h2>{w("custom")}</h2><span className="wb-count">{tasks.length + legacy.length}</span></div>
          {!tasks.length && !legacy.length && <div className="wb-task-empty"><span className="wb-task-icon" aria-hidden="true"><NavIcon icon="automate"/></span><p>{w("noTasks")}</p><button className="wb-button" type="button" onClick={newTask}>＋ {w("newTask")}</button></div>}
          <div className="wb-saved-task-list">
            {tasks.map(task => <article className="wb-saved-task" key={task.id}>
              <h2>{task.title}</h2><p>{task.prompt}</p>
              <div className="wb-actions">
                <button type="button" className="wb-button wb-button--primary" onClick={() => onUse(task.prompt)}>{w("useTask")} <span aria-hidden="true">↗</span></button>
                <button type="button" className="wb-text-button" onClick={() => { setTitle(task.title); setPrompt(task.prompt); setEditingId(task.id); setForm(true) }}>{w("edit")}</button>
                <button type="button" className="wb-text-button" disabled={busy} onClick={async () => { setBusy(true); try { if (!await confirm({ title: w("deleteTask"), message: w("confirmTaskDelete"), detail: task.title, confirmLabel: w("delete"), destructive: true })) return; await removeTask(task.id); setVersion(v => v + 1) } catch { setError(w("actionError")) } finally { setBusy(false) } }}>{w("delete")}</button>
              </div>
            </article>)}
            {legacy.map(agent => <article className="wb-saved-task" key={agent.id}><span className="wb-card-meta">{w("legacy")}</span><h2>{agent.name}</h2><p>{agent.systemPrompt}</p><small className="wb-muted">{w("legacyHint")}</small><div className="wb-actions"><button type="button" className="wb-button wb-button--primary" onClick={() => onUse(agent.systemPrompt)}>{w("useTask")} <span aria-hidden="true">↗</span></button></div></article>)}
          </div>
        </section>
      </>}
      <footer className="wb-page-footer">{w("taskHint")}</footer>
    </div>
    {dialog}
  </div>
}
