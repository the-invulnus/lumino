/** Export store artwork from an isolated headless browser, never a user profile. */
import { spawn } from "node:child_process"
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const profile = await mkdtemp(resolve(tmpdir(), "lumino-store-"))
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const browser = spawn(chrome, ["--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1280,800", "about:blank"], { stdio: "ignore" })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  let port
  for (let i = 0; i < 100; i++) {
    try { port = Number((await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break } catch { await pause(100) }
  }
  if (!port) throw new Error("Headless browser did not start")
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const target = targets.find(target => target.type === "page" && target.url === "about:blank")
  if (!target) throw new Error("Isolated preview tab not found")
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let nextId = 0
  const pending = new Map()
  const errors = []
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)))
      else request?.resolve(message.result)
    } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  await send("Runtime.enable")
  await send("Page.enable")
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  for (const lang of ["zh", "en"]) {
    const output = lang === "zh" ? resolve(root, "assets/store") : resolve(root, "assets/store/en")
    await mkdir(output, { recursive: true })
    for (const [index, view] of ["assistant", "compare", "workspace", "tasks"].entries()) {
      errors.length = 0
      await send("Page.navigate", { url: `http://127.0.0.1:8766/?view=${view}&lang=${lang}` })
      let ready = false
      for (let i = 0; i < 100; i++) {
        await pause(150)
        const state = await send("Runtime.evaluate", { expression: 'document.documentElement.dataset.ready === "true" && !!document.querySelector(".wb-main")', returnByValue: true })
        if (state.result.value) { ready = true; break }
        if (errors.length) throw new Error(JSON.stringify(errors))
      }
      if (!ready) {
        const state = await send("Runtime.evaluate", { expression: 'JSON.stringify({url:location.href, state:document.readyState, body:document.body?.innerText, resources:performance.getEntriesByType("resource").map(r=>({name:r.name,size:r.transferSize}))})', returnByValue: true })
        throw new Error("App did not render: " + JSON.stringify({ errors, state }))
      }
      await pause(1000)
      if (view === "workspace" || view === "tasks") {
        const title = view === "workspace" ? (lang === "zh" ? "工作区" : "Workspace") : (lang === "zh" ? "快捷任务" : "Tasks")
        await send("Runtime.evaluate", { expression: `document.querySelector('.lm-icon-sidebar button[title="${title}"]')?.click()` })
        await pause(500)
      }
      await send("Runtime.evaluate", { expression: 'document.querySelectorAll(".lm-chat-scroll").forEach(el => { el.scrollTop = 0 })' })
      await pause(100)
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
      const path = resolve(output, `0${index + 1}-${view}-1280x800.png`)
      await writeFile(path, Buffer.from(shot.data, "base64"))
      console.log(path)
    }
  }
} finally {
  socket?.close()
  browser.kill("SIGTERM")
  await pause(500)
  await rm(profile, { recursive: true, force: true })
}
