---
title: "差异对比"
summary: "用于智能体的只读差异查看器和文件渲染器（可选插件工具）"
description: "使用可选的 Diffs 插件将前后文本或统一补丁渲染为 Gateway 托管的差异视图、文件（PNG 或 PDF）或两者兼有。"
read_when:
  - 希望智能体将代码或 Markdown 编辑显示为差异
  - 需要画布就绪的查看器 URL 或渲染的差异文件
  - 需要具有安全默认值的受控临时差异制品
---

# 差异对比

`diffs` 是一个可选的插件工具，带有简短的内置系统指引和一个伴随技能，可将变更内容转换为供智能体使用的只读差异制品。

它接受以下任一输入：

- `before` 和 `after` 文本
- 统一 `patch` 补丁

它可以返回：

- 用于画布展示的 Gateway 查看器 URL
- 用于消息发送的渲染文件路径（PNG 或 PDF）
- 在一次调用中同时返回两种输出

启用后，插件会将简洁的使用指引注入到系统提示空间中，并暴露一个详细的技能供智能体在需要更完整说明时使用。

## 快速开始

1. 启用插件。
2. 使用 `mode: "view"` 调用 `diffs` 实现画布优先流程。
3. 使用 `mode: "file"` 调用 `diffs` 实现聊天文件发送流程。
4. 使用 `mode: "both"` 调用 `diffs` 当您同时需要两种制品时。

## 启用插件

```json5
{
  plugins: {
    entries: {
      diffs: {
        enabled: true,
      },
    },
  },
}
```

## 禁用内置系统指引

如果您想保持 `diffs` 工具启用但禁用其内置系统提示指引，将 `plugins.entries.diffs.hooks.allowPromptInjection` 设置为 `false`：

```json5
{
  plugins: {
    entries: {
      diffs: {
        enabled: true,
        hooks: {
          allowPromptInjection: false,
        },
      },
    },
  },
}
```

这会阻止 diffs 插件的 `before_prompt_build` 钩子，同时保持插件、工具和伴随技能可用。

如果您想同时禁用指引和工具，请改为禁用插件。

## 典型智能体工作流

1. 智能体调用 `diffs`。
2. 智能体读取 `details` 字段。
3. 智能体执行以下之一：
   - 使用 `canvas present` 打开 `details.viewerUrl`
   - 使用 `message` 的 `path` 或 `filePath` 发送 `details.filePath`
   - 两者都执行

## 输入示例

前后对比：

```json
{
  "before": "# Hello\n\nOne",
  "after": "# Hello\n\nTwo",
  "path": "docs/example.md",
  "mode": "view"
}
```

补丁：

```json
{
  "patch": "diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;\n",
  "mode": "both"
}
```

## 工具输入参考

除非另有说明，所有字段均为可选：

- `before` (`string`)：原始文本。在省略 `patch` 时与 `after` 一起必填。
- `after` (`string`)：更新后文本。在省略 `patch` 时与 `before` 一起必填。
- `patch` (`string`)：统一差异文本。与 `before` 和 `after` 互斥。
- `path` (`string`)：前后对比模式的显示文件名。
- `lang` (`string`)：前后对比模式的语言覆盖提示。
- `title` (`string`)：查看器标题覆盖。
- `mode` (`"view" | "file" | "both"`)：输出模式。默认使用插件默认值 `defaults.mode`。
- `theme` (`"light" | "dark"`)：查看器主题。默认使用插件默认值 `defaults.theme`。
- `layout` (`"unified" | "split"`)：差异布局。默认使用插件默认值 `defaults.layout`。
- `expandUnchanged` (`boolean`)：当完整上下文可用时展开未更改的部分。仅限每次调用选项（不是插件默认键）。
- `fileFormat` (`"png" | "pdf"`)：渲染文件格式。默认使用插件默认值 `defaults.fileFormat`。
- `fileQuality` (`"standard" | "hq" | "print"`)：PNG 或 PDF 渲染的质量预设。
- `fileScale` (`number`)：设备缩放覆盖（`1`-`4`）。
- `fileMaxWidth` (`number`)：最大渲染宽度，单位为 CSS 像素（`640`-`2400`）。
- `ttlSeconds` (`number`)：查看器制品 TTL，单位为秒。默认 1800，最大 21600。
- `baseUrl` (`string`)：查看器 URL 源覆盖。必须为 `http` 或 `https`，不含查询/哈希。

验证和限制：

- `before` 和 `after` 各最大 512 KiB。
- `patch` 最大 2 MiB。
- `path` 最大 2048 字节。
- `lang` 最大 128 字节。
- `title` 最大 1024 字节。
- 补丁复杂度上限：最多 128 个文件和 120000 总行数。
- 同时提供 `patch` 和 `before` 或 `after` 将被拒绝。
- 渲染文件安全限制（适用于 PNG 和 PDF）：
  - `fileQuality: "standard"`：最大 8 MP（8,000,000 渲染像素）。
  - `fileQuality: "hq"`：最大 14 MP（14,000,000 渲染像素）。
  - `fileQuality: "print"`：最大 24 MP（24,000,000 渲染像素）。
  - PDF 还有最多 50 页的限制。

## 输出详情契约

工具在 `details` 下返回结构化元数据。

创建查看器的模式共享字段：

- `artifactId`
- `viewerUrl`
- `viewerPath`
- `title`
- `expiresAt`
- `inputKind`
- `fileCount`
- `mode`

渲染 PNG 或 PDF 时的文件字段：

- `filePath`
- `path`（与 `filePath` 相同值，用于消息工具兼容性）
- `fileBytes`
- `fileFormat`
- `fileQuality`
- `fileScale`
- `fileMaxWidth`

模式行为摘要：

- `mode: "view"`：仅查看器字段。
- `mode: "file"`：仅文件字段，不创建查看器制品。
- `mode: "both"`：查看器字段加文件字段。如果文件渲染失败，查看器仍返回并附带 `fileError`。

## 折叠的未更改部分

- 查看器可以显示类似 `N 行未修改` 的行。
- 这些行上的展开控件是有条件的，不保证对每种输入类型都可用。
- 当渲染的差异具有可展开的上下文数据时，展开控件会出现，这在前后对比输入中很典型。
- 对于许多统一补丁输入，被省略的上下文内容在解析的补丁块中不可用，因此该行可能出现但没有展开控件。这是预期行为。
- `expandUnchanged` 仅在可展开上下文存在时适用。

## 插件默认值

在 `~/.openclaw/openclaw.json` 中设置插件范围的默认值：

```json5
{
  plugins: {
    entries: {
      diffs: {
        enabled: true,
        config: {
          defaults: {
            fontFamily: "Fira Code",
            fontSize: 15,
            lineSpacing: 1.6,
            layout: "unified",
            showLineNumbers: true,
            diffIndicators: "bars",
            wordWrap: true,
            background: true,
            theme: "dark",
            fileFormat: "png",
            fileQuality: "standard",
            fileScale: 2,
            fileMaxWidth: 960,
            mode: "both",
          },
        },
      },
    },
  },
}
```

支持的默认值：

- `fontFamily`
- `fontSize`
- `lineSpacing`
- `layout`
- `showLineNumbers`
- `diffIndicators`
- `wordWrap`
- `background`
- `theme`
- `fileFormat`
- `fileQuality`
- `fileScale`
- `fileMaxWidth`
- `mode`

显式工具参数会覆盖这些默认值。

## 安全配置

- `security.allowRemoteViewer` (`boolean`，默认 `false`)
  - `false`：拒绝非回环请求访问查看器路由。
  - `true`：如果令牌化路径有效，则允许远程查看器。

示例：

```json5
{
  plugins: {
    entries: {
      diffs: {
        enabled: true,
        config: {
          security: {
            allowRemoteViewer: false,
          },
        },
      },
    },
  },
}
```

## 制品生命周期和存储

- 制品存储在临时子目录下：`$TMPDIR/openclaw-diffs`。
- 查看器制品元数据包含：
  - 随机制品 ID（20 个十六进制字符）
  - 随机令牌（48 个十六进制字符）
  - `createdAt` 和 `expiresAt`
  - 存储的 `viewer.html` 路径
- 未指定时默认查看器 TTL 为 30 分钟。
- 最大接受的查看器 TTL 为 6 小时。
- 清理在制品创建后机会性运行。
- 过期制品会被删除。
- 当元数据缺失时，回退清理会移除超过 24 小时的陈旧文件夹。

## 查看器 URL 和网络行为

查看器路由：

- `/plugins/diffs/view/{artifactId}/{token}`

查看器资源：

- `/plugins/diffs/assets/viewer.js`
- `/plugins/diffs/assets/viewer-runtime.js`

URL 构建行为：

- 如果提供了 `baseUrl`，在严格验证后使用。
- 没有 `baseUrl` 时，查看器 URL 默认使用回环地址 `127.0.0.1`。
- 如果 Gateway 绑定模式为 `custom` 且设置了 `gateway.customBindHost`，则使用该主机。

`baseUrl` 规则：

- 必须为 `http://` 或 `https://`。
- 拒绝查询和哈希。
- 允许源加可选基路径。

## 安全模型

查看器加固：

- 默认仅回环。
- 使用严格的 ID 和令牌验证的令牌化查看器路径。
- 查看器响应 CSP：
  - `default-src 'none'`
  - 脚本和资源仅来自 self
  - 无出站 `connect-src`
- 启用远程访问时的远程未命中限流：
  - 每 60 秒 40 次失败
  - 60 秒锁定（`429 Too Many Requests`）

文件渲染加固：

- 截图浏览器请求路由默认拒绝。
- 仅允许来自 `http://127.0.0.1/plugins/diffs/assets/*` 的本地查看器资源。
- 阻止外部网络请求。

## 文件模式的浏览器要求

`mode: "file"` 和 `mode: "both"` 需要 Chromium 兼容浏览器。

解析顺序：

1. OpenClaw 配置中的 `browser.executablePath`。
2. 环境变量：
   - `OPENCLAW_BROWSER_EXECUTABLE_PATH`
   - `BROWSER_EXECUTABLE_PATH`
   - `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
3. 平台命令/路径发现回退。

常见失败文本：

- `Diff PNG/PDF rendering requires a Chromium-compatible browser...`

通过安装 Chrome、Chromium、Edge 或 Brave，或设置上述可执行路径选项之一来修复。

## 故障排除

输入验证错误：

- `Provide patch or both before and after text.`
  - 同时提供 `before` 和 `after`，或提供 `patch`。
- `Provide either patch or before/after input, not both.`
  - 不要混合输入模式。
- `Invalid baseUrl: ...`
  - 使用 `http(s)` 源加可选路径，不含查询/哈希。
- `{field} exceeds maximum size (...)`
  - 减小负载大小。
- 大补丁拒绝
  - 减少补丁文件数量或总行数。

查看器可访问性问题：

- 查看器 URL 默认解析到 `127.0.0.1`。
- 对于远程访问场景，请：
  - 每次工具调用传递 `baseUrl`，或
  - 使用 `gateway.bind=custom` 和 `gateway.customBindHost`
- 仅在您打算外部访问查看器时启用 `security.allowRemoteViewer`。

未修改行没有展开按钮：

- 当补丁不携带可展开上下文时，补丁输入可能出现这种情况。
- 这是预期行为，不表示查看器故障。

制品未找到：

- 制品因 TTL 过期。
- 令牌或路径已更改。
- 清理已移除陈旧数据。

## 操作指南

- 对于本地交互式画布审查，优先使用 `mode: "view"`。
- 对于需要附件的出站聊天频道，优先使用 `mode: "file"`。
- 除非您的部署需要远程查看器 URL，否则保持 `allowRemoteViewer` 禁用。
- 对敏感差异设置明确的短 `ttlSeconds`。
- 在非必要时避免在差异输入中发送密钥。
- 如果您的频道会大幅压缩图片（例如 Telegram 或 WhatsApp），优先使用 PDF 输出（`fileFormat: "pdf"`）。

差异渲染引擎：

- 由 [Diffs](https://diffs.com) 驱动。

## 相关文档

- [工具概览](/tools)
- [插件](/tools/plugin)
- [浏览器](/tools/browser)
