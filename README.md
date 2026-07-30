# Lumino

A multi-mode AI assistant in your browser side panel — research, replicate designs, and automate web pages.

Powered by a self-built agent loop with a rich set of built-in tools for reading web content, manipulating DOM, managing an OPFS file workspace, and integrating with Obsidian.

## Features

- **Multi-Agent Modes** — Chat, Deep Research, Design Replication, Page Automation, plus custom agents you define
- **Rich Built-in Tools** — Page reading, DOM inspection, form filling, screenshots, file system operations, and more
- **Obsidian Integration** — Read and write notes via Obsidian Local REST API
- **OPFS File Workspace** — Built-in file system for storing and editing files during sessions
- **Three Themes** — Paper, ORYZO, and Fictional color schemes
- **i18n** — English and Chinese with runtime switching
- **Privacy First** — API keys stored locally only, never synced to cloud

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Development

```bash
pnpm install
pnpm dev
```

Load the extension from `build/chrome-mv3-dev` in Chrome's `chrome://extensions` page (enable "Developer mode" → "Load unpacked").

### Production Build

```bash
pnpm build
pnpm package   # generates a .zip ready for Chrome Web Store
```

## Configuration

Open the Options page (right-click extension icon → Options) to configure:

- **LLM Settings** — OpenAI-compatible API (base URL, API key, model name)
- **Obsidian Integration** — Enable and configure Obsidian Local REST API access
- **Custom Agents** — Create agents with custom system prompts and tool subsets
- **Theme** — Switch between Paper, ORYZO, and Fictional themes
- **Language** — English / 中文

## Architecture

Built with [Plasmo](https://docs.plasmo.com/) (Chrome Extension framework), React 18 + TypeScript 5.3.

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.

## License

MIT
