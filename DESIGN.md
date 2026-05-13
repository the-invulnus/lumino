# Design System — Lumino

## Product Context
- **What this is:** Chrome extension companion (陪伴型助手) with LLM config, browsing data collection controls, and side panel chat
- **Who it's for:** Users who want AI companionship integrated into their browser experience
- **Space/industry:** Browser extension / personal AI assistant
- **Project type:** Configuration page + side panel chat (internal tool within a Chrome extension)

## Aesthetic Direction
- **Direction:** Warm Editorial — typographic hierarchy leads, soft ambient motion soothes
- **Decoration level:** Intentional — subtle blobs, double-bezel card, gradient accents
- **Mood:** A small, warm private study. Every interaction feels gentle, not mechanical.
- **Reference sites:** None (built from codebase analysis and first-principles design)

## Typography
- **Display/Hero:** Plus Jakarta Sans 700 — warm geometric sans with humanist touch
- **Body:** Plus Jakarta Sans 500 at 13px
- **UI/Labels:** Plus Jakarta Sans 600 at 12px, letter-spacing +0.03em
- **Data/Tables:** SF Mono / JetBrains Mono at 10px — monospace for eyebrow badges and code
- **Code:** SF Mono, JetBrains Mono, ui-monospace (system stack)
- **Loading:** Google Fonts CDN (`https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700`)
- **Scale:**
  - 10px: Eyebrow badge (mono, uppercase, wide tracking)
  - 11.5px: Helper text, small metadata
  - 12px: Form labels, toggle titles (semibold)
  - 13px: Body copy, input text, button labels (the workhorse size)
  - 15px: Section headings (h2)
  - 20px: Display/hero heading (h1, bold, tight tracking)

## Color
- **Approach:** Restrained warm palette — 1 primary accent, 2 atmospheric accents, neutrals carry the page
- **Primary:** `#c97d6d` — Warm rose. Used for logo gradient, checkbox accent, subtle ambient glow
- **Secondary:** `#a78bfa` — Soft violet. Used for focus rings, decorative elements, gradient partner
- **Atmospheric:** `#9ec9e0` — Cool mist. Used for the third blob in ambient background
- **Neutrals:** Warmer grays derived from cream base
  - `#fdfbf7` — Page background (cream)
  - `#fffaf5` — Raised surface (inputs, cards)
  - `rgba(255,253,249,0.94)` — Translucent surface for overlays
  - `#f6f2eb` — Deep cream (alternative bg)
  - `#2d2622` — Primary ink (near-black with warmth)
  - `rgba(45,38,34,0.58)` — Soft ink (secondary text)
  - `rgba(45,38,34,0.35)` — Faint ink (placeholders, tertiary)
- **Semantic:**
  - Success: `#5b8c5a`
  - Warning: `#c8890c`
  - Error/Danger: `#c4554d`
- **Dark mode:** All values have dark-mode overrides with 10-20% saturation reduction

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable (config pages need to be scannable, not spacious)
- **Scale:**
  - 4px: Tight internal padding (eyebrow capsule)
  - 8px: Toggle group item gap
  - 12px: Label-input gap, component gap
  - 16px: Standard section padding
  - 24px: Section-to-section gap
  - 28px: Card inner padding (horizontal)
  - 32px: Outer container padding

## Layout
- **Approach:** Centered card — single-column form within a blurred glass outer bezel + solid inner card
- **Grid:** Single column, max-width 600px (options page), full-width for side panel
- **Max content width:** 600px (config form)
- **Border radius:**
  - Outer bezel: 24px (`--lumi-radius-outer`)
  - Inner card: 18px (`--lumi-radius-inner`)
  - Inputs/fields: 14px (`--lumi-radius-field`)
  - Buttons/badges: 999px (pill)

## Motion
- **Approach:** Intentional — subtle ambient blobs drift slowly, hover states have spring easing
- **Easing:** enter (ease-out), exit (ease-in), ambient (cubic-bezier 0.32, 0.72, 0, 1)
- **Duration:** micro (50-100ms), short (150-250ms), medium (250-400ms), long (400-700ms), ambient (28-36s)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|----------|
| 2026-05-13 | Initial design system created | Created by /design-consultation based on codebase analysis of options.tsx, paper.css, and lumino-vars.css |
| 2026-05-13 | Typographic scale consolidated to 6 sizes | Original had 8+ font sizes (10px-19px) with no clear logic; reduced to 6-step modular scale |
| 2026-05-13 | Accent shifted from #d4847a to #c97d6d | Warmer, more sophisticated, less pink — better pairs with the cream neutrals |
| 2026-05-13 | Ambient blob opacity halved | Original 0.16/0.12 competed with form content; 0.08/0.06 reads as atmosphere |
