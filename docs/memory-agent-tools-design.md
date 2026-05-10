# Design: Lumino 记忆系统 Agent Tool 方案 — 读写一体 + 搜索升级

参考：
- https://docs.openclaw.ai/concepts/memory
- https://docs.openclaw.ai/concepts/memory-builtin
- https://docs.openclaw.ai/concepts/memory-search
- https://docs.openclaw.ai/plugins/memory-wiki

目标：让对话 Agent 不仅是记忆的消费者，也是记忆的**生产者**。同时让记忆搜索从简单关键词匹配升级为可渐进增强的检索引擎。

---

## 1. 现状分析

### 1.1 Lumino 当前记忆系统

```
Layer 1 (原始事件)     → event-collector → IndexedDB (layer1_events)
Layer 2 (日记忆)        → LLM 定时批量总结 → IndexedDB (daily_memories)
Layer 3 (检索)          → 关键词匹配 → context-builder → completion-engine
用户画像                → LLM 推断 → chrome.storage.local
```

### 1.2 当前 Agent Tools（仅读取）

| Tool | 功能 |
|------|------|
| `lumino_get_profile` | 读取用户画像 |
| `lumino_get_daily_memories` | 读取近 N 天日记忆摘要 |
| `lumino_get_manifest_version` | 读版本号（测试用） |
| `lumino_echo` | 回显文本（测试用） |

**缺失：** 没有写入能力，记忆搜索是简陋的关键词字符串匹配。

---

## 2. OpenClaw 记忆系统深度分析

### 2.1 架构全景

```
┌─────────────────────────────────────────────────────┐
│                    Agent Runtime                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ memory_search │  │ memory_get   │  │ memory_*  │ │
│  │ (hybrid)      │  │ (line range) │  │ (CRUD)    │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
└─────────┼─────────────────┼───────────────┼────────┘
          │                 │               │
    ┌─────▼─────────────────▼───────────────▼────┐
    │            Memory Backend Layer             │
    │  ┌──────────┐  ┌─────┐  ┌──────┐  ┌─────┐ │
    │  │ Builtin  │  │ QMD │  │Honcho│  │Lance│ │
    │  │ (default)│  │     │  │      │  │DB   │ │
    │  └────┬─────┘  └──┬──┘  └──┬───┘  └──┬──┘ │
    └───────┼────────────┼────────┼────────┼─────┘
            │            │        │        │
    ┌───────▼────────────▼────────▼────────▼─────┐
    │              Storage Layer                  │
    │  MEMORY.md + memory/YYYY-MM-DD.md          │
    └────────────────────────────────────────────┘
```

### 2.2 每日记忆 MD 机制（核心参考点）

OpenClaw 的每日记忆是**文件驱动 + Agent 自治 + 分层注入**：

```
~/.openclaw/workspace/
├── MEMORY.md              ← 长期记忆（每次 session boot 注入 system prompt）
├── memory/
│   ├── 2026-05-08.md      ← 3 天前（仅被 memory_search 索引，不注入 context）
│   ├── 2026-05-09.md      ← 昨天（自动注入当前 session context）
│   └── 2026-05-10.md      ← 今天（自动注入 + Agent 可在对话中直接追加）
└── DREAMS.md              ← Dreaming 审查面（人类可读，Agent 不直接改）
```

**关键机制：**

**A. 热/温/冷三层注入策略**

| 层级 | 范围 | 注入方式 | Token 策略 |
|------|------|---------|-----------|
| 热 | `MEMORY.md` | Session boot 时完整注入 system prompt | 有预算上限，超出时截断（文件不删） |
| 温 | 今天 + 昨天的 `memory/*.md` | 自动注入当前 context | 完整注入（一天摘要量不大） |
| 冷 | 更早的 `memory/*.md` | **不注入**，仅被 `memory_search` 索引 | 按需检索，按相关性返回 top-K |

**B. Agent 直接写入**

Agent 不是通过某个"记忆 API"写入，而是直接修改 Markdown 文件：
- `memory_create` / `memory_update` / `memory_delete` 三个 tool
- "Remember that I prefer TypeScript" → Agent 将这句话追加到 `MEMORY.md`
- 写入系统 prompt 的「记忆管理能力」段指导 Agent 何时该写入

**C. Memory Flush（自动回写，防止遗失）**

Compaction 之前的 silent turn：
- System prompt 专门提醒 Agent："把对话中的重要信息写回 memory 文件"
- 防止上下文压缩时丢失尚未持久化的关键事实
- 这是纯 prompt 驱动的机制，不需要额外引擎

**D. Dreaming（后台提升管线）**

```
短期记忆存储 (.dreams/)
  → 收集候选
  → 多维度打分（置信度、回忆频率、查询多样性）
  → 通过 gate → 提升到 MEMORY.md
  → 结果写入 DREAMS.md（人类审查面）
```

Dreaming **不直接修改 MEMORY.md**——人类始终有最终审查权。

### 2.3 记忆搜索引擎 — Builtin Engine（核心参考点）

OpenClaw 的 Builtin engine 是一个**本地 SQLite 驱动的混合检索引擎**：

```
                    ┌─────────────┐
                    │ memory_search│
                    │   (query)    │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │      并行执行两条路径     │
              ▼                         ▼
     ┌────────────────┐      ┌────────────────┐
     │  Vector Search │      │  BM25 Keyword  │
     │  (embeddings)  │      │  Search (FTS5) │
     │  语义相似性     │      │  精确关键词匹配  │
     └───────┬────────┘      └───────┬────────┘
             │                       │
             └───────────┬───────────┘
                         ▼
              ┌─────────────────────┐
              │   Merge & Rank      │
              │  • Temporal Decay   │
              │  • MMR (Diversity)  │
              │  • CJK Trigram      │
              └─────────────────────┘
```

**核心组件拆解：**

**A. 分块索引（Chunking）**
- 记忆文件切为 ~400 token 的 chunks，相邻 chunk 有 80 token 重叠
- 每个 chunk 存储：原文 + embedding vector + FTS5 关键词索引
- 持久化：`~/.openclaw/memory/<agentId>.sqlite`
- 文件变化 → debounced 重索引（1.5s）
- provider/model 切换 → 全量重建

**B. 混合搜索（Hybrid Search）**
- **Vector 路径**：语义相似性——"网关主机" 匹配 "运行 OpenClaw 的机器"
- **BM25 路径**：精确关键词匹配——ID、错误码、配置键、代码符号
- 两条路径**并行执行**，结果合并排序
- 任一不可用时，另一条单独运行（渐进降级）
- 无 embedding provider 时，退化为 FTS 词法排序（非 exact-match 原始顺序）

**C. 排序增强**
- **Temporal Decay**：旧笔记权重按指数衰减（默认半衰期 30 天）。上个月的笔记得分降至 50%。`MEMORY.md` 永不过期。
- **MMR (Maximal Marginal Relevance)**：5 条笔记都提同一配置 → MMR 让 top 覆盖不同主题，减少冗余。

**D. CJK 支持**
- Tri-gram tokenization 支持中文、日文、韩文
- 与 FTS5 配合，重建索引即可启用

**E. Provider 自动检测**
- 有 OpenAI / Gemini / Voyage / Mistral key → 自动启用 vector search
- 无 key → 仅 keyword search（不阻塞功能）
- 策略：渐进增强，先跑起来，有 embedding 后自动升级

### 2.4 Lumino 可借鉴模式总结

| OpenClaw 模式 | Lumino 当前状态 | 改造方向 | 改动量 |
|--------------|----------------|---------|-------|
| 热/温/冷三层注入 | 无分层，`lumino_get_daily_memories` 平铺返回 | session context + 昨天日记自动注入 + 历史按需检索 | 小 |
| Agent 直接写记忆 | **0 写入 tool** | 新增 4 个写入 tool（核心） | 中 |
| Memory Flush | 无 | system prompt 引导 Agent 在对话结束前回写 | 小 |
| Chunking + Hybrid Search | 纯字符串 `includes()` 匹配 | Phase 1 BM25 升级 + Phase 3 embeddings | 大 |
| Temporal Decay | 已有简单 recency boost（`scoreDailyMemory`） | 升级为指数衰减 + 可配置半衰期 | 小 |
| CJK Trigram | 正则 `split()` 分词 | 引入简单分词器（jieba-js / Intl.Segmenter） | 中 |
| Provider 自动检测 | `hasCompleteLlmSettings()` | 升级为检测 embedding 能力 | 中 |

---

## 3. 每日记忆 MD 实现方案

### 3.1 设计目标

参考 OpenClaw 的 `memory/YYYY-MM-DD.md`，让 Lumino 的每日记忆从"后台定期生成的静态摘要"变成"Agent 可在对话中直接读写的动态文档"。

### 3.2 数据模型扩展

```typescript
// 当前（仅后台生成）
type DailyMemoryEntry = {
  date: string           // "2026-05-10"
  createdAt: number      // Unix ms
  summary: string        // LLM 总结的自由文本
  keywords: string[]     // LLM 提取的关键词
  sourceEventIds: string[] // 引用的 Layer1 事件 ID
}

// 扩展后（Agent 可写入）
type DailyMemoryEntryExtended = DailyMemoryEntry & {
  // Agent 手动追加的笔记块
  manualNotes?: ManualNote[]
  // 记忆状态标记
  status: "auto" | "confirmed" | "outdated" | "important"
  statusReason?: string
  // 最后一次修改者
  lastModifiedBy: "scheduler" | "agent"
  lastModifiedAt: number
}

type ManualNote = {
  id: string             // uuid
  content: string        // 笔记内容
  tags: string[]         // 标签
  importance: "low" | "medium" | "high"
  source: "user_confirmed" | "agent_inference"
  createdAt: number
}
```

### 3.3 分层注入策略（类比热/温/冷）

Lumino 的 Side Panel Chat Agent 在每次对话时，system prompt 中自动注入记忆的**策略**不同于 OpenClaw 的文件注入，而是通过 tool 调用结果注入：

```
┌─────────────────────────────────────────────┐
│              Chat Agent System Prompt        │
│                                              │
│  ## 用户画像（热 — 始终注入）                  │
│  {profile}  ← 通过 lumino_get_profile 获取    │
│                                              │
│  ## 近期记忆（温 — 自动注入）                  │
│  昨天 + 今天的日记忆 summary                  │
│  ← chat 初始化时自动调用                      │
│     lumino_get_daily_memories 获取             │
│                                              │
│  ## 历史记忆（冷 — 按需检索）                  │
│  Agent 需要时主动调用 lumino_search_memories  │
│  ← 根据用户问题关键词检索                      │
└─────────────────────────────────────────────┘
```

**实现方式：**

在 `sidepanel.tsx` 中，每次新建会话或切换会话时，自动在消息列表开头插入一条 system 级别的 context 消息（或作为 system prompt 的一部分）：

```typescript
// 伪代码
async function buildAgentContext(): Promise<string> {
  const profile = await loadUserProfile()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const recentMemories = await loadDailyMemories()
  const warmMemories = recentMemories
    .filter(m => m.date === today || m.date === yesterday)
    .sort((a, b) => b.createdAt - a.createdAt)

  return `
## 用户画像
${formatProfile(profile)}

## 近期浏览记忆
${warmMemories.map(m => `- [${m.date}] ${m.summary}`).join('\n') || '（暂无）'}

当需要查询更早的记忆时，使用 lumino_search_memories 工具。
`
}
```

### 3.4 Agent 写入每日记忆的时机

参考 OpenClaw 的 Memory Flush 和 Agent 自主写入：

| 时机 | 触发方式 | 写入内容 | tool |
|------|---------|---------|------|
| 用户说"记住..." | 用户明确指令 | manualNote（高置信度） | `lumino_add_daily_note` |
| Agent 推断偏好 | Agent 判断（>0.8 置信度） | manualNote（标记 source=agent_inference） | `lumino_add_daily_note` |
| 用户说"不对，我之前..." | 用户纠正 | status=outdated 标记 | `lumino_mark_memory` |
| 对话结束前（Memory Flush 类比） | system prompt 引导 | 将未持久化的关键信息回写 | `lumino_save_conversation_insight` |
| 用户确认某条记忆 | 对话中确认 | status=confirmed 标记 | `lumino_mark_memory` |

### 3.5 Memory Flush 的 Lumino 实现

OpenClaw 的 Memory Flush 发生在 Compaction 之前。Lumino 当前没有 Compaction（Chrome Side Panel 生命周期不同），但可以换个角度实现：

**方案：在 system prompt 中增加"会话结束前检查"指引**

```
## 记忆回写规则
在每次回复的末尾，如果本轮对话中包含以下信息，主动使用记忆工具回写：
1. 用户明确要求记住的内容 → lumino_add_daily_note (source=user_confirmed)
2. 你从对话中高置信度（>0.8）推断出的偏好/事实
   → lumino_save_conversation_insight (source=agent_inference)
3. 用户纠正了你之前引用的记忆 → lumino_mark_memory (status=outdated)
4. 低置信度推断不要写入，用对话确认后再写

注意：同一轮对话不要重复写入相同内容。
```

这不需要额外引擎——纯 prompt 驱动，但效果等价于 OpenClaw 的 Memory Flush。

---

## 4. 记忆搜索升级方案

### 4.1 当前状态 vs 目标状态

**当前（`retriever.ts`）：**
- `extractContextKeywords()`：正则 split 提取关键词
- `scoreDailyMemory()`：`summary.includes(kw)` 字符串匹配
- 无分块、无排名算法、无 CJK 分词

**目标（Phase 1 → Phase 3）：**

| 阶段 | 搜索方式 | 新增能力 |
|------|---------|---------|
| Phase 1 | BM25 关键词搜索 | 分词器 + TF-IDF 权重 + 多字段索引 |
| Phase 2 | BM25 + 排序增强 | Temporal Decay + MMR 去重 + 来源置信度加权 |
| Phase 3 | Hybrid（BM25 + Vector） | embeddings 语义搜索 + 自动降级 |

### 4.2 Phase 1：BM25 关键词搜索（替代 `includes()`）

**为什么需要 BM25 而不是继续用 `includes()`？**

- `includes()` 对 "React" 和 "reactive" 的匹配权重一样（实际前者更相关）
- `includes()` 无法区分高频词（"的"/"是"）和信息词（"TypeScript"/"部署"）
- BM25 天然处理词频饱和度（TF saturation）和文档长度归一化

#### 4.2.1 分词器选择

```typescript
// 方案 A：Intl.Segmenter（推荐，浏览器原生，零依赖）
function tokenize(text: string): string[] {
  const segmenter = new Intl.Segmenter("zh-Hans", { granularity: "word" })
  const tokens: string[] = []
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    if (isWordLike && segment.length >= 2) {
      tokens.push(segment)
    }
  }
  return tokens
}

// 方案 B：jieba-js（更精确的中文分词，需要额外依赖 ~500KB）
// 如果 Intl.Segmenter 在 CJK 场景不够好，可以升级为 jieba
```

**选择：先用 `Intl.Segmenter`**（Chrome 87+，2020 年已支持）。如果用户反馈中文分词不够好，再引入 jieba-js 作为升级。

#### 4.2.2 BM25 实现

```typescript
// src/lib/memory/bm25.ts

type Bm25Document = {
  id: string          // memory date 或 insight id
  tokens: string[]    // 分词结果
  metadata: {         // 用于后续排序增强
    createdAt: number
    source: "scheduler" | "agent" | "user_confirmed"
    type: "daily_memory" | "insight" | "manual_note"
  }
}

type Bm25Config = {
  k1: number  // TF saturation，默认 1.2
  b: number   // 长度归一化，默认 0.75
}

function computeBm25(
  queryTokens: string[],
  documents: Bm25Document[],
  config: Bm25Config = { k1: 1.2, b: 0.75 }
): Array<{ id: string; score: number }> {
  const docCount = documents.length
  const avgDocLen = documents.reduce((sum, d) => sum + d.tokens.length, 0) / docCount

  // 1. 计算 IDF（逆文档频率）
  const idf = new Map<string, number>()
  for (const token of queryTokens) {
    const docFreq = documents.filter(d => d.tokens.includes(token)).length
    idf.set(token, Math.log(1 + (docCount - docFreq + 0.5) / (docFreq + 0.5)))
  }

  // 2. 计算每个文档的 BM25 得分
  return documents.map(doc => {
    let score = 0
    const docLen = doc.tokens.length
    const termFreq = new Map<string, number>()

    for (const t of doc.tokens) {
      termFreq.set(t, (termFreq.get(t) ?? 0) + 1)
    }

    for (const token of queryTokens) {
      const tf = termFreq.get(token) ?? 0
      if (tf === 0) continue

      const numerator = tf * (config.k1 + 1)
      const denominator = tf + config.k1 * (1 - config.b + config.b * docLen / avgDocLen)
      score += (idf.get(token) ?? 0) * numerator / denominator
    }

    return { id: doc.id, score }
  })
}
```

#### 4.2.3 索引构建

```typescript
// src/lib/memory/search-index.ts

async function buildSearchIndex(): Promise<Bm25Document[]> {
  const dailyMemories = await loadDailyMemories()
  const insights = await loadInsights()  // 来自我们新增的 insights 表
  const documents: Bm25Document[] = []

  // 日记忆 → 文档
  for (const memory of dailyMemories) {
    const fullText = [
      memory.summary,
      ...memory.keywords,
      ...(memory.manualNotes ?? []).map(n => n.content + " " + n.tags.join(" "))
    ].join(" ")

    documents.push({
      id: `daily:${memory.date}`,
      tokens: tokenize(fullText),
      metadata: {
        createdAt: memory.createdAt,
        source: memory.lastModifiedBy ?? "scheduler",
        type: "daily_memory"
      }
    })
  }

  // 洞察 → 文档
  for (const insight of insights) {
    documents.push({
      id: `insight:${insight.id}`,
      tokens: tokenize(`${insight.insight} ${insight.tags.join(" ")}`),
      metadata: {
        createdAt: insight.createdAt,
        source: insight.source,
        type: "insight"
      }
    })
  }

  return documents
}
```

### 4.3 Phase 2：排序增强

#### 4.3.1 Temporal Decay（指数衰减）

参考 OpenClaw 的 30 天半衰期，但 Lumino 的浏览器记忆量更小，可以更激进：

```typescript
function applyTemporalDecay(
  results: Array<{ id: string; score: number; createdAt: number }>,
  halfLifeDays: number = 14,  // Lumino 用 14 天半衰期（浏览器记忆变化更快）
  evergreenIds: Set<string> = new Set()  // 永不过期的记忆 ID
): Array<{ id: string; score: number }> {
  const now = Date.now()
  const lambda = Math.log(2) / (halfLifeDays * 24 * 60 * 60 * 1000)

  return results.map(r => {
    if (evergreenIds.has(r.id)) return r

    const ageMs = now - r.createdAt
    const decay = Math.exp(-lambda * ageMs)
    return { id: r.id, score: r.score * decay }
  })
}
```

**Lumino 的 evergreen 定义：**
- 标记为 `status=important` 的记忆 → 永不过期
- `source=user_confirmed` 的 manualNote → 半衰期 90 天（比自动生成的长）
- 其余 → 14 天半衰期

#### 4.3.2 来源置信度加权

不同类型记忆在搜索时的基础权重不同：

```typescript
const SOURCE_WEIGHTS = {
  "user_confirmed": 1.5,   // 用户明确说"记住"的内容，加权 1.5x
  "agent_inference": 1.0,  // Agent 推断的，标准权重
  "scheduler": 0.7,        // 后台自动生成的 LLM 总结，可能不准确
}

function applySourceWeight(
  results: Array<{ id: string; score: number; source: string }>
): Array<{ id: string; score: number }> {
  return results.map(r => ({
    id: r.id,
    score: r.score * (SOURCE_WEIGHTS[r.source as keyof typeof SOURCE_WEIGHTS] ?? 1.0)
  }))
}
```

#### 4.3.3 MMR 去重（简化版）

```typescript
function applyMmrDiversity(
  results: Array<{ id: string; score: number; tokens: string[] }>,
  lambda: number = 0.5,  // 多样性权重
  topK: number = 5
): Array<{ id: string; score: number }> {
  const selected: Array<{ id: string; score: number; tokens: string[] }> = []
  const remaining = [...results].sort((a, b) => b.score - a.score)

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0
    let bestScore = -Infinity

    for (let i = 0; i < remaining.length; i++) {
      const relevance = remaining[i].score
      let maxSimilarity = 0

      // 计算与已选结果的最大 Jaccard 相似度
      for (const s of selected) {
        const intersection = remaining[i].tokens.filter(t => s.tokens.includes(t)).length
        const union = new Set([...remaining[i].tokens, ...s.tokens]).size
        const similarity = intersection / union
        maxSimilarity = Math.max(maxSimilarity, similarity)
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity
      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIdx = i
      }
    }

    const picked = remaining.splice(bestIdx, 1)[0]
    selected.push(picked)
  }

  return selected.map(s => ({ id: s.id, score: s.score }))
}
```

### 4.4 Phase 3：Hybrid Search（BM25 + Vector）

当用户配置了 embedding-capable 的 LLM（如 OpenAI `text-embedding-3-small`）时，自动启用混合搜索。

```typescript
// src/lib/memory/hybrid-search.ts

async function hybridSearch(
  query: string,
  topK: number = 10
): Promise<SearchResult[]> {
  const settings = await getLlmSettings()
  const index = await buildSearchIndex()
  const queryTokens = tokenize(query)

  // BM25 路径（总是可用）
  const bm25Results = computeBm25(queryTokens, index)

  // Vector 路径（有 embedding 能力时才可用）
  let vectorResults: Array<{ id: string; score: number }> = []

  if (supportsEmbeddings(settings)) {
    const queryEmbedding = await getEmbedding(settings, query)
    const chunkEmbeddings = await loadChunkEmbeddings()  // 需要存储 chunk embeddings
    vectorResults = cosineSimilarityRank(queryEmbedding, chunkEmbeddings)
  }

  // 合并：BM25 和 Vector 各占 50% 权重
  const merged = mergeResults(bm25Results, vectorResults, {
    bm25Weight: vectorResults.length > 0 ? 0.5 : 1.0,
    vectorWeight: vectorResults.length > 0 ? 0.5 : 0.0
  })

  // 排序增强
  const withDecay = applyTemporalDecay(merged)
  const withSource = applySourceWeight(withDecay)
  const diversified = applyMmrDiversity(withSource, 0.3, topK)

  return diversified
}
```

**Embedding 存储：**

在 IndexedDB 中新增 `chunk_embeddings` store：

| Store | Key Path | 索引 | 用途 |
|-------|----------|------|------|
| `chunk_embeddings` | `chunkId` | `memoryId` | 存储每个 chunk 的 embedding vector（Float32Array → ArrayBuffer） |

**Provider 自动检测：**

```typescript
function supportsEmbeddings(settings: LlmSettings): boolean {
  // OpenAI / Gemini / Voyage / Mistral 都支持 embeddings
  const embeddingProviders = ["openai", "gemini", "voyage", "mistral"]
  const url = (settings.baseUrl ?? "").toLowerCase()

  return (
    hasCompleteLlmSettings(settings) &&
    embeddingProviders.some(p => url.includes(p))
  )
}
```

---

## 5. Agent Tool 完整清单

### 5.1 全部工具（改造后）

| Tool | 读写 | 功能 | 变更 |
|------|------|------|------|
| `lumino_get_profile` | R | 读取用户画像（含 updateHistory） | 保留+扩展 |
| `lumino_update_profile` | W | 增量更新画像字段 | **新增** |
| `lumino_get_daily_memories` | R | 读取近 N 天日记忆（含 manualNotes+status） | 保留+扩展 |
| `lumino_search_memories` | R | BM25 搜索日记忆+洞察（支持关键词/分类/时间过滤） | **新增** |
| `lumino_add_daily_note` | W | 向今日记忆追加手动笔记 | **新增** |
| `lumino_mark_memory` | W | 标记记忆状态（confirmed/outdated/important） | **新增** |
| `lumino_save_conversation_insight` | W | 保存对话洞察到长期记忆 | **新增** |
| `lumino_get_manifest_version` | R | 读版本号 | 保留 |
| `lumino_echo` | R/W | 回显文本 | 保留 |

### 5.2 `lumino_search_memories` 详细参数

```
name: lumino_search_memories
description: >
  搜索日记忆和对话洞察。支持关键词查询、时间范围、
  分类过滤。当用户问"我之前..."、"有没有关于..."时使用。
parameters:
  query:
    type: string
    description: "搜索关键词或自然语言查询"
  days:
    type: number
    description: "搜索最近多少天的记忆，默认 30"
  category:
    type: string
    enum: ["preference", "fact", "task", "learning", "all"]
    description: "过滤洞察分类，默认 all"
  source:
    type: string
    enum: ["user_confirmed", "agent_inference", "scheduler", "all"]
    description: "按来源过滤，默认 all"
  limit:
    type: number
    description: "返回条目数上限，默认 10，最大 20"
```

**搜索流程：**

```typescript
async function executeSearchMemories(args: {
  query: string
  days?: number
  category?: string
  source?: string
  limit?: number
}): Promise<string> {
  const days = args.days ?? 30
  const category = args.category ?? "all"
  const source = args.source ?? "all"
  const limit = Math.min(args.limit ?? 10, 20)

  // 1. 加载候选数据
  const dailyMemories = await loadDailyMemories()
  const insights = await loadInsights()

  // 2. 时间过滤
  const cutoff = Date.now() - days * 86400000
  const filteredMemories = dailyMemories.filter(m => m.createdAt >= cutoff)
  const filteredInsights = insights.filter(i => i.createdAt >= cutoff)

  // 3. 分类/来源过滤
  const categoryFilteredInsights = category === "all"
    ? filteredInsights
    : filteredInsights.filter(i => i.category === category)

  // 4. BM25 搜索
  const queryTokens = tokenize(args.query)
  const allDocs = buildSearchDocuments(filteredMemories, categoryFilteredInsights)
  let results = computeBm25(queryTokens, allDocs)
    .filter(r => r.score > 0)

  // 5. 来源置信度加权
  results = applySourceWeight(results)

  // 6. Temporal Decay
  results = applyTemporalDecay(results, 14)

  // 7. 排序 + Top-K + MMR
  results = applyMmrDiversity(results, 0.3, limit)
  results.sort((a, b) => b.score - a.score)

  // 8. 组装返回
  return JSON.stringify(
    results.map(r => {
      const doc = allDocs.find(d => d.id === r.id)
      return {
        id: r.id,
        score: r.score.toFixed(2),
        ...doc
      }
    }),
    null,
    2
  )
}
```

### 5.3 System Prompt 增强

```
你是 Lumino，在浏览器侧栏里陪伴用户的助手。回答简洁、温暖。

## 记忆管理能力
你拥有读写用户记忆的能力。在以下场景主动使用记忆工具：

### 读取记忆
- 用户询问历史行为 → lumino_search_memories(query=用户问题)
- 用户说"我不记得之前..."→ lumino_get_daily_memories(days=7)

### 写入记忆
- 用户说"记住..."→ lumino_add_daily_note(source=user_confirmed)
- 你从对话中高置信度（>0.8）推断偏好/事实
  → lumino_save_conversation_insight(source=agent_inference)
- 用户纠正你引用的记忆 → lumino_mark_memory(status=outdated)
- 用户确认某条记忆正确 → lumino_mark_memory(status=confirmed)

### 写入原则
- 低置信度推断不要自动写入，先用对话向用户确认
- 同一轮对话不要重复写入相同内容
- 涉及密码、银行卡、身份证等敏感信息 → 绝对不写入记忆
```

---

## 6. 实现路线

### Phase 1（核心写入 + BM25 搜索）

1. **类型扩展**
   - `DailyMemoryEntry` → `DailyMemoryEntryExtended`（manualNotes + status + lastModifiedBy）
   - 新增 `ConversationInsight`、`ManualNote` 类型
   
2. **IndexedDB 扩展**
   - `db.ts` 版本升至 v2
   - 新增 store：`insights`（keyPath=`id`，索引 `createdAt`, `category`, `sourceThreadId`）
   - 新增 store：`profile_updates`（keyPath=`id`，索引 `timestamp`）
   - `daily_memories` store 兼容旧数据（新字段 optional）

3. **BM25 搜索引擎**
   - 新增 `src/lib/memory/tokenizer.ts`（`Intl.Segmenter` 分词 + 停用词过滤）
   - 新增 `src/lib/memory/bm25.ts`（BM25 计算 + 排序增强）
   - 新增 `src/lib/memory/search-index.ts`（索引构建）
   - 重构 `retriever.ts`：`retrieveContext()` 改用 BM25

4. **Agent Tools**
   - 新增 4 个写入 tool：`lumino_update_profile`, `lumino_add_daily_note`, `lumino_mark_memory`, `lumino_save_conversation_insight`
   - 新增搜索 tool：`lumino_search_memories`
   - 更新 `lumino_get_daily_memories` 返回结构（含 manualNotes + status）

5. **System Prompt 更新**
   - `DEFAULT_SYSTEM_PROMPT` 加入记忆管理指引
   - `buildAgentContext()` 实现热/温两层注入

### Phase 2（排序增强 + 审查面）

1. **Temporal Decay + MMR** — 搜索排序的完整管线
2. **记忆查看面板** — Side Panel "memory" Tab 展示 Agent 写入的笔记/洞察
3. **冲突检测** — Agent 写入 vs scheduler 写入冲突标记

### Phase 3（Hybrid Search + Embeddings）

1. **Chunking** — 每日记忆和 insight 切为 ~300 token chunks（Lumino 记忆比 OpenClaw 短，chunk size 更小）
2. **Embedding 存储** — IndexedDB 新增 `chunk_embeddings` store
3. **Hybrid Search** — BM25 + Vector 并行检索 + 合并排序
4. **Provider 自动检测** — 有 embedding-capable LLM 时自动启用

---

## 7. 不需要引入的 OpenClaw 概念

| 概念 | 原因 |
|------|------|
| memory-wiki（完整知识库编译） | 浏览器插件不需要 claims/evidence/provenance 层级 |
| Dreaming（完整打分管线） | scheduler 日记忆生成已覆盖后台整合需求 |
| Commitments（完整 heartbeat） | Lumino 无后台推送机制，简化为 `ConversationInsight` + `expiresAt` |
| 多 backend（QMD/Honcho/LanceDB） | 浏览器扩展仅能用 IndexedDB |
| SQLite FTS5 | 浏览器无 SQLite，用 BM25 内存计算替代 |

---

## 8. 关键设计决策

### 8.1 为什么 BM25 而不是直接调 embedding API？

- **渐进增强**：BM25 零依赖、零延迟、在浏览器中直接运行
- **离线可用**：即使用户没配 LLM，记忆搜索也能工作
- **混合模式**：Phase 3 的 hybrid search 让 BM25 和 vector 互补——BM25 负责精确匹配（配置键、代码符号），vector 负责语义理解
- OpenClaw 的 builtin engine 也是这样设计的：BM25 始终可用，vector 是增强

### 8.2 为什么 Agent 不直接改 scheduler 生成的 summary？

- scheduler 生成的 `summary` 字段是 LLM 对全天行为的总结，属于"客观记录"
- Agent 写入的是 `manualNotes`（补充）和 `status`（纠错标记），不覆盖原始 summary
- 类比 OpenClaw：Dreaming 结果写入 `DREAMS.md`，不直接改 `memory/YYYY-MM-DD.md`

### 8.3 Chunk size 为什么是 300 token 而不是 OpenClaw 的 400？

Lumino 的日记忆 summary 通常是 3-5 句话（~100-200 token），远小于 OpenClaw 的日记文件（一整天的详细记录）。300 token 的 chunk 足以容纳一条日记忆 + 手动笔记，chunk 之间不需要重叠（每条记忆独立）。

---

## 9. 安全性考量

### 9.1 写入的信任边界

```
用户明确指令 > Agent 高置信推断 > 后台 Scheduler
```

- `source=user_confirmed` → 直接写入
- `source=agent_inference` → 写入但标注来源
- 后台 scheduler **永不**覆盖 Agent 手动标记的内容

### 9.2 敏感信息过滤

所有写入 tool（`lumino_add_daily_note` / `lumino_save_conversation_insight`）在 `executeLuminoToolCall` 中检查内容：
- 正则匹配身份证、银行卡、密码模式
- 匹配到 → 拒绝写入，返回 `{ error: "sensitive_content_detected" }`

### 9.3 隐私域名记忆

`privacy-filter.ts` 已跳过 bank/gov/health/adult 域名的事件采集。所以这些域名的信息不会出现在 scheduler 生成的日记忆中。Agent 搜索返回的结果自然也经过隐私过滤。

---

## 10. 后续可探索方向

1. **记忆审查面板** — Side Panel 中让用户直接编辑/删除记忆
2. **记忆导出** — Markdown/JSON 导出，跨设备同步
3. **记忆驱动的主动建议** — "上次你在这个表单里填过..."
4. **Memory Flush 时机优化** — 侧栏关闭时触发一次回写检查
