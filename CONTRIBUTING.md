# 参与贡献 OpenClaw

欢迎来到龙虾池！🦞

## 快速链接

- **GitHub:** https://github.com/openclaw/openclaw
- **愿景:** [`VISION.md`](VISION.md)
- **Discord:** https://discord.gg/qkhbAGHRBT
- **X/Twitter:** [@steipete](https://x.com/steipete) / [@openclaw](https://x.com/openclaw)

## 维护者

- **Peter Steinberger** - 仁慈的独裁者
  - GitHub: [@steipete](https://github.com/steipete) · X: [@steipete](https://x.com/steipete)

- **Shadow** - Discord 子系统、Discord 管理员、ClawHub、所有社区管理
  - GitHub: [@thewilloftheshadow](https://github.com/thewilloftheshadow) · X: [@4shadowed](https://x.com/4shadowed)

- **Vignesh** - 记忆 (QMD)、形式化建模、TUI、IRC 和 Lobster
  - GitHub: [@vignesh07](https://github.com/vignesh07) · X: [@\_vgnsh](https://x.com/_vgnsh)

- **Jos** - Telegram、API、Nix 模式
  - GitHub: [@joshp123](https://github.com/joshp123) · X: [@jjpcodes](https://x.com/jjpcodes)

- **Ayaan Zaidi** - Telegram 子系统、iOS 应用
  - GitHub: [@obviyus](https://github.com/obviyus) · X: [@0bviyus](https://x.com/0bviyus)

- **Tyler Yust** - 智能体/子智能体、定时任务、BlueBubbles、macOS 应用
  - GitHub: [@tyler6204](https://github.com/tyler6204) · X: [@tyleryust](https://x.com/tyleryust)

- **Mariano Belinky** - iOS 应用、安全
  - GitHub: [@mbelinky](https://github.com/mbelinky) · X: [@belimad](https://x.com/belimad)

- **Nimrod Gutman** - iOS 应用、macOS 应用和甲壳类功能
  - GitHub: [@ngutman](https://github.com/ngutman) · X: [@theguti](https://x.com/theguti)

- **Vincent Koc** - 智能体、遥测、钩子、安全
  - GitHub: [@vincentkoc](https://github.com/vincentkoc) · X: [@vincent_koc](https://x.com/vincent_koc)

- **Val Alexander** - UI/UX、文档和智能体开发者体验
  - GitHub: [@BunsDev](https://github.com/BunsDev) · X: [@BunsDev](https://x.com/BunsDev)

- **Seb Slight** - 文档、智能体可靠性、运行时加固
  - GitHub: [@sebslight](https://github.com/sebslight) · X: [@sebslig](https://x.com/sebslig)

- **Christoph Nakazawa** - JS 基础设施
  - GitHub: [@cpojer](https://github.com/cpojer) · X: [@cnakazawa](https://x.com/cnakazawa)

- **Gustavo Madeira Santana** - 多智能体、CLI、Web UI
  - GitHub: [@gumadeiras](https://github.com/gumadeiras) · X: [@gumadeiras](https://x.com/gumadeiras)

- **Onur Solmaz** - 智能体、开发工作流、ACP 集成、MS Teams
  - GitHub: [@onutc](https://github.com/onutc), [@osolmaz](https://github.com/osolmaz) · X: [@onusoz](https://x.com/onusoz)

- **Josh Avant** - 核心、CLI、Gateway、安全、智能体
  - GitHub: [@joshavant](https://github.com/joshavant) · X: [@joshavant](https://x.com/joshavant)

- **Jonathan Taylor** - ACP 子系统、Gateway 功能/缺陷、Gog/Mog/Sog CLI、SEDMAT
  - GitHub [@visionik](https://github.com/visionik) · X: [@visionik](https://x.com/visionik)
- **Josh Lehman** - 压缩、Tlon/Urbit 子系统
  - GitHub [@jalehman](https://github.com/jalehman) · X: [@jlehman\_](https://x.com/jlehman_)

- **Radek Sienkiewicz** - 控制面板 UI + WebChat 正确性
  - GitHub [@velvet-shark](https://github.com/velvet-shark) · X: [@velvet_shark](https://twitter.com/velvet_shark)

- **Muhammed Mukhthar** - Mattermost、CLI
  - GitHub [@mukhtharcm](https://github.com/mukhtharcm) · X: [@mukhtharcm](https://x.com/mukhtharcm)

- **Altay** - 智能体、CLI、错误处理
  - GitHub [@altaywtf](https://github.com/altaywtf) · X: [@altaywtf](https://x.com/altaywtf)

- **Robin Waslander** - 安全、PR 分类、缺陷修复
  - GitHub: [@hydro13](https://github.com/hydro13) · X: [@Robin_waslander](https://x.com/Robin_waslander)

## 如何贡献

1. **缺陷和小修复** → 直接提交 PR！
2. **新功能 / 架构变更** → 先发起 [GitHub 讨论](https://github.com/openclaw/openclaw/discussions) 或在 Discord 中咨询
3. **问题** → Discord [#help](https://discord.com/channels/1456350064065904867/1459642797895319552) / [#users-helping-users](https://discord.com/channels/1456350064065904867/1459007081603403828)

## 提交 PR 之前

- 在本地使用你的 OpenClaw 实例进行测试
- 运行测试：`pnpm build && pnpm check && pnpm test`
- 确保 CI 检查通过
- 保持 PR 聚焦（每个 PR 只做一件事；不要混合不相关的内容）
- 描述做了什么以及为什么
- 在要求再次审查之前，回复或解决你已处理的机器人审查对话
- **附上截图** — 一张显示问题/修改前，一张显示修复/修改后（用于 UI 或视觉变更）

## 审查对话由作者负责

如果审查机器人在你的 PR 上留下审查对话，你需要负责后续跟进：

- 当代码或说明完全解决了机器人的问题时，自行解决对话
- 仅在需要维护者或审查者判断时回复并保持开放
- 不要把"已修复"的机器人审查对话留给维护者清理

这适用于人工编写和 AI 辅助的 PR。

## Control UI 装饰器

Control UI 使用 Lit 和 **旧版** 装饰器（当前 Rollup 解析不支持标准装饰器所需的 `accessor` 字段）。添加响应式字段时，保持旧版风格：

```ts
@state() foo = "bar";
@property({ type: Number }) count = 0;
```

根目录 `tsconfig.json` 配置为旧版装饰器（`experimentalDecorators: true`），`useDefineForClassFields: false`。除非你同时更新 UI 构建工具以支持标准装饰器，否则不要修改这些设置。

## 欢迎 AI/Vibe-Coded PR！🤖

使用 Codex、Claude 或其他 AI 工具构建的？**太好了 - 请标注出来！**

请在你的 PR 中包含：

- [ ] 在 PR 标题或描述中标记为 AI 辅助
- [ ] 注明测试程度（未测试 / 轻度测试 / 完整测试）
- [ ] 如有可能，附上提示词或会话日志（非常有帮助！）
- [ ] 确认你理解代码的功能
- [ ] 在处理后解决或回复机器人审查对话

AI PR 在这里是一等公民。我们只是希望透明，让审查者知道需要关注什么。如果你使用 LLM 编码智能体，请指示它解决已处理的机器人审查对话，而不是留给维护者。

## 当前重点和路线图 🗺

我们目前优先关注：

- **稳定性**：修复频道连接中的边缘情况（WhatsApp/Telegram）。
- **用户体验**：改进入门向导和错误消息。
- **技能**：技能贡献请前往 [ClawHub](https://clawhub.ai/) — OpenClaw 技能社区中心。
- **性能**：优化令牌使用和压缩逻辑。

查看 [GitHub Issues](https://github.com/openclaw/openclaw/issues) 中的 "good first issue" 标签！

## 维护者

我们正在有选择性地扩大维护者团队。
如果你是一位有经验的贡献者，希望通过代码、文档或社区帮助塑造 OpenClaw 的方向 — 我们很想听到你的声音。

成为维护者是一种责任，而非荣誉头衔。我们期望积极、持续的参与 — 分类问题、审查 PR、推动项目前进。

仍然感兴趣？请发送邮件至 contributing@openclaw.ai，包含：

- 你在 OpenClaw 上的 PR 链接（如果没有，请先从这里开始）
- 你维护或积极贡献的开源项目链接
- 你的 GitHub、Discord 和 X/Twitter 账号
- 简短介绍：背景、经验和兴趣领域
- 你会的语言和所在位置
- 你能实际投入多少时间

我们欢迎各种技能的人 — 工程、文档、社区管理等。
我们会仔细审查每一份纯人工编写的申请，并缓慢且慎重地添加维护者。
请允许几周时间等待回复。

## 报告漏洞

我们非常重视安全报告。请直接在问题所在的仓库报告漏洞：

- **核心 CLI 和 Gateway** — [openclaw/openclaw](https://github.com/openclaw/openclaw)
- **macOS 桌面应用** — [openclaw/openclaw](https://github.com/openclaw/openclaw) (apps/macos)
- **iOS 应用** — [openclaw/openclaw](https://github.com/openclaw/openclaw) (apps/ios)
- **Android 应用** — [openclaw/openclaw](https://github.com/openclaw/openclaw) (apps/android)
- **ClawHub** — [openclaw/clawhub](https://github.com/openclaw/clawhub)
- **信任和威胁模型** — [openclaw/trust](https://github.com/openclaw/trust)

对于不适合特定仓库的问题，或你不确定时，请发送电子邮件至 **security@openclaw.ai**，我们会进行转发。

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
