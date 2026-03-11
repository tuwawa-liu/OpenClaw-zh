---
summary: Onboarding 向导参考：完整步骤、参数与配置字段
title: 向导参考
sidebarTitle: 向导参考
---

# 向导参考

# 向导参考

这是 `openclaw onboard` CLI 向导的完整参考。
有关高级概述，请参阅[引导向导](/start/wizard)。

## 流程详情（本地模式）

<Steps>
  <Step title="现有配置检测">
    - 如果 `~/.openclaw/openclaw.json` 存在，选择 **保留 / 修改 / 重置**。
    - 重新运行向导**不会**清除任何内容，除非你明确选择**重置**（或传入 `--reset`）。
    - CLI `--reset` 默认为 `config+creds+sessions`；使用 `--reset-scope full` 也可移除工作区。
    - 如果配置无效或包含遗留键，向导会停止并要求你在继续之前运行 `openclaw doctor`。
    - 重置使用 `trash`（绝不使用 `rm`）并提供范围选择：
      - 仅配置
      - 配置 + 凭据 + 会话
      - 完全重置（也移除工作区）
  </Step>
  <Step title="模型/认证">
    - **Anthropic API 密钥**：如果存在 `ANTHROPIC_API_KEY` 则使用，否则提示输入密钥，然后保存供守护进程使用。
    - **Anthropic OAuth（Claude Code CLI）**：在 macOS 上向导检查 Keychain 项目 "Claude Code-credentials"（选择"始终允许"以便 launchd 启动不会阻塞）；在 Linux/Windows 上，如果存在则复用 `~/.claude/.credentials.json`。
    - **Anthropic token（粘贴 setup-token）**：在任何机器上运行 `claude setup-token`，然后粘贴 token（可以命名；留空 = 默认）。
    - **OpenAI Code（Codex）订阅（Codex CLI）**：如果 `~/.codex/auth.json` 存在，向导可以复用它。
    - **OpenAI Code（Codex）订阅（OAuth）**：浏览器流程；粘贴 `code#state`。
      - 当模型未设置或为 `openai/*` 时，将 `agents.defaults.model` 设置为 `openai-codex/gpt-5.2`。
    - **OpenAI API 密钥**：如果存在 `OPENAI_API_KEY` 则使用，否则提示输入密钥，然后存储在认证配置文件中。
    - **xAI（Grok）API 密钥**：提示输入 `XAI_API_KEY` 并配置 xAI 作为模型提供商。
    - **OpenCode**：提示输入 `OPENCODE_API_KEY`（或 `OPENCODE_ZEN_API_KEY`，在 https://opencode.ai/auth 获取）并让你选择 Zen 或 Go 目录。
    - **API 密钥**：为你存储密钥。
    - **Vercel AI Gateway（多模型代理）**：提示输入 `AI_GATEWAY_API_KEY`。
    - 更多详情：[Vercel AI Gateway](/providers/vercel-ai-gateway)
    - **Cloudflare AI Gateway**：提示输入账户 ID、网关 ID 和 `CLOUDFLARE_AI_GATEWAY_API_KEY`。
    - 更多详情：[Cloudflare AI Gateway](/providers/cloudflare-ai-gateway)
    - **MiniMax M2.5**：配置自动写入。
    - 更多详情：[MiniMax](/providers/minimax)
    - **Synthetic（Anthropic 兼容）**：提示输入 `SYNTHETIC_API_KEY`。
    - 更多详情：[Synthetic](/providers/synthetic)
    - **Moonshot（Kimi K2）**：配置自动写入。
    - **Kimi Coding**：配置自动写入。
    - 更多详情：[Moonshot AI（Kimi + Kimi Coding）](/providers/moonshot)
    - **跳过**：尚未配置认证。
    - 从检测到的选项中选择默认模型（或手动输入 provider/model）。为获得最佳质量和更低的提示注入风险，请选择你的提供商栈中可用的最强最新一代模型。
    - 向导运行模型检查，如果配置的模型未知或缺少认证则发出警告。
    - API 密钥存储模式默认为明文认证配置文件值。使用 `--secret-input-mode ref` 改为存储环境变量引用（例如 `keyRef: { source: "env", provider: "default", id: "OPENAI_API_KEY" }`）。
    - OAuth 凭据位于 `~/.openclaw/credentials/oauth.json`；认证配置文件位于 `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`（API 密钥 + OAuth）。
    - 更多详情：[/concepts/oauth](/concepts/oauth)
    <Note>
    无头/服务器提示：在有浏览器的机器上完成 OAuth，然后将 `~/.openclaw/credentials/oauth.json`（或 `$OPENCLAW_STATE_DIR/credentials/oauth.json`）复制到网关主机。
    </Note>
  </Step>
  <Step title="工作区">
    - 默认 `~/.openclaw/workspace`（可配置）。
    - 为智能体引导仪式准备所需的工作区文件。
    - 完整工作区布局 + 备份指南：[智能体工作区](/concepts/agent-workspace)
  </Step>
  <Step title="Gateway 网关">
    - 端口、绑定、认证模式、tailscale 暴露。
    - 认证建议：即使在回环地址也保持 **Token** 认证，以便本地 WS 客户端必须认证。
    - 在 token 模式下，交互式引导提供：
      - **生成/存储明文 token**（默认）
      - **使用 SecretRef**（可选）
      - 快速开始会跨 `env`、`file` 和 `exec` 提供商复用现有的 `gateway.auth.token` SecretRef 进行引导探测/仪表板引导。
      - 如果该 SecretRef 已配置但无法解析，引导会立即失败并给出明确的修复消息，而不是静默降级运行时认证。
    - 在密码模式下，交互式引导也支持明文或 SecretRef 存储。
    - 非交互式 token SecretRef 路径：`--gateway-token-ref-env <ENV_VAR>`。
      - 需要引导进程环境中存在非空的环境变量。
      - 不能与 `--gateway-token` 组合使用。
    - 仅在完全信任每个本地进程时才禁用认证。
    - 非回环绑定仍然需要认证。
  </Step>
  <Step title="渠道">
    - [WhatsApp](/channels/whatsapp)：可选 QR 登录。
    - [Telegram](/channels/telegram)：机器人 token。
    - [Discord](/channels/discord)：机器人 token。
    - [Google Chat](/channels/googlechat)：服务账户 JSON + webhook 受众。
    - [Mattermost](/channels/mattermost)（插件）：机器人 token + 基础 URL。
    - [Signal](/channels/signal)：可选 `signal-cli` 安装 + 账户配置。
    - [BlueBubbles](/channels/bluebubbles)：**推荐用于 iMessage**；服务器 URL + 密码 + webhook。
    - [iMessage](/channels/imessage)：遗留 `imsg` CLI 路径 + 数据库访问。
    - DM 安全：默认为配对模式。首条 DM 发送验证码；通过 `openclaw pairing approve <channel> <code>` 审批或使用允许列表。
  </Step>
  <Step title="网页搜索">
    - 选择提供商：Perplexity、Brave、Gemini、Grok 或 Kimi（或跳过）。
    - 粘贴你的 API 密钥（快速开始会自动从环境变量或现有配置中检测密钥）。
    - 使用 `--skip-search` 跳过。
    - 稍后配置：`openclaw configure --section web`。
  </Step>
  <Step title="守护进程安装">
    - macOS：LaunchAgent
      - 需要已登录的用户会话；对于无头环境，使用自定义 LaunchDaemon（未随附）。
    - Linux（和通过 WSL2 的 Windows）：systemd 用户单元
      - 向导尝试通过 `loginctl enable-linger <user>` 启用持久化，以便 Gateway 在注销后保持运行。
      - 可能提示 sudo（写入 `/var/lib/systemd/linger`）；先尝试不用 sudo。
    - **运行时选择**：Node（推荐；WhatsApp/Telegram 必需）。不推荐 Bun。
    - 如果 token 认证需要 token 且 `gateway.auth.token` 由 SecretRef 管理，守护进程安装会验证它但不会将解析后的明文 token 值持久化到 supervisor 服务环境元数据中。
    - 如果 token 认证需要 token 且配置的 token SecretRef 无法解析，守护进程安装会被阻止并给出可操作的指导。
    - 如果同时配置了 `gateway.auth.token` 和 `gateway.auth.password` 但 `gateway.auth.mode` 未设置，守护进程安装会被阻止，直到明确设置模式。
  </Step>
  <Step title="健康检查">
    - 启动 Gateway（如需要）并运行 `openclaw health`。
    - 提示：`openclaw status --deep` 会在状态输出中添加网关健康探测（需要可达的网关）。
  </Step>
  <Step title="Skills（推荐）">
    - 读取可用的 skills 并检查需求。
    - 让你选择 node 管理器：**npm / pnpm**（不推荐 bun）。
    - 安装可选依赖（一些在 macOS 上使用 Homebrew）。
  </Step>
  <Step title="完成">
    - 摘要 + 后续步骤，包括 iOS/Android/macOS 应用的额外功能。
  </Step>
</Steps>

<Note>
如果未检测到 GUI，向导会打印 SSH 端口转发说明以访问 Control UI，而不是打开浏览器。
如果缺少 Control UI 资产，向导会尝试构建它们；回退方案是 `pnpm ui:build`（自动安装 UI 依赖）。
</Note>

## 非交互模式

使用 `--non-interactive` 来自动化或脚本化引导：

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice apiKey \
  --anthropic-api-key "$ANTHROPIC_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --install-daemon \
  --daemon-runtime node \
  --skip-skills
```

添加 `--json` 获取机器可读的摘要。

非交互模式下的 Gateway token SecretRef：

```bash
export OPENCLAW_GATEWAY_TOKEN="your-token"
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice skip \
  --gateway-auth token \
  --gateway-token-ref-env OPENCLAW_GATEWAY_TOKEN
```

`--gateway-token` 和 `--gateway-token-ref-env` 互斥。

<Note>
`--json` **不**意味着非交互模式。脚本中使用 `--non-interactive`（和 `--workspace`）。
</Note>

<AccordionGroup>
  <Accordion title="Gemini 示例">
    ```bash
    openclaw onboard --non-interactive \
      --mode local \
      --auth-choice gemini-api-key \
      --gemini-api-key "$GEMINI_API_KEY" \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
  </Accordion>
  <Accordion title="Z.AI 示例">
    ```bash
    openclaw onboard --non-interactive \
      --mode local \
      --auth-choice zai-api-key \
      --zai-api-key "$ZAI_API_KEY" \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
  </Accordion>
  <Accordion title="Vercel AI Gateway 示例">
    ```bash
    openclaw onboard --non-interactive \
      --mode local \
      --auth-choice ai-gateway-api-key \
      --ai-gateway-api-key "$AI_GATEWAY_API_KEY" \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
  </Accordion>
  <Accordion title="Cloudflare AI Gateway 示例">
    ```bash
    openclaw onboard --non-interactive \
      --mode local \
      --auth-choice cloudflare-ai-gateway-api-key \
      --cloudflare-ai-gateway-account-id "your-account-id" \
      --cloudflare-ai-gateway-gateway-id "your-gateway-id" \
      --cloudflare-ai-gateway-api-key "$CLOUDFLARE_AI_GATEWAY_API_KEY" \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
  </Accordion>
  <Accordion title="Moonshot 示例">
    ```bash
    openclaw onboard --non-interactive \
      --mode local \
      --auth-choice moonshot-api-key \
      --moonshot-api-key "$MOONSHOT_API_KEY" \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
  </Accordion>
  <Accordion title="Synthetic 示例">
    ```bash
    openclaw onboard --non-interactive \
      --mode local \
      --auth-choice synthetic-api-key \
      --synthetic-api-key "$SYNTHETIC_API_KEY" \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
  </Accordion>
  <Accordion title="OpenCode 示例">
    ```bash
    openclaw onboard --non-interactive \
      --mode local \
      --auth-choice opencode-zen \
      --opencode-zen-api-key "$OPENCODE_API_KEY" \
      --gateway-port 18789 \
      --gateway-bind loopback
    ```
    换成 `--auth-choice opencode-go --opencode-go-api-key "$OPENCODE_API_KEY"` 可使用 Go 目录。
  </Accordion>
</AccordionGroup>

### 添加智能体（非交互式）

```bash
openclaw agents add work \
  --workspace ~/.openclaw/workspace-work \
  --model openai/gpt-5.2 \
  --bind whatsapp:biz \
  --non-interactive \
  --json
```

## Gateway 向导 RPC

Gateway 通过 RPC 暴露向导流程（`wizard.start`、`wizard.next`、`wizard.cancel`、`wizard.status`）。
客户端（macOS 应用、Control UI）可以渲染步骤而无需重新实现引导逻辑。

## Signal 设置（signal-cli）

向导可以从 GitHub releases 安装 `signal-cli`：

- 下载适当的 release 资产。
- 存储在 `~/.openclaw/tools/signal-cli/<version>/` 下。
- 将 `channels.signal.cliPath` 写入你的配置。

注意：

- JVM 构建需要 **Java 21**。
- 可用时使用原生构建。
- Windows 使用 WSL2；signal-cli 安装在 WSL 内遵循 Linux 流程。

## 向导写入的内容

`~/.openclaw/openclaw.json` 中的典型字段：

- `agents.defaults.workspace`
- `agents.defaults.model` / `models.providers`（如果选择了 Minimax）
- `tools.profile`（本地引导默认为 `"coding"`，未设置时；现有的显式值会被保留）
- `gateway.*`（模式、绑定、认证、tailscale）
- `session.dmScope`（行为详情：[CLI 引导参考](/start/wizard-cli-reference#outputs-and-internals)）
- `channels.telegram.botToken`、`channels.discord.token`、`channels.signal.*`、`channels.imessage.*`
- 渠道允许列表（Slack/Discord/Matrix/Microsoft Teams），当你在提示中选择加入时（名称尽可能解析为 ID）。
- `skills.install.nodeManager`
- `wizard.lastRunAt`
- `wizard.lastRunVersion`
- `wizard.lastRunCommit`
- `wizard.lastRunCommand`
- `wizard.lastRunMode`

`openclaw agents add` 写入 `agents.list[]` 和可选的 `bindings`。

WhatsApp 凭据存储在 `~/.openclaw/credentials/whatsapp/<accountId>/` 下。
会话存储在 `~/.openclaw/agents/<agentId>/sessions/` 下。

一些渠道以插件形式提供。当你在引导过程中选择一个时，向导会在配置之前提示安装它（npm 或本地路径）。

## 相关文档

- 向导概述：[引导向导](/start/wizard)
- macOS 应用引导：[引导](/start/onboarding)
- 配置参考：[Gateway 配置](/gateway/configuration)
- 提供商：[WhatsApp](/channels/whatsapp)、[Telegram](/channels/telegram)、[Discord](/channels/discord)、[Google Chat](/channels/googlechat)、[Signal](/channels/signal)、[BlueBubbles](/channels/bluebubbles)（iMessage）、[iMessage](/channels/imessage)（遗留）
- Skills：[Skills](/tools/skills)、[Skills 配置](/tools/skills-config)
