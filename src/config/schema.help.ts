import {
  DISCORD_DEFAULT_INBOUND_WORKER_TIMEOUT_MS,
  DISCORD_DEFAULT_LISTENER_TIMEOUT_MS,
} from "../discord/monitor/timeouts.js";
import { MEDIA_AUDIO_FIELD_HELP } from "./media-audio-field-metadata.js";
import { IRC_FIELD_HELP } from "./schema.irc.js";
import { describeTalkSilenceTimeoutDefaults } from "./talk-defaults.js";

export const FIELD_HELP: Record<string, string> = {
  meta: "由 OpenClaw 自动维护的元数据字段，用于记录此配置文件的写入/版本历史。保持这些值由系统管理，除非调试迁移历史，否则避免手动编辑。",
  "meta.lastTouchedVersion": "OpenClaw 写入配置时自动设置。",
  "meta.lastTouchedAt": "上次配置写入的 ISO 时间戳（自动设置）。",
  env: "环境导入和覆盖设置，用于向网关进程提供运行时变量。使用此部分控制 shell 环境加载和显式变量注入行为。",
  "env.shellEnv":
    "Shell 环境导入控制，用于在启动时从登录 shell 加载变量。当依赖 profile 中定义的密钥或 PATH 自定义时保持启用。",
  "env.shellEnv.enabled":
    "启用在启动初始化期间从用户 shell profile 加载环境变量。开发机器上保持启用，或在具有显式环境管理的锁定服务环境中禁用。",
  "env.shellEnv.timeoutMs":
    "Shell 环境解析允许的最大时间（毫秒），超时后使用回退行为。使用更短的超时以加快启动，或在 shell 初始化较重时增加。",
  "env.vars":
    "显式键/值环境变量覆盖，合并到 OpenClaw 的运行时进程环境中。使用此项进行确定性环境配置，而不是仅依赖 shell profile 的副作用。",
  wizard:
    "设置向导状态跟踪字段，记录最近一次引导式入门运行的详情。保留这些字段以便在升级过程中观察和排查设置流程。",
  "wizard.lastRunAt":
    "设置向导在此主机上最近完成时的 ISO 时间戳。用于在支持和运维审计期间确认入门的时效性。",
  "wizard.lastRunVersion":
    "此配置上最近一次向导运行时记录的 OpenClaw 版本。用于诊断跨版本入门变更导致的行为差异。",
  "wizard.lastRunCommit":
    "开发构建中最后一次向导执行时记录的源代码提交标识符。用于在调试期间将入门行为与精确的源码状态关联。",
  "wizard.lastRunCommand":
    "为保留执行上下文而记录的最新向导运行命令调用。用于在验证设置回归时重现入门步骤。",
  "wizard.lastRunMode":
    '最近一次入门流程记录的向导执行模式，为 "local" 或 "remote"。用于了解设置是针对直接本地运行时还是远程网关拓扑。',
  diagnostics:
    "诊断控制，用于调试期间的目标追踪、遥测导出和缓存检查。在生产环境中保持基线诊断最小化，仅在调查问题时启用更深层信号。",
  "diagnostics.otel":
    "网关组件发出的追踪、指标和日志的 OpenTelemetry 导出设置。在与集中式可观测性后端和分布式追踪管道集成时使用。",
  "diagnostics.cacheTrace":
    "缓存追踪日志设置，用于观察内嵌运行中的缓存决策和负载上下文。临时启用以进行调试，之后禁用以减少敏感日志占用。",
  logging:
    "日志行为控制，包括严重性、输出目的地、格式化和敏感数据脱敏。保持级别和脱敏对生产环境足够严格，同时保留有用的诊断信息。",
  "logging.level":
    '运行时日志输出的主日志级别阈值："silent"、"fatal"、"error"、"warn"、"info"、"debug" 或 "trace"。生产环境保持 "info" 或 "warn"，仅在调查期间使用 debug/trace。',
  "logging.file":
    "用于持久化日志输出的可选文件路径，作为控制台日志的补充或替代。使用受管理的可写路径，并将保留/轮转与你的运维策略对齐。",
  "logging.consoleLevel":
    '控制台专用日志阈值："silent"、"fatal"、"error"、"warn"、"info"、"debug" 或 "trace"，用于终端输出控制。使用此项在需要时保持本地控制台安静，同时保留更丰富的文件日志。',
  "logging.consoleStyle":
    '控制台输出格式样式：根据操作者和摄取需求选择 "pretty"、"compact" 或 "json"。机器解析管道使用 json，人优先的终端工作流使用 pretty/compact。',
  "logging.redactSensitive":
    '敏感数据脱敏模式："off" 禁用内置遮蔽，"tools" 脱敏敏感的工具/配置负载字段。在共享日志中保持 "tools"，除非你有隔离的安全日志接收器。',
  "logging.redactPatterns":
    "应用于日志输出发送/存储前的额外自定义脱敏正则模式。用于遮蔽内置脱敏规则未覆盖的组织特定令牌和标识符。",
  cli: "CLI 展示控制，用于本地命令输出行为，如横幅和标语样式。使用此部分使启动输出与操作者偏好一致，不改变运行时行为。",
  "cli.banner":
    "CLI 启动横幅控制，包括标题/版本行和标语样式行为。保持横幅启用以快速检查版本/上下文，然后调整标语模式到偏好的噪音级别。",
  "cli.banner.taglineMode":
    '控制 CLI 启动横幅中的标语样式："random"（默认）从轮换标语池中选取，"default" 始终显示中性默认标语，"off" 隐藏标语文本但保留横幅版本行。',
  update:
    "更新通道和启动检查行为，用于保持 OpenClaw 运行时版本最新。在生产环境中使用保守通道，仅在受控环境中使用实验性通道。",
  "update.channel": 'git + npm 安装的更新通道（"stable"、"beta" 或 "dev"）。',
  "update.checkOnStart": "网关启动时检查 npm 更新（默认：true）。",
  "update.auto.enabled": "启用后台自动更新包安装（默认：false）。",
  "update.auto.stableDelayHours":
    "稳定通道自动应用开始前的最小延迟（默认：6）。",
  "update.auto.stableJitterHours":
    "稳定通道推出分散窗口的额外小时数（默认：12）。",
  "update.auto.betaCheckIntervalHours": "Beta 通道检查运行频率（小时，默认：1）。",
  gateway:
    "网关运行时界面，包括绑定模式、认证、控制面板 UI、远程传输和运维安全控制。保持保守默认值，除非你有意将网关暴露到可信本地接口之外。",
  "gateway.port":
    "网关侦听器使用的 TCP 端口，用于 API、控制面板 UI 和面向频道的入口路径。使用专用端口，避免与反向代理或本地开发服务冲突。",
  "gateway.mode":
    '网关运行模式："local" 在此主机上运行频道和代理运行时，"remote" 通过远程传输连接。除非你有意运行分离的远程网关拓扑，否则保持 "local"。',
  "gateway.bind":
    '网络绑定配置："auto"、"lan"、"loopback"、"custom" 或 "tailnet"，控制接口暴露。保持 "loopback" 或 "auto" 以获得最安全的本地运行，除非外部客户端必须连接。',
  "gateway.customBindHost":
    "当 gateway.bind 设置为 custom 时用于手动接口定位的显式绑定主机/IP。使用精确地址，避免通配符绑定，除非需要外部暴露。",
  "gateway.controlUi":
    "控制面板 UI 托管设置，包括启用、路径配置和浏览器来源/认证加固行为。保持 UI 最小暴露，在面向互联网的部署前配合强认证控制。",
  "gateway.controlUi.enabled":
    "启用时从网关 HTTP 进程提供控制面板 UI 服务。本地管理保持启用，当外部控制界面替代时禁用。",
  "gateway.auth":
    "网关 HTTP/WebSocket 访问的认证策略，包括模式、凭据、可信代理行为和速率限制。每个非回环部署都要启用认证。",
  "gateway.auth.mode":
    '网关认证模式："none"、"token"、"password" 或 "trusted-proxy"，取决于你的边缘架构。直接暴露使用 token/password，仅在加固的身份感知代理后面使用 trusted-proxy。',
  "gateway.auth.allowTailscale":
    "允许可信 Tailscale 身份路径满足网关认证检查。仅在你的尾网身份态势强大且操作者工作流依赖它时使用。",
  "gateway.auth.rateLimit":
    "登录/认证尝试限流控制，以减少网关边界的凭据暴力破解风险。在暴露环境中保持启用，并根据你的流量基线调整阈值。",
  "gateway.auth.trustedProxy":
    "可信代理认证头映射，用于注入用户声明的上游身份提供者。仅与已知代理 CIDR 和严格的头部允许列表一起使用，以防止伪造的身份头。",
  "gateway.trustedProxies":
    "允许提供转发客户端身份头的上游代理的 CIDR/IP 允许列表。保持此列表精简，以防止不可信跳点冒充用户。",
  "gateway.allowRealIpFallback":
    "在代理场景中 x-forwarded-for 缺失时启用 x-real-ip 回退。除非你的入口栈需要此兼容行为，否则保持禁用。",
  "gateway.tools":
    "网关级工具暴露允许/拒绝策略，可独立于代理/工具配置限制运行时工具可用性。用于粗粒度紧急控制和生产加固。",
  "gateway.tools.allow":
    "网关级工具显式允许列表，当你需要运行时可用的精简工具集时使用。用于需要严格控制工具范围的锁定环境。",
  "gateway.tools.deny":
    "网关级工具显式拒绝列表，即使低级策略允许也会阻止高风险工具。用于紧急响应和纵深防御加固。",
  "gateway.channelHealthCheckMinutes":
    "自动频道健康探测和状态更新的间隔（分钟）。使用较低间隔以更快检测，或较高间隔以减少定期探测噪音。",
  "gateway.tailscale":
    "Tailscale 集成设置，用于网关启动/退出时的 Serve/Funnel 暴露和生命周期处理。除非你的部署有意依赖 Tailscale 入口，否则保持关闭。",
  "gateway.tailscale.mode":
    'Tailscale 发布模式："off"、"serve" 或 "funnel"，用于私有或公开暴露路径。尾网内访问使用 "serve"，仅在需要公开互联网可达性时使用 "funnel"。',
  "gateway.tailscale.resetOnExit":
    "网关退出时重置 Tailscale Serve/Funnel 状态，以避免关闭后的过时发布路由。除非其他控制器在网关外管理发布生命周期，否则保持启用。",
  "gateway.remote":
    "此实例代理到另一个运行时主机时的远程网关连接设置。仅在有意配置分离主机运行时使用远程模式。",
  "gateway.remote.transport":
    '远程连接传输方式："direct" 使用配置的 URL 连接，"ssh" 通过 SSH 隧道。当你需要加密隧道语义而无需暴露远程端口时使用 SSH。',
  "gateway.reload":
    "实时配置重载策略，控制编辑如何应用以及何时触发完全重启。保持混合行为以获得最安全的运维更新，除非调试重载内部。",
  "gateway.tls":
    "用于在网关进程中直接终止 HTTPS 的 TLS 证书和密钥设置。在生产环境中使用显式证书，避免在不可信网络上明文暴露。",
  "gateway.tls.enabled":
    "在网关侦听器启用 TLS 终止，使客户端直接通过 HTTPS/WSS 连接。直接面向互联网或任何不可信网络边界时保持启用。",
  "gateway.tls.autoGenerate":
    "未配置显式文件时自动生成本地 TLS 证书/密钥对。仅用于本地/开发设置，生产流量请替换为真实证书。",
  "gateway.tls.certPath":
    "启用 TLS 时网关使用的 TLS 证书文件的文件系统路径。使用受管理的证书路径，并保持续签自动化与此位置对齐。",
  "gateway.tls.keyPath":
    "启用 TLS 时网关使用的 TLS 私钥文件的文件系统路径。保持此密钥文件权限受限，并按安全策略轮换。",
  "gateway.tls.caPath":
    "网关边缘的客户端验证或自定义信任链要求的可选 CA 捆绑包路径。当私有 PKI 或自定义证书链是部署的一部分时使用。",
  "gateway.http":
    "网关 HTTP API 配置，分组端点切换和面向传输的 API 暴露控制。仅启用必需的端点以减少攻击面。",
  "gateway.http.endpoints":
    "网关 API 表面下的 HTTP 端点功能切换，用于兼容路由和可选集成。有意启用端点并在推出后监控访问模式。",
  "gateway.http.securityHeaders":
    "网关进程自身应用的可选 HTTP 响应安全头。当 TLS 在反向代理终止时，优先在反向代理设置。",
  "gateway.http.securityHeaders.strictTransportSecurity":
    "Strict-Transport-Security 响应头的值。仅在你完全控制的 HTTPS 来源上设置；使用 false 显式禁用。",
  "gateway.remote.url": "远程网关 WebSocket URL（ws:// 或 wss://）。",
  "gateway.remote.token":
    "用于在令牌认证部署中向远程网关认证此客户端的 Bearer 令牌。通过密钥/环境替换存储，并随远程网关认证变更一起轮换。",
  "gateway.remote.password":
    "启用密码模式时用于远程网关认证的密码凭据。保持此密钥在外部管理，避免在提交的配置中使用明文值。",
  "gateway.remote.tlsFingerprint":
    "远程网关的预期 sha256 TLS 指纹（固定以避免中间人攻击）。",
  "gateway.remote.sshTarget":
    "通过 SSH 的远程网关（将网关端口隧道到 localhost）。格式：user@host 或 user@host:port。",
  "gateway.remote.sshIdentity": "可选的 SSH 身份文件路径（传递给 ssh -i）。",
  "talk.provider": '活动的语音提供商 ID（例如 "elevenlabs"）。',
  "talk.providers":
    "按提供商 ID 键控的特定提供商语音设置。迁移期间优先使用此项而非旧版 talk.* 键。",
  "talk.providers.*.voiceId": "提供商默认语音 ID，用于语音模式。",
  "talk.providers.*.voiceAliases": "可选的提供商语音别名映射，用于语音指令。",
  "talk.providers.*.modelId": "提供商默认模型 ID，用于语音模式。",
  "talk.providers.*.outputFormat": "提供商默认输出格式，用于语音模式。",
  "talk.providers.*.apiKey": "提供商 API 密钥，用于语音模式。", // pragma: allowlist secret
  "talk.voiceId":
    "旧版 ElevenLabs 默认语音 ID，用于语音模式。优先使用 talk.providers.elevenlabs.voiceId。",
  "talk.voiceAliases":
    '仅在迁移期间使用此旧版 ElevenLabs 语音别名映射（例如 {"Clawd":"EXAVITQu4vr4xnSDxMaL"}）。优先使用 talk.providers.elevenlabs.voiceAliases。',
  "talk.modelId":
    "旧版 ElevenLabs 模型 ID，用于语音模式（默认：eleven_v3）。优先使用 talk.providers.elevenlabs.modelId。",
  "talk.outputFormat":
    "仅在迁移期间使用此旧版 ElevenLabs 语音模式输出格式（例如 pcm_44100 或 mp3_44100_128）。优先使用 talk.providers.elevenlabs.outputFormat。",
  "talk.apiKey":
    "仅在迁移期间使用此旧版 ElevenLabs 语音模式 API 密钥，并将密钥保存在环境变量支持的存储中。优先使用 talk.providers.elevenlabs.apiKey（回退：ELEVENLABS_API_KEY）。",
  "talk.interruptOnSpeech":
    "如果为 true（默认），当用户在语音模式中开始说话时停止助手语音。保持启用以实现对话轮换。",
  "talk.silenceTimeoutMs": `Milliseconds of user silence before Talk mode finalizes and sends the current transcript. Leave unset to keep the platform default pause window (${describeTalkSilenceTimeoutDefaults()}).`,
  acp: "ACP 运行时控制，用于启用调度、选择后端、约束允许的代理目标和调整流式轮次投影行为。",
  "acp.enabled":
    "全局 ACP 功能开关。除非 ACP 运行时 + 策略已配置，否则保持禁用。",
  "acp.dispatch.enabled":
    "ACP 会话轮次的独立调度开关（默认：true）。设置 false 可保持 ACP 命令可用同时阻止 ACP 轮次执行。",
  "acp.backend":
    "默认 ACP 运行时后端 ID（例如：acpx）。必须匹配已注册的 ACP 运行时插件后端。",
  "acp.defaultAgent":
    "ACP 生成未指定显式目标时使用的回退 ACP 目标代理 ID。",
  "acp.allowedAgents":
    "ACP 运行时会话允许的 ACP 目标代理 ID 允许列表。空表示无额外允许列表限制。",
  "acp.maxConcurrentSessions":
    "此网关进程中同时活动的最大 ACP 会话数。",
  "acp.stream":
    "ACP 流式投影控制，用于块大小、元数据可见性和去重投递行为。",
  "acp.stream.coalesceIdleMs":
    "发出块回复前 ACP 流式文本的合并器空闲刷新窗口（毫秒）。",
  "acp.stream.maxChunkChars":
    "分割为多个块回复前 ACP 流式块投影的最大块大小。",
  "acp.stream.repeatSuppression":
    "当为 true（默认）时，在轮次中抑制重复的 ACP 状态/工具投影行，同时保持原始 ACP 事件不变。",
  "acp.stream.deliveryMode":
    "ACP 投递样式：live 增量投影输出，final_only 缓冲所有投影 ACP 输出直到终端轮次事件。",
  "acp.stream.hiddenBoundarySeparator":
    "当隐藏 ACP 工具生命周期事件发生时，在下一个可见助手文本前插入的分隔符（none|space|newline|paragraph）。默认：paragraph。",
  "acp.stream.maxOutputChars":
    "每个 ACP 轮次投影的最大助手输出字符数，超出后发出截断通知。",
  "acp.stream.maxSessionUpdateChars":
    "投影 ACP 会话/更新行（工具/状态更新）的最大字符数。",
  "acp.stream.tagVisibility":
    "ACP 投影的每 sessionUpdate 可见性覆盖（例如 usage_update、available_commands_update）。",
  "acp.runtime.ttlMinutes":
    "ACP 会话工作器在符合清理条件前的空闲运行时 TTL（分钟）。",
  "acp.runtime.installCommand":
    "`/acp install` 和 `/acp doctor` 在 ACP 后端缺失时显示的可选操作者安装/设置命令。",
  "agents.list.*.skills":
    "此代理的可选技能允许列表（省略 = 所有技能；空 = 无技能）。",
  "agents.list[].skills":
    "此代理的可选技能允许列表（省略 = 所有技能；空 = 无技能）。",
  agents:
    "代理运行时配置根节点，涵盖用于路由和执行上下文的默认值和显式代理条目。保持此部分显式配置，以便模型/工具行为在多代理工作流中保持可预测。",
  "agents.defaults":
    "代理继承的共享默认设置，除非在 agents.list 中按条目覆盖。使用默认值来强制一致的基线行为，减少重复的逐代理配置。",
  "agents.list":
    "带 ID 和可选覆盖的配置代理显式列表。保持 ID 随时间稳定，以便绑定、审批和会话路由保持确定性。",
  "agents.list[].runtime":
    "此代理的可选运行时描述符。内嵌使用 embedded（默认 OpenClaw 执行），外部使用 acp（ACP 挂载默认值）。",
  "agents.list[].runtime.type":
    '此代理的运行时类型："embedded"（默认 OpenClaw 运行时）或 "acp"（ACP 挂载默认值）。',
  "agents.list[].runtime.acp":
    "runtime.type=acp 时此代理的 ACP 运行时默认值。绑定级别的 ACP 覆盖仍按对话优先。",
  "agents.list[].runtime.acp.agent":
    "此 OpenClaw 代理使用的可选 ACP 挂载代理 ID（例如 codex、claude）。",
  "agents.list[].runtime.acp.backend":
    "此代理 ACP 会话的可选 ACP 后端覆盖（回退到全局 acp.backend）。",
  "agents.list[].runtime.acp.mode":
    "此代理的可选 ACP 会话模式默认值（persistent 或 oneshot）。",
  "agents.list[].runtime.acp.cwd":
    "此代理 ACP 会话的可选默认工作目录。",
  "agents.list[].identity.avatar":
    "头像图片路径（仅相对于代理工作区）或远程 URL/data URL。",
  "agents.defaults.heartbeat.suppressToolErrorWarnings":
    "心跳运行期间抑制工具错误警告负载。",
  "agents.list[].heartbeat.suppressToolErrorWarnings":
    "心跳运行期间抑制工具错误警告负载。",
  browser:
    "浏览器运行时控制，用于本地或远程 CDP 连接、配置文件路由和截图/快照行为。保持默认值，除非你的自动化工作流需要自定义浏览器传输设置。",
  "browser.enabled":
    "在网关中启用浏览器能力连接，以便浏览器工具和 CDP 驱动的工作流可以运行。不需要浏览器自动化时禁用以减少攻击面和启动工作。",
  "browser.cdpUrl":
    "用于连接到外部管理的浏览器实例的远程 CDP WebSocket URL。用于集中式浏览器主机，保持 URL 访问限制在可信网络路径。",
  "browser.color":
    "浏览器配置文件/UI 提示中显示彩色身份标识时使用的默认强调色。使用一致的颜色帮助操作者快速识别活动的浏览器配置文件上下文。",
  "browser.executablePath":
    "当自动发现不足以满足你的主机环境时的显式浏览器可执行文件路径。使用绝对稳定路径使启动行为在重启后保持确定性。",
  "browser.headless":
    "当本地启动器启动浏览器实例时强制无头模式。服务器环境保持无头启用，仅在需要可见 UI 调试时禁用。",
  "browser.noSandbox":
    "为运行时沙箱失败的环境禁用 Chromium 沙箱隔离标志。尽可能保持关闭，因为进程隔离保护会降低。",
  "browser.attachOnly":
    "将浏览器模式限制为仅连接行为，不启动本地浏览器进程。当所有浏览器会话由远程 CDP 提供商外部管理时使用。",
  "browser.cdpPortRangeStart":
    "用于自动分配浏览器配置文件端口的起始本地 CDP 端口。当主机级端口默认值与其他本地服务冲突时增加。",
  "browser.defaultProfile":
    "调用者未显式选择配置文件时选择的默认浏览器配置文件名称。使用稳定的低权限配置文件作为默认值，以减少意外的跨上下文状态使用。",
  "browser.relayBindHost":
    "Chrome 扩展中继侦听器的绑定 IP 地址。保持未设置以仅回环访问，或仅在中继必须跨网络命名空间可达（例如 WSL2）且周围网络已可信时设置显式的非回环 IP（如 0.0.0.0）。",
  "browser.profiles":
    "命名的浏览器配置文件连接映射，用于显式路由到 CDP 端口或 URL，带可选元数据。保持配置文件名称一致，避免重叠的端点定义。",
  "browser.profiles.*.cdpPort":
    "按配置文件的本地 CDP 端口，通过端口而非 URL 连接到浏览器实例时使用。每个配置文件使用唯一端口以避免连接冲突。",
  "browser.profiles.*.cdpUrl":
    "按配置文件的 CDP WebSocket URL，用于按配置文件名称显式远程浏览器路由。当配置文件连接终止在远程主机或隧道时使用。",
  "browser.profiles.*.driver":
    '按配置文件的浏览器驱动模式："openclaw"（或旧版 "clawd"）或 "extension"，取决于连接/运行时策略。使用与你的浏览器控制栈匹配的驱动以避免协议不匹配。',
  "browser.profiles.*.attachOnly":
    "按配置文件的仅连接覆盖，跳过本地浏览器启动，仅连接到现有 CDP 端点。当一个配置文件由外部管理而其他配置文件在本地启动时很有用。",
  "browser.profiles.*.color":
    "按配置文件的强调色，用于仪表盘和浏览器相关 UI 提示中的视觉区分。为高信号的操作者识别活动配置文件使用不同颜色。",
  "browser.evaluateEnabled":
    "启用浏览器端求值辅助程序，用于支持的运行时脚本求值能力。除非你的工作流需要超出快照/导航的求值语义，否则保持禁用。",
  "browser.snapshotDefaults":
    "调用者未提供显式快照选项时使用的默认快照捕获配置。调整此项以在频道和自动化路径间获得一致的捕获行为。",
  "browser.snapshotDefaults.mode":
    "默认快照提取模式，控制页面内容如何转换以供代理消费。选择在可读性、保真度和令牌占用之间平衡的模式。",
  "browser.ssrfPolicy":
    "浏览器/网络获取路径的服务器端请求伪造防护设置，这些路径可能到达内部主机。在生产环境中保持限制性默认值，仅显式批准的目标除外。",
  "browser.ssrfPolicy.allowPrivateNetwork":
    "browser.ssrfPolicy.dangerouslyAllowPrivateNetwork 的旧版别名。优先使用带 dangerously 前缀的键以明确风险意图。",
  "browser.ssrfPolicy.dangerouslyAllowPrivateNetwork":
    "允许从浏览器工具访问私有网络地址范围。可信网络操作者设置默认启用；禁用以强制严格的仅公共解析检查。",
  "browser.ssrfPolicy.allowedHostnames":
    "浏览器/网络请求 SSRF 策略检查的显式主机名允许列表例外。保持此列表最小化并定期审查以避免过时的广泛访问。",
  "browser.ssrfPolicy.hostnameAllowlist":
    "SSRF 策略消费者使用的旧版/备选主机名允许列表字段，用于显式主机例外。使用稳定的精确主机名，避免类通配符的广泛模式。",
  "browser.remoteCdpTimeoutMs":
    "连接到远程 CDP 端点的超时时间（毫秒），超时后浏览器连接尝试失败。高延迟隧道增加此值，或降低以更快检测失败。",
  "browser.remoteCdpHandshakeTimeoutMs":
    "针对远程浏览器目标的连接后 CDP 握手就绪检查超时时间（毫秒）。慢启动远程浏览器提高此值，自动化循环中降低以快速失败。",
  "discovery.mdns.mode":
    'mDNS broadcast mode ("minimal" default, "full" includes cliPath/sshPort, "off" disables mDNS).',
  discovery:
    "本地 mDNS 广播和可选广域存在信号的服务发现设置。保持发现范围限于预期网络，以避免泄漏服务元数据。",
  "discovery.wideArea":
    "广域发现配置组，用于将发现信号暴露到本地链路范围之外。仅在有意跨站点聚合网关存在的部署中启用。",
  "discovery.wideArea.enabled":
    "当你的环境需要非本地网关发现时启用广域发现信号。除非跨网络发现在运维上必需，否则保持禁用。",
  "discovery.mdns":
    "mDNS 发现配置组，用于本地网络广播和发现行为调整。保持最小模式用于常规 LAN 发现，除非需要额外元数据。",
  tools:
    "跨 Web、执行、媒体、消息和提升权限界面的全局工具访问策略和能力配置。使用此部分在广泛推出前约束高风险能力。",
  "tools.allow":
    "替代配置文件派生默认值的绝对工具允许列表，用于严格环境。仅在你有意运行精心策划的工具能力子集时使用。",
  "tools.deny":
    "即使配置文件或提供商规则允许也会阻止列出工具的全局工具拒绝列表。用于紧急锁定和长期纵深防御。",
  "tools.web":
    "Web 工具策略分组，用于搜索/获取提供商、限制和回退行为调整。保持启用设置与 API 密钥可用性和出站网络策略对齐。",
  "tools.exec":
    "执行工具策略分组，用于 shell 执行主机、安全模式、审批行为和运行时绑定。在生产环境中保持保守默认值，收紧提升执行路径。",
  "tools.exec.host":
    "选择 shell 命令的执行主机策略，通常控制本地与委托执行环境。使用仍满足自动化要求的最安全主机模式。",
  "tools.exec.security":
    "执行安全态势选择器，控制命令执行的沙箱/审批预期。不可信提示保持严格安全模式，仅对可信操作者工作流放宽。",
  "tools.exec.ask":
    "执行命令运行前需要人工确认时的审批策略。在共享频道中使用更严格的 ask 行为，在私有操作者上下文中使用更低摩擦的设置。",
  "tools.exec.node":
    "通过已连接节点委托命令执行时的执行工具节点绑定配置。仅在需要多节点路由时使用显式节点绑定。",
  "tools.agentToAgent":
    "允许代理间工具调用和约束可达目标代理的策略。除非有意启用跨代理编排，否则保持禁用或严格范围。",
  "tools.agentToAgent.enabled":
    "启用 agent_to_agent 工具界面，使一个代理可以在运行时调用另一个代理。简单部署中保持关闭，仅在编排价值超过复杂性时启用。",
  "tools.agentToAgent.allow":
    "启用编排时允许 agent_to_agent 调用的目标代理 ID 允许列表。使用显式允许列表以避免不受控的跨代理调用图。",
  "tools.elevated":
    "特权命令界面的提升工具访问控制，仅应从可信发送者可达。除非操作者工作流明确要求提升操作，否则保持禁用。",
  "tools.elevated.enabled":
    "当发送者和策略检查通过时启用提升工具执行路径。在公共/共享频道中保持禁用，仅对可信的所有者操作上下文启用。",
  "tools.elevated.allowFrom":
    "提升工具的发送者允许规则，通常按频道/提供商身份格式键控。使用精确的显式身份，避免提升命令被意外用户触发。",
  "tools.subagents":
    "生成子代理的工具策略包装器，用于相对于父默认值限制或扩展工具可用性。使用此项将委托代理的能力范围限制在任务意图内。",
  "tools.subagents.tools":
    "应用于生成子代理运行时的允许/拒绝工具策略，用于逐子代理加固。当子代理运行半自主工作流时，保持比父范围更窄。",
  "tools.sandbox":
    "沙箱代理执行的工具策略包装器，使沙箱运行可以有不同的能力边界。使用此项在沙箱上下文中强制更强的安全性。",
  "tools.sandbox.tools":
    "代理在沙箱执行环境中运行时应用的允许/拒绝工具策略。保持策略最小化，避免沙箱任务升级到不必要的外部操作。",
  web: "Web 频道运行时设置，用于基于 Web 聊天界面的心跳和重连行为。使用适合你的网络可靠性和正常运行时间需求的重连值。",
  "web.enabled":
    "启用 Web 频道运行时和相关 WebSocket 生命周期行为。不使用 Web 聊天时禁用以减少活动连接管理开销。",
  "web.heartbeatSeconds":
    "Web 频道连接和存活性维护的心跳间隔（秒）。使用更短间隔以更快检测，或更长间隔以减少保活噪音。",
  "web.reconnect":
    "传输失败后 Web 频道重连尝试的重连退避策略。保持有界重试和抖动调整，避免雷群重连行为。",
  "web.reconnect.initialMs":
    "断开连接后首次重试前的初始重连延迟（毫秒）。使用适度延迟以快速恢复而不立即重试风暴。",
  "web.reconnect.maxMs":
    "重连退避上限（毫秒），限制重复失败时的重试延迟增长。使用合理上限以在长时间中断后保持及时恢复。",
  "web.reconnect.factor":
    "Web 频道重试循环中重连尝试之间的指数退避乘数。保持乘数大于 1 并配合抖动以获得稳定的大规模重连行为。",
  "web.reconnect.jitter":
    "应用于重连延迟的随机化因子（0-1），在中断事件后去同步客户端。在多客户端部署中保持非零抖动以减少同步峰值。",
  "web.reconnect.maxAttempts":
    "当前失败序列放弃前的最大重连尝试次数（0 表示不重试）。在自动化敏感环境中使用有限上限进行受控的故障处理。",
  canvasHost:
    "Canvas 宿主设置，用于提供 canvas 资产和 canvas 工作流的本地实时重载行为。除非正在使用 canvas 资产，否则保持禁用。",
  "canvasHost.enabled":
    "启用 canvas 宿主服务器进程和提供 canvas 文件的路由。canvas 工作流不活动时保持禁用以减少暴露的本地服务。",
  "canvasHost.root":
    "canvas 宿主提供 canvas 内容和静态资产的文件系统根目录。使用专用目录，避免使用广泛的仓库根目录以最小权限文件暴露。",
  "canvasHost.port":
    "启用 canvas 托管时 canvas 宿主 HTTP 服务器使用的 TCP 端口。选择不冲突的端口并相应对齐防火墙/代理策略。",
  "canvasHost.liveReload":
    "开发工作流期间启用 canvas 资产的自动实时重载行为。在类生产环境中保持禁用，优先确定性输出。",
  talk: "语音模式合成设置，用于语音身份、模型选择、输出格式和中断行为。使用此部分调整面向人类的语音用户体验，同时控制延迟和成本。",
  "gateway.auth.token":
    "默认情况下网关访问需要此令牌（除非使用 Tailscale Serve 身份）；非回环绑定时必需。",
  "gateway.auth.password": "Tailscale Funnel 必需。",
  "agents.defaults.sandbox.browser.network":
    "沙箱浏览器容器的 Docker 网络（默认：openclaw-sandbox-browser）。如需更严格隔离则避免 bridge。",
  "agents.list[].sandbox.browser.network": "逐代理沙箱浏览器 Docker 网络覆盖。",
  "agents.defaults.sandbox.docker.dangerouslyAllowContainerNamespaceJoin":
    "【危险】break-glass 覆盖，允许沙箱 Docker 网络模式 container:<id>。这会加入另一个容器命名空间并削弱沙箱隔离。",
  "agents.list[].sandbox.docker.dangerouslyAllowContainerNamespaceJoin":
    "逐代理的容器命名空间加入【危险】覆盖，用于沙箱 Docker 网络模式。",
  "agents.defaults.sandbox.browser.cdpSourceRange":
    "容器边缘 CDP 入口的可选 CIDR 允许列表（例如 172.21.0.1/32）。",
  "agents.list[].sandbox.browser.cdpSourceRange":
    "逐代理 CDP 源 CIDR 允许列表覆盖。",
  "gateway.controlUi.basePath":
    "控制面板 UI 提供服务的可选 URL 前缀（例如 /openclaw）。",
  "gateway.controlUi.root":
    "控制面板 UI 资产的可选文件系统根目录（默认为 dist/control-ui）。",
  "gateway.controlUi.allowedOrigins":
    "控制面板 UI/WebChat WebSocket 连接允许的浏览器来源（仅完整来源，例如 https://control.example.com）。非回环控制面板 UI 部署必需，除非显式启用了危险的 Host 头回退。",
  "gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback":
    "【危险】启用基于 Host 头的来源回退，用于控制面板 UI/WebChat WebSocket 检查。当你的部署有意依赖 Host 头来源策略时支持此模式；显式的 gateway.controlUi.allowedOrigins 仍然是推荐的加固默认值。",
  "gateway.controlUi.allowInsecureAuth":
    "当你必须运行非标准设置时，放宽控制面板 UI 的严格浏览器认证检查。除非你信任你的网络和代理路径，否则保持关闭，因为冒充风险更高。",
  "gateway.controlUi.dangerouslyDisableDeviceAuth":
    "禁用控制面板 UI 设备身份检查，仅依赖令牌/密码。仅用于可信网络上的短期调试，然后立即关闭。",
  "gateway.http.endpoints.chatCompletions.enabled":
    "启用 OpenAI 兼容的 `POST /v1/chat/completions` 端点（默认：false）。",
  "gateway.http.endpoints.chatCompletions.maxBodyBytes":
    "`/v1/chat/completions` 的最大请求体大小（字节，默认：20MB）。",
  "gateway.http.endpoints.chatCompletions.maxImageParts":
    "最新用户消息中接受的最大 `image_url` 部分数量（默认：8）。",
  "gateway.http.endpoints.chatCompletions.maxTotalImageBytes":
    "一个请求中所有 `image_url` 部分的最大累计解码字节数（默认：20MB）。",
  "gateway.http.endpoints.chatCompletions.images":
    "OpenAI 兼容 `image_url` 部分的图片获取/验证控制。",
  "gateway.http.endpoints.chatCompletions.images.allowUrl":
    "允许服务器端 URL 获取 `image_url` 部分（默认：false；data URI 始终支持）。",
  "gateway.http.endpoints.chatCompletions.images.urlAllowlist":
    "`image_url` URL 获取的可选主机名允许列表；支持精确主机和 `*.example.com` 通配符。",
  "gateway.http.endpoints.chatCompletions.images.allowedMimes":
    "`image_url` 部分允许的 MIME 类型（不区分大小写列表）。",
  "gateway.http.endpoints.chatCompletions.images.maxBytes":
    "每个获取/解码的 `image_url` 图片的最大字节数（默认：10MB）。",
  "gateway.http.endpoints.chatCompletions.images.maxRedirects":
    "获取 `image_url` URL 时允许的最大 HTTP 重定向次数（默认：3）。",
  "gateway.http.endpoints.chatCompletions.images.timeoutMs":
    "`image_url` URL 获取的超时时间（毫秒，默认：10000）。",
  "gateway.reload.mode":
    '控制配置编辑的应用方式："off" 忽略实时编辑，"restart" 始终重启，"hot" 在进程内应用，"hybrid" 先尝试热加载然后在需要时重启。保持 "hybrid" 以获得最安全的常规更新。',
  "gateway.reload.debounceMs": "应用配置更改前的防抖窗口（毫秒）。",
  "gateway.nodes.browser.mode":
    '节点浏览器路由模式（"auto" = 选择单个已连接的浏览器节点，"manual" = 需要 node 参数，"off" = 禁用）。',
  "gateway.nodes.browser.node": "将浏览器路由固定到特定的节点 ID 或名称（可选）。",
  "gateway.nodes.allowCommands":
    "在网关默认值之外额外允许的 node.invoke 命令（命令字符串数组）。在此启用危险命令是安全敏感的覆盖，会被 `openclaw security audit` 标记。",
  "gateway.nodes.denyCommands":
    "即使存在于节点声明或默认允许列表中也要阻止的节点命令名称（仅精确命令名匹配，例如 `system.run`；不检查该命令内的 shell 文本）。",
  nodeHost:
    "节点主机控制，用于从此网关节点向其他节点或客户端暴露功能。保持默认值，除非你有意在节点网络中代理本地能力。",
  "nodeHost.browserProxy":
    "浏览器代理设置分组，用于通过节点路由暴露本地浏览器控制。仅在远程节点工作流需要你的本地浏览器配置文件时启用。",
  "nodeHost.browserProxy.enabled":
    "通过节点代理路由暴露本地浏览器控制服务器，使远程客户端可以使用此主机的浏览器能力。除非远程自动化明确依赖它，否则保持禁用。",
  "nodeHost.browserProxy.allowProfiles":
    "通过节点代理路由暴露的浏览器配置文件名称的可选允许列表。留空以暴露所有配置的配置文件，或使用精简列表以强制最小权限配置文件访问。",
  media:
    "跨处理入站文件的提供商和工具共享的顶级媒体行为。保持默认值，除非需要为外部处理管道提供稳定文件名或更长的入站媒体保留。",
  "media.preserveFilenames":
    "启用时，上传的媒体保留原始文件名而非生成的临时安全名称。当下游自动化依赖稳定名称时开启，关闭以减少意外的文件名泄漏。",
  "media.ttlHours":
    "跨完整媒体树的持久化入站媒体清理的可选保留窗口（小时）。留空以保留旧版行为，或设置如 24（1 天）或 168（7 天）以启用自动清理。",
  audio:
    "在高级工具处理语音或媒体内容之前使用的全局音频摄取设置。当需要对语音备忘录和片段进行确定性转录行为时配置。",
  "audio.transcription":
    "基于命令的转录设置，用于在代理处理前将音频文件转换为文本。保持简单确定性的命令路径，以便在日志中易于诊断失败。",
  "audio.transcription.command":
    '用于转录音频的可执行文件 + 参数（第一个令牌必须是安全的二进制/路径），例如 `["whisper-cli", "--model", "small", "{input}"]`。优先使用固定命令以使运行时环境行为一致。',
  "audio.transcription.timeoutSeconds":
    "转录命令完成前允许的最大时间。较长录音增加此值，延迟敏感部署中保持紧凑。",
  bindings:
    "顶级绑定规则，用于路由和持久化 ACP 会话所有权。正常路由使用 type=route，持久化 ACP 挂载绑定使用 type=acp。",
  "bindings[].type":
    '绑定类型。正常路由使用 "route"（或省略用于旧版路由条目），持久化 ACP 会话绑定使用 "acp"。',
  "bindings[].agentId":
    "当对应的绑定匹配规则满足时接收流量的目标代理 ID。仅使用有效的已配置代理 ID 以避免运行时路由失败。",
  "bindings[].match":
    "用于决定绑定何时应用的匹配规则对象，包括频道和可选的账户/对等约束。保持规则精确以避免跨上下文的意外代理接管。",
  "bindings[].match.channel":
    "此绑定适用的频道/提供商标识符，如 `telegram`、`discord` 或插件频道 ID。精确使用已配置的频道键以使绑定求值可靠工作。",
  "bindings[].match.accountId":
    "多账户频道设置中的可选账户选择器，使绑定仅适用于一个身份。需要路由的账户范围时使用，否则留空。",
  "bindings[].match.peer":
    "特定对话的可选对等匹配器，包括对等类型和对等 ID。当只有一个直接/群组/频道目标应固定到某代理时使用。",
  "bindings[].match.peer.kind":
    '对等会话类型："direct"、"group"、"channel" 或旧版 "dm"（direct 的弃用别名）。新配置优先使用 "direct" 并保持类型与频道语义对齐。',
  "bindings[].match.peer.id":
    "与对等匹配一起使用的会话标识符，如提供商的聊天 ID、频道 ID 或群组 ID。保持精确以避免静默不匹配。",
  "bindings[].match.guildId":
    "多服务器部署中绑定求值的可选 Discord 风格公会/服务器 ID 约束。当相同对等标识符可能出现在不同公会时使用。",
  "bindings[].match.teamId":
    "按提供商使用的可选团队/工作区 ID 约束，用于在团队下范围聊天。当需要将绑定隔离到一个工作区上下文时添加。",
  "bindings[].match.roles":
    "按提供商使用的可选基于角色的过滤列表，用于将角色附加到聊天上下文。使用此项将特权或运维角色流量路由到专门的代理。",
  "bindings[].acp":
    "type=acp 绑定的可选逐绑定 ACP 覆盖。此层覆盖匹配对话的 agents.list[].runtime.acp 默认值。",
  "bindings[].acp.mode": "此绑定的 ACP 会话模式覆盖（persistent 或 oneshot）。",
  "bindings[].acp.label":
    "此绑定对话中 ACP 状态/诊断的人类友好标签。",
  "bindings[].acp.cwd": "从此绑定创建的 ACP 会话的工作目录覆盖。",
  "bindings[].acp.backend":
    "此绑定的 ACP 后端覆盖（回退到代理运行时 ACP 后端，然后全局 acp.backend）。",
  broadcast:
    "广播路由映射，用于将同一出站消息发送到每个源会话的多个对等 ID。保持最小化并审计，因为一个源可以扇出到多个目的地。",
  "broadcast.strategy":
    '广播扇出的投递顺序："parallel" 并发发送到所有目标，"sequential" 逐个发送。速度优先使用 "parallel"，更严格排序/背压控制使用 "sequential"。',
  "broadcast.*":
    "每源广播目的地列表，每个键是源对等 ID，值是目的地对等 ID 数组。保持列表有意图以避免意外的消息放大。",
  "diagnostics.flags":
    '按标志启用目标诊断日志（例如 ["telegram.http"]）。支持通配符如 "telegram.*" 或 "*"。',
  "diagnostics.enabled":
    "日志和遥测连接路径中诊断设备输出的主开关。正常可观测性保持启用，仅在严格约束的环境中禁用。",
  "diagnostics.stuckSessionWarnMs":
    "会话保持处理状态时发出卡住会话警告的年龄阈值（毫秒）。长时间多工具轮次增加以减少误报；降低以更快检测挂起。",
  "diagnostics.otel.enabled":
    "基于配置的端点/协议设置启用追踪、指标和日志的 OpenTelemetry 导出管道。除非你的收集器端点和认证已完全配置，否则保持禁用。",
  "diagnostics.otel.endpoint":
    "用于 OpenTelemetry 导出传输的收集器端点 URL，包括协议和端口。使用可达的可信收集器端点并在推出后监控摄取错误。",
  "diagnostics.otel.protocol":
    'OTel 遥测导出传输协议："http/protobuf" 或 "grpc"，取决于收集器支持。使用你的可观测性后端期望的协议以避免丢弃遥测负载。',
  "diagnostics.otel.headers":
    "随 OpenTelemetry 导出请求发送的额外 HTTP/gRPC 元数据头，通常用于租户认证或路由。保持密钥在环境变量支持的值中，避免不必要的头部蔓延。",
  "diagnostics.otel.serviceName":
    "遥测资源属性中报告的服务名称，用于在可观测性后端识别此网关实例。使用稳定名称以保持仪表盘和告警跨部署一致。",
  "diagnostics.otel.traces":
    "启用追踪信号导出到配置的 OpenTelemetry 收集器端点。需要延迟/调试追踪时保持启用，仅需要指标/日志时禁用。",
  "diagnostics.otel.metrics":
    "启用指标信号导出到配置的 OpenTelemetry 收集器端点。运行时健康仪表盘保持启用，仅在必须最小化指标量时禁用。",
  "diagnostics.otel.logs":
    "除本地日志接收器外，通过 OpenTelemetry 启用日志信号导出。当需要跨服务和代理的集中式日志关联时使用。",
  "diagnostics.otel.sampleRate":
    "追踪采样率（0-1），控制导出到可观测性后端的追踪流量比例。较低速率减少开销/成本，较高速率改善调试保真度。",
  "diagnostics.otel.flushIntervalMs":
    "从缓冲区到收集器的周期性遥测刷新间隔（毫秒）。增加以减少导出噪音，或降低以在活动事件响应期间更快获得可见性。",
  "diagnostics.cacheTrace.enabled":
    "记录内嵌代理运行的缓存追踪快照（默认：false）。",
  "diagnostics.cacheTrace.filePath":
    "缓存追踪日志的 JSONL 输出路径（默认：$OPENCLAW_STATE_DIR/logs/cache-trace.jsonl）。",
  "diagnostics.cacheTrace.includeMessages":
    "在追踪输出中包含完整消息负载（默认：true）。",
  "diagnostics.cacheTrace.includePrompt": "在追踪输出中包含提示文本（默认：true）。",
  "diagnostics.cacheTrace.includeSystem": "在追踪输出中包含系统提示（默认：true）。",
  "tools.exec.applyPatch.enabled":
    "实验性。当工具策略允许时为 OpenAI 模型启用 apply_patch。",
  "tools.exec.applyPatch.workspaceOnly":
    "将 apply_patch 路径限制在工作区目录（默认：true）。设置 false 允许写入工作区外（危险）。",
  "tools.exec.applyPatch.allowModels":
    '可选的模型 ID 允许列表（例如 "gpt-5.2" 或 "openai/gpt-5.2"）。',
  "tools.loopDetection.enabled":
    "启用重复工具调用循环检测和退避安全检查（默认：false）。",
  "tools.loopDetection.historySize": "循环检测的工具历史窗口大小（默认：30）。",
  "tools.loopDetection.warningThreshold":
    "检测器启用时重复模式的警告阈值（默认：10）。",
  "tools.loopDetection.criticalThreshold":
    "检测器启用时重复模式的严重阈值（默认：20）。",
  "tools.loopDetection.globalCircuitBreakerThreshold":
    "全局无进展断路器阈值（默认：30）。",
  "tools.loopDetection.detectors.genericRepeat":
    "启用通用重复相同工具/相同参数循环检测（默认：true）。",
  "tools.loopDetection.detectors.knownPollNoProgress":
    "启用已知轮询工具无进展循环检测（默认：true）。",
  "tools.loopDetection.detectors.pingPong": "启用乒乓循环检测（默认：true）。",
  "tools.exec.notifyOnExit":
    "当为 true（默认）时，后台执行会话退出和节点执行生命周期事件会排入系统事件并请求心跳。",
  "tools.exec.notifyOnExitEmptySuccess":
    "当为 true 时，空输出的成功后台执行退出仍排入完成系统事件（默认：false）。",
  "tools.exec.pathPrepend": "执行运行（网关/沙箱）时预置到 PATH 的目录。",
  "tools.exec.safeBins":
    "允许仅标准输入的安全二进制文件在无显式允许列表条目的情况下运行。",
  "tools.exec.safeBinTrustedDirs":
    "安全二进制路径检查信任的额外显式目录（PATH 条目永不自动信任）。",
  "tools.exec.safeBinProfiles":
    "可选的逐二进制安全二进制配置文件（位置限制 + 允许/拒绝标志）。",
  "tools.profile":
    "用于选择预定义工具策略基线的全局工具配置文件名称。用于跨代理一致的环境态势，保持配置文件名称稳定。",
  "tools.alsoAllow":
    "合并到所选工具配置文件和默认策略之上的额外工具允许列表条目。保持此列表精简且显式以便审计快速识别有意的策略例外。",
  "tools.byProvider":
    "按频道/提供商 ID 键控的逐提供商工具允许/拒绝覆盖，以按界面定制能力。当一个提供商需要比全局工具策略更严格的控制时使用。",
  "agents.list[].tools.profile":
    "当一个代理需要不同能力基线时的逐代理工具配置文件选择覆盖。谨慎使用以保持跨代理的策略差异有意且可审查。",
  "agents.list[].tools.alsoAllow":
    "在全局和配置文件策略之上的逐代理工具附加允许列表。保持精确以避免专门代理的意外权限扩展。",
  "agents.list[].tools.byProvider":
    "逐代理的特定提供商工具策略覆盖，用于频道范围的能力控制。当单个代理对一个提供商需要比其他更严格的限制时使用。",
  "tools.exec.approvalRunningNoticeMs":
    "执行审批授予后显示进行中通知的延迟（毫秒）。增加以减少快速命令的闪烁，或降低以更快获得操作者反馈。",
  "tools.links.enabled":
    "启用自动链接理解预处理，以便在代理推理前总结 URL。保持启用以获得更丰富的上下文，当需要严格最小处理时禁用。",
  "tools.links.maxLinks":
    "链接理解期间每轮展开的最大链接数量。使用较低值控制多话题中的延迟/成本，当多链接上下文至关重要时使用较高值。",
  "tools.links.timeoutSeconds":
    "每链接理解超时预算（秒），超时后跳过未解析的链接。保持有界以避免外部站点缓慢或不可达时的长时间停顿。",
  "tools.links.models":
    "链接理解任务的首选模型列表，按顺序作为回退评估。常规总结优先使用轻量模型，仅在需要时使用更重模型。",
  "tools.links.scope":
    "控制链接理解相对于对话上下文和消息类型何时运行。保持范围保守以避免对链接不可操作的消息进行不必要的获取。",
  "tools.media.models":
    "当特定模态模型列表未设置时，媒体理解工具使用的共享回退模型列表。保持与可用多模态提供商对齐以避免运行时回退抖动。",
  "tools.media.concurrency":
    "每轮跨图片、音频和视频任务的最大并发媒体理解操作数。资源受限部署降低以防止 CPU/网络饱和。",
  "tools.media.image.enabled":
    "启用图片理解以便附件或引用的图片可以被解释为文本上下文。如需纯文本操作或想避免图片处理成本则禁用。",
  "tools.media.image.maxBytes":
    "策略跳过或截断前接受的最大图片负载大小（字节）。保持限制对提供商上限和基础设施带宽合理。",
  "tools.media.image.maxChars":
    "模型响应归一化后图片理解输出返回的最大字符数。使用更紧限制减少提示膨胀，细节密集的 OCR 任务使用更大限制。",
  "tools.media.image.prompt":
    "用于图片理解请求的指令模板，塑造提取样式和详细级别。保持提示确定性以使输出在轮次和频道间保持一致。",
  "tools.media.image.timeoutSeconds":
    "每个图片理解请求中止前的超时时间（秒）。高分辨率分析增加，延迟敏感操作者工作流降低。",
  "tools.media.image.attachments":
    "图片输入的附件处理策略，包括哪些消息附件符合图片分析条件。在不可信频道中使用限制性设置以减少意外处理。",
  "tools.media.image.models":
    "当你想覆盖共享媒体模型时，专门用于图片理解的有序模型首选项。将最可靠的多模态模型放在首位以减少回退尝试。",
  "tools.media.image.scope":
    "图片理解尝试时机的范围选择器（例如仅显式请求与更广泛的自动检测）。繁忙频道保持窄范围以控制令牌和 API 支出。",
  ...MEDIA_AUDIO_FIELD_HELP,
  "tools.media.video.enabled":
    "启用视频理解以便片段可以被总结为文本供下游推理和响应使用。当处理视频不在策略内或对部署太昂贵时禁用。",
  "tools.media.video.maxBytes":
    "策略拒绝或修剪前接受的最大视频负载大小（字节）。根据提供商和基础设施限制调整以避免重复的超时/失败循环。",
  "tools.media.video.maxChars":
    "视频理解输出保留的最大字符数以控制提示增长。密集场景描述提高，偏好简洁摘要时降低。",
  "tools.media.video.prompt":
    "视频理解的指令模板，描述期望的摘要粒度和关注区域。保持稳定以使输出质量在模型/提供商回退间保持可预测。",
  "tools.media.video.timeoutSeconds":
    "每个视频理解请求取消前的超时时间（秒）。交互式频道使用保守值，离线或批量处理使用更长值。",
  "tools.media.video.attachments":
    "视频分析的附件资格策略，定义哪些消息文件可以触发视频处理。在共享频道中保持显式以防止意外的大型媒体工作负载。",
  "tools.media.video.models":
    "共享媒体回退应用前专门用于视频理解的有序模型首选项。优先选择具有强大多模态视频支持的模型以最小化降级摘要。",
  "tools.media.video.scope":
    "控制跨传入事件何时尝试视频理解的范围选择器。嘈杂频道收窄范围，仅在视频解读是工作流核心时扩大。",
  "skills.load.watch":
    "启用文件系统监视技能定义更改，以便无需完全重启进程即可应用更新。开发工作流保持启用，不可变生产镜像中禁用。",
  "skills.load.watchDebounceMs":
    "重载逻辑运行前合并快速技能文件更改的防抖窗口（毫秒）。增加以减少频繁写入的重载抖动，或降低以获得更快的编辑反馈。",
  approvals:
    "审批路由控制，用于将执行审批请求转发到发起会话之外的聊天目的地。除非操作者需要带外审批可见性，否则保持禁用。",
  "approvals.exec":
    "执行审批转发行为分组，包括启用、路由模式、过滤器和显式目标。当审批提示必须到达运维频道而非仅限原始线程时在此配置。",
  "approvals.exec.enabled":
    "启用将执行审批请求转发到已配置投递目的地（默认：false）。低风险环境保持禁用，仅在人工审批响应者需要频道可见提示时启用。",
  "approvals.exec.mode":
    '控制审批提示发送位置："session" 使用原始聊天，"targets" 使用已配置目标，"both" 发送到两个路径。将 "session" 作为基线，仅在运维工作流需要冗余时扩展。',
  "approvals.exec.agentFilter":
    '转发审批的可选代理 ID 允许列表，例如 `["primary", "ops-agent"]`。使用此项限制转发范围并避免通知与无关代理相关的频道。',
  "approvals.exec.sessionFilter":
    '可选的会话密钥过滤器，匹配子字符串或正则样式模式，例如 `["discord:", "^agent:ops:"]`。使用窄模式以确保仅预期的审批上下文被转发到共享目的地。',
  "approvals.exec.targets":
    "转发模式包含目标时使用的显式投递目标，每个包含频道和目的地详情。保持目标列表最小权限，在启用广泛转发前验证每个目的地。",
  "approvals.exec.targets[].channel":
    "用于转发审批投递的频道/提供商 ID，如 discord、slack 或插件频道 ID。仅使用有效的频道 ID 以避免审批因未知路由而静默失败。",
  "approvals.exec.targets[].to":
    "目标频道内的目的地标识符（频道 ID、用户 ID 或线程根，取决于提供商）。请按提供商验证语义，因为目的地格式因频道集成而异。",
  "approvals.exec.targets[].accountId":
    "多账户频道设置中的可选账户选择器，当审批必须通过特定账户上下文路由时使用。仅在目标频道有多个已配置身份时使用。",
  "approvals.exec.targets[].threadId":
    "支持线程投递转发审批的频道的可选线程/主题目标。使用此项将审批流量限制在运维线程而非主频道中。",
  "tools.fs.workspaceOnly":
    "将文件系统工具（read/write/edit/apply_patch）限制在工作区目录（默认：false）。",
  "tools.sessions.visibility":
    '控制 sessions_list/sessions_history/sessions_send 可以定位哪些会话。（"tree" 默认 = 当前会话 + 生成的子代理会话；"self" = 仅当前；"agent" = 当前代理 ID 中的任何会话；"all" = 任何会话；跨代理仍需要 tools.agentToAgent）。',
  "tools.message.allowCrossContextSend":
    "旧版覆盖：允许跨所有提供商的跨上下文发送。",
  "tools.message.crossContext.allowWithinProvider":
    "允许在同一提供商内向其他频道发送（默认：true）。",
  "tools.message.crossContext.allowAcrossProviders":
    "允许跨不同提供商发送（默认：false）。",
  "tools.message.crossContext.marker.enabled":
    "跨上下文发送时添加可见来源标记（默认：true）。",
  "tools.message.crossContext.marker.prefix":
    '跨上下文标记的文本前缀（支持 "{channel}"）。',
  "tools.message.crossContext.marker.suffix":
    '跨上下文标记的文本后缀（支持 "{channel}"）。',
  "tools.message.broadcast.enabled": "启用广播操作（默认：true）。",
  "tools.web.search.enabled": "启用 web_search 工具（需要提供商 API 密钥）。",
  "tools.web.search.provider":
    '搜索提供商（"brave"、"gemini"、"grok"、"kimi" 或 "perplexity"）。省略时从可用 API 密钥自动检测。',
  "tools.web.search.apiKey": "Brave Search API 密钥（回退：BRAVE_API_KEY 环境变量）。",
  "tools.web.search.maxResults": "返回的结果数量（1-10）。",
  "tools.web.search.timeoutSeconds": "web_search 请求的超时时间（秒）。",
  "tools.web.search.cacheTtlMinutes": "web_search 结果的缓存 TTL（分钟）。",
  "tools.web.search.brave.mode":
    'Brave Search 模式："web"（URL 结果）或 "llm-context"（预提取的页面内容用于 LLM 基础）。',
  "tools.web.search.gemini.apiKey":
    "用于 Google Search 基础的 Gemini API 密钥（回退：GEMINI_API_KEY 环境变量）。",
  "tools.web.search.gemini.model": 'Gemini 模型覆盖（默认："gemini-2.5-flash"）。',
  "tools.web.search.grok.apiKey": "Grok (xAI) API 密钥（回退：XAI_API_KEY 环境变量）。", // pragma: allowlist secret
  "tools.web.search.grok.model": 'Grok 模型覆盖（默认："grok-4-1-fast"）。',
  "tools.web.search.kimi.apiKey":
    "Moonshot/Kimi API 密钥（回退：KIMI_API_KEY 或 MOONSHOT_API_KEY 环境变量）。",
  "tools.web.search.kimi.baseUrl":
    'Kimi 基础 URL 覆盖（默认："https://api.moonshot.ai/v1"）。',
  "tools.web.search.kimi.model": 'Kimi 模型覆盖（默认："moonshot-v1-128k"）。',
  "tools.web.search.perplexity.apiKey":
    "Perplexity 或 OpenRouter API 密钥（回退：PERPLEXITY_API_KEY 或 OPENROUTER_API_KEY 环境变量）。直接 Perplexity 密钥默认使用 Search API；OpenRouter 密钥使用 Sonar 聊天完成。",
  "tools.web.search.perplexity.baseUrl":
    "可选的 Perplexity/OpenRouter 聊天完成基础 URL 覆盖。设置此项将 Perplexity 切换到旧版 Sonar/OpenRouter 兼容路径。",
  "tools.web.search.perplexity.model":
    '可选的 Sonar/OpenRouter 模型覆盖（默认："perplexity/sonar-pro"）。设置此项将 Perplexity 切换到旧版聊天完成兼容路径。',
  "tools.web.fetch.enabled": "启用 web_fetch 工具（轻量 HTTP 获取）。",
  "tools.web.fetch.maxChars": "web_fetch 返回的最大字符数（截断）。",
  "tools.web.fetch.maxCharsCap":
    "web_fetch maxChars 的硬上限（适用于配置和工具调用）。",
  "tools.web.fetch.timeoutSeconds": "web_fetch 请求的超时时间（秒）。",
  "tools.web.fetch.cacheTtlMinutes": "web_fetch 结果的缓存 TTL（分钟）。",
  "tools.web.fetch.maxRedirects": "web_fetch 允许的最大重定向次数（默认：3）。",
  "tools.web.fetch.userAgent": "覆盖 web_fetch 请求的 User-Agent 头。",
  "tools.web.fetch.readability":
    "使用 Readability 从 HTML 提取主要内容（回退到基本 HTML 清理）。",
  "tools.web.fetch.firecrawl.enabled": "启用 web_fetch 的 Firecrawl 回退（如已配置）。",
  "tools.web.fetch.firecrawl.apiKey": "Firecrawl API 密钥（回退：FIRECRAWL_API_KEY 环境变量）。",
  "tools.web.fetch.firecrawl.baseUrl":
    "Firecrawl 基础 URL（例如 https://api.firecrawl.dev 或自定义端点）。",
  "tools.web.fetch.firecrawl.onlyMainContent":
    "当为 true 时，Firecrawl 仅返回主要内容（默认：true）。",
  "tools.web.fetch.firecrawl.maxAgeMs":
    "Firecrawl maxAge（毫秒），API 支持时用于缓存结果。",
  "tools.web.fetch.firecrawl.timeoutSeconds": "Firecrawl 请求的超时时间（秒）。",
  models:
    "模型目录根节点，用于提供商定义、合并/替换行为和可选 Bedrock 发现集成。在依赖生产故障切换路径前，保持提供商定义显式且已验证。",
  "models.mode":
    '控制提供商目录行为："merge" 保留内置并叠加自定义提供商，"replace" 仅使用已配置的提供商。"merge" 模式下，匹配的提供商 ID 保留非空 agent models.json baseUrl 值，apiKey 值仅在提供商非当前配置/认证配置上下文中 SecretRef 管理时保留；SecretRef 管理的提供商从当前源标记刷新 apiKey，匹配模型 contextWindow/maxTokens 使用显式和隐式条目之间的较高值。',
  "models.providers":
    "按提供商 ID 键控的提供商映射，包含该提供商条目的连接/认证设置和具体模型定义。使用稳定的提供商键以保持代理和工具引用跨环境可移植。",
  "models.providers.*.baseUrl":
    "用于为该提供商条目服务模型请求的提供商端点基础 URL。使用 HTTPS 端点，在需要时通过配置模板保持 URL 环境特定。",
  "models.providers.*.apiKey":
    "提供商需要直接密钥认证时使用的 API 密钥型认证提供商凭据。使用密钥/环境替换，避免在提交的配置文件中存储真实密钥。",
  "models.providers.*.auth":
    '选择提供商认证样式："api-key" 用于 API 密钥认证，"token" 用于 Bearer 令牌认证，"oauth" 用于 OAuth 凭据，"aws-sdk" 用于 AWS 凭据解析。根据提供商要求匹配。',
  "models.providers.*.api":
    "提供商 API 适配器选择，控制模型调用的请求/响应兼容性处理。使用与上游提供商协议匹配的适配器以避免功能不匹配。",
  "models.providers.*.injectNumCtxForOpenAICompat":
    "控制 OpenClaw 是否为使用 OpenAI 兼容适配器（`openai-completions`）配置的 Ollama 提供商注入 `options.num_ctx`。默认为 true。仅在你的代理/上游拒绝未知 `options` 负载字段时设置 false。",
  "models.providers.*.headers":
    "合并到提供商请求中的静态 HTTP 头，用于租户路由、代理认证或自定义网关要求。谨慎使用并将敏感头值保存在密钥中。",
  "models.providers.*.authHeader":
    "当为 true 时，凭据通过 HTTP Authorization 头发送，即使可以使用替代认证。仅在你的提供商或代理明确要求 Authorization 转发时使用。",
  "models.providers.*.models":
    "提供商的已声明模型列表，包括标识符、元数据和可选的兼容性/成本提示。保持 ID 与提供商目录值精确匹配以使选择和回退正确解析。",
  "models.bedrockDiscovery":
    "自动 AWS Bedrock 模型发现设置，用于从账户可见性合成提供商模型条目。保持发现范围有限，刷新间隔保守以减少 API 抖动。",
  "models.bedrockDiscovery.enabled":
    "为 Bedrock 支持的提供商启用定期 Bedrock 模型发现和目录刷新。除非 Bedrock 正在使用且 IAM 权限已正确配置，否则保持禁用。",
  "models.bedrockDiscovery.region":
    "发现启用时用于 Bedrock 发现调用的 AWS 区域。使用你的 Bedrock 模型已配置的区域以避免空发现结果。",
  "models.bedrockDiscovery.providerFilter":
    "Bedrock 发现的可选提供商允许列表过滤器，仅刷新所选提供商。在多提供商环境中使用以限制发现范围。",
  "models.bedrockDiscovery.refreshInterval":
    "Bedrock 发现轮询的刷新频率（秒），用于随时间检测新可用模型。生产环境使用更长间隔以减少 API 成本和控制平面噪音。",
  "models.bedrockDiscovery.defaultContextWindow":
    "当提供商元数据缺少显式限制时应用于发现模型的回退上下文窗口值。使用现实默认值以避免超出真实提供商约束的过大提示。",
  "models.bedrockDiscovery.defaultMaxTokens":
    "没有显式输出令牌限制的发现模型的回退最大令牌值。使用保守默认值以减少截断意外和意外的令牌支出。",
  auth: "认证配置文件根节点，用于多配置文件提供商凭据和基于冷却的故障切换排序。保持配置文件最小且显式，以便自动故障切换行为可审计。",
  "channels.slack.allowBots":
    "允许机器人消息触发 Slack 回复（默认：false）。",
  "channels.slack.thread.historyScope":
    'Slack 线程历史上下文范围（"thread" 按线程隔离；"channel" 复用频道历史）。',
  "channels.slack.thread.inheritParent":
    "如果为 true，Slack 线程会话继承父频道转录（默认：false）。",
  "channels.slack.thread.initialHistoryLimit":
    "启动新线程会话时获取的现有 Slack 线程消息最大数量（默认：20，设为 0 禁用）。",
  "channels.mattermost.botToken":
    "来自 Mattermost 系统控制台 -> 集成 -> 机器人账户的机器人令牌。",
  "channels.mattermost.baseUrl":
    "Mattermost 服务器的基础 URL（例如 https://chat.example.com）。",
  "channels.mattermost.chatmode":
    '在被提及时回复频道消息（"oncall"），在触发字符（">" 或 "!"）时回复（"onchar"），或在每条消息时回复（"onmessage"）。',
  "channels.mattermost.oncharPrefixes": 'onchar 模式的触发前缀（默认：[">", "!"]）。',
  "channels.mattermost.requireMention":
    "在频道中回复前需要 @提及（默认：true）。",
  "auth.profiles": "命名的认证配置文件（提供商 + 模式 + 可选邮箱）。",
  "auth.order": "每提供商的有序认证配置文件 ID（用于自动故障切换）。",
  "auth.cooldowns":
    "临时配置文件抑制后的冷却/退避控制，用于计费相关失败和重试窗口。使用这些以防止快速重新选择仍被阻止的配置文件。",
  "auth.cooldowns.billingBackoffHours":
    "配置文件因计费/余额不足失败时的基础退避（小时，默认：5）。",
  "auth.cooldowns.billingBackoffHoursByProvider":
    "可选的逐提供商计费退避覆盖（小时）。",
  "auth.cooldowns.billingMaxHours": "计费退避上限（小时，默认：24）。",
  "auth.cooldowns.failureWindowHours": "退避计数器的失败窗口（小时，默认：24）。",
  "agents.defaults.workspace":
    "暴露给代理运行时工具的默认工作区路径，用于文件系统上下文和仓库感知行为。从包装器运行时显式设置以保持路径解析确定性。",
  "agents.defaults.bootstrapMaxChars":
    "截断前注入系统提示的每个工作区引导文件的最大字符数（默认：20000）。",
  "agents.defaults.bootstrapTotalMaxChars":
    "所有注入的工作区引导文件的最大总字符数（默认：150000）。",
  "agents.defaults.bootstrapPromptTruncationWarning":
    '引导文件被截断时注入代理可见的警告文本："off"、"once"（默认）或 "always"。',
  "agents.defaults.repoRoot":
    "系统提示运行时行中显示的可选仓库根目录（覆盖自动检测）。",
  "agents.defaults.envelopeTimezone":
    '消息信封的时区（"utc"、"local"、"user" 或 IANA 时区字符串）。',
  "agents.defaults.envelopeTimestamp":
    '消息信封中包含绝对时间戳（"on" 或 "off"）。',
  "agents.defaults.envelopeElapsed": '消息信封中包含已用时间（"on" 或 "off"）。',
  "agents.defaults.models": "已配置的模型目录（键为完整的 provider/model ID）。",
  "agents.defaults.memorySearch":
    "对 MEMORY.md 和 memory/*.md 的向量搜索（支持逐代理覆盖）。",
  "agents.defaults.memorySearch.enabled":
    "此代理配置文件上内存搜索索引和检索行为的主开关。语义回忆保持启用，需要完全无状态响应时禁用。",
  "agents.defaults.memorySearch.sources":
    '选择索引的来源："memory" 读取 MEMORY.md + 内存文件，"sessions" 包含转录历史。除非需要从先前聊天转录中召回，否则保持 ["memory"]。',
  "agents.defaults.memorySearch.extraPaths":
    "在默认内存文件之外向内存索引添加额外目录或 .md 文件。当关键参考文档在仓库其他位置时使用；保持路径精简和有意图以避免嘈杂的召回。",
  "agents.defaults.memorySearch.experimental.sessionMemory":
    "将会话转录索引到内存搜索中，使响应可以引用先前聊天轮次。除非需要转录召回，否则保持关闭，因为索引成本和存储使用都会增加。",
  "agents.defaults.memorySearch.provider":
    '选择用于构建/查询内存向量的嵌入后端："openai"、"gemini"、"voyage"、"mistral"、"ollama" 或 "local"。在此保持最可靠的提供商并配置回退以增强弹性。',
  "agents.defaults.memorySearch.model":
    "当需要非默认模型时，所选内存提供商使用的嵌入模型覆盖。仅在需要超出提供商默认值的显式召回质量/成本调优时设置。",
  "agents.defaults.memorySearch.remote.baseUrl":
    "覆盖嵌入 API 端点，如 OpenAI 兼容代理或自定义 Gemini 基础 URL。仅在通过自有网关或供应商端点路由时使用；否则保持提供商默认值。",
  "agents.defaults.memorySearch.remote.apiKey":
    "为内存索引和查询时嵌入使用的远程嵌入调用提供专用 API 密钥。当内存嵌入应使用与全局默认值或环境变量不同的凭据时使用。",
  "agents.defaults.memorySearch.remote.headers":
    "向远程嵌入请求添加自定义 HTTP 头，与提供商默认值合并。用于代理认证和租户路由头，保持值最小化以避免泄漏敏感元数据。",
  "agents.defaults.memorySearch.remote.batch.enabled":
    "在支持时启用嵌入作业的提供商批量 API（OpenAI/Gemini），提高较大索引运行的吞吐量。除非调试提供商批量失败或运行非常小的工作负载，否则保持启用。",
  "agents.defaults.memorySearch.remote.batch.wait":
    "等待批量嵌入作业完全完成后索引操作才完成。保持启用以获得确定性索引状态；仅在接受延迟一致性时禁用。",
  "agents.defaults.memorySearch.remote.batch.concurrency":
    "限制索引期间同时运行的嵌入批量作业数量（默认：2）。谨慎增加以加快批量索引，但注意提供商速率限制和队列错误。",
  "agents.defaults.memorySearch.remote.batch.pollIntervalMs":
    "控制系统轮询提供商 API 批量作业状态的频率（毫秒，默认：2000）。使用更长间隔减少 API 通信，或更短间隔以更快检测完成。",
  "agents.defaults.memorySearch.remote.batch.timeoutMinutes":
    "设置完整嵌入批量操作的最大等待时间（分钟，默认：60）。对非常大的语料库或较慢的提供商增加，在自动化密集流程中降低以快速失败。",
  "agents.defaults.memorySearch.local.modelPath":
    "指定本地内存搜索的本地嵌入模型源，如 GGUF 文件路径或 `hf:` URI。仅在提供商为 `local` 时使用，在大型索引重建前验证模型兼容性。",
  "agents.defaults.memorySearch.fallback":
    '主嵌入失败时使用的备份提供商："openai"、"gemini"、"voyage"、"mistral"、"ollama"、"local" 或 "none"。为生产可靠性设置真实回退；仅在优先显式失败时使用 "none"。',
  "agents.defaults.memorySearch.store.path":
    "设置每个代理的 SQLite 内存索引在磁盘上的存储位置。除非需要自定义存储位置或备份策略对齐，否则保持默认 `~/.openclaw/memory/{agentId}.sqlite`。",
  "agents.defaults.memorySearch.store.vector.enabled":
    "启用内存搜索中用于向量相似性查询的 sqlite-vec 扩展（默认：true）。正常语义召回保持启用；仅用于调试或仅回退操作时禁用。",
  "agents.defaults.memorySearch.store.vector.extensionPath":
    "覆盖自动发现的 sqlite-vec 扩展库路径（`.dylib`、`.so` 或 `.dll`）。当运行时无法自动找到 sqlite-vec 或你固定已知可用版本时使用。",
  "agents.defaults.memorySearch.chunking.tokens":
    "在嵌入/索引前分割内存源时使用的令牌块大小。增加以获得每块更广的上下文，或降低以提高精确查找的精度。",
  "agents.defaults.memorySearch.chunking.overlap":
    "相邻内存块之间的令牌重叠，以保持分割边界附近的上下文连续性。使用适度重叠减少边界遗漏而不过度膨胀索引大小。",
  "agents.defaults.memorySearch.query.maxResults":
    "下游重排序和提示注入前搜索返回的最大内存命中数。提高以获得更广的召回，或降低以获得更紧凑的提示和更快的响应。",
  "agents.defaults.memorySearch.query.minScore":
    "将内存结果纳入最终召回输出的最小相关性分数阈值。增加以减少弱/嘈杂匹配，或在需要更宽松检索时降低。",
  "agents.defaults.memorySearch.query.hybrid.enabled":
    "结合 BM25 关键词匹配和向量相似性，以在混合精确 + 语义查询上获得更好的召回。除非为排查问题隔离排名行为，否则保持启用。",
  "agents.defaults.memorySearch.query.hybrid.vectorWeight":
    "控制语义相似性对混合排名的影响强度（0-1）。当释义匹配比精确术语更重要时增加；需要更严格的关键词强调时降低。",
  "agents.defaults.memorySearch.query.hybrid.textWeight":
    "控制 BM25 关键词相关性对混合排名的影响强度（0-1）。增加以获得精确术语匹配；当语义匹配应排名更高时降低。",
  "agents.defaults.memorySearch.query.hybrid.candidateMultiplier":
    "重排序前扩展候选池（默认：4）。在嘈杂语料库上提高以获得更好的召回，但预期更多计算和略慢的搜索。",
  "agents.defaults.memorySearch.query.hybrid.mmr.enabled":
    "添加 MMR 重排序以多样化结果并减少单个回答窗口中的近重复片段。当召回看起来重复时启用；保持关闭以进行严格分数排序。",
  "agents.defaults.memorySearch.query.hybrid.mmr.lambda":
    "设置 MMR 相关性与多样性的平衡（0 = 最多样，1 = 最相关，默认：0.7）。较低值减少重复；较高值保持紧密相关但可能重复。",
  "agents.defaults.memorySearch.query.hybrid.temporalDecay.enabled":
    "应用时效衰减以便评分接近时较新内存可以超过较旧内存。当时效性重要时启用；对永恒参考知识保持关闭。",
  "agents.defaults.memorySearch.query.hybrid.temporalDecay.halfLifeDays":
    "控制时效衰减启用时较旧内存失去排名的速度（半衰期天数，默认：30）。较低值更积极地优先考虑最近的上下文。",
  "agents.defaults.memorySearch.cache.enabled":
    "在 SQLite 中缓存计算的块嵌入，以便重新索引和增量更新运行更快（默认：true）。除非调查缓存正确性或最小化磁盘使用，否则保持启用。",
  memory: "内存后端配置（全局）。",
  "memory.backend":
    '选择全局内存引擎："builtin" 使用 OpenClaw 内存内部机制，"qmd" 使用 QMD 辅助管道。除非有意运行 QMD，否则保持 "builtin"。',
  "memory.citations":
    '控制回复中引用的可见性："auto" 在有用时显示引用，"on" 始终显示，"off" 隐藏。保持 "auto" 以获得平衡的信噪比默认值。',
  "memory.qmd.command":
    "设置 QMD 后端使用的 `qmd` 二进制文件的可执行路径（默认：从 PATH 解析）。当存在多个 qmd 安装或 PATH 在不同环境间不同时使用显式绝对路径。",
  "memory.qmd.mcporter":
    "通过 mcporter（MCP 运行时）路由 QMD 工作而非每次调用都生成 `qmd`。当大型模型的冷启动开销很大时使用；更简单的本地设置保持直接进程模式。",
  "memory.qmd.mcporter.enabled":
    "通过 mcporter 守护进程路由 QMD 而非每个请求生成 qmd，减少大型模型的冷启动开销。除非 mcporter 已安装和配置，否则保持禁用。",
  "memory.qmd.mcporter.serverName":
    "命名用于 QMD 调用的 mcporter 服务器目标（默认：qmd）。仅在 mcporter 设置使用自定义服务器名称进行 qmd mcp 保活时更改。",
  "memory.qmd.mcporter.startDaemon":
    "在启用 mcporter 支持的 QMD 模式时自动启动 mcporter 守护进程（默认：true）。除非进程生命周期由服务管理器外部管理，否则保持启用。",
  "memory.qmd.searchMode":
    '选择 QMD 检索路径："query" 使用标准查询流程，"search" 使用面向搜索的检索，"vsearch" 强调向量检索。除非调整相关性质量，否则保持默认。',
  "memory.qmd.includeDefaultMemory":
    "自动将默认内存文件（MEMORY.md 和 memory/**/*.md）索引到 QMD 集合中。除非你希望仅通过显式自定义路径控制索引，否则保持启用。",
  "memory.qmd.paths":
    "添加自定义目录或文件以包含在 QMD 索引中，每个带有可选名称和 glob 模式。用于默认内存路径之外的项目特定知识位置。",
  "memory.qmd.paths.path":
    "定义 QMD 应扫描的根位置，使用绝对路径或 `~` 相对路径。使用稳定目录以便集合身份不会在不同环境间漂移。",
  "memory.qmd.paths.pattern":
    "使用 glob 模式过滤每个索引根下的文件，默认 `**/*.md`。当目录包含混合文件类型时使用更窄的模式以减少噪音和索引成本。",
  "memory.qmd.paths.name":
    "为索引路径设置稳定的集合名称，而非从文件系统位置派生。当路径在不同机器间变化但你希望一致的集合身份时使用。",
  "memory.qmd.sessions.enabled":
    "将会话转录索引到 QMD 中以便召回可以包含先前对话内容（实验性，默认：false）。仅在需要转录记忆且接受更大索引更替时启用。",
  "memory.qmd.sessions.exportDir":
    "覆盖 QMD 索引前清理会话导出的写入位置。当默认状态存储受限或导出必须落在受管卷上时使用。",
  "memory.qmd.sessions.retentionDays":
    "定义导出会话文件在自动清理前保留的时间（天，默认：无限）。为存储卫生或合规保留策略设置有限值。",
  "memory.qmd.update.interval":
    "设置 QMD 从源内容刷新索引的频率（时长字符串，默认：5m）。更短间隔提高新鲜度但增加后台 CPU 和 I/O。",
  "memory.qmd.update.debounceMs":
    "设置连续 QMD 刷新尝试之间的最小延迟（毫秒，默认：15000）。如果频繁文件更改导致更新抖动或不必要的后台负载则增加。",
  "memory.qmd.update.onBoot":
    "在网关启动期间运行一次初始 QMD 更新（默认：true）。保持启用以便召回从新鲜基线开始；仅在启动速度比即时新鲜度更重要时禁用。",
  "memory.qmd.update.waitForBootSync":
    "阻止启动完成直到初始引导时 QMD 同步完成（默认：false）。当需要在提供流量前完全更新的召回时启用，保持关闭以获得更快启动。",
  "memory.qmd.update.embedInterval":
    "设置 QMD 重新计算嵌入的频率（时长字符串，默认：60m；设为 0 禁用定期嵌入）。更低间隔提高新鲜度但增加嵌入工作负载和成本。",
  "memory.qmd.update.commandTimeoutMs":
    "设置 QMD 维护命令的超时时间，如集合列表/添加（毫秒，默认：30000）。在较慢磁盘或延迟命令完成的远程文件系统上运行时增加。",
  "memory.qmd.update.updateTimeoutMs":
    "设置每个 `qmd update` 周期的最大运行时间（毫秒，默认：120000）。对较大集合增加；在自动化中需要更快失败检测时降低。",
  "memory.qmd.update.embedTimeoutMs":
    "设置每个 `qmd embed` 周期的最大运行时间（毫秒，默认：120000）。对更重的嵌入工作负载或更慢硬件增加，在严格 SLA 下降低以快速失败。",
  "memory.qmd.limits.maxResults":
    "限制每个召回请求返回到代理循环的 QMD 命中数（默认：6）。增加以获得更广的召回上下文，或降低以保持提示更紧凑和更快。",
  "memory.qmd.limits.maxSnippetChars":
    "限制从 QMD 命中中提取的每个结果片段长度（字符，默认：700）。当提示快速膨胀时降低，仅在答案一直遗漏关键细节时提高。",
  "memory.qmd.limits.maxInjectedChars":
    "限制所有命中中可以注入一个轮次的 QMD 文本量。使用较低值控制提示膨胀和延迟；仅在上下文一直被截断时提高。",
  "memory.qmd.limits.timeoutMs":
    "设置每个查询的 QMD 搜索超时（毫秒，默认：4000）。对较大索引或较慢环境增加，降低以保持请求延迟有界。",
  "memory.qmd.scope":
    "使用 session.sendPolicy 样式规则定义哪些会话/频道有资格进行 QMD 召回。除非有意需要跨聊天内存共享，否则保持默认的仅直接范围。",
  "agents.defaults.memorySearch.cache.maxEntries":
    "设置 SQLite 中内存搜索缓存嵌入的尽力而为上限。当控制磁盘增长比峰值重新索引速度更重要时使用。",
  "agents.defaults.memorySearch.sync.onSessionStart":
    "在会话开始时触发内存索引同步，以便早期轮次看到新鲜的内存内容。当启动新鲜度比初始轮次延迟更重要时保持启用。",
  "agents.defaults.memorySearch.sync.onSearch":
    "通过在检测到内容更改后在搜索时调度重新索引来使用延迟同步。保持启用以降低空闲开销，或在需要任何查询前预同步索引时禁用。",
  "agents.defaults.memorySearch.sync.watch":
    "监视内存文件并从文件更改事件（chokidar）调度索引更新。启用以获得近实时新鲜度；如果监视更替过于嘈杂则在非常大的工作区上禁用。",
  "agents.defaults.memorySearch.sync.watchDebounceMs":
    "在重新索引运行前合并快速文件监视事件的防抖窗口（毫秒）。增加以减少频繁写入文件的更替，或降低以获得更快的新鲜度。",
  "agents.defaults.memorySearch.sync.sessions.deltaBytes":
    "要求至少这么多新追加字节后会话转录更改才触发重新索引（默认：100000）。增加以减少频繁的小型重新索引，或降低以获得更快的转录新鲜度。",
  "agents.defaults.memorySearch.sync.sessions.deltaMessages":
    "要求至少这么多追加转录消息后才触发重新索引（默认：50）。降低以获得近实时转录召回，或提高以减少索引更替。",
  ui: "UI 呈现设置，用于控制界面中显示的强调色和助手身份。用于品牌和可读性自定义而不更改运行时行为。",
  "ui.seamColor":
    "UI 界面用于强调、徽章和视觉身份提示的主要强调/接缝颜色。使用在浅色/深色主题中保持可读的高对比度值。",
  "ui.assistant":
    "UI 界面中显示的助手名称和头像的显示身份设置。保持这些值与面向操作者的角色和支持期望一致。",
  "ui.assistant.name":
    "在 UI 视图、聊天框架和状态上下文中为助手显示的名称。保持稳定以便操作者可以可靠地识别哪个助手角色处于活动状态。",
  "ui.assistant.avatar":
    "UI 界面中使用的助手头像图片源（URL、路径或 data URI，取决于运行时支持）。使用可信资产和一致的品牌尺寸以获得干净的渲染。",
  plugins:
    "插件系统控制，用于启用扩展、约束加载范围、配置条目和跟踪安装。在生产环境中保持插件策略显式且最小权限。",
  "plugins.enabled":
    "在启动和配置重载期间全局启用或禁用插件/扩展加载（默认：true）。仅在部署需要扩展功能时保持启用。",
  "plugins.allow":
    "可选的插件 ID 允许列表；设置后仅列出的插件有资格加载。用于在受控环境中强制执行批准的扩展清单。",
  "plugins.deny":
    "可选的插件 ID 拒绝列表，即使允许列表或路径包含也会被阻止。使用拒绝规则进行紧急回滚和对风险插件的硬阻止。",
  "plugins.load":
    "插件加载器配置组，用于指定发现插件的文件系统路径。保持加载路径显式且经过审查以避免意外的不可信扩展加载。",
  "plugins.load.paths":
    "加载器在内置默认值之外扫描的额外插件文件或目录。使用专用扩展目录，避免包含不相关可执行内容的宽泛路径。",
  "plugins.slots":
    "选择哪些插件拥有排他性运行时插槽（如内存），以便只有一个插件提供该功能。使用显式插槽所有权以避免行为冲突的重叠提供商。",
  "plugins.slots.memory":
    '按 ID 选择活动内存插件，或使用 "none" 禁用内存插件。',
  "plugins.slots.contextEngine":
    "按 ID 选择活动上下文引擎插件，以便一个插件提供上下文编排行为。",
  "plugins.entries":
    "按插件 ID 键控的逐插件设置，包括启用和插件特定的运行时配置负载。用于范围插件调优而不更改全局加载器策略。",
  "plugins.entries.*.enabled":
    "特定条目的逐插件启用覆盖，应用于全局插件策略之上（需要重启）。用于跨环境逐步推出插件。",
  "plugins.entries.*.hooks":
    "逐插件类型化钩子策略控制，用于核心强制的安全门控。使用此项约束高影响钩子类别而不禁用整个插件。",
  "plugins.entries.*.hooks.allowPromptInjection":
    "控制此插件是否可以通过类型化钩子修改提示。设为 false 以阻止 `before_prompt_build` 并忽略旧版 `before_agent_start` 的提示修改字段，同时保留旧版 `modelOverride` 和 `providerOverride` 行为。",
  "plugins.entries.*.apiKey":
    "接受条目设置中直接密钥配置的插件使用的可选 API 密钥字段。使用密钥/环境替换，避免将真实凭据提交到配置文件中。",
  "plugins.entries.*.env":
    "仅为该插件运行时上下文注入的逐插件环境变量映射。使用此项将提供商凭据范围限定到一个插件而非共享全局进程环境。",
  "plugins.entries.*.config":
    "由该插件自己的架构和验证规则解释的插件定义配置负载。仅使用插件文档中记录的字段以防止被忽略或无效的设置。"'s own schema and validation rules. Use only documented fields from the plugin to prevent ignored or invalid settings.",
  "plugins.installs":
    "CLI 管理的安装元数据（由 `openclaw plugins update` 用于定位安装源）。",
  "plugins.installs.*.source": '安装源（"npm"、"archive" 或 "path"）。',
  "plugins.installs.*.spec": "安装使用的原始 npm 规格（如果源是 npm）。",
  "plugins.installs.*.sourcePath": "安装使用的原始存档/路径（如有）。",
  "plugins.installs.*.installPath":
    "解析的安装目录（通常为 ~/.openclaw/extensions/<id>）。",
  "plugins.installs.*.version": "安装时记录的版本（如有）。",
  "plugins.installs.*.resolvedName": "从获取的工件中解析的 npm 包名称。",
  "plugins.installs.*.resolvedVersion":
    "从获取的工件中解析的 npm 包版本（对非固定规格有用）。",
  "plugins.installs.*.resolvedSpec":
    "从获取的工件中解析的精确 npm 规格（<name>@<version>）。",
  "plugins.installs.*.integrity":
    "获取工件的已解析 npm dist 完整性哈希（如 npm 报告）。",
  "plugins.installs.*.shasum":
    "获取工件的已解析 npm dist shasum（如 npm 报告）。",
  "plugins.installs.*.resolvedAt":
    "此安装记录的 npm 包元数据最后解析的 ISO 时间戳。",
  "plugins.installs.*.installedAt": "最后安装/更新的 ISO 时间戳。",
  "agents.list.*.identity.avatar":
    "代理头像（工作区相对路径、http(s) URL 或 data URI）。",
  "agents.defaults.model.primary": "主模型（provider/model）。",
  "agents.defaults.model.fallbacks":
    "有序回退模型（provider/model）。主模型失败时使用。",
  "agents.defaults.imageModel.primary":
    "当主模型缺少图片输入时使用的可选图片模型（provider/model）。",
  "agents.defaults.imageModel.fallbacks": "有序回退图片模型（provider/model）。",
  "agents.defaults.pdfModel.primary":
    "PDF 分析工具的可选 PDF 模型（provider/model）。默认回退到 imageModel，然后是会话模型。",
  "agents.defaults.pdfModel.fallbacks": "有序回退 PDF 模型（provider/model）。",
  "agents.defaults.pdfMaxBytesMb":
    "PDF 工具的最大 PDF 文件大小（MB，默认：10）。",
  "agents.defaults.pdfMaxPages":
    "PDF 工具处理的最大 PDF 页数（默认：20）。",
  "agents.defaults.imageMaxDimensionPx":
    "清理转录/工具结果图片负载时的最大图片边长（像素，默认：1200）。",
  "agents.defaults.cliBackends": "可选的 CLI 后端，用于纯文本回退（claude-cli 等）。",
  "agents.defaults.compaction":
    "上下文接近令牌限制时的压缩调整，包括历史份额、储备空间和压缩前内存刷新行为。当长时间运行的会话需要在紧凑上下文窗口下保持稳定连续性时使用。",
  "agents.defaults.compaction.mode":
    '压缩策略模式："default" 使用基线行为，"safeguard" 应用更严格的防护以保留最近上下文。除非你观察到限制边界附近的激进历史丢失，否则保持 "default"。',
  "agents.defaults.compaction.reserveTokens":
    "压缩运行后为回复生成和工具输出保留的令牌空间。详细/工具密集型会话使用更高储备，最大化保留历史时使用更低储备。",
  "agents.defaults.compaction.keepRecentTokens":
    "压缩期间从最近对话窗口保留的最小令牌预算。使用更高值保护即时上下文连续性，更低值保留更多长尾历史。",
  "agents.defaults.compaction.reserveTokensFloor":
    "Pi 压缩路径中 reserveTokens 强制的最小下限（0 禁用下限保护）。使用非零下限以避免在波动的令牌估计下过度激进压缩。",
  "agents.defaults.compaction.maxHistoryShare":
    "压缩后允许保留历史占总上下文预算的最大比例（范围 0.1-0.9）。使用较低份额获得更多生成空间，或较高份额获得更深的历史连续性。",
  "agents.defaults.compaction.identifierPolicy":
    '压缩摘要的标识符保留策略："strict" 前置内置不透明标识符保留指导（默认），"off" 禁用此前缀，"custom" 使用 identifierInstructions。除非有特定兼容性需求，否则保持 "strict"。',
  "agents.defaults.compaction.identifierInstructions":
    'identifierPolicy="custom" 时使用的自定义标识符保留指令文本。保持显式且以安全为重，避免压缩摘要重写不透明 ID、URL、主机或端口。',
  "agents.defaults.compaction.recentTurnsPreserve":
    "保护性摘要化之外保留的最近用户/助手对话轮次数量（默认：3）。增加以保留精确的最近对话上下文，或降低以最大化压缩节省。",
  "agents.defaults.compaction.qualityGuard":
    "保护性压缩摘要的可选质量审计重试设置。除非你明确需要摘要审计和失败检查时的一次性重新生成，否则保持禁用。",
  "agents.defaults.compaction.qualityGuard.enabled":
    "启用保护性压缩的摘要质量审计和重新生成重试。默认：false，因此保护模式本身不会启用重试行为。",
  "agents.defaults.compaction.qualityGuard.maxRetries":
    "保护性摘要质量审计失败后的最大重新生成重试次数。使用小值以限制额外延迟和令牌成本。",
  "agents.defaults.compaction.postCompactionSections":
    '压缩后重新注入的 AGENTS.md H2/H3 章节名称，使代理重新运行关键启动指导。留空使用 "Session Startup"/"Red Lines"（旧版回退到 "Every Session"/"Safety"）；设为 [] 完全禁用重新注入。',
  "agents.defaults.compaction.model":
    "仅用于压缩摘要化的可选 provider/model 覆盖。当你希望压缩在与会话默认不同的模型上运行时设置，留空以继续使用主代理模型。",
  "agents.defaults.compaction.memoryFlush":
    "在运行时执行更强历史缩减前运行代理式内存写入的压缩前内存刷新设置。长会话保持启用以在激进修剪前持久化重要上下文。",
  "agents.defaults.compaction.memoryFlush.enabled":
    "在运行时执行更强历史缩减前启用压缩前内存刷新。除非你有意在受限环境中禁用内存副作用，否则保持启用。",
  "agents.defaults.compaction.memoryFlush.softThresholdTokens":
    "触发压缩前内存刷新执行的到压缩距离阈值（令牌）。使用更早阈值以更安全的持久化，或更紧阈值以更低的刷新频率。",
  "agents.defaults.compaction.memoryFlush.forceFlushTranscriptBytes":
    '当转录文件大小达到此阈值时强制压缩前内存刷新（字节或如 "2mb" 的字符串）。使用此项防止即使令牌计数器过时时长会话也挂起；设为 0 禁用。',
  "agents.defaults.compaction.memoryFlush.prompt":
    "生成内存候选时用于压缩前内存刷新轮次的用户提示模板。仅在你需要超出默认内存刷新行为的自定义提取指令时使用。",
  "agents.defaults.compaction.memoryFlush.systemPrompt":
    "压缩前内存刷新轮次的系统提示覆盖，用于控制提取样式和安全约束。小心使用以避免自定义指令降低内存质量或泄漏敏感上下文。",
  "agents.defaults.embeddedPi":
    "内嵌 Pi 运行器加固控制，用于在 OpenClaw 会话中如何信任和应用工作区本地 Pi 设置。",
  "agents.defaults.embeddedPi.projectSettingsPolicy":
    '内嵌 Pi 处理工作区本地 `.pi/config/settings.json` 的方式："sanitize"（默认）剥离 shellPath/shellCommandPrefix，"ignore" 完全禁用项目设置，"trusted" 按原样应用项目设置。',
  "agents.defaults.humanDelay.mode": '块回复的延迟样式（"off"、"natural"、"custom"）。',
  "agents.defaults.humanDelay.minMs": "自定义 humanDelay 的最小延迟（毫秒，默认：800）。",
  "agents.defaults.humanDelay.maxMs": "自定义 humanDelay 的最大延迟（毫秒，默认：2500）。",
  commands:
    "控制聊天命令界面、所有者门控和跨提供商的提升命令访问行为。保持默认值，除非需要更严格的操作者控制或更广泛的命令可用性。",
  "commands.native":
    "Registers native slash/menu commands with channels that support command registration (Discord, Slack, Telegram). Keep enabled for discoverability unless you intentionally run text-only command workflows.",
  "commands.nativeSkills":
    "Registers native skill commands so users can invoke skills directly from provider command menus where supported. Keep aligned with your skill policy so exposed commands match what operators expect.",
  "commands.text":
    "Enables text-command parsing in chat input in addition to native command surfaces where available. Keep this enabled for compatibility across channels that do not support native command registration.",
  "commands.bash":
    "Allow bash chat command (`!`; `/bash` alias) to run host shell commands (default: false; requires tools.elevated).",
  "commands.bashForegroundMs":
    "How long bash waits before backgrounding (default: 2000; 0 backgrounds immediately).",
  "commands.config": "Allow /config chat command to read/write config on disk (default: false).",
  "commands.debug": "Allow /debug chat command for runtime-only overrides (default: false).",
  "commands.restart": "Allow /restart and gateway restart tool actions (default: true).",
  "commands.useAccessGroups": "Enforce access-group allowlists/policies for commands.",
  "commands.ownerAllowFrom":
    "Explicit owner allowlist for owner-only tools/commands. Use channel-native IDs (optionally prefixed like \"whatsapp:+15551234567\"). '*' is ignored.",
  "commands.ownerDisplay":
    "Controls how owner IDs are rendered in the system prompt. Allowed values: raw, hash. Default: raw.",
  "commands.ownerDisplaySecret":
    "Optional secret used to HMAC hash owner IDs when ownerDisplay=hash. Prefer env substitution.",
  "commands.allowFrom":
    "Defines elevated command allow rules by channel and sender for owner-level command surfaces. Use narrow provider-specific identities so privileged commands are not exposed to broad chat audiences.",
  session:
    "全局会话路由、重置、投递策略和会话历史行为的维护控制。保持默认值，除非需要更严格的隔离、保留或投递约束。",
  "session.scope":
    'Sets base session grouping strategy: "per-sender" isolates by sender and "global" shares one session per channel context. Keep "per-sender" for safer multi-user behavior unless deliberate shared context is required.',
  "session.dmScope":
    'DM session scoping: "main" keeps continuity, while "per-peer", "per-channel-peer", and "per-account-channel-peer" increase isolation. Use isolated modes for shared inboxes or multi-account deployments.',
  "session.identityLinks":
    "Maps canonical identities to provider-prefixed peer IDs so equivalent users resolve to one DM thread (example: telegram:123456). Use this when the same human appears across multiple channels or accounts.",
  "session.resetTriggers":
    "Lists message triggers that force a session reset when matched in inbound content. Use sparingly for explicit reset phrases so context is not dropped unexpectedly during normal conversation.",
  "session.idleMinutes":
    "Applies a legacy idle reset window in minutes for session reuse behavior across inactivity gaps. Use this only for compatibility and prefer structured reset policies under session.reset/session.resetByType.",
  "session.reset":
    "Defines the default reset policy object used when no type-specific or channel-specific override applies. Set this first, then layer resetByType or resetByChannel only where behavior must differ.",
  "session.reset.mode":
    'Selects reset strategy: "daily" resets at a configured hour and "idle" resets after inactivity windows. Keep one clear mode per policy to avoid surprising context turnover patterns.',
  "session.reset.atHour":
    "Sets local-hour boundary (0-23) for daily reset mode so sessions roll over at predictable times. Use with mode=daily and align to operator timezone expectations for human-readable behavior.",
  "session.reset.idleMinutes":
    "Sets inactivity window before reset for idle mode and can also act as secondary guard with daily mode. Use larger values to preserve continuity or smaller values for fresher short-lived threads.",
  "session.resetByType":
    "Overrides reset behavior by chat type (direct, group, thread) when defaults are not sufficient. Use this when group/thread traffic needs different reset cadence than direct messages.",
  "session.resetByType.direct":
    "Defines reset policy for direct chats and supersedes the base session.reset configuration for that type. Use this as the canonical direct-message override instead of the legacy dm alias.",
  "session.resetByType.dm":
    "Deprecated alias for direct reset behavior kept for backward compatibility with older configs. Use session.resetByType.direct instead so future tooling and validation remain consistent.",
  "session.resetByType.group":
    "Defines reset policy for group chat sessions where continuity and noise patterns differ from DMs. Use shorter idle windows for busy groups if context drift becomes a problem.",
  "session.resetByType.thread":
    "Defines reset policy for thread-scoped sessions, including focused channel thread workflows. Use this when thread sessions should expire faster or slower than other chat types.",
  "session.resetByChannel":
    "Provides channel-specific reset overrides keyed by provider/channel id for fine-grained behavior control. Use this only when one channel needs exceptional reset behavior beyond type-level policies.",
  "session.store":
    "Sets the session storage file path used to persist session records across restarts. Use an explicit path only when you need custom disk layout, backup routing, or mounted-volume storage.",
  "session.typingIntervalSeconds":
    "Controls interval for repeated typing indicators while replies are being prepared in typing-capable channels. Increase to reduce chatty updates or decrease for more active typing feedback.",
  "session.typingMode":
    'Controls typing behavior timing: "never", "instant", "thinking", or "message" based emission points. Keep conservative modes in high-volume channels to avoid unnecessary typing noise.',
  "session.parentForkMaxTokens":
    "Maximum parent-session token count allowed for thread/session inheritance forking. If the parent exceeds this, OpenClaw starts a fresh thread session instead of forking; set 0 to disable this protection.",
  "session.mainKey":
    'Overrides the canonical main session key used for continuity when dmScope or routing logic points to "main". Use a stable value only if you intentionally need custom session anchoring.',
  "session.sendPolicy":
    "Controls cross-session send permissions using allow/deny rules evaluated against channel, chatType, and key prefixes. Use this to fence where session tools can deliver messages in complex environments.",
  "session.sendPolicy.default":
    'Sets fallback action when no sendPolicy rule matches: "allow" or "deny". Keep "allow" for simpler setups, or choose "deny" when you require explicit allow rules for every destination.',
  "session.sendPolicy.rules":
    'Ordered allow/deny rules evaluated before the default action, for example `{ action: "deny", match: { channel: "discord" } }`. Put most specific rules first so broad rules do not shadow exceptions.',
  "session.sendPolicy.rules[].action":
    'Defines rule decision as "allow" or "deny" when the corresponding match criteria are satisfied. Use deny-first ordering when enforcing strict boundaries with explicit allow exceptions.',
  "session.sendPolicy.rules[].match":
    "Defines optional rule match conditions that can combine channel, chatType, and key-prefix constraints. Keep matches narrow so policy intent stays readable and debugging remains straightforward.",
  "session.sendPolicy.rules[].match.channel":
    "Matches rule application to a specific channel/provider id (for example discord, telegram, slack). Use this when one channel should permit or deny delivery independently of others.",
  "session.sendPolicy.rules[].match.chatType":
    "Matches rule application to chat type (direct, group, thread) so behavior varies by conversation form. Use this when DM and group destinations require different safety boundaries.",
  "session.sendPolicy.rules[].match.keyPrefix":
    "Matches a normalized session-key prefix after internal key normalization steps in policy consumers. Use this for general prefix controls, and prefer rawKeyPrefix when exact full-key matching is required.",
  "session.sendPolicy.rules[].match.rawKeyPrefix":
    "Matches the raw, unnormalized session-key prefix for exact full-key policy targeting. Use this when normalized keyPrefix is too broad and you need agent-prefixed or transport-specific precision.",
  "session.agentToAgent":
    "Groups controls for inter-agent session exchanges, including loop prevention limits on reply chaining. Keep defaults unless you run advanced agent-to-agent automation with strict turn caps.",
  "session.agentToAgent.maxPingPongTurns":
    "Max reply-back turns between requester and target agents during agent-to-agent exchanges (0-5). Use lower values to hard-limit chatter loops and preserve predictable run completion.",
  "session.threadBindings":
    "Shared defaults for thread-bound session routing behavior across providers that support thread focus workflows. Configure global defaults here and override per channel only when behavior differs.",
  "session.threadBindings.enabled":
    "Global master switch for thread-bound session routing features and focused thread delivery behavior. Keep enabled for modern thread workflows unless you need to disable thread binding globally.",
  "session.threadBindings.idleHours":
    "Default inactivity window in hours for thread-bound sessions across providers/channels (0 disables idle auto-unfocus). Default: 24.",
  "session.threadBindings.maxAgeHours":
    "Optional hard max age in hours for thread-bound sessions across providers/channels (0 disables hard cap). Default: 0.",
  "session.maintenance":
    "Automatic session-store maintenance controls for pruning age, entry caps, and file rotation behavior. Start in warn mode to observe impact, then enforce once thresholds are tuned.",
  "session.maintenance.mode":
    'Determines whether maintenance policies are only reported ("warn") or actively applied ("enforce"). Keep "warn" during rollout and switch to "enforce" after validating safe thresholds.',
  "session.maintenance.pruneAfter":
    "Removes entries older than this duration (for example `30d` or `12h`) during maintenance passes. Use this as the primary age-retention control and align it with data retention policy.",
  "session.maintenance.pruneDays":
    "Deprecated age-retention field kept for compatibility with legacy configs using day counts. Use session.maintenance.pruneAfter instead so duration syntax and behavior are consistent.",
  "session.maintenance.maxEntries":
    "Caps total session entry count retained in the store to prevent unbounded growth over time. Use lower limits for constrained environments, or higher limits when longer history is required.",
  "session.maintenance.rotateBytes":
    "Rotates the session store when file size exceeds a threshold such as `10mb` or `1gb`. Use this to bound single-file growth and keep backup/restore operations manageable.",
  "session.maintenance.resetArchiveRetention":
    "Retention for reset transcript archives (`*.reset.<timestamp>`). Accepts a duration (for example `30d`), or `false` to disable cleanup. Defaults to pruneAfter so reset artifacts do not grow forever.",
  "session.maintenance.maxDiskBytes":
    "Optional per-agent sessions-directory disk budget (for example `500mb`). Use this to cap session storage per agent; when exceeded, warn mode reports pressure and enforce mode performs oldest-first cleanup.",
  "session.maintenance.highWaterBytes":
    "Target size after disk-budget cleanup (high-water mark). Defaults to 80% of maxDiskBytes; set explicitly for tighter reclaim behavior on constrained disks.",
  cron: "Global scheduler settings for stored cron jobs, run concurrency, delivery fallback, and run-session retention. Keep defaults unless you are scaling job volume or integrating external webhook receivers.",
  "cron.enabled":
    "Enables cron job execution for stored schedules managed by the gateway. Keep enabled for normal reminder/automation flows, and disable only to pause all cron execution without deleting jobs.",
  "cron.store":
    "Path to the cron job store file used to persist scheduled jobs across restarts. Set an explicit path only when you need custom storage layout, backups, or mounted volumes.",
  "cron.maxConcurrentRuns":
    "Limits how many cron jobs can execute at the same time when multiple schedules fire together. Use lower values to protect CPU/memory under heavy automation load, or raise carefully for higher throughput.",
  "cron.retry":
    "Overrides the default retry policy for one-shot jobs when they fail with transient errors (rate limit, overloaded, network, server_error). Omit to use defaults: maxAttempts 3, backoffMs [30000, 60000, 300000], retry all transient types.",
  "cron.retry.maxAttempts":
    "Max retries for one-shot jobs on transient errors before permanent disable (default: 3).",
  "cron.retry.backoffMs":
    "Backoff delays in ms for each retry attempt (default: [30000, 60000, 300000]). Use shorter values for faster retries.",
  "cron.retry.retryOn":
    "Error types to retry: rate_limit, overloaded, network, timeout, server_error. Use to restrict which errors trigger retries; omit to retry all transient types.",
  "cron.webhook":
    'Deprecated legacy fallback webhook URL used only for old jobs with `notify=true`. Migrate to per-job delivery using `delivery.mode="webhook"` plus `delivery.to`, and avoid relying on this global field.',
  "cron.webhookToken":
    "Bearer token attached to cron webhook POST deliveries when webhook mode is used. Prefer secret/env substitution and rotate this token regularly if shared webhook endpoints are internet-reachable.",
  "cron.sessionRetention":
    "Controls how long completed cron run sessions are kept before pruning (`24h`, `7d`, `1h30m`, or `false` to disable pruning; default: `24h`). Use shorter retention to reduce storage growth on high-frequency schedules.",
  "cron.runLog":
    "Pruning controls for per-job cron run history files under `cron/runs/<jobId>.jsonl`, including size and line retention.",
  "cron.runLog.maxBytes":
    "Maximum bytes per cron run-log file before pruning rewrites to the last keepLines entries (for example `2mb`, default `2000000`).",
  "cron.runLog.keepLines":
    "How many trailing run-log lines to retain when a file exceeds maxBytes (default `2000`). Increase for longer forensic history or lower for smaller disks.",
  hooks:
    "入站 Webhook 自动化界面，用于将外部事件映射到 OpenClaw 中的唤醒或代理操作。在暴露到可信网络之外前，使用显式的令牌/会话/代理控制锁定它。",
  "hooks.enabled":
    "Enables the hooks endpoint and mapping execution pipeline for inbound webhook requests. Keep disabled unless you are actively routing external events into the gateway.",
  "hooks.path":
    "HTTP path used by the hooks endpoint (for example `/hooks`) on the gateway control server. Use a non-guessable path and combine it with token validation for defense in depth.",
  "hooks.token":
    "Shared bearer token checked by hooks ingress for request authentication before mappings run. Use environment substitution and rotate regularly when webhook endpoints are internet-accessible.",
  "hooks.defaultSessionKey":
    "Fallback session key used for hook deliveries when a request does not provide one through allowed channels. Use a stable but scoped key to avoid mixing unrelated automation conversations.",
  "hooks.allowRequestSessionKey":
    "Allows callers to supply a session key in hook requests when true, enabling caller-controlled routing. Keep false unless trusted integrators explicitly need custom session threading.",
  "hooks.allowedSessionKeyPrefixes":
    "Allowlist of accepted session-key prefixes for inbound hook requests when caller-provided keys are enabled. Use narrow prefixes to prevent arbitrary session-key injection.",
  "hooks.allowedAgentIds":
    "Allowlist of agent IDs that hook mappings are allowed to target when selecting execution agents. Use this to constrain automation events to dedicated service agents.",
  "hooks.maxBodyBytes":
    "Maximum accepted webhook payload size in bytes before the request is rejected. Keep this bounded to reduce abuse risk and protect memory usage under bursty integrations.",
  "hooks.presets":
    "Named hook preset bundles applied at load time to seed standard mappings and behavior defaults. Keep preset usage explicit so operators can audit which automations are active.",
  "hooks.transformsDir":
    "Base directory for hook transform modules referenced by mapping transform.module paths. Use a controlled repo directory so dynamic imports remain reviewable and predictable.",
  "hooks.mappings":
    "Ordered mapping rules that match inbound hook requests and choose wake or agent actions with optional delivery routing. Use specific mappings first to avoid broad pattern rules capturing everything.",
  "hooks.mappings[].id":
    "Optional stable identifier for a hook mapping entry used for auditing, troubleshooting, and targeted updates. Use unique IDs so logs and config diffs can reference mappings unambiguously.",
  "hooks.mappings[].match":
    "Grouping object for mapping match predicates such as path and source before action routing is applied. Keep match criteria specific so unrelated webhook traffic does not trigger automations.",
  "hooks.mappings[].match.path":
    "Path match condition for a hook mapping, usually compared against the inbound request path. Use this to split automation behavior by webhook endpoint path families.",
  "hooks.mappings[].match.source":
    "Source match condition for a hook mapping, typically set by trusted upstream metadata or adapter logic. Use stable source identifiers so routing remains deterministic across retries.",
  "hooks.mappings[].action":
    'Mapping action type: "wake" triggers agent wake flow, while "agent" sends directly to agent handling. Use "agent" for immediate execution and "wake" when heartbeat-driven processing is preferred.',
  "hooks.mappings[].wakeMode":
    'Wake scheduling mode: "now" wakes immediately, while "next-heartbeat" defers until the next heartbeat cycle. Use deferred mode for lower-priority automations that can tolerate slight delay.',
  "hooks.mappings[].name":
    "Human-readable mapping display name used in diagnostics and operator-facing config UIs. Keep names concise and descriptive so routing intent is obvious during incident review.",
  "hooks.mappings[].agentId":
    "Target agent ID for mapping execution when action routing should not use defaults. Use dedicated automation agents to isolate webhook behavior from interactive operator sessions.",
  "hooks.mappings[].sessionKey":
    "Explicit session key override for mapping-delivered messages to control thread continuity. Use stable scoped keys so repeated events correlate without leaking into unrelated conversations.",
  "hooks.mappings[].messageTemplate":
    "Template for synthesizing structured mapping input into the final message content sent to the target action path. Keep templates deterministic so downstream parsing and behavior remain stable.",
  "hooks.mappings[].textTemplate":
    "Text-only fallback template used when rich payload rendering is not desired or not supported. Use this to provide a concise, consistent summary string for chat delivery surfaces.",
  "hooks.mappings[].deliver":
    "Controls whether mapping execution results are delivered back to a channel destination versus being processed silently. Disable delivery for background automations that should not post user-facing output.",
  "hooks.mappings[].allowUnsafeExternalContent":
    "When true, mapping content may include less-sanitized external payload data in generated messages. Keep false by default and enable only for trusted sources with reviewed transform logic.",
  "hooks.mappings[].channel":
    'Delivery channel override for mapping outputs (for example "last", "telegram", "discord", "slack", "signal", "imessage", or "msteams"). Keep channel overrides explicit to avoid accidental cross-channel sends.',
  "hooks.mappings[].to":
    "Destination identifier inside the selected channel when mapping replies should route to a fixed target. Verify provider-specific destination formats before enabling production mappings.",
  "hooks.mappings[].model":
    "Optional model override for mapping-triggered runs when automation should use a different model than agent defaults. Use this sparingly so behavior remains predictable across mapping executions.",
  "hooks.mappings[].thinking":
    "Optional thinking-effort override for mapping-triggered runs to tune latency versus reasoning depth. Keep low or minimal for high-volume hooks unless deeper reasoning is clearly required.",
  "hooks.mappings[].timeoutSeconds":
    "Maximum runtime allowed for mapping action execution before timeout handling applies. Use tighter limits for high-volume webhook sources to prevent queue pileups.",
  "hooks.mappings[].transform":
    "Transform configuration block defining module/export preprocessing before mapping action handling. Use transforms only from reviewed code paths and keep behavior deterministic for repeatable automation.",
  "hooks.mappings[].transform.module":
    "Relative transform module path loaded from hooks.transformsDir to rewrite incoming payloads before delivery. Keep modules local, reviewed, and free of path traversal patterns.",
  "hooks.mappings[].transform.export":
    "Named export to invoke from the transform module; defaults to module default export when omitted. Set this when one file hosts multiple transform handlers.",
  "hooks.gmail":
    "Gmail push integration settings used for Pub/Sub notifications and optional local callback serving. Keep this scoped to dedicated Gmail automation accounts where possible.",
  "hooks.gmail.account":
    "Google account identifier used for Gmail watch/subscription operations in this hook integration. Use a dedicated automation mailbox account to isolate operational permissions.",
  "hooks.gmail.label":
    "Optional Gmail label filter limiting which labeled messages trigger hook events. Keep filters narrow to avoid flooding automations with unrelated inbox traffic.",
  "hooks.gmail.topic":
    "Google Pub/Sub topic name used by Gmail watch to publish change notifications for this account. Ensure the topic IAM grants Gmail publish access before enabling watches.",
  "hooks.gmail.subscription":
    "Pub/Sub subscription consumed by the gateway to receive Gmail change notifications from the configured topic. Keep subscription ownership clear so multiple consumers do not race unexpectedly.",
  "hooks.gmail.hookUrl":
    "Public callback URL Gmail or intermediaries invoke to deliver notifications into this hook pipeline. Keep this URL protected with token validation and restricted network exposure.",
  "hooks.gmail.includeBody":
    "When true, fetch and include email body content for downstream mapping/agent processing. Keep false unless body text is required, because this increases payload size and sensitivity.",
  "hooks.gmail.allowUnsafeExternalContent":
    "Allows less-sanitized external Gmail content to pass into processing when enabled. Keep disabled for safer defaults, and enable only for trusted mail streams with controlled transforms.",
  "hooks.gmail.serve":
    "Local callback server settings block for directly receiving Gmail notifications without a separate ingress layer. Enable only when this process should terminate webhook traffic itself.",
  "hooks.gmail.pushToken":
    "Shared secret token required on Gmail push hook callbacks before processing notifications. Use env substitution and rotate if callback endpoints are exposed externally.",
  "hooks.gmail.maxBytes":
    "Maximum Gmail payload bytes processed per event when includeBody is enabled. Keep conservative limits to reduce oversized message processing cost and risk.",
  "hooks.gmail.renewEveryMinutes":
    "Renewal cadence in minutes for Gmail watch subscriptions to prevent expiration. Set below provider expiration windows and monitor renew failures in logs.",
  "hooks.gmail.serve.bind":
    "Bind address for the local Gmail callback HTTP server used when serving hooks directly. Keep loopback-only unless external ingress is intentionally required.",
  "hooks.gmail.serve.port":
    "Port for the local Gmail callback HTTP server when serve mode is enabled. Use a dedicated port to avoid collisions with gateway/control interfaces.",
  "hooks.gmail.serve.path":
    "HTTP path on the local Gmail callback server where push notifications are accepted. Keep this consistent with subscription configuration to avoid dropped events.",
  "hooks.gmail.tailscale.mode":
    'Tailscale exposure mode for Gmail callbacks: "off", "serve", or "funnel". Use "serve" for private tailnet delivery and "funnel" only when public internet ingress is required.',
  "hooks.gmail.tailscale":
    "Tailscale exposure configuration block for publishing Gmail callbacks through Serve/Funnel routes. Use private tailnet modes before enabling any public ingress path.",
  "hooks.gmail.tailscale.path":
    "Path published by Tailscale Serve/Funnel for Gmail callback forwarding when enabled. Keep it aligned with Gmail webhook config so requests reach the expected handler.",
  "hooks.gmail.tailscale.target":
    "Local service target forwarded by Tailscale Serve/Funnel (for example http://127.0.0.1:8787). Use explicit loopback targets to avoid ambiguous routing.",
  "hooks.gmail.model":
    "Optional model override for Gmail-triggered runs when mailbox automations should use dedicated model behavior. Keep unset to inherit agent defaults unless mailbox tasks need specialization.",
  "hooks.gmail.thinking":
    'Thinking effort override for Gmail-driven agent runs: "off", "minimal", "low", "medium", or "high". Keep modest defaults for routine inbox automations to control cost and latency.',
  "hooks.internal":
    "Internal hook runtime settings for bundled/custom event handlers loaded from module paths. Use this for trusted in-process automations and keep handler loading tightly scoped.",
  "hooks.internal.enabled":
    "Enables processing for internal hook handlers and configured entries in the internal hook runtime. Keep disabled unless internal hook handlers are intentionally configured.",
  "hooks.internal.handlers":
    "List of internal event handlers mapping event names to modules and optional exports. Keep handler definitions explicit so event-to-code routing is auditable.",
  "hooks.internal.handlers[].event":
    "Internal event name that triggers this handler module when emitted by the runtime. Use stable event naming conventions to avoid accidental overlap across handlers.",
  "hooks.internal.handlers[].module":
    "Safe relative module path for the internal hook handler implementation loaded at runtime. Keep module files in reviewed directories and avoid dynamic path composition.",
  "hooks.internal.handlers[].export":
    "Optional named export for the internal hook handler function when module default export is not used. Set this when one module ships multiple handler entrypoints.",
  "hooks.internal.entries":
    "Configured internal hook entry records used to register concrete runtime handlers and metadata. Keep entries explicit and versioned so production behavior is auditable.",
  "hooks.internal.load":
    "Internal hook loader settings controlling where handler modules are discovered at startup. Use constrained load roots to reduce accidental module conflicts or shadowing.",
  "hooks.internal.load.extraDirs":
    "Additional directories searched for internal hook modules beyond default load paths. Keep this minimal and controlled to reduce accidental module shadowing.",
  "hooks.internal.installs":
    "Install metadata for internal hook modules, including source and resolved artifacts for repeatable deployments. Use this as operational provenance and avoid manual drift edits.",
  messages:
    "入站/出站聊天流的消息格式化、确认、排队、防抖和状态反应行为。当频道响应性或消息体验需要调整时使用此部分。",
  "messages.messagePrefix":
    "Prefix text prepended to inbound user messages before they are handed to the agent runtime. Use this sparingly for channel context markers and keep it stable across sessions.",
  "messages.responsePrefix":
    "Prefix text prepended to outbound assistant replies before sending to channels. Use for lightweight branding/context tags and avoid long prefixes that reduce content density.",
  "messages.groupChat":
    "Group-message handling controls including mention triggers and history window sizing. Keep mention patterns narrow so group channels do not trigger on every message.",
  "messages.groupChat.mentionPatterns":
    "Regex-like patterns used to detect explicit mentions/trigger phrases in group chats. Use precise patterns to reduce false positives in high-volume channels.",
  "messages.groupChat.historyLimit":
    "Maximum number of prior group messages loaded as context per turn for group sessions. Use higher values for richer continuity, or lower values for faster and cheaper responses.",
  "messages.queue":
    "Inbound message queue strategy used to buffer bursts before processing turns. Tune this for busy channels where sequential processing or batching behavior matters.",
  "messages.queue.mode":
    'Queue behavior mode: "steer", "followup", "collect", "steer-backlog", "steer+backlog", "queue", or "interrupt". Keep conservative modes unless you intentionally need aggressive interruption/backlog semantics.',
  "messages.queue.byChannel":
    "Per-channel queue mode overrides keyed by provider id (for example telegram, discord, slack). Use this when one channel’s traffic pattern needs different queue behavior than global defaults.",
  "messages.queue.debounceMs":
    "Global queue debounce window in milliseconds before processing buffered inbound messages. Use higher values to coalesce rapid bursts, or lower values for reduced response latency.",
  "messages.queue.debounceMsByChannel":
    "Per-channel debounce overrides for queue behavior keyed by provider id. Use this to tune burst handling independently for chat surfaces with different pacing.",
  "messages.queue.cap":
    "Maximum number of queued inbound items retained before drop policy applies. Keep caps bounded in noisy channels so memory usage remains predictable.",
  "messages.queue.drop":
    'Drop strategy when queue cap is exceeded: "old", "new", or "summarize". Use summarize when preserving intent matters, or old/new when deterministic dropping is preferred.',
  "messages.inbound":
    "Direct inbound debounce settings used before queue/turn processing starts. Configure this for provider-specific rapid message bursts from the same sender.",
  "messages.inbound.byChannel":
    "Per-channel inbound debounce overrides keyed by provider id in milliseconds. Use this where some providers send message fragments more aggressively than others.",
  "messages.removeAckAfterReply":
    "Removes the acknowledgment reaction after final reply delivery when enabled. Keep enabled for cleaner UX in channels where persistent ack reactions create clutter.",
  "messages.tts":
    "Text-to-speech policy for reading agent replies aloud on supported voice or audio surfaces. Keep disabled unless voice playback is part of your operator/user workflow.",
  channels:
    "频道提供商配置加上控制访问策略、心跳可见性和每界面行为的共享默认值。保持默认值集中化，仅在需要时按提供商覆盖。",
  "channels.telegram":
    "Telegram channel provider configuration including auth tokens, retry behavior, and message rendering controls. Use this section to tune bot behavior for Telegram-specific API semantics.",
  "channels.slack":
    "Slack channel provider configuration for bot/app tokens, streaming behavior, and DM policy controls. Keep token handling and thread behavior explicit to avoid noisy workspace interactions.",
  "channels.discord":
    "Discord channel provider configuration for bot auth, retry policy, streaming, thread bindings, and optional voice capabilities. Keep privileged intents and advanced features disabled unless needed.",
  "channels.whatsapp":
    "WhatsApp channel provider configuration for access policy and message batching behavior. Use this section to tune responsiveness and direct-message routing safety for WhatsApp chats.",
  "channels.signal":
    "Signal channel provider configuration including account identity and DM policy behavior. Keep account mapping explicit so routing remains stable across multi-device setups.",
  "channels.imessage":
    "iMessage channel provider configuration for CLI integration and DM access policy handling. Use explicit CLI paths when runtime environments have non-standard binary locations.",
  "channels.bluebubbles":
    "BlueBubbles channel provider configuration used for Apple messaging bridge integrations. Keep DM policy aligned with your trusted sender model in shared deployments.",
  "channels.msteams":
    "Microsoft Teams channel provider configuration and provider-specific policy toggles. Use this section to isolate Teams behavior from other enterprise chat providers.",
  "channels.mattermost":
    "Mattermost channel provider configuration for bot credentials, base URL, and message trigger modes. Keep mention/trigger rules strict in high-volume team channels.",
  "channels.irc":
    "IRC channel provider configuration and compatibility settings for classic IRC transport workflows. Use this section when bridging legacy chat infrastructure into OpenClaw.",
  "channels.defaults":
    "Default channel behavior applied across providers when provider-specific settings are not set. Use this to enforce consistent baseline policy before per-provider tuning.",
  "channels.defaults.groupPolicy":
    'Default group policy across channels: "open", "disabled", or "allowlist". Keep "allowlist" for safer production setups unless broad group participation is intentional.',
  "channels.defaults.heartbeat":
    "Default heartbeat visibility settings for status messages emitted by providers/channels. Tune this globally to reduce noisy healthy-state updates while keeping alerts visible.",
  "channels.defaults.heartbeat.showOk":
    "Shows healthy/OK heartbeat status entries when true in channel status outputs. Keep false in noisy environments and enable only when operators need explicit healthy confirmations.",
  "channels.defaults.heartbeat.showAlerts":
    "Shows degraded/error heartbeat alerts when true so operator channels surface problems promptly. Keep enabled in production so broken channel states are visible.",
  "channels.defaults.heartbeat.useIndicator":
    "Enables concise indicator-style heartbeat rendering instead of verbose status text where supported. Use indicator mode for dense dashboards with many active channels.",
  "agents.defaults.heartbeat.directPolicy":
    'Controls whether heartbeat delivery may target direct/DM chats: "allow" (default) permits DM delivery and "block" suppresses direct-target sends.',
  "agents.list.*.heartbeat.directPolicy":
    'Per-agent override for heartbeat direct/DM delivery policy; use "block" for agents that should only send heartbeat alerts to non-DM destinations.',
  "channels.telegram.configWrites":
    "Allow Telegram to write config in response to channel events/commands (default: true).",
  "channels.telegram.botToken":
    "Telegram bot token used to authenticate Bot API requests for this account/provider config. Use secret/env substitution and rotate tokens if exposure is suspected.",
  "channels.telegram.capabilities.inlineButtons":
    "Enable Telegram inline button components for supported command and interaction surfaces. Disable if your deployment needs plain-text-only compatibility behavior.",
  "channels.telegram.execApprovals":
    "Telegram-native exec approval routing and approver authorization. Enable this only when Telegram should act as an explicit exec-approval client for the selected bot account.",
  "channels.telegram.execApprovals.enabled":
    "Enable Telegram exec approvals for this account. When false or unset, Telegram messages/buttons cannot approve exec requests.",
  "channels.telegram.execApprovals.approvers":
    "Telegram user IDs allowed to approve exec requests for this bot account. Use numeric Telegram user IDs; prompts are only delivered to these approvers when target includes dm.",
  "channels.telegram.execApprovals.agentFilter":
    'Optional allowlist of agent IDs eligible for Telegram exec approvals, for example `["main", "ops-agent"]`. Use this to keep approval prompts scoped to the agents you actually operate from Telegram.',
  "channels.telegram.execApprovals.sessionFilter":
    "Optional session-key filters matched as substring or regex-style patterns before Telegram approval routing is used. Use narrow patterns so Telegram approvals only appear for intended sessions.",
  "channels.telegram.execApprovals.target":
    'Controls where Telegram approval prompts are sent: "dm" sends to approver DMs (default), "channel" sends to the originating Telegram chat/topic, and "both" sends to both. Channel delivery exposes the command text to the chat, so only use it in trusted groups/topics.',
  "channels.slack.configWrites":
    "Allow Slack to write config in response to channel events/commands (default: true).",
  "channels.slack.botToken":
    "Slack bot token used for standard chat actions in the configured workspace. Keep this credential scoped and rotate if workspace app permissions change.",
  "channels.slack.appToken":
    "Slack app-level token used for Socket Mode connections and event transport when enabled. Use least-privilege app scopes and store this token as a secret.",
  "channels.slack.userToken":
    "Optional Slack user token for workflows requiring user-context API access beyond bot permissions. Use sparingly and audit scopes because this token can carry broader authority.",
  "channels.slack.userTokenReadOnly":
    "When true, treat configured Slack user token usage as read-only helper behavior where possible. Keep enabled if you only need supplemental reads without user-context writes.",
  "channels.mattermost.configWrites":
    "Allow Mattermost to write config in response to channel events/commands (default: true).",
  "channels.discord.configWrites":
    "Allow Discord to write config in response to channel events/commands (default: true).",
  "channels.discord.token":
    "Discord bot token used for gateway and REST API authentication for this provider account. Keep this secret out of committed config and rotate immediately after any leak.",
  "channels.discord.allowBots":
    'Allow bot-authored messages to trigger Discord replies (default: false). Set "mentions" to only accept bot messages that mention the bot.',
  "channels.discord.proxy":
    "Proxy URL for Discord gateway + API requests (app-id lookup and allowlist resolution). Set per account via channels.discord.accounts.<id>.proxy.",
  "channels.whatsapp.configWrites":
    "Allow WhatsApp to write config in response to channel events/commands (default: true).",
  "channels.signal.configWrites":
    "Allow Signal to write config in response to channel events/commands (default: true).",
  "channels.signal.account":
    "Signal account identifier (phone/number handle) used to bind this channel config to a specific Signal identity. Keep this aligned with your linked device/session state.",
  "channels.imessage.configWrites":
    "Allow iMessage to write config in response to channel events/commands (default: true).",
  "channels.imessage.cliPath":
    "Filesystem path to the iMessage bridge CLI binary used for send/receive operations. Set explicitly when the binary is not on PATH in service runtime environments.",
  "channels.msteams.configWrites":
    "Allow Microsoft Teams to write config in response to channel events/commands (default: true).",
  "channels.modelByChannel":
    "Map provider -> channel id -> model override (values are provider/model or aliases).",
  ...IRC_FIELD_HELP,
  "channels.discord.commands.native": 'Override native commands for Discord (bool or "auto").',
  "channels.discord.commands.nativeSkills":
    'Override native skill commands for Discord (bool or "auto").',
  "channels.telegram.commands.native": 'Override native commands for Telegram (bool or "auto").',
  "channels.telegram.commands.nativeSkills":
    'Override native skill commands for Telegram (bool or "auto").',
  "channels.slack.commands.native": 'Override native commands for Slack (bool or "auto").',
  "channels.slack.commands.nativeSkills":
    'Override native skill commands for Slack (bool or "auto").',
  "channels.slack.streaming":
    'Unified Slack stream preview mode: "off" | "partial" | "block" | "progress". Legacy boolean/streamMode keys are auto-mapped.',
  "channels.slack.nativeStreaming":
    "Enable native Slack text streaming (chat.startStream/chat.appendStream/chat.stopStream) when channels.slack.streaming is partial (default: true).",
  "channels.slack.streamMode":
    "Legacy Slack preview mode alias (replace | status_final | append); auto-migrated to channels.slack.streaming.",
  "channels.telegram.customCommands":
    "Additional Telegram bot menu commands (merged with native; conflicts ignored).",
  "messages.suppressToolErrors":
    "When true, suppress ⚠️ tool-error warnings from being shown to the user. The agent already sees errors in context and can retry. Default: false.",
  "messages.ackReaction": "Emoji reaction used to acknowledge inbound messages (empty disables).",
  "messages.ackReactionScope":
    'When to send ack reactions ("group-mentions", "group-all", "direct", "all", "off", "none"). "off"/"none" disables ack reactions entirely.',
  "messages.statusReactions":
    "Lifecycle status reactions that update the emoji on the trigger message as the agent progresses (queued → thinking → tool → done/error).",
  "messages.statusReactions.enabled":
    "Enable lifecycle status reactions for Telegram. When enabled, the ack reaction becomes the initial 'queued' state and progresses through thinking, tool, done/error automatically. Default: false.",
  "messages.statusReactions.emojis":
    "Override default status reaction emojis. Keys: thinking, tool, coding, web, done, error, stallSoft, stallHard. Must be valid Telegram reaction emojis.",
  "messages.statusReactions.timing":
    "Override default timing. Keys: debounceMs (700), stallSoftMs (25000), stallHardMs (60000), doneHoldMs (1500), errorHoldMs (2500).",
  "messages.inbound.debounceMs":
    "Debounce window (ms) for batching rapid inbound messages from the same sender (0 to disable).",
  "channels.telegram.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.telegram.allowFrom=["*"].',
  "channels.telegram.streaming":
    'Unified Telegram stream preview mode: "off" | "partial" | "block" | "progress" (default: "partial"). "progress" maps to "partial" on Telegram. Legacy boolean/streamMode keys are auto-mapped.',
  "channels.discord.streaming":
    'Unified Discord stream preview mode: "off" | "partial" | "block" | "progress". "progress" maps to "partial" on Discord. Legacy boolean/streamMode keys are auto-mapped.',
  "channels.discord.streamMode":
    "Legacy Discord preview mode alias (off | partial | block); auto-migrated to channels.discord.streaming.",
  "channels.discord.draftChunk.minChars":
    'Minimum chars before emitting a Discord stream preview update when channels.discord.streaming="block" (default: 200).',
  "channels.discord.draftChunk.maxChars":
    'Target max size for a Discord stream preview chunk when channels.discord.streaming="block" (default: 800; clamped to channels.discord.textChunkLimit).',
  "channels.discord.draftChunk.breakPreference":
    "Preferred breakpoints for Discord draft chunks (paragraph | newline | sentence). Default: paragraph.",
  "channels.telegram.retry.attempts":
    "Max retry attempts for outbound Telegram API calls (default: 3).",
  "channels.telegram.retry.minDelayMs": "Minimum retry delay in ms for Telegram outbound calls.",
  "channels.telegram.retry.maxDelayMs":
    "Maximum retry delay cap in ms for Telegram outbound calls.",
  "channels.telegram.retry.jitter": "Jitter factor (0-1) applied to Telegram retry delays.",
  "channels.telegram.network.autoSelectFamily":
    "Override Node autoSelectFamily for Telegram (true=enable, false=disable).",
  "channels.telegram.timeoutSeconds":
    "Max seconds before Telegram API requests are aborted (default: 500 per grammY).",
  "channels.telegram.threadBindings.enabled":
    "Enable Telegram conversation binding features (/focus, /unfocus, /agents, and /session idle|max-age). Overrides session.threadBindings.enabled when set.",
  "channels.telegram.threadBindings.idleHours":
    "Inactivity window in hours for Telegram bound sessions. Set 0 to disable idle auto-unfocus (default: 24). Overrides session.threadBindings.idleHours when set.",
  "channels.telegram.threadBindings.maxAgeHours":
    "Optional hard max age in hours for Telegram bound sessions. Set 0 to disable hard cap (default: 0). Overrides session.threadBindings.maxAgeHours when set.",
  "channels.telegram.threadBindings.spawnSubagentSessions":
    "Allow subagent spawns with thread=true to auto-bind Telegram current conversations when supported.",
  "channels.telegram.threadBindings.spawnAcpSessions":
    "Allow ACP spawns with thread=true to auto-bind Telegram current conversations when supported.",
  "channels.whatsapp.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.whatsapp.allowFrom=["*"].',
  "channels.whatsapp.selfChatMode": "Same-phone setup (bot uses your personal WhatsApp number).",
  "channels.whatsapp.debounceMs":
    "Debounce window (ms) for batching rapid consecutive messages from the same sender (0 to disable).",
  "channels.signal.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.signal.allowFrom=["*"].',
  "channels.imessage.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.imessage.allowFrom=["*"].',
  "channels.bluebubbles.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.bluebubbles.allowFrom=["*"].',
  "channels.discord.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.discord.allowFrom=["*"].',
  "channels.discord.dm.policy":
    'Direct message access control ("pairing" recommended). "open" requires channels.discord.allowFrom=["*"] (legacy: channels.discord.dm.allowFrom).',
  "channels.discord.retry.attempts":
    "Max retry attempts for outbound Discord API calls (default: 3).",
  "channels.discord.retry.minDelayMs": "Minimum retry delay in ms for Discord outbound calls.",
  "channels.discord.retry.maxDelayMs": "Maximum retry delay cap in ms for Discord outbound calls.",
  "channels.discord.retry.jitter": "Jitter factor (0-1) applied to Discord retry delays.",
  "channels.discord.maxLinesPerMessage": "Soft max line count per Discord message (default: 17).",
  "channels.discord.inboundWorker.runTimeoutMs": `Optional queued Discord inbound worker timeout in ms. This is separate from Carbon listener timeouts; defaults to ${DISCORD_DEFAULT_INBOUND_WORKER_TIMEOUT_MS} and can be disabled with 0. Set per account via channels.discord.accounts.<id>.inboundWorker.runTimeoutMs.`,
  "channels.discord.eventQueue.listenerTimeout": `Canonical Discord listener timeout control in ms for gateway normalization/enqueue handlers. Default is ${DISCORD_DEFAULT_LISTENER_TIMEOUT_MS} in OpenClaw; set per account via channels.discord.accounts.<id>.eventQueue.listenerTimeout.`,
  "channels.discord.eventQueue.maxQueueSize":
    "Optional Discord EventQueue capacity override (max queued events before backpressure). Set per account via channels.discord.accounts.<id>.eventQueue.maxQueueSize.",
  "channels.discord.eventQueue.maxConcurrency":
    "Optional Discord EventQueue concurrency override (max concurrent handler executions). Set per account via channels.discord.accounts.<id>.eventQueue.maxConcurrency.",
  "channels.discord.threadBindings.enabled":
    "Enable Discord thread binding features (/focus, bound-thread routing/delivery, and thread-bound subagent sessions). Overrides session.threadBindings.enabled when set.",
  "channels.discord.threadBindings.idleHours":
    "Inactivity window in hours for Discord thread-bound sessions (/focus and spawned thread sessions). Set 0 to disable idle auto-unfocus (default: 24). Overrides session.threadBindings.idleHours when set.",
  "channels.discord.threadBindings.maxAgeHours":
    "Optional hard max age in hours for Discord thread-bound sessions. Set 0 to disable hard cap (default: 0). Overrides session.threadBindings.maxAgeHours when set.",
  "channels.discord.threadBindings.spawnSubagentSessions":
    "Allow subagent spawns with thread=true to auto-create and bind Discord threads (default: false; opt-in). Set true to enable thread-bound subagent spawns for this account/channel.",
  "channels.discord.threadBindings.spawnAcpSessions":
    "Allow /acp spawn to auto-create and bind Discord threads for ACP sessions (default: false; opt-in). Set true to enable thread-bound ACP spawns for this account/channel.",
  "channels.discord.ui.components.accentColor":
    "Accent color for Discord component containers (hex). Set per account via channels.discord.accounts.<id>.ui.components.accentColor.",
  "channels.discord.voice.enabled":
    "Enable Discord voice channel conversations (default: true). Omit channels.discord.voice to keep voice support disabled for the account.",
  "channels.discord.voice.autoJoin":
    "Voice channels to auto-join on startup (list of guildId/channelId entries).",
  "channels.discord.voice.daveEncryption":
    "Toggle DAVE end-to-end encryption for Discord voice joins (default: true in @discordjs/voice; Discord may require this).",
  "channels.discord.voice.decryptionFailureTolerance":
    "Consecutive decrypt failures before DAVE attempts session recovery (passed to @discordjs/voice; default: 24).",
  "channels.discord.voice.tts":
    "Optional TTS overrides for Discord voice playback (merged with messages.tts).",
  "channels.discord.intents.presence":
    "Enable the Guild Presences privileged intent. Must also be enabled in the Discord Developer Portal. Allows tracking user activities (e.g. Spotify). Default: false.",
  "channels.discord.intents.guildMembers":
    "Enable the Guild Members privileged intent. Must also be enabled in the Discord Developer Portal. Default: false.",
  "channels.discord.pluralkit.enabled":
    "Resolve PluralKit proxied messages and treat system members as distinct senders.",
  "channels.discord.pluralkit.token":
    "Optional PluralKit token for resolving private systems or members.",
  "channels.discord.activity": "Discord presence activity text (defaults to custom status).",
  "channels.discord.status": "Discord presence status (online, dnd, idle, invisible).",
  "channels.discord.autoPresence.enabled":
    "Enable automatic Discord bot presence updates based on runtime/model availability signals. When enabled: healthy=>online, degraded/unknown=>idle, exhausted/unavailable=>dnd.",
  "channels.discord.autoPresence.intervalMs":
    "How often to evaluate Discord auto-presence state in milliseconds (default: 30000).",
  "channels.discord.autoPresence.minUpdateIntervalMs":
    "Minimum time between actual Discord presence update calls in milliseconds (default: 15000). Prevents status spam on noisy state changes.",
  "channels.discord.autoPresence.healthyText":
    "Optional custom status text while runtime is healthy (online). If omitted, falls back to static channels.discord.activity when set.",
  "channels.discord.autoPresence.degradedText":
    "Optional custom status text while runtime/model availability is degraded or unknown (idle).",
  "channels.discord.autoPresence.exhaustedText":
    "Optional custom status text while runtime detects exhausted/unavailable model quota (dnd). Supports {reason} template placeholder.",
  "channels.discord.activityType":
    "Discord presence activity type (0=Playing,1=Streaming,2=Listening,3=Watching,4=Custom,5=Competing).",
  "channels.discord.activityUrl": "Discord presence streaming URL (required for activityType=1).",
  "channels.slack.dm.policy":
    'Direct message access control ("pairing" recommended). "open" requires channels.slack.allowFrom=["*"] (legacy: channels.slack.dm.allowFrom).',
  "channels.slack.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.slack.allowFrom=["*"].',
};
