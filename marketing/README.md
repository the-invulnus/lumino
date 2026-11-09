# Lumino 1.1.0 商店素材

## 商店配置

- 扩展包：`build/chrome-mv3-prod.zip`（运行 `pnpm package`）。
- 默认商店语言：简体中文；另提供英文名称、简介与详细说明。
- 应用界面：首次使用跟随 Chrome 界面语言；中文环境使用简体中文，其余使用英文。已保存的手动选择优先。
- [中文详细介绍](listing.zh-CN.txt) / [English description](listing.en.txt)。
- [隐私政策](../PRIVACY.md)；发布时使用已推送的公开页面。

## 图片

| 用途 | 文件 | 尺寸 |
| --- | --- | --- |
| 小型宣传图 | `assets/promo-tiles/small-promo-440x280.jpg` | 440 × 280 |
| 顶部宣传图 | `assets/promo-tiles/marquee-promo-1400x560.jpg` | 1400 × 560 |
| 网页助手截图 | `assets/store/01-assistant-1280x800.png` | 1280 × 800 |
| 多页对比截图 | `assets/store/02-compare-1280x800.png` | 1280 × 800 |
| 文件工作区截图 | `assets/store/03-workspace-1280x800.png` | 1280 × 800 |
| 快捷任务截图 | `assets/store/04-tasks-1280x800.png` | 1280 × 800 |
| English store screenshots | `assets/store/en/01-assistant-1280x800.png` – `04-tasks-1280x800.png` | 1280 × 800 |

宣传图使用英文。中文与英文界面截图均使用真实应用组件，所有会话、页面和文件均为隔离的虚构示例；界面中标注演示内容。不包含用户资料、真实 API Key 或外部服务的生成结果。素材预览代码不包含在扩展入口中。

## 重新导出截图

```bash
node marketing/build-preview.mjs
python3 -m http.server 8766 --bind 127.0.0.1 --directory marketing/.render
# 在另一个终端中执行；默认使用 macOS 的 Google Chrome，可用 CHROME_PATH 覆盖。
node marketing/render-preview.mjs
```

渲染器创建独立的临时 Chrome 配置，分别导出中文和英文截图，导出后自动清理，不读取个人浏览器配置。`.render/` 为忽略的构建产物。

## 封面来源与提示词

使用内置 `image_gen` 工具，以仓库中的 Lumino 黑猫图标为品牌参考生成，再将中文素材中的文案替换为英文。原尺寸文件保存在 `assets/cover.png` 和 `assets/cover2.png`，用 `sips` 转换为上表指定尺寸的 JPEG。

顶部宣传图最终编辑提示词：保留 Lumino 黑猫标志、衬线品牌字、暖白纸张背景、珊瑚色和薰衣草色柔和渐变与轻盈纸张元素。移除中文，精确使用 “Lumino”、“Turn browsing into doing.” 和 “AI Web Assistant · Summaries · Notes · Workspace”。保持宽幅 2.5:1 构图、清晰排版和充分留白，不添加其他标识。

小型宣传图最终编辑提示词：保留黑猫标志、Lumino 衬线字、暖白纸张纹理、珊瑚色和薰衣草色角落光影。将所有中文替换为 “AI Web Assistant” 和 “Summaries · Notes · Workspace”。确保缩小到 440 × 280 后仍清晰，适当缩小副标题字号，保留间距，不添加其他文字、标志或徽章。横向比例 11:7。

## 本次改版

统一助手入口；新增完整文件工作区和快捷任务；网页与文件引用；文件上传与收藏；可折叠工具执行过程；历史会话时间分组；改进文件浏览、滚动与应用内确认框；自动选择中英文界面并保留手动切换。
