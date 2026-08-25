/**
 * Lumino Side Panel — 入口文件
 *
 * Plasmo 要求 sidepanel.tsx 作为 Side Panel 入口。
 * 实际逻辑在 src/sidepanel/App.tsx 中。
 */

import { App } from "./sidepanel/App"
import "./styles/components.css"

export default function SidePanel() {
  return <App />
}
