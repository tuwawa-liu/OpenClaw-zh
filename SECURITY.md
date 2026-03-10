# 安全策略

如果你认为发现了 OpenClaw 的安全问题，请私下报告。

## 报告

请直接在问题所在的仓库报告漏洞：

- **核心 CLI 和 Gateway** — [openclaw/openclaw](https://github.com/openclaw/openclaw)
- **macOS 桌面应用** — [openclaw/openclaw](https://github.com/openclaw/openclaw) (apps/macos)
- **iOS 应用** — [openclaw/openclaw](https://github.com/openclaw/openclaw) (apps/ios)
- **Android 应用** — [openclaw/openclaw](https://github.com/openclaw/openclaw) (apps/android)
- **ClawHub** — [openclaw/clawhub](https://github.com/openclaw/clawhub)
- **信任和威胁模型** — [openclaw/trust](https://github.com/openclaw/trust)

对于不适合特定仓库的问题，或你不确定时，请发送电子邮件至 **[security@openclaw.ai](mailto:security@openclaw.ai)**，我们会进行转发。

完整报告说明请参见我们的 [信任页面](https://trust.openclaw.ai)。

### 报告需包含

1. **标题**
2. **严重性评估**
3. **影响**
4. **受影响组件**
5. **技术复现步骤**
6. **已证明的影响**
7. **环境**
8. **修复建议**

缺少复现步骤、已证明影响和修复建议的报告将被降低优先级。鉴于大量 AI 生成的扫描结果，我们必须确保收到的是来自理解问题的研究人员的经过审查的报告。

### 报告接受门槛（分类快速路径）

为最快分类，请包含以下全部内容：

- 当前版本上的确切漏洞路径（`文件`、函数和行范围）。
- 测试版本详情（OpenClaw 版本和/或提交 SHA）。
- 针对最新 `main` 或最新发布版本的可复现 PoC。
- 与 OpenClaw 文档化信任边界相关的已证明影响。
- 对于暴露密钥报告：证明凭证为 OpenClaw 所有（或授予对 OpenClaw 运营的基础设施/服务的访问权限）。
- 明确声明报告不依赖于对抗性操作者共享一个 Gateway 主机/配置。
- 范围检查，解释报告为何 **不** 在下方"范围外"部分的覆盖范围内。
- 对于命令风险/一致性报告（例如混淆检测差异），需要具体的边界绕过路径（认证/审批/白名单/沙箱）。仅一致性发现被视为加固，而非漏洞。

不满足这些要求的报告可能被关闭为 `invalid` 或 `no-action`。

### 常见误报模式

以下内容经常被报告但通常不做代码更改即关闭：

- 没有边界绕过的仅提示注入链（提示注入不在范围内）。
- 操作者意图的本地功能（例如 TUI 本地 `!` shell）被呈现为远程注入。
- 将明确的操作者控制界面（例如 `canvas.eval`、浏览器 evaluate/脚本执行或直接的 `node.invoke` 执行原语）视为漏洞而未证明认证/策略/沙箱边界绕过的报告。这些功能在启用时是有意的，是受信任的操作者功能，而非独立的安全缺陷。
- 授权用户触发的本地操作被呈现为权限提升。示例：白名单/所有者发送者运行 `/export-session /absolute/path.html` 写入主机。在此信任模型中，授权用户操作是受信任的主机操作，除非你证明了认证/沙箱/边界绕过。
- 仅显示恶意插件在受信任操作者安装/启用后执行特权操作的报告。
- 假设在共享 Gateway 主机/配置上有每用户多租户授权的报告。
- 仅显示命令风险检测/一致性中的启发式检测差异（例如一种 exec 路径上的混淆模式检测但另一种没有，如 `node.invoke -> system.run` 一致性差距）而未证明认证、审批、白名单强制、沙箱或其他文档化信任边界绕过的报告。
- 需要受信任操作者配置输入的 ReDoS/DoS 声明（例如 `sessionFilter` 或 `logging.redactPatterns` 中的灾难性正则）而无信任边界绕过。
- 需要在受信任状态下预先在本地文件系统中布置的归档/安装提取声明（例如在目标目录如技能/工具路径下植入符号链接/硬链接别名）而未显示不受信任路径可以创建/控制该原语。
- 依赖于替换或重写受信任主机上已批准的可执行文件路径（相同路径 inode/内容交换）而未显示不受信任路径执行该写入的报告。
- 依赖于预先存在的符号链接技能/工作区文件系统状态（例如涉及 `skills/*/SKILL.md` 的符号链接链）而未显示不受信任路径可以创建/控制该状态的报告。
- 默认本地/回环部署上缺失 HSTS 的发现。
- HTTP 模式已使用签名密钥验证时的 Slack webhook 签名发现。
- 不被本仓库 Discord 集成使用的路径的 Discord 入站 webhook 签名发现。
- 声称 Microsoft Teams `fileConsent/invoke` `uploadInfo.uploadUrl` 受攻击者控制而未证明以下之一的声明：认证边界绕过、携带攻击者选择 URL 的真实认证 Teams/Bot Framework 事件、或 Microsoft/Bot 信任路径的妥协。
- 仅针对过时/不存在路径的扫描器声明，或没有可工作复现的声明。

### 重复报告处理

- 提交前搜索现有公告。
- 适用时在报告中包含可能的重复 GHSA ID。
- 维护者可能会关闭质量较低/较后的重复报告，保留最早的高质量规范报告。

## 安全与信任

**Jamieson O'Reilly** ([@theonejvo](https://twitter.com/theonejvo)) 负责 OpenClaw 的安全与信任。Jamieson 是 [Dvuln](https://dvuln.com) 的创始人，拥有丰富的攻击性安全、渗透测试和安全程序开发经验。

## 缺陷赏金

OpenClaw 是一个充满热爱的项目。没有缺陷赏金计划，也没有付费报告的预算。请仍然负责任地披露，以便我们能快速修复问题。
目前帮助项目的最佳方式是提交 PR。

## 维护者：通过 CLI 更新 GHSA

通过 `gh api` 修补 GHSA 时，请包含 `X-GitHub-Api-Version: 2022-11-28`（或更新版本）。没有它，某些字段（特别是 CVSS）可能不会持久化，即使请求返回 200。

## 操作者信任模型（重要）

OpenClaw **不** 将一个 Gateway 建模为多租户、对抗性用户边界。

- 经过认证的 Gateway 调用者被视为该 Gateway 实例的受信任操作者。
- 会话标识符（`sessionKey`、会话 ID、标签）是路由控制，而非每用户授权边界。
- 如果一个操作者可以查看同一 Gateway 上另一个操作者的数据，这在此信任模型中是预期的。
- OpenClaw 技术上可以在一台机器上运行多个 Gateway 实例，但推荐的操作是按信任边界进行清晰分离。
- 推荐模式：每台机器/主机（或 VPS）一个用户，该用户一个 Gateway，Gateway 内一个或多个智能体。
- 如果多个用户需要 OpenClaw，每个用户使用一个 VPS（或主机/OS 用户边界）。
- 对于高级设置，可以在一台机器上运行多个 Gateway，但仅在严格隔离的情况下，这不是推荐的默认设置。
- exec 行为默认为主机优先：`agents.defaults.sandbox.mode` 默认为 `off`。
- `tools.exec.host` 默认为 `sandbox` 作为路由偏好，但如果会话的沙箱运行时未激活，exec 在 Gateway 主机上运行。
- 隐式 exec 调用（工具调用中没有显式 host）遵循相同行为。
- 这在 OpenClaw 的单用户受信任操作者模型中是预期的。如果你需要隔离，请启用沙箱模式（`non-main`/`all`）并保持严格的工具策略。

## 受信任插件概念（核心）

插件/扩展是 Gateway 受信任计算基础的一部分。

- 安装或启用插件授予其与在该 Gateway 主机上运行的本地代码相同的信任级别。
- 插件读取环境变量/文件或运行主机命令等行为在此信任边界内是预期的。
- 安全报告必须显示边界绕过（例如未认证的插件加载、白名单/策略绕过或沙箱/路径安全绕过），而不仅仅是受信任安装插件的恶意行为。

## 范围外

- 公共互联网暴露
- 以文档建议不要的方式使用 OpenClaw
- 互不信任/对抗性操作者共享一个 Gateway 主机和配置的部署（例如，期望 `sessions.list`、`sessions.preview`、`chat.history` 或类似控制平面读取具有每操作者隔离的报告）
- 仅提示注入攻击（没有策略/认证/沙箱边界绕过）
- 需要对受信任本地状态（`~/.openclaw`、`MEMORY.md` / `memory/*.md` 等工作区文件）有写入权限的报告
- 可利用性取决于攻击者控制的受信任本地路径中预先存在的符号链接/硬链接文件系统状态的报告（例如提取/安装目标树），除非显示了创建该状态的单独不受信任边界绕过。
- 唯一声明为通过受信任本地技能/工作区符号链接状态（例如 `skills/*/SKILL.md` 符号链接链）进行沙箱/工作区读取扩展的报告，除非显示了创建/控制该状态的单独不受信任边界绕过。
- 唯一声明为通过相同路径文件替换/重写在受信任主机上进行批准后可执行文件身份漂移的报告，除非显示了该主机写入原语的单独不受信任边界绕过。
- 唯一证明的影响为已授权发送者故意调用本地操作命令（例如 `/export-session` 写入绝对主机路径）而未绕过认证、沙箱或其他文档化边界的报告。
- 唯一声明为使用明确的受信任操作者控制界面（例如 `canvas.eval`、浏览器 evaluate/脚本执行或直接 `node.invoke` 执行）而未证明认证、策略、白名单、审批或沙箱绕过的报告。
- 唯一声明为受信任安装/启用的插件可以使用 Gateway/主机权限执行的报告（文档化的信任模型行为）。
- 唯一声明为操作者启用的 `dangerous*`/`dangerously*` 配置选项削弱默认值的报告（这些是设计上明确的紧急开关权衡）
- 依赖受信任操作者提供的配置值来触发可用性影响的报告（例如自定义正则模式）。这些可能仍作为纵深防御加固被修复，但不是安全边界绕过。
- 唯一声明为命令风险检测中跨 exec 界面的启发式/一致性漂移（例如混淆模式检查）而未证明信任边界绕过的报告。这些是仅加固发现，不是漏洞；分类可能将其关闭为 `invalid`/`no-action` 或单独作为低/信息性加固进行跟踪。
- 暴露的第三方/用户控制的凭证（非 OpenClaw 所有且不授予对 OpenClaw 运营的基础设施/服务的访问权限）而未证明 OpenClaw 影响
- 唯一声明为沙箱运行时禁用/不可用时的主机端 exec 的报告（受信任操作者模型中的文档化默认行为），没有边界绕过。
- 唯一声明为平台提供的上传目标 URL 不受信任的报告（例如 Microsoft Teams `fileConsent/invoke` `uploadInfo.uploadUrl`），未在认证生产流程中证明攻击者控制。

## 部署假设

OpenClaw 安全指南假设：

- OpenClaw 运行的主机在受信任的 OS/管理员边界内。
- 任何可以修改 `~/.openclaw` 状态/配置（包括 `openclaw.json`）的人实际上就是受信任的操作者。
- 互不信任的人共享单个 Gateway **不是推荐的设置**。按信任边界使用单独的 Gateway（或至少单独的 OS 用户/主机）。
- 经过认证的 Gateway 调用者被视为受信任的操作者。会话标识符（例如 `sessionKey`）是路由控制，而非每用户授权边界。
- 可以在一台机器上运行多个 Gateway 实例，但推荐的模型是按用户清晰隔离（优先每用户一个主机/VPS）。

## 单用户信任模型（个人助手）

OpenClaw 的安全模型是"个人助手"（一个受信任的操作者，可能有多个智能体），而非"共享的多租户总线"。

- 如果多人可以向同一个启用工具的智能体发送消息（例如共享的 Slack 工作区），他们都可以在其授予的权限范围内引导该智能体。
- 会话或记忆范围限定减少上下文泄漏，但 **不** 创建每用户的主机授权边界。
- 对于混合信任或对抗性用户，按 OS 用户/主机/Gateway 隔离，并按边界使用单独的凭证。
- 公司共享智能体在用户处于同一信任边界且智能体严格限于业务用途时可以是有效的设置。
- 对于公司共享设置，使用专用的机器/VM/容器和专用账户；避免在该运行时混合个人数据。
- 如果该主机/浏览器配置文件登录了个人账户（例如 Apple/Google/个人密码管理器），你已经打破了边界并增加了个人数据暴露风险。

## 智能体和模型假设

- 模型/智能体 **不是** 受信任的主体。假设提示/内容注入可以操纵行为。
- 安全边界来自主机/配置信任、认证、工具策略、沙箱和 exec 审批。
- 仅提示注入本身不是漏洞报告，除非它跨越了这些边界之一。
- 钩子/webhook 驱动的有效载荷应被视为不受信任的内容；除非进行严格范围的调试，否则保持不安全绕过标志禁用（`hooks.gmail.allowUnsafeExternalContent`、`hooks.mappings[].allowUnsafeExternalContent`）。
- 弱模型层通常更容易被提示注入。对于启用工具或钩子驱动的智能体，优先使用强大的现代模型层和严格的工具策略（例如 `tools.profile: "messaging"` 或更严格），加上可能的沙箱。

## Gateway 和节点信任概念

OpenClaw 将路由与执行分离，但两者都保持在同一操作者信任边界内：

- **Gateway** 是控制平面。如果调用者通过了 Gateway 认证，则被视为该 Gateway 的受信任操作者。
- **节点** 是 Gateway 的执行扩展。配对节点授予该节点上的操作者级远程能力。
- **Exec 审批**（白名单/询问 UI）是操作者安全护栏，用于减少意外命令执行，而非多租户授权边界。
- exec 界面之间（`gateway`、`node`、`sandbox`）命令风险警告启发式的差异本身不构成安全边界绕过。
- 对于不受信任用户的隔离，按信任边界分割：每个边界使用单独的 Gateway 和单独的 OS 用户/主机。

## 工作区记忆信任边界

`MEMORY.md` 和 `memory/*.md` 是普通的工作区文件，被视为受信任的本地操作者状态。

- 如果某人可以编辑工作区记忆文件，他们已经跨越了受信任的操作者边界。
- 对这些文件的记忆搜索索引/召回是预期行为，而非沙箱/安全边界。
- 被视为范围外的示例报告模式："攻击者将恶意内容写入 `memory/*.md`，然后 `memory_search` 返回它。"
- 如果你需要互不信任用户之间的隔离，按 OS 用户或主机分割，并运行单独的 Gateway。

## 插件信任边界

插件/扩展在 Gateway **进程内** 加载，被视为受信任的代码。

- 插件可以使用与 OpenClaw 进程相同的 OS 权限执行。
- 运行时辅助函数（例如 `runtime.system.runCommandWithTimeout`）是便利 API，而非沙箱边界。
- 仅安装你信任的插件，并优先使用 `plugins.allow` 固定明确的受信任插件 ID。

## 临时文件夹边界（媒体/沙箱）

OpenClaw 使用专用的临时根目录进行本地媒体交接和沙箱相邻的临时文件：

- 首选临时根目录：`/tmp/openclaw`（在主机上可用且安全时）。
- 回退临时根目录：`os.tmpdir()/openclaw`（或多用户主机上的 `openclaw-<uid>`）。

安全边界说明：

- 沙箱媒体验证仅允许 OpenClaw 管理的临时根目录下的绝对临时路径。
- 任意主机 tmp 路径不被视为受信任的媒体根目录。
- 插件/扩展代码在处理媒体文件时应使用 OpenClaw 临时辅助函数（`resolvePreferredOpenClawTmpDir`、`buildRandomTempFilePath`、`withTempDownloadPath`），而非原始的 `os.tmpdir()` 默认值。
- 执行参考点：
  - 临时根目录解析器：`src/infra/tmp-openclaw-dir.ts`
  - SDK 临时辅助函数：`src/plugin-sdk/temp-path.ts`
  - 消息/频道 tmp 护栏：`scripts/check-no-random-messaging-tmp.mjs`

## 运维指南

有关威胁模型 + 加固指南（包括 `openclaw security audit --deep` 和 `--fix`），请参见：

- `https://docs.openclaw.ai/gateway/security`

### 工具文件系统加固

- `tools.exec.applyPatch.workspaceOnly: true`（推荐）：将 `apply_patch` 的写入/删除限制在已配置的工作区目录内。
- `tools.fs.workspaceOnly: true`（可选）：将 `read`/`write`/`edit`/`apply_patch` 路径和原生提示图片自动加载路径限制在工作区目录内。
- 避免设置 `tools.exec.applyPatch.workspaceOnly: false`，除非你完全信任谁可以触发工具执行。

### 子智能体委派加固

- 除非你明确需要委派运行，否则保持 `sessions_spawn` 被拒绝。
- 保持 `agents.list[].subagents.allowAgents` 范围窄，仅包含你信任其沙箱设置的智能体。
- 当委派必须保持沙箱化时，使用 `sandbox: "require"` 调用 `sessions_spawn`（默认为 `inherit`）。
  - `sandbox: "require"` 除非目标子运行时已沙箱化，否则拒绝该 spawn。
  - 这防止了权限较少限制的会话错误地将工作委派到未沙箱化的子会话中。

### Web 界面安全

OpenClaw 的 Web 界面（Gateway Control UI + HTTP 端点）仅用于 **本地使用**。

- 推荐：保持 Gateway **仅回环**（`127.0.0.1` / `::1`）。
  - 配置：`gateway.bind="loopback"`（默认）。
  - CLI：`openclaw gateway run --bind loopback`。
- `gateway.controlUi.dangerouslyDisableDeviceAuth` 用于仅 localhost 的紧急使用。
  - OpenClaw 设计上保持部署灵活性，不会硬性禁止非本地设置。
  - `openclaw security audit` 会将非本地和其他风险配置标记为危险发现。
  - 此操作者选择的权衡是设计上的，本身不是安全漏洞。
- Canvas 主机说明：网络可见的 canvas 对受信任节点场景（LAN/tailnet）是 **有意的**。
  - 预期设置：非回环绑定 + Gateway 认证（令牌/密码/受信任代理）+ 防火墙/tailnet 控制。
  - 预期路由：`/__openclaw__/canvas/`、`/__openclaw__/a2ui/`。
  - 此部署模型本身不是安全漏洞。
- **不要** 将其暴露到公共互联网（不要直接绑定到 `0.0.0.0`，不要使用公共反向代理）。它没有经过公共暴露的加固。
- 如果需要远程访问，优先使用 SSH 隧道或 Tailscale serve/funnel（这样 Gateway 仍然绑定到回环），加上强 Gateway 认证。
- Gateway HTTP 界面包括 canvas 主机（`/__openclaw__/canvas/`、`/__openclaw__/a2ui/`）。将 canvas 内容视为敏感/不受信任的，除非你了解风险，否则避免将其暴露到回环之外。

## 运行时要求

### Node.js 版本

OpenClaw 需要 **Node.js 22.12.0 或更高版本**（LTS）。此版本包含重要的安全补丁：

- CVE-2025-59466：async_hooks DoS 漏洞
- CVE-2026-21636：权限模型绕过漏洞

验证你的 Node.js 版本：

```bash
node --version  # 应为 v22.12.0 或更高版本
```

### Docker 安全

在 Docker 中运行 OpenClaw 时：

1. 官方镜像以非 root 用户（`node`）运行，以减少攻击面
2. 尽可能使用 `--read-only` 标志以获得额外的文件系统保护
3. 使用 `--cap-drop=ALL` 限制容器能力

安全 Docker 运行示例：

```bash
docker run --read-only --cap-drop=ALL \
  -v openclaw-data:/app/data \
  openclaw/openclaw:latest
```

## 安全扫描

本项目在 CI/CD 中使用 `detect-secrets` 进行自动密钥检测。
配置参见 `.detect-secrets.cfg`，基线参见 `.secrets.baseline`。

本地运行：

```bash
pip install detect-secrets==1.5.0
detect-secrets scan --baseline .secrets.baseline
```
