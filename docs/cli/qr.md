---
summary: "`openclaw qr` 的 CLI 参考（生成 iOS 配对二维码 + 设置码）"
read_when:
  - 想要快速将 iOS 应用与 Gateway 配对
  - 需要用于远程/手动分享的设置码输出
title: "qr"
---

# `openclaw qr`

从你当前的 Gateway 配置生成 iOS 配对二维码和设置码。

## 用法

```bash
openclaw qr
openclaw qr --setup-code-only
openclaw qr --json
openclaw qr --remote
openclaw qr --url wss://gateway.example/ws --token '<token>'
```

## 选项

- `--remote`：使用 `gateway.remote.url` 加上配置中的远程令牌/密码
- `--url <url>`：覆盖载荷中使用的 Gateway URL
- `--public-url <url>`：覆盖载荷中使用的公共 URL
- `--token <token>`：覆盖载荷的 Gateway 令牌
- `--password <password>`：覆盖载荷的 Gateway 密码
- `--setup-code-only`：仅打印设置码
- `--no-ascii`：跳过 ASCII 二维码渲染
- `--json`：输出 JSON（`setupCode`、`gatewayUrl`、`auth`、`urlSource`）

## 说明

- `--token` 和 `--password` 互斥。
- 使用 `--remote` 时，如果有效的远程凭证配置为 SecretRef 且你未传入 `--token` 或 `--password`，命令会从活动的 Gateway 快照中解析它们。如果 Gateway 不可用，命令会快速失败。
- 不使用 `--remote` 时，当 CLI 未传入认证覆盖时，会解析本地 Gateway 认证 SecretRef：
  - 当令牌认证可以胜出时（显式 `gateway.auth.mode="token"` 或推断模式下无密码源胜出），解析 `gateway.auth.token`。
  - 当密码认证可以胜出时（显式 `gateway.auth.mode="password"` 或推断模式下无胜出令牌），解析 `gateway.auth.password`。
- 如果同时配置了 `gateway.auth.token` 和 `gateway.auth.password`（包括 SecretRef）且 `gateway.auth.mode` 未设置，设置码解析会失败直到显式设置模式。
- Gateway 版本偏差说明：此命令路径需要支持 `secrets.resolve` 的 Gateway；较旧的 Gateway 会返回未知方法错误。
- 扫描后，使用以下命令批准设备配对：
  - `openclaw devices list`
  - `openclaw devices approve <requestId>`
