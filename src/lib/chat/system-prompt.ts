import { loadUserProfile } from "../memory/user-profile"
import { loadDailyMemories } from "../memory/daily-memory"

export const STATIC_SYSTEM_PROMPT = `你是 Lumino，运行在用户浏览器侧栏中的智能助手。

## 核心身份
- 你能读写用户的长期记忆，记忆存储在内部目录中
- 你能在工作区目录中创建、读取、搜索、编辑文件
- 你能感知用户当前浏览器标签页的状态
- 回答简洁、温暖、中文优先

## 工具使用原则
- 优先使用工具获取实时信息
- 一次调用失败后换参数重试一次
- 不需要告知用户你正在调用工具，静默执行`

export const SEMI_STATIC_SYSTEM_PROMPT = `## 记忆管理
- 记忆存储在内部固定路径，由系统自动管理
- 使用 memory_get 读取特定日期的记忆
- 使用 memory_search 搜索历史记忆和洞察
- 日记忆由系统定时生成，你可以追加内容
- 用户说"记住"→ 将内容保存到文件或追加到记忆

## 文件系统
- 工作区位于扩展内部存储中，无需用户手动选择目录
- 使用 ls/read_file/write_file/edit_file/glob/grep/rm 操作工作区文件
- read_file 支持 offset/limit 分页读取大文件
- edit_file 通过精确字符串替换编辑文件，old_string 必须在文件中唯一
- glob 通过通配符模式查找文件，如 glob pattern="*.ts"
- grep 支持字面量或正则搜索，通过 output_mode 控制输出格式
- 用户说"生成文件""创建项目"→ 在工作区中创建文件
- 用户说"导出""下载""保存到本地"→ 使用 export 工具导出文件到本地下载目录

## 禁止
✖ 密码、银行卡、身份证等敏感信息不要写入记忆或文件
✖ 低置信度推断先对话确认，不要自动写入
✖ 同一轮对话不要重复写入相同内容`

export async function buildDynamicSystemBlock(): Promise<string> {
  const profile = await loadUserProfile()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const allMemories = await loadDailyMemories()
  const recentMemories = allMemories
    .filter((m) => m.date === today || m.date === yesterday)
    .sort((a, b) => b.createdAt - a.createdAt)

  const lines: string[] = []

  lines.push("## 用户画像")
  if (profile.name) lines.push(`- 名称：${profile.name}`)
  lines.push(`- 语言：${profile.language === "zh" ? "中文" : "English"}`)
  if (profile.interests.length > 0) lines.push(`- 关注：${profile.interests.join("、")}`)
  if (profile.notes) lines.push(`- 备注：${profile.notes}`)
  if (profile.frequentSites.length > 0) {
    lines.push(`- 常用站点：${profile.frequentSites.slice(0, 5).join(", ")}`)
  }

  lines.push("\n## 近期记忆摘要")
  if (recentMemories.length > 0) {
    for (const m of recentMemories.slice(0, 5)) {
      lines.push(`- [${m.date}] ${m.summary.slice(0, 200)}`)
    }
  } else {
    lines.push("（暂无近期记忆）")
  }

  const now = new Date()
  lines.push(`\n## 当前时间\n${now.toISOString()}（${now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}）`)

  return lines.join("\n")
}

export async function buildAgentMessages(
  historyMessages: Array<{
    role: "system" | "user" | "assistant" | "tool"
    content: string | null
    tool_calls?: unknown[]
    tool_call_id?: string
  }>
): Promise<Array<{
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: unknown[]
  tool_call_id?: string
}>> {
  const dynamicBlock = await buildDynamicSystemBlock()

  return [
    {
      role: "system",
      content: STATIC_SYSTEM_PROMPT
    },
    {
      role: "system",
      content: SEMI_STATIC_SYSTEM_PROMPT
    },
    {
      role: "system",
      content: dynamicBlock
    },
    ...historyMessages
  ]
}
