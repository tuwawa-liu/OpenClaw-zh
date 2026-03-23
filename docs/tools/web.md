---
summary: "Web search + fetch tools (Brave, Firecrawl, Gemini, Grok, Kimi, and Perplexity providers)"
read_when:
  - 你想启用 web_search 或 web_fetch
  - 你需要设置 Brave Search API 密钥
  - 你想使用 Perplexity Sonar 进行网络搜索
summary: Web 搜索 + 获取工具（Brave Search API、Perplexity 直连/OpenRouter）
title: Web 工具
x-i18n:
  generated_at: "2026-02-03T10:12:43Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 760b706cc966cb421e370f10f8e76047f8ca9fe0a106d90c05d979976789465a
  source_path: tools/web.md
  workflow: 15
---

# Web 工具

OpenClaw 提供两个轻量级 Web 工具：

- `web_search` — Search the web using Brave Search API, Firecrawl Search, Gemini with Google Search grounding, Grok, Kimi, or Perplexity Search API.
- `web_fetch` — HTTP fetch + readable extraction (HTML → markdown/text).

这些**不是**浏览器自动化。对于 JS 密集型网站或需要登录的情况，请使用[浏览器工具](/tools/browser)。

## 工作原理

- `web_search` calls your configured provider and returns results.
- Results are cached by query for 15 minutes (configurable).
- `web_fetch` does a plain HTTP GET and extracts readable content
  (HTML → markdown/text). It does **not** execute JavaScript.
- `web_fetch` is enabled by default (unless explicitly disabled).
- The bundled Firecrawl plugin also adds `firecrawl_search` and `firecrawl_scrape` when enabled.

## 选择搜索提供商

| 提供商            | 优点                     | 缺点                               | API 密钥                                     |
| ----------------- | ------------------------ | ---------------------------------- | -------------------------------------------- |
| **Brave**（默认） | 快速、结构化结果、免费层 | 传统搜索结果                       | `BRAVE_API_KEY`                              |
| **Perplexity**    | AI 综合答案、引用、实时  | 需要 Perplexity 或 OpenRouter 访问 | `OPENROUTER_API_KEY` 或 `PERPLEXITY_API_KEY` |

| Provider                  | Result shape                       | Provider-specific filters                                    | Notes                                                                          | API key                                     |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------- |
| **Brave Search API**      | Structured results with snippets   | `country`, `language`, `ui_lang`, time                       | Supports Brave `llm-context` mode                                              | `BRAVE_API_KEY`                             |
| **Firecrawl Search**      | Structured results with snippets   | Use `firecrawl_search` for Firecrawl-specific search options | Best for pairing search with Firecrawl scraping/extraction                     | `FIRECRAWL_API_KEY`                         |
| **Gemini**                | AI-synthesized answers + citations | —                                                            | Uses Google Search grounding                                                   | `GEMINI_API_KEY`                            |
| **Grok**                  | AI-synthesized answers + citations | —                                                            | Uses xAI web-grounded responses                                                | `XAI_API_KEY`                               |
| **Kimi**                  | AI-synthesized answers + citations | —                                                            | Uses Moonshot web search                                                       | `KIMI_API_KEY` / `MOONSHOT_API_KEY`         |
| **Perplexity Search API** | Structured results with snippets   | `country`, `language`, time, `domain_filter`                 | Supports content extraction controls; OpenRouter uses Sonar compatibility path | `PERPLEXITY_API_KEY` / `OPENROUTER_API_KEY` |

### Auto-detection

The table above is alphabetical. If no `provider` is explicitly set, runtime auto-detection checks providers in this order:

1. **Brave** — `BRAVE_API_KEY` env var or `tools.web.search.apiKey` config
2. **Gemini** — `GEMINI_API_KEY` env var or `tools.web.search.gemini.apiKey` config
3. **Grok** — `XAI_API_KEY` env var or `tools.web.search.grok.apiKey` config
4. **Kimi** — `KIMI_API_KEY` / `MOONSHOT_API_KEY` env var or `tools.web.search.kimi.apiKey` config
5. **Perplexity** — `PERPLEXITY_API_KEY`, `OPENROUTER_API_KEY`, or `tools.web.search.perplexity.apiKey` config
6. **Firecrawl** — `FIRECRAWL_API_KEY` env var or `tools.web.search.firecrawl.apiKey` config

If no keys are found, it falls back to Brave (you'll get a missing-key error prompting you to configure one).

Runtime SecretRef behavior:

- Web tool SecretRefs are resolved atomically at gateway startup/reload.
- In auto-detect mode, OpenClaw resolves only the selected provider key. Non-selected provider SecretRefs stay inactive until selected.
- If the selected provider SecretRef is unresolved and no provider env fallback exists, startup/reload fails fast.

## Setting up web search

Use `openclaw configure --section web` to set up your API key and choose a provider.

### Brave Search

1. Create a Brave Search API account at [brave.com/search/api](https://brave.com/search/api/)
2. In the dashboard, choose the **Search** plan and generate an API key.
3. Run `openclaw configure --section web` to store the key in config, or set `BRAVE_API_KEY` in your environment.

Each Brave plan includes **\$5/month in free credit** (renewing). The Search
plan costs \$5 per 1,000 requests, so the credit covers 1,000 queries/month. Set
your usage limit in the Brave dashboard to avoid unexpected charges. See the
[Brave API portal](https://brave.com/search/api/) for current plans and
pricing.

### Perplexity Search

1. Create a Perplexity account at [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
2. Generate an API key in the dashboard
3. Run `openclaw configure --section web` to store the key in config, or set `PERPLEXITY_API_KEY` in your environment.

For legacy Sonar/OpenRouter compatibility, set `OPENROUTER_API_KEY` instead, or configure `tools.web.search.perplexity.apiKey` with an `sk-or-...` key. Setting `tools.web.search.perplexity.baseUrl` or `model` also opts Perplexity back into the chat-completions compatibility path.

See [Perplexity Search API Docs](https://docs.perplexity.ai/guides/search-quickstart) for more details.

### Where to store the key

**Via config:** run `openclaw configure --section web`. It stores the key under the provider-specific config path:

- Brave: `tools.web.search.apiKey`
- Firecrawl: `tools.web.search.firecrawl.apiKey`
- Gemini: `tools.web.search.gemini.apiKey`
- Grok: `tools.web.search.grok.apiKey`
- Kimi: `tools.web.search.kimi.apiKey`
- Perplexity: `tools.web.search.perplexity.apiKey`

All of these fields also support SecretRef objects.

**Via environment:** set provider env vars in the Gateway process environment:

- Brave: `BRAVE_API_KEY`
- Firecrawl: `FIRECRAWL_API_KEY`
- Gemini: `GEMINI_API_KEY`
- Grok: `XAI_API_KEY`
- Kimi: `KIMI_API_KEY` or `MOONSHOT_API_KEY`
- Perplexity: `PERPLEXITY_API_KEY` or `OPENROUTER_API_KEY`

For a gateway install, put these in `~/.openclaw/.env` (or your service environment). See [Env vars](/help/faq#how-does-openclaw-load-environment-variables).

### Config examples

**Brave Search:**

```json5
{
  tools: {
    web: {
      search: {
        provider: "brave", // 或 "perplexity"
      },
    },
  },
}
```

**Firecrawl Search:**

```json5
{
  plugins: {
    entries: {
      firecrawl: {
        enabled: true,
      },
    },
  },
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "firecrawl",
        firecrawl: {
          apiKey: "fc-...", // optional if FIRECRAWL_API_KEY is set
          baseUrl: "https://api.firecrawl.dev",
        },
      },
    },
  },
}
```

When you choose Firecrawl in onboarding or `openclaw configure --section web`, OpenClaw enables the bundled Firecrawl plugin automatically so `web_search`, `firecrawl_search`, and `firecrawl_scrape` are all available.

**Brave LLM Context mode:**

```json5
{
  tools: {
    web: {
      search: {
        provider: "perplexity",
        perplexity: {
          apiKey: "pplx-...",
          baseUrl: "https://api.perplexity.ai",
          model: "perplexity/sonar-pro",
        },
      },
    },
  },
}
```

## 获取 Brave API 密钥

1. 在 https://brave.com/search/api/ 创建 Brave Search API 账户
2. 在控制面板中，选择 **Data for Search** 计划（不是"Data for AI"）并生成 API 密钥。
3. 运行 `openclaw configure --section web` 将密钥存储在配置中（推荐），或在环境中设置 `BRAVE_API_KEY`。

Brave 提供免费层和付费计划；查看 Brave API 门户了解当前限制和定价。

### 在哪里设置密钥（推荐）

**推荐：** 运行 `openclaw configure --section web`。它将密钥存储在 `~/.openclaw/openclaw.json` 的 `tools.web.search.apiKey` 下。

**环境变量替代方案：** 在 Gateway 网关进程环境中设置 `BRAVE_API_KEY`。对于 Gateway 网关安装，将其放在 `~/.openclaw/.env`（或你的服务环境）中。参见[环境变量](/help/faq#how-does-openclaw-load-environment-variables)。

## 使用 Perplexity（直连或通过 OpenRouter）

Perplexity Sonar 模型具有内置的网络搜索功能，并返回带有引用的 AI 综合答案。你可以通过 OpenRouter 使用它们（无需信用卡 - 支持加密货币/预付费）。

### 获取 OpenRouter API 密钥

1. 在 https://openrouter.ai/ 创建账户
2. 添加额度（支持加密货币、预付费或信用卡）
3. 在账户设置中生成 API 密钥

Search the web using your configured provider.

### Requirements

- `tools.web.search.enabled` must not be `false` (default: enabled)
- API key for your chosen provider:
  - **Brave**: `BRAVE_API_KEY` or `tools.web.search.apiKey`
  - **Firecrawl**: `FIRECRAWL_API_KEY` or `tools.web.search.firecrawl.apiKey`
  - **Gemini**: `GEMINI_API_KEY` or `tools.web.search.gemini.apiKey`
  - **Grok**: `XAI_API_KEY` or `tools.web.search.grok.apiKey`
  - **Kimi**: `KIMI_API_KEY`, `MOONSHOT_API_KEY`, or `tools.web.search.kimi.apiKey`
  - **Perplexity**: `PERPLEXITY_API_KEY`, `OPENROUTER_API_KEY`, or `tools.web.search.perplexity.apiKey`
- All provider key fields above support SecretRef objects.

### Config

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "perplexity",
        perplexity: {
          // API 密钥（如果设置了 OPENROUTER_API_KEY 或 PERPLEXITY_API_KEY 则可选）
          apiKey: "sk-or-v1-...",
          // 基础 URL（如果省略则根据密钥感知默认值）
          baseUrl: "https://openrouter.ai/api/v1",
          // 模型（默认为 perplexity/sonar-pro）
          model: "perplexity/sonar-pro",
        },
      },
    },
  },
}
```

**环境变量替代方案：** 在 Gateway 网关环境中设置 `OPENROUTER_API_KEY` 或 `PERPLEXITY_API_KEY`。对于 Gateway 网关安装，将其放在 `~/.openclaw/.env` 中。

如果未设置基础 URL，OpenClaw 会根据 API 密钥来源选择默认值：

- `PERPLEXITY_API_KEY` 或 `pplx-...` → `https://api.perplexity.ai`
- `OPENROUTER_API_KEY` 或 `sk-or-...` → `https://openrouter.ai/api/v1`
- 未知密钥格式 → OpenRouter（安全回退）

### 可用的 Perplexity 模型

| 模型                             | 描述                 | 最适合   |
| -------------------------------- | -------------------- | -------- |
| `perplexity/sonar`               | 带网络搜索的快速问答 | 快速查询 |
| `perplexity/sonar-pro`（默认）   | 带网络搜索的多步推理 | 复杂问题 |
| `perplexity/sonar-reasoning-pro` | 思维链分析           | 深度研究 |

## web_search

使用配置的提供商搜索网络。

### 要求

- `tools.web.search.enabled` 不能为 `false`（默认：启用）
- 所选提供商的 API 密钥：
  - **Brave**：`BRAVE_API_KEY` 或 `tools.web.search.apiKey`
  - **Perplexity**：`OPENROUTER_API_KEY`、`PERPLEXITY_API_KEY` 或 `tools.web.search.perplexity.apiKey`

### 配置

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        apiKey: "BRAVE_API_KEY_HERE", // 如果设置了 BRAVE_API_KEY 则可选
        maxResults: 5,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15,
      },
    },
  },
}
```

### 工具参数

Parameters depend on the selected provider.

Perplexity's OpenRouter / Sonar compatibility path supports only `query` and `freshness`.
If you set `tools.web.search.perplexity.baseUrl` / `model`, use `OPENROUTER_API_KEY`, or configure an `sk-or-...` key, Search API-only filters return explicit errors.

| Parameter             | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `query`               | Search query (required)                               |
| `count`               | Results to return (1-10, default: 5)                  |
| `country`             | 2-letter ISO country code (e.g., "US", "DE")          |
| `language`            | ISO 639-1 language code (e.g., "en", "de")            |
| `freshness`           | Time filter: `day`, `week`, `month`, or `year`        |
| `date_after`          | Results after this date (YYYY-MM-DD)                  |
| `date_before`         | Results before this date (YYYY-MM-DD)                 |
| `ui_lang`             | UI language code (Brave only)                         |
| `domain_filter`       | Domain allowlist/denylist array (Perplexity only)     |
| `max_tokens`          | Total content budget, default 25000 (Perplexity only) |
| `max_tokens_per_page` | Per-page token limit, default 2048 (Perplexity only)  |

Firecrawl `web_search` supports `query` and `count`. For Firecrawl-specific controls like `sources`, `categories`, result scraping, or scrape timeout, use `firecrawl_search` from the bundled Firecrawl plugin.

**Examples:**

```javascript
// 德国特定搜索
await web_search({
  query: "TV online schauen",
  count: 10,
  country: "DE",
  search_lang: "de",
});

// 带法语 UI 的法语搜索
await web_search({
  query: "actualités",
  country: "FR",
  search_lang: "fr",
  ui_lang: "fr",
});

// 最近结果（过去一周）
await web_search({
  query: "TMBG interview",
  freshness: "pw",
});
```

## web_fetch

获取 URL 并提取可读内容。

### 要求

- `tools.web.fetch.enabled` 不能为 `false`（默认：启用）
- 可选的 Firecrawl 回退：设置 `tools.web.fetch.firecrawl.apiKey` 或 `FIRECRAWL_API_KEY`。

### 配置

```json5
{
  tools: {
    web: {
      fetch: {
        enabled: true,
        maxChars: 50000,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15,
        maxRedirects: 3,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        readability: true,
        firecrawl: {
          enabled: true,
          apiKey: "FIRECRAWL_API_KEY_HERE", // 如果设置了 FIRECRAWL_API_KEY 则可选
          baseUrl: "https://api.firecrawl.dev",
          onlyMainContent: true,
          maxAgeMs: 86400000, // 毫秒（1 天）
          timeoutSeconds: 60,
        },
      },
    },
  },
}
```

### 工具参数

- `url`（必需，仅限 http/https）
- `extractMode`（`markdown` | `text`）
- `maxChars`（截断长页面）

注意：

- `web_fetch` 首先使用 Readability（主要内容提取），然后使用 Firecrawl（如果已配置）。如果两者都失败，工具返回错误。
- Firecrawl 请求使用机器人规避模式并默认缓存结果。
- `web_fetch` 默认发送类 Chrome 的 User-Agent 和 `Accept-Language`；如需要可覆盖 `userAgent`。
- `web_fetch` 阻止私有/内部主机名并重新检查重定向（用 `maxRedirects` 限制）。
- `web_fetch` 是尽力提取；某些网站需要浏览器工具。
- 参见 [Firecrawl](/tools/firecrawl) 了解密钥设置和服务详情。
- 响应会被缓存（默认 15 分钟）以减少重复获取。
- 如果你使用工具配置文件/允许列表，添加 `web_search`/`web_fetch` 或 `group:web`。
- 如果缺少 Brave 密钥，`web_search` 返回一个简短的设置提示和文档链接。
