// ============================================================
// 隐私过滤 — 跳过敏感域名的数据采集
// ============================================================

/**
 * 敏感域名分类：
 * - bank: 银行/金融
 * - gov: 政府网站
 * - health: 医疗/健康
 * - adult: 成人内容（额外保护）
 */
const PRIVACY_DOMAINS: ReadonlyArray<{
  category: string
  patterns: RegExp[]
}> = [
  {
    category: "bank",
    patterns: [
      /\.bank$/i,
      /\bbank\b/i,
      /\bbanking\b/i,
      /\bpaypal\.com$/i,
      /\bstripe\.com$/i,
      /\bwise\.com$/i,
      /\bvenmo\.com$/i,
      /\bcashapp\.com$/i
    ]
  },
  {
    category: "gov",
    patterns: [
      /\.gov$/i,
      /\.gov\./i,
      /\.mil$/i,
      /\.govt$/i,
      /\bgovt\./i,
      /\btax\./i,
      /\birs\b/i
    ]
  },
  {
    category: "health",
    patterns: [
      /\bhealthcare\b/i,
      /\bhealth\./i,
      /\bhospital\b/i,
      /\bclinic\b/i,
      /\bpharmacy\b/i,
      /\bmedical\b/i,
      /\bdoximity\b/i,
      /\bepic\./i
    ]
  },
  {
    category: "adult",
    patterns: [
      /\bporn\b/i,
      /\bxvideos?\b/i,
      /\bpornhub\b/i,
      /\bredtube\b/i,
      /\byouporn\b/i,
      /\bonlyfans\b/i
    ]
  }
]

/**
 * 检查给定 hostname 是否属于隐私敏感域名。
 * @returns true 表示应该过滤（不采集）
 */
export function isPrivacyHostname(hostname: string): boolean {
  if (!hostname) {
    return true
  }

  // localhost / 内网 IP 不过滤（方便开发调试）
  if (hostname === "localhost" || hostname.startsWith("127.") || hostname.startsWith("192.168.")) {
    return false
  }

  for (const domain of PRIVACY_DOMAINS) {
    for (const pattern of domain.patterns) {
      if (pattern.test(hostname)) {
        return true
      }
    }
  }

  return false
}

/**
 * 从 URL 字符串提取 hostname 并做隐私检查。
 */
export function isPrivacyUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return isPrivacyHostname(hostname)
  } catch {
    // 无效 URL 默认过滤
    return true
  }
}
