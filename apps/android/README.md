## OpenClaw Android 应用

状态：**非常早期的 Alpha 版本**。该应用正在从头开始重建。

### 重建清单

- [x] 新的 4 步引导流程
- [x] 连接标签页，支持 `设置码` + `手动` 模式
- [x] Gateway 设置/认证状态的加密持久化
- [x] 聊天界面重新设计
- [x] 设置界面重新设计和去重（Gateway 控制移至连接）
- [x] 引导流程中的二维码扫描
- [x] 性能改进
- [x] 聊天界面流式支持
- [x] 引导/设置流程中请求相机/位置等权限
- [x] Gateway/聊天状态更新的推送通知
- [x] 安全加固（生物识别锁、令牌处理、更安全的默认值）
- [x] 语音标签页完整功能
- [x] 屏幕标签页完整功能
- [ ] 完整端到端 QA 和发布加固

## 在 Android Studio 中打开

- 打开文件夹 `apps/android`。

## 构建 / 运行

```bash
cd apps/android
./gradlew :app:assembleDebug
./gradlew :app:installDebug
./gradlew :app:testDebugUnitTest
```

## Kotlin 检查 + 格式化

```bash
pnpm android:lint
pnpm android:format
```

Android 框架/资源检查（单独通道）：

```bash
pnpm android:lint:android
```

直接 Gradle 任务：

```bash
cd apps/android
./gradlew :app:ktlintCheck :benchmark:ktlintCheck
./gradlew :app:ktlintFormat :benchmark:ktlintFormat
./gradlew :app:lintDebug
```

如果 `ANDROID_SDK_ROOT` / `ANDROID_HOME` 未设置，`gradlew` 会自动检测 `~/Library/Android/sdk`（macOS 默认值）处的 Android SDK。

## 宏基准测试（启动 + 帧计时）

```bash
cd apps/android
./gradlew :benchmark:connectedDebugAndroidTest
```

报告输出路径：

- `apps/android/benchmark/build/reports/androidTests/connected/`

## 性能 CLI（低噪声）

确定性启动测量 + 热点提取，紧凑 CLI 输出：

```bash
cd apps/android
./scripts/perf-startup-benchmark.sh
./scripts/perf-startup-hotspots.sh
```

基准脚本行为：

- 仅运行 `StartupMacrobenchmark#coldStartup`（10 次迭代）。
- 单行打印中位数/最小值/最大值/变异系数。
- 将带时间戳的快照 JSON 写入 `apps/android/benchmark/results/`。
- 自动与之前的本地快照比较（或传入显式基线：`--baseline <old-benchmarkData.json>`）。

热点脚本行为：

- 确保安装调试应用，为 `.MainActivity` 捕获启动 `simpleperf` 数据。
- 打印顶级 DSO、顶级符号和关键应用路径线索（Compose/MainActivity/WebView）。
- 写入原始 `perf.data` 路径以供需要时深入分析。

## 在真实 Android 手机上运行（USB）

1) 在手机上启用 **开发者选项** + **USB 调试**。
2) 通过 USB 连接并在手机上接受调试信任提示。
3) 验证 ADB 可以看到设备：

```bash
adb devices -l
```

4) 安装 + 启动调试版本：

```bash
pnpm android:install
pnpm android:run
```

如果 `adb devices -l` 显示 `unauthorized`，请重新插拔并再次接受信任提示。

### 仅 USB Gateway 测试（无 LAN 依赖）

使用 `adb reverse` 将 Android 的 `localhost:18789` 隧道到你的笔记本电脑 `localhost:18789`。

终端 A（Gateway）：

```bash
pnpm openclaw gateway --port 18789 --verbose
```

终端 B（USB 隧道）：

```bash
adb reverse tcp:18789 tcp:18789
```

然后在应用中 **连接 -> 手动**：

- 主机：`127.0.0.1`
- 端口：`18789`
- TLS：关闭

## 热重载 / 快速迭代

此应用是原生 Kotlin + Jetpack Compose。

- Compose UI 编辑：在调试版本上使用 Android Studio **Live Edit**（适用于物理设备；项目 `minSdk=31` 已满足 API 要求）。
- 许多非结构性代码/资源更改：使用 Android Studio **Apply Changes**。
- 结构性/原生/清单/Gradle 更改：完整重装（`pnpm android:run`）。
- Canvas Web 内容在从 Gateway `__openclaw__/canvas/` 加载时已支持实时重载（见 `docs/platforms/android.md`）。

## 连接 / 配对

1) 启动 Gateway（在你的主机上）：

```bash
pnpm openclaw gateway --port 18789 --verbose
```

2) 在 Android 应用中：

- 打开 **连接** 标签页。
- 使用 **设置码** 或 **手动** 模式进行连接。

3) 批准配对（在 Gateway 机器上）：

```bash
openclaw devices list
openclaw devices approve <requestId>
```

更多详情：`docs/platforms/android.md`。

## 权限

- 发现：
  - Android 13+（`API 33+`）：`NEARBY_WIFI_DEVICES`
  - Android 12 及以下：`ACCESS_FINE_LOCATION`（NSD 扫描所需）
- 前台服务通知（Android 13+）：`POST_NOTIFICATIONS`
- 相机：
  - `CAMERA` 用于 `camera.snap` 和 `camera.clip`
  - `RECORD_AUDIO` 用于 `camera.clip` 当 `includeAudio=true` 时

## 集成能力测试（预配置）

此测试套件假设设置已手动完成。它 **不会** 自动安装/运行/配对。

前置要求清单：

1) Gateway 正在运行且可从 Android 应用访问。
2) Android 应用已连接到该 Gateway，`openclaw nodes status` 显示它已配对 + 已连接。
3) 应用保持解锁且在前台运行整个过程。
4) 打开应用 **屏幕** 标签页并在运行期间保持活跃（canvas/A2UI 命令需要该处附加的 canvas WebView）。
5) 为你期望通过的功能授予运行时权限（相机/麦克风/位置/通知监听器/位置等）。
6) 测试开始前不应有待处理的交互式系统对话框。
7) Canvas 主机已启用且可从设备访问（不要使用 `OPENCLAW_SKIP_CANVAS_HOST=1` 运行 Gateway；启动日志应包含 `canvas host mounted at .../__openclaw__/`）。
8) 本地操作者测试客户端配对已批准。如果首次运行失败并显示 `pairing required`，请批准最新的待处理设备配对请求，然后重新运行：
9) 对于 A2UI 检查，保持应用在 **屏幕** 标签页；节点现在会在首次 A2UI 可达性失败时自动刷新 canvas 能力（TTL 安全重试）。

```bash
openclaw devices list
openclaw devices approve --latest
```

运行：

```bash
pnpm android:test:integration
```

可选覆盖：

- `OPENCLAW_ANDROID_GATEWAY_URL=ws://...`（默认：从你的本地 OpenClaw 配置）
- `OPENCLAW_ANDROID_GATEWAY_TOKEN=...`
- `OPENCLAW_ANDROID_GATEWAY_PASSWORD=...`
- `OPENCLAW_ANDROID_NODE_ID=...` 或 `OPENCLAW_ANDROID_NODE_NAME=...`

测试内容：

- 从选定的 Android 节点读取 `node.describe` 命令列表。
- 调用已公布的非交互式命令。
- 在此套件中跳过 `screen.record`（Android 需要每次调用的交互式屏幕捕获同意）。
- 断言命令约定（成功或安全无效调用的预期确定性错误，如 `sms.send` 和 `notifications.actions`）。

常见失败快速修复：

- 测试开始前 `pairing required`：
  - 批准待处理的设备配对（`openclaw devices approve --latest`）并重新运行。
- `A2UI host not reachable` / `A2UI_HOST_NOT_CONFIGURED`：
  - 确保 Gateway canvas 主机正在运行且可达，保持应用在 **屏幕** 标签页。应用会自动刷新一次 canvas 能力；如果仍然失败，重新连接应用并重新运行。
- `NODE_BACKGROUND_UNAVAILABLE: canvas unavailable`：
  - 应用实际上未准备好接收 canvas 命令；保持应用在前台且 **屏幕** 标签页活跃。

## 贡献

此 Android 应用目前正在重建中。
维护者：@obviyus。如有问题/疑问/贡献，请开 issue 或在 Discord 上联系。
