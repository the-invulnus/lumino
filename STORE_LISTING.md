# Chrome Web Store Listing — Lumino

Copy-paste ready content for the Chrome Web Store Developer Dashboard.

---

## Name (75 chars max)

Lumino: Browse and Build with AI Agent.

---

## Short Description (132 chars max)

An AI assistant that actually acts — using real tools to read, write, automate, and get work done, right in your browser side panel.

---

## Detailed Description

🔥 Lumino is your capable AI assistant — powered by your own LLM.
Open the side panel, and it actually acts. Lumino doesn't just chat about a page — it reads, clicks, fills, scrapes, saves files, and talks to your Obsidian vault, chaining built-in tools in a self-driven loop until the work is done.

Bring any OpenAI-compatible LLM — point Lumino at OpenAI, Claude, Gemini, a local model, or any compatible provider. You stay in control of the model and your data.

💪 Key Features:

👉 Work with Purpose-Built Agents
✔️ Deep Research: Browses pages, extracts content, follows links, and synthesizes findings into a clear report.
✔️ Knowledge Management: Read, write, and organize notes in your local Obsidian vault via the Local REST API — your second brain, always within reach.
✔️ Web Replication: Scrapes a page's full DOM structure, computed styles, and assets so you can study or recreate any design.
✔️ Browser Automation: Fills forms, clicks elements, presses keys, and inspects the DOM to drive multi-step web flows on your behalf.
✔️ Custom Agents: Create your own agents with a tailored system prompt and a curated tool subset. Custom agents sync across your devices.

👉 Real Tools
✔️ Browser interaction — navigate, click, fill forms, press keys, inspect elements, take screenshots, scroll, close tabs
✔️ Page reading — extract visible text or structured content from any tab
✔️ Page scraping — capture DOM structure, computed styles, and resources; download files
✔️ File system — a full OPFS workspace with ls, read, write, edit, glob, grep, rm, and export to your computer
✔️ Obsidian integration — list, read, and write notes in your local vault

👉 Chat That Gets Things Done
✔️ Multi-session: Create, switch, search, and delete conversations — each tied to the agent you used.
✔️ Step-by-step transparency: Watch every tool call and result as it happens.
✔️ Tab locking: Once the agent picks a tab, your tab-switching won't disrupt its work.
✔️ Markdown rendering with sanitization for safe display.

🔒 Privacy First
✔️ No telemetry, no analytics, no tracking — Lumino never collects or transmits your data to the developer.
✔️ API keys stay local — stored in chrome.storage.local, never synced to your Google account.
✔️ You choose the LLM — Lumino talks only to the OpenAI-compatible endpoint you configure.
✔️ Chat history and files live on your device, in IndexedDB and the Origin Private File System.

🎨 More
✔️ Three themes — Paper, ORYZO, and Fictional
✔️ Bilingual — English and Chinese with runtime switching
✔️ Free to use — bring your own LLM key, no subscription required

💻 How to Use:
🔸 Click "Add to Chrome" and pin Lumino to your toolbar.
🔸 Open the Options page and configure your LLM provider (base URL, API key, model name).
🔸 Optionally enable Obsidian integration via the Local REST API plugin.
🔸 Open the side panel, pick an agent mode, and start a conversation.

❓ FAQ:

📌 Do I need an OpenAI account?
- No. Lumino works with any OpenAI-compatible LLM endpoint — OpenAI, Anthropic, Google, a local model, or any compatible provider. You bring your own key.

📌 Is Lumino free?
- Yes. Lumino itself is free. You only pay for the LLM API you choose to use, if any.

📌 Does it work in my country?
- Yes. Since Lumino connects to the LLM provider you configure, availability depends on your chosen provider, not on Lumino.

📌 Is my data safe?
- Yes. Lumino stores everything locally — API keys, chat history, and files never leave your device except for the requests you explicitly send to your own LLM provider.

📪 Contact:
Have questions or suggestions? Open an issue on our GitHub repository.
See the full privacy policy at: https://raw.githubusercontent.com/the-invulnus/lumino/main/PRIVACY.md

---

## Permission Justifications (for the Dashboard "Permissions" / "Privacy" section)

Use these when the dashboard asks why each permission is required:

- **sidePanel** — Opens the assistant interface in Chrome's side panel.
- **storage** — Saves your settings, preferences, custom agents, and active session locally.
- **tabs** — Lets agent tools read, navigate, screenshot, and close browser tabs you interact with.
- **scripting** — Executes page-reading and DOM tools (inspect element, fill form, click, etc.) on the active tab.
- **downloads** — Exports files from the built-in file workspace to your computer.
- **alarms** — Schedules periodic cleanup of large cached tool results to reclaim storage.
- **host_permissions: <all_urls>** — Allows the floating launcher button and content scripts to run on any page, and enables web-browsing tools to read page content on demand.

### Data Use Declarations

- **Does Lumino sell or transfer user data to third parties?** No.
- **Does Lumino use or transfer user data for purposes unrelated to the item's core functionality?** No.
- **Does Lumino use or transfer user data to determine creditworthiness or for lending purposes?** No.

Lumino sends requests only to the LLM endpoint the user explicitly configures, and (optionally) to the user's own local Obsidian instance. No data is sent to the developer or any third party.

---

## Category

Productivity

---

## Single Purpose (required by dashboard, 132 chars max)

A multi-mode AI assistant in the browser side panel that reads pages, automates tasks, manages files, and integrates with Obsidian.
