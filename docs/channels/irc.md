---
title: IRC
description: 将 OpenClaw 连接到 IRC 频道和私信。
summary: "IRC 插件设置、访问控制和故障排除"
read_when:
  - 想要将 OpenClaw 连接到 IRC 频道或私信
  - 正在配置 IRC 白名单、群组策略或提及门控
---

当你想在经典频道（`#room`）和私信中使用 OpenClaw 时，请使用 IRC。
IRC 作为扩展插件提供，但在主配置的 `channels.irc` 下进行配置。

## 快速开始

1. 在 `~/.openclaw/openclaw.json` 中启用 IRC 配置。
2. 至少设置：

```json
{
  "channels": {
    "irc": {
      "enabled": true,
      "host": "irc.libera.chat",
      "port": 6697,
      "tls": true,
      "nick": "openclaw-bot",
      "channels": ["#openclaw"]
    }
  }
}
```

3. 启动/重启 Gateway：

```bash
openclaw gateway run
```

## 安全默认设置

- `channels.irc.dmPolicy` 默认为 `"pairing"`。
- `channels.irc.groupPolicy` 默认为 `"allowlist"`。
- 使用 `groupPolicy="allowlist"` 时，设置 `channels.irc.groups` 定义允许的频道。
- 使用 TLS（`channels.irc.tls=true`），除非你有意接受明文传输。

## 访问控制

IRC 频道有两个独立的"门控"：

1. **频道访问**（`groupPolicy` + `groups`）：机器人是否接受来自某个频道的消息。
2. **发送者访问**（`groupAllowFrom` / 按频道 `groups["#channel"].allowFrom`）：频道内谁可以触发机器人。

配置键：

- 私信白名单（私信发送者访问）：`channels.irc.allowFrom`
- 群组发送者白名单（频道发送者访问）：`channels.irc.groupAllowFrom`
- 按频道控制（频道 + 发送者 + 提及规则）：`channels.irc.groups["#channel"]`
- `channels.irc.groupPolicy="open"` 允许未配置的频道（**默认仍然有提及门控**）

白名单条目应使用稳定的发送者身份（`nick!user@host`）。
仅当 `channels.irc.dangerouslyAllowNameMatching: true` 时才启用裸昵称匹配，且这是可变的。

### 常见误区：`allowFrom` 用于私信，不是频道

如果你看到类似日志：

- `irc: drop group sender alice!ident@host (policy=allowlist)`

...这意味着发送者不被允许在 **群组/频道** 消息中交互。修复方法：

- 设置 `channels.irc.groupAllowFrom`（对所有频道全局生效），或
- 设置按频道的发送者白名单：`channels.irc.groups["#channel"].allowFrom`

示例（允许 `#tuirc-dev` 中的任何人与机器人对话）：

```json5
{
  channels: {
    irc: {
      groupPolicy: "allowlist",
      groups: {
        "#tuirc-dev": { allowFrom: ["*"] },
      },
    },
  },
}
```

## 回复触发（提及）

即使频道被允许（通过 `groupPolicy` + `groups`）且发送者被允许，OpenClaw 在群组上下文中默认使用 **提及门控**。

这意味着你可能会看到 `drop channel … (missing-mention)` 日志，除非消息中包含匹配机器人的提及模式。

要使机器人在 IRC 频道中 **无需提及即可回复**，请为该频道禁用提及门控：

```json5
{
  channels: {
    irc: {
      groupPolicy: "allowlist",
      groups: {
        "#tuirc-dev": {
          requireMention: false,
          allowFrom: ["*"],
        },
      },
    },
  },
}
```

或者允许 **所有** IRC 频道（不使用按频道白名单）且无需提及即可回复：

```json5
{
  channels: {
    irc: {
      groupPolicy: "open",
      groups: {
        "*": { requireMention: false, allowFrom: ["*"] },
      },
    },
  },
}
```

## 安全说明（推荐用于公共频道）

如果你在公共频道中允许 `allowFrom: ["*"]`，任何人都可以向机器人发送提示。
要降低风险，请限制该频道的工具。

### 频道中所有人使用相同工具

```json5
{
  channels: {
    irc: {
      groups: {
        "#tuirc-dev": {
          allowFrom: ["*"],
          tools: {
            deny: [
              "group:runtime",
              "group:fs",
              "gateway",
              "nodes",
              "cron",
              "browser",
            ],
          },
        },
      },
    },
  },
}
```

### 不同发送者使用不同工具（所有者获得更多权限）

使用 `toolsBySender` 为 `"*"` 应用更严格的策略，为你的昵称应用更宽松的策略：

```json5
{
  channels: {
    irc: {
      groups: {
        "#tuirc-dev": {
          allowFrom: ["*"],
          toolsBySender: {
            "*": {
              deny: [
                "group:runtime",
                "group:fs",
                "gateway",
                "nodes",
                "cron",
                "browser",
              ],
            },
            "id:eigen": {
              deny: ["gateway", "nodes", "cron"],
            },
          },
        },
      },
    },
  },
}
```

注意事项：

- `toolsBySender` 键应使用 `id:` 前缀表示 IRC 发送者身份值：
  `id:eigen` 或 `id:eigen!~eigen@174.127.248.171` 以进行更强的匹配。
- 旧版无前缀键仍被接受，仅作为 `id:` 匹配。
- 第一个匹配的发送者策略生效；`"*"` 是通配符回退。

关于群组访问与提及门控（及其交互方式）的更多信息，参见：[/channels/groups](/channels/groups)。

## NickServ

连接后使用 NickServ 认证：

```json
{
  "channels": {
    "irc": {
      "nickserv": {
        "enabled": true,
        "service": "NickServ",
        "password": "your-nickserv-password"
      }
    }
  }
}
```

可选的连接时一次性注册：

```json
{
  "channels": {
    "irc": {
      "nickserv": {
        "register": true,
        "registerEmail": "bot@example.com"
      }
    }
  }
}
```

昵称注册后请禁用 `register`，以避免重复的 REGISTER 尝试。

## 环境变量

默认账户支持：

- `IRC_HOST`
- `IRC_PORT`
- `IRC_TLS`
- `IRC_NICK`
- `IRC_USERNAME`
- `IRC_REALNAME`
- `IRC_PASSWORD`
- `IRC_CHANNELS`（逗号分隔）
- `IRC_NICKSERV_PASSWORD`
- `IRC_NICKSERV_REGISTER_EMAIL`

## 故障排除

- 如果机器人连接成功但从不在频道中回复，请验证 `channels.irc.groups` **以及** 提及门控是否在丢弃消息（`missing-mention`）。如果你希望它无需被提及即可回复，为该频道设置 `requireMention:false`。
- 如果登录失败，验证昵称可用性和服务器密码。
- 如果 TLS 在自定义网络上失败，验证主机/端口和证书配置。
