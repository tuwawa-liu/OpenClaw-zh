# OpenClaw iOS（超级 Alpha 版）

此 iPhone 应用处于超级 Alpha 阶段，仅供内部使用。它以 `role: node` 连接到 OpenClaw Gateway。

## 分发状态

- 公开发布：暂不可用。
- 内部 Beta 发布：本地归档 + 通过 Fastlane 上传到 TestFlight。
- 本地/手动通过 Xcode 从源码部署仍是默认开发方式。

## 超级 Alpha 免责声明

- 预计会有破坏性变更。
- UI 和引导流程可能在没有迁移保证的情况下更改。
- 前台使用是目前唯一可靠的模式。
- 在权限和后台行为仍在加固期间，请将此版本视为敏感。

## 精确的 Xcode 手动部署流程

1. 前提条件：
   - Xcode 16+
   - `pnpm`
   - `xcodegen`
   - 在 Xcode 中设置好 Apple Development 签名
2. 从仓库根目录：

```bash
pnpm install
./scripts/ios-configure-signing.sh
cd apps/ios
xcodegen generate
open OpenClaw.xcodeproj
```

3. 在 Xcode 中：
   - Scheme：`OpenClaw`
   - 目标：已连接的 iPhone（推荐用于真实行为）
   - 构建配置：`Debug`
   - 运行（`Product` -> `Run`）
4. 如果个人团队签名失败：
   - 使用 `apps/ios/LocalSigning.xcconfig` 设置唯一的本地 Bundle ID。
   - 从 `apps/ios/LocalSigning.xcconfig.example` 开始。

快捷命令（相同流程 + 打开项目）：

```bash
pnpm ios:open
```

## 本地 Beta 发布流程

前提条件：

- Xcode 16+
- `pnpm`
- `xcodegen`
- `fastlane`
- Apple 账户已登录 Xcode 以支持自动签名/配置
- 在自动解析 Beta 构建号或上传到 TestFlight 时，通过 `scripts/ios-asc-keychain-setup.sh` 在钥匙串中设置 App Store Connect API 密钥

发布行为：

- 本地开发继续使用来自 `scripts/ios-configure-signing.sh` 的每开发者唯一 Bundle ID。
- Beta 发布使用规范的 `ai.openclaw.client*` Bundle ID，通过在 `apps/ios/build/BetaRelease.xcconfig` 中生成临时 xcconfig 实现。
- Beta 流程不会修改 `apps/ios/.local-signing.xcconfig` 或 `apps/ios/LocalSigning.xcconfig`。
- 根目录 `package.json.version` 是 iOS 的唯一版本来源。
- 根版本如 `2026.3.11-beta.1` 会变为：
  - `CFBundleShortVersionString = 2026.3.11`
  - `CFBundleVersion = 2026.3.11 的下一个 TestFlight 构建号`

仅归档（不上传）：

```bash
pnpm ios:beta:archive
```

归档并上传到 TestFlight：

```bash
pnpm ios:beta
```

如果需要强制指定构建号：

```bash
pnpm ios:beta -- --build-number 7
```

## 本地/手动构建的 APNs 预期

- 应用在启动时调用 `registerForRemoteNotifications()`。
- `apps/ios/Sources/OpenClaw.entitlements` 将 `aps-environment` 设置为 `development`。
- APNs 令牌注册到 Gateway 仅在 Gateway 连接后进行（`push.apns.register`）。
- 你选择的团队/描述文件必须支持你签名的应用 Bundle ID 的推送通知。
- 如果推送功能或配置错误，APNs 注册在运行时失败（在 Xcode 日志中检查 `APNs registration failed`）。
- 调试版本注册为 APNs 沙箱；发布版本使用生产环境。

## 当前可用功能（具体）

- 通过设置码流程配对（在 Telegram 中 `/pair` 然后 `/pair approve`）。
- 通过发现或手动主机/端口（含 TLS 指纹信任提示）连接 Gateway。
- 通过操作者 Gateway 会话进行聊天 + 通话。
- 前台 iPhone 节点命令：相机拍照/录制、canvas 呈现/导航/eval/快照、屏幕录制、位置、联系人、日历、提醒事项、照片、运动、本地通知。
- 分享扩展深度链接转发到已连接的 Gateway 会话。

## 位置自动化用例（测试）

用于自动化信号（"我移动了"、"我到了"、"我离开了"），而非保持唤醒机制。

- 产品意图：
  - 由 iOS 位置事件驱动的运动感知自动化
  - 示例：到达/离开地理围栏、显著移动、访问检测
- 非目标：
  - 仅为保持应用存活的持续 GPS 轮询

QA 运行中应包含的测试路径：

1. 在应用中启用位置权限：
   - 设置 `始终` 权限
   - 验证构建配置文件中已启用后台位置功能
2. 将应用切到后台并触发移动：
   - 走路/开车足够产生一次显著位置更新，或跨越已配置的地理围栏
3. 验证 Gateway 端效果：
   - 需要时节点重连/唤醒
   - 预期的位置/运动事件到达 Gateway
   - 自动化触发器执行一次（无重复风暴）
4. 验证资源影响：
   - 无持续高温状态
   - 短观察窗口内无过度后台电池消耗

通过条件：

- 运动事件可靠地交付以满足自动化用户体验
- 无位置驱动的重连垃圾循环
- 应用在反复后台/前台切换后保持稳定

## 已知问题 / 限制 / 问题

- 前台优先：iOS 可能在后台挂起套接字；重连恢复仍在调优中。
- 后台命令限制严格：`canvas.*`、`camera.*`、`screen.*` 和 `talk.*` 在后台时被阻止。
- 后台位置需要 `始终` 位置权限。
- 配对/认证错误会故意暂停重连循环，直到人工修复认证/配对状态。
- 语音唤醒和通话争用同一个麦克风；通话在活跃时会抑制唤醒捕获。
- APNs 可靠性取决于本地签名/配置/主题对齐。
- 预计在活跃开发期间会有粗糙的用户体验边缘和偶尔的重连抖动。

## 当前进行中的工作流

自动唤醒/重连加固：

- 改善跨场景转换的唤醒/恢复行为
- 减少后台 -> 前台后的死套接字状态
- 收紧节点/操作者会话重连协调
- 减少暂时性网络故障后的手动恢复步骤

## 调试清单

1. 确认构建/签名基线：
   - 重新生成项目（`xcodegen generate`）
   - 验证选择的团队 + Bundle ID
2. 在应用 `设置 -> Gateway` 中：
   - 确认状态文本、服务器和远程地址
   - 验证状态是否显示配对/认证门控
3. 如果需要配对：
   - 从 Telegram 运行 `/pair approve`，然后重新连接
4. 如果发现不稳定：
   - 启用 `发现调试日志`
   - 检查 `设置 -> Gateway -> 发现日志`
5. 如果网络路径不清楚：
   - 在 Gateway 高级设置中切换到手动主机/端口 + TLS
6. 在 Xcode 控制台中，按子系统/类别信号过滤：
   - `ai.openclaw.ios`
   - `GatewayDiag`
   - `APNs registration failed`
7. 验证后台期望：
   - 先在前台复现
   - 然后测试后台转换并确认返回时重连
