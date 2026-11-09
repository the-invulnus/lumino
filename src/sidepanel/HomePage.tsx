import { NavIcon } from "./IconSidebar"
import { starters, useW } from "../lib/workbench/i18n"
import lumiIcon from "data-base64:~lumi.png"

export function HomePage({ onStart }: { onStart: (prompt: string, selectTabs?: boolean) => void }) {
  const w = useW()
  return <div className="wb-home">
    <div className="lm-home-hero">
      <img className="lm-home-hero-avatar" src={lumiIcon} alt="" />
      <h1 className="lm-home-hero-title">Lumi Knows</h1>
      <p className="lm-home-hero-desc">{w("welcome")}</p>
    </div>
    <div className="lm-home-section">
      <h2 className="lm-home-section-title">{w("quick")}</h2>
      <div className="lm-home-grid">
        {starters.map(({ id, icon }) => <button key={id} type="button" className="lm-home-card" onClick={() => onStart(w(`${id}Prompt`), id === "compare")}>
          <div className="lm-home-card-icon"><NavIcon icon={icon} /></div>
          <div className="lm-home-card-body">
            <span className="lm-home-card-name">{w(id)}</span>
            <span className="lm-home-card-desc">{w(`${id}Desc`)}</span>
          </div>
        </button>)}
      </div>
    </div>
  </div>
}
