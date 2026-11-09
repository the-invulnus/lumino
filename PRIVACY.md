# Lumino 隐私政策 / Privacy Policy

更新日期 / Last updated: 2026-11-09

## 简体中文

Lumino 是浏览器侧边栏 AI 助手，用于根据用户指令处理网页与文件。开发者不运营接收用户对话、网页内容或工作区文件的后台服务。Lumino 不内置广告、行为分析或遥测，也不出售用户数据。

### 本地保存的数据

- 模型接口地址、模型名称、API Key、Obsidian MCP 地址与凭证、语言偏好、快捷任务保存在 Chrome 本地存储中。发起请求时，Lumino 使用相应凭证向用户配置的模型或 MCP 服务进行身份验证；凭证不会发送给 Lumino 开发者运营的服务器。
- 对话与消息保存在浏览器 IndexedDB 中。
- 上传文件、下载资源、网页收藏、助手回复、截图、笔记与项目文件保存在浏览器 OPFS 工作区中；临时工具输出也可能存入工作区。
- 主题以及保留下来的旧自定义 Agent 配置可能使用 Chrome 同步存储，由用户的 Chrome 同步设置决定是否跨设备同步。模型与 Obsidian 的凭证不使用同步存储。

### 为完成任务而发送的数据

Lumino 会将对话及完成任务所需的上下文发送到用户自行配置的 OpenAI 兼容模型接口。上下文可能包含选中或读取的网页标题、地址、正文、页面结构、截图，以及被引用或由工具读取的文件内容。是否发送截图取决于所用功能；Lumino 不采集麦克风或摄像头数据。

启用 Obsidian 集成后，Lumino 通过用户配置的 MCP 服务地址执行笔记相关操作。该地址可能是本机服务，也可能是用户选择的其他地址。相关数据的处理还受该服务及模型提供方的政策约束。

浏览器工具也可能按用户任务访问网站、下载资源、填写表单或操作页面。相应网站会接收到这些操作涉及的数据。请只引用适合交给所选服务处理的内容，并在执行重要操作时留意助手的工具调用。

Lumino 仅为提供用户主动请求的网页、对话、文件和 Obsidian 功能处理上述数据；不会出售这些数据，也不会将其用于广告或与产品功能无关的用途。数据由用户所选的模型、MCP 或目标网站按各自政策处理。

### 权限用途

| 权限 | 用途 |
| --- | --- |
| sidePanel | 显示助手、工作区和快捷任务界面 |
| storage | 保存配置、偏好与快捷任务 |
| tabs | 识别引用的标签页并执行标签页相关操作 |
| scripting | 按任务读取网页、检查元素与执行页面交互 |
| downloads | 将工作区文件或文件夹导出到设备 |
| offscreen | 在扩展的离屏页面中处理 PDF 文本提取 |
| alarms | 清理临时工具输出等缓存 |
| 所有网站访问权限 | 支持跨网站的页面引用、内容读取、页面操作与浮动入口；权限本身不表示向开发者发送浏览历史 |

### 删除与控制

你可以删除历史会话、工作区文件与快捷任务，在设置中修改模型配置或关闭 Obsidian 集成。卸载扩展会清除扩展的本地数据；已经导出的文件不会随之删除。若需保留文件，请先导出。删除本地数据不会自动删除模型提供方或其他网站已处理的数据，请联系对应服务。

### 联系与更新

问题或建议：https://github.com/the-invulnus/lumino/issues

政策更新会发布在本页面，并标注新的更新日期。

## English

Lumino is a browser-side AI assistant for working with pages and files at your direction. The developer does not operate a server that receives your conversations, page content or workspace files. Lumino has no advertising, behavioral analytics or telemetry, and does not sell user data.

Model and Obsidian MCP settings, credentials, language preferences and shortcuts are stored in Chrome local storage. Lumino uses the relevant credential to authenticate requests to the model or MCP endpoint you configure; credentials are not sent to servers operated by the Lumino developer. Conversations use IndexedDB. Uploaded files, downloads, saved pages, saved replies, screenshots, notes, projects and temporary tool outputs use the browser's OPFS workspace. Theme settings and legacy custom-agent configurations may use Chrome sync storage; model and Obsidian credentials do not.

To perform your requests, Lumino sends relevant conversation and context to your configured OpenAI-compatible model endpoint. This can include page titles, URLs, text, structure, screenshots and file contents that you reference or that tools read for a task. Lumino does not capture microphone or camera data.

If enabled, Obsidian operations use your configured MCP endpoint, which may be local or remote. Browser actions may also send relevant data to the websites you ask the assistant to use. These services' own data policies apply. Only provide content appropriate for your selected services. Lumino processes this information only to provide the page, conversation, file and Obsidian features you request. It does not sell this information or use it for advertising or purposes unrelated to the product. The model, MCP and destination websites you choose process data under their own policies.

Permissions support the side panel, settings and task storage, tab references, page reading and interaction, file export, offscreen PDF processing and temporary-cache cleanup. Broad website access enables these user-directed features across sites; it does not itself send browsing history to the developer.

You can delete conversations, workspace files and shortcuts, change model settings or disable Obsidian. Uninstalling removes local extension data but does not delete exported files or data already processed by external providers. Export files you wish to keep before uninstalling. Contact external services to manage data they retain.

Questions: https://github.com/the-invulnus/lumino/issues

Changes to this policy are published here with an updated date.
