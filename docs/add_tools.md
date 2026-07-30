
一、弥补现有明显短板

1. 网络请求工具 fetch / http_request

- 现状：fetch_resource 只能取资源内容存文件，不能直接发 API 请求、看响应。agent 想查一个 API、读一个 JSON 接口，得绕路。
- 建议：通用 HTTP 工具，支持 method/headers/body，返回状态码 + 响应体（走 SW fetch，无 CORS）。调研模式（读 API 文档、查天气/汇率等）和自动化模式（调 webhook）都常用。
- 成本：低。SW 里 fetch 现成。

2. 网页全文搜索 web_search

- 现状：调研模式只能靠 navigate + get_page_content 在已知页面里转，没法"搜一下"。
- 建议：接一个搜索 API（DuckDuckGo HTML、SearXNG、或让用户配 Bing/Google key），返回标题+URL+摘要。research 模式的核心缺口。
- 成本：中。需要选 API、处理限流。可做成可选（用户在 Options 配 API key 才启用，类似 Obsidian 集成）。

3. 提取页面主结构 readability / extract_article

- 现状：get_page_content 对文章页返回大量导航/广告/页脚噪声。
- 建议：用 Readability 算法（Mozilla 的 @mozilla/readability）提取正文。调研读文章、新闻时信噪比高很多。
- 成本：低。库小，现成。

二、增强浏览器操控（automate 模式）

4. 等待元素 wait_for_element

- 现状：自动化填表/点击时，页面是 SPA 动态加载，agent 只能盲点 + 重试。
- 建议：等待选择器出现/消失/可见，带超时。让自动化稳定度大增。
- 成本：低。content script 里 MutationObserver。

5. 批量元素操作 query_all / click_all

- 现状：click_element 一次一个。要"勾选所有复选框""提取所有商品价格"得循环调多次工具。
- 建议：按选择器返回所有匹配元素的文本/属性，或批量点击。
- 成本：低。

6. 滚动到底 scroll_to_bottom / 翻页加载

- 现状：scroll 能滚，但无限滚动页面 agent 不知道何时停。
- 建议：滚动直到内容不再增长（带最大次数），返回新加载的内容。爬取列表页（商品、评论、搜索结果）必备。
- 成本：中。

三、文件与生产力（chat / 全模式）

7. 文件下载 download

- 现状：export 能把 OPFS 文件导出，但 agent 不能主动"下载一个 URL 的文件到工作区"。
- 建议：把 URL 资源下载进 OPFS（文本/二进制都支持）。配合 fetch_resource 已有能力，但语义更直接。
- 成本：低。已有 writeWorkspaceFileBytes。

8. Markdown / 格式转换

- 现状：agent 处理 HTML 网页内容时，给 LLM 的是原始文本或 HTML。
- 建议：HTML→Markdown（你已有 turndown 依赖！），让 LLM 读网页内容更省 token、结构更清晰。
- 成本：极低。turndown 已装，直接用。

9. 读取剪贴板 / 写剪贴板

- 现状：用户想让 agent 处理"我复制的一段内容"得粘贴到对话框。
- 建议：read_clipboard / write_clipboard。自动化场景"把结果填入剪贴板"也实用。
- 成本：中。MV3 剪贴板 API 受限，可能需 content script 配合。

四、知识管理（延续 Obsidian 方向）

10. 本地笔记读写（不依赖 Obsidian）

- 现状：笔记能力强绑 Obsidian Local REST API，用户没装 Obsidian 就没有笔记能力。
- 建议：OPFS 里直接做轻量 Markdown 笔记库（note CRUD + 全文搜索 + 标签）。降低笔记功能门槛。
- 成本：中高。但与现有 OPFS 工作区天然契合。

11. 简单表格 / 数据处理

- 现状：agent 处理 CSV/JSON 数据只能靠 read_file + 文本操作。
- 建议：CSV 读取、过滤、聚合；JSON 查询（JSONPath）。数据分析场景实用。
- 成本：中。

五、多媒体（差异化能力）

12. 图片 OCR ocr_image

- 现状：read_pdf 扫描件页拿不到文本，截图工具拍了图但 LLM 看不了细节文字。
- 建议：本地 OCR（Tesseract.js，纯 JS/WASM）或调用户配置的视觉 LLM。补齐扫描件/图片文字提取。
- 成本：中高。Tesseract.js 体积大；调视觉 LLM 更轻但要消耗 API。

13. 音频转写 transcribe

- 现状：无。
- 建议：调用户配置的 LLM（如 OpenAI Whisper API）转写音频文件/网页音频。场景较窄，优先级低。
