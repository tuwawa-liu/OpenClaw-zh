---
read_when:
  - You want to use Perplexity Search for web search
  - You need PERPLEXITY_API_KEY or OPENROUTER_API_KEY setup
title: "Perplexity Search (legacy path)"
---

# Perplexity Sonar

OpenClaw 可以使用 Perplexity Sonar 作为 `web_search` 工具。你可以通过 Perplexity 的直连 API 或通过 OpenRouter 连接。

For compatibility, OpenClaw also supports legacy Perplexity Sonar/OpenRouter setups.
If you use `OPENROUTER_API_KEY`, an `sk-or-...` key in `plugins.entries.perplexity.config.webSearch.apiKey`, or set `plugins.entries.perplexity.config.webSearch.baseUrl` / `model`, the provider switches to the chat-completions path and returns AI-synthesized answers with citations instead of structured Search API results.

### Perplexity（直连）

- Base URL：https://api.perplexity.ai
- 环境变量：`PERPLEXITY_API_KEY`

### OpenRouter（替代方案）

If you were already using OpenRouter for Perplexity Sonar, keep `provider: "perplexity"` and set `OPENROUTER_API_KEY` in the Gateway environment, or store an `sk-or-...` key in `plugins.entries.perplexity.config.webSearch.apiKey`.

Optional compatibility controls:

- `plugins.entries.perplexity.config.webSearch.baseUrl`
- `plugins.entries.perplexity.config.webSearch.model`

## Config examples

### Native Perplexity Search API

```json5
{
  plugins: {
    entries: {
      perplexity: {
        config: {
          webSearch: {
            apiKey: "pplx-...",
          },
        },
      },
    },
  },
  tools: {
    web: {
      search: {
        provider: "perplexity",
      },
    },
  },
}
```

### OpenRouter / Sonar compatibility

```json5
{
  plugins: {
    entries: {
      perplexity: {
        config: {
          webSearch: {
            apiKey: "<openrouter-api-key>",
            baseUrl: "https://openrouter.ai/api/v1",
            model: "perplexity/sonar-pro",
          },
        },
      },
    },
  },
  tools: {
    web: {
      search: {
        provider: "perplexity",
      },
    },
  },
}
```

## 从 Brave 切换

**Via config:** run `openclaw configure --section web`. It stores the key in
`~/.openclaw/openclaw.json` under `plugins.entries.perplexity.config.webSearch.apiKey`.
That field also accepts SecretRef objects.

**Via environment:** set `PERPLEXITY_API_KEY` or `OPENROUTER_API_KEY`
in the Gateway process environment. For a gateway install, put it in
`~/.openclaw/.env` (or your service environment). See [Env vars](/help/faq#env-vars-and-env-loading).

If `provider: "perplexity"` is configured and the Perplexity key SecretRef is unresolved with no env fallback, startup/reload fails fast.

## Tool parameters

These parameters apply to the native Perplexity Search API path.

| Parameter             | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `query`               | Search query (required)                              |
| `count`               | Number of results to return (1-10, default: 5)       |
| `country`             | 2-letter ISO country code (e.g., "US", "DE")         |
| `language`            | ISO 639-1 language code (e.g., "en", "de", "fr")     |
| `freshness`           | Time filter: `day` (24h), `week`, `month`, or `year` |
| `date_after`          | Only results published after this date (YYYY-MM-DD)  |
| `date_before`         | Only results published before this date (YYYY-MM-DD) |
| `domain_filter`       | Domain allowlist/denylist array (max 20)             |
| `max_tokens`          | Total content budget (default: 25000, max: 1000000)  |
| `max_tokens_per_page` | Per-page token limit (default: 2048)                 |

For the legacy Sonar/OpenRouter compatibility path, only `query` and `freshness` are supported.
Search API-only filters such as `country`, `language`, `date_after`, `date_before`, `domain_filter`, `max_tokens`, and `max_tokens_per_page` return explicit errors.

**Examples:**

```javascript
// Country and language-specific search
await web_search({
  query: "renewable energy",
  country: "DE",
  language: "de",
});

// Recent results (past week)
await web_search({
  query: "AI news",
  freshness: "week",
});

// Date range search
await web_search({
  query: "AI developments",
  date_after: "2024-01-01",
  date_before: "2024-06-30",
});

// Domain filtering (allowlist)
await web_search({
  query: "climate research",
  domain_filter: ["nature.com", "science.org", ".edu"],
});

// Domain filtering (denylist - prefix with -)
await web_search({
  query: "product reviews",
  domain_filter: ["-reddit.com", "-pinterest.com"],
});

// More content extraction
await web_search({
  query: "detailed AI research",
  max_tokens: 50000,
  max_tokens_per_page: 4096,
});
```

如果同时设置了 `PERPLEXITY_API_KEY` 和 `OPENROUTER_API_KEY`，请设置 `tools.web.search.perplexity.baseUrl`（或 `tools.web.search.perplexity.apiKey`）以消除歧义。

如果未设置 base URL，OpenClaw 会根据 API 密钥来源选择默认值：

- `PERPLEXITY_API_KEY` 或 `pplx-...` → 直连 Perplexity（`https://api.perplexity.ai`）
- `OPENROUTER_API_KEY` 或 `sk-or-...` → OpenRouter（`https://openrouter.ai/api/v1`）
- 未知密钥格式 → OpenRouter（安全回退）

- Perplexity Search API returns structured web search results (`title`, `url`, `snippet`)
- OpenRouter or explicit `plugins.entries.perplexity.config.webSearch.baseUrl` / `model` switches Perplexity back to Sonar chat completions for compatibility
- Results are cached for 15 minutes by default (configurable via `cacheTtlMinutes`)

- `perplexity/sonar` — 带网络搜索的快速问答
- `perplexity/sonar-pro`（默认） — 多步推理 + 网络搜索
- `perplexity/sonar-reasoning-pro` — 深度研究

请参阅 [Web 工具](/tools/web) 了解 web_search 配置详情。
