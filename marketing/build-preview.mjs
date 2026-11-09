import { createRequire } from "node:module"
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"

const require = createRequire(import.meta.url)
const fromVitest = createRequire(require.resolve("vitest/package.json"))
const fromVite = createRequire(fromVitest.resolve("vite/package.json"))
const { build } = fromVite("esbuild")
const root = resolve(import.meta.dirname, "..")
const out = resolve(root, "marketing/.render")
await mkdir(out, { recursive: true })
await build({
  entryPoints: [resolve(root, "marketing/preview.tsx")], outdir: out, bundle: true,
  format: "esm", target: "es2022", jsx: "automatic", loader: { ".woff": "file", ".woff2": "file", ".ttf": "file", ".png": "dataurl" },
  plugins: [{ name: "plasmo-image", setup(api) {
    api.onResolve({ filter: /^data-base64:~/ }, args => ({ path: resolve(root, "src", args.path.replace("data-base64:~", "")), namespace: "brand-image" }))
    api.onLoad({ filter: /.*/, namespace: "brand-image" }, async args => ({ contents: `export default ${JSON.stringify("data:image/png;base64," + (await readFile(args.path)).toString("base64"))}`, loader: "js" }))
  } }],
  define: { "process.env.NODE_ENV": '"production"' }
})
await copyFile(resolve(root, "assets/icon.png"), resolve(out, "icon.png"))
await writeFile(resolve(out, "index.html"), `<!doctype html><html lang="zh-CN" data-theme="paper"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lumino 商店素材</title><link rel="stylesheet" href="preview.css"></head><body><main class="store-canvas"><div class="store-brand"><img src="icon.png" alt="">Lumino</div><section id="feature-copy"></section><div class="store-foot">浏览器侧边栏 AI 助手 · 自选模型 · 中文 / English</div><section class="store-app-frame"><div class="store-app-title"><img src="icon.png" alt=""><span>Lumino</span><span>界面演示 · 示例内容</span></div><div id="app"></div></section></main><script type="module" src="preview.js"></script></body></html>`)
console.log(out)
