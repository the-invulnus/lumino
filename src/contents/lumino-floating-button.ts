import type { PlasmoCSConfig } from "plasmo"

import { mountFloatingButton } from "../content/floating-button"
import "../styles/content-inject.css"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

mountFloatingButton()
