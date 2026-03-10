---
summary: "`openclaw daemon` 的 CLI 参考（Gateway 服务管理的旧版别名）"
read_when:
  - 脚本中仍在使用 `openclaw daemon ...`
  - 需要服务生命周期命令（install/start/stop/restart/status）
title: "daemon"
---

# `openclaw daemon`

Gateway 服务管理命令的旧版别名。

`openclaw daemon ...` 映射到与 `openclaw gateway ...` 服务命令相同的服务控制界面。

## 用法

```bash
openclaw daemon status
openclaw daemon install
openclaw daemon start
openclaw daemon stop
openclaw daemon restart
openclaw daemon uninstall
```

## 子命令

- `status`：显示服务安装状态并探测 Gateway 健康
- `install`：安装服务（`launchd`/`systemd`/`schtasks`）
- `uninstall`：移除服务
- `start`：启动服务
- `stop`：停止服务
- `restart`：重启服务

## 常用选项

- `status`：`--url`、`--token`、`--password`、`--timeout`、`--no-probe`、`--deep`、`--json`
- `install`：`--port`、`--runtime <node|bun>`、`--token`、`--force`、`--json`
- 生命周期（`uninstall|start|stop|restart`）：`--json`

说明：

- `status` 在可能的情况下解析已配置的认证 SecretRef 用于探测认证。
- 当令牌认证需要令牌且 `gateway.auth.token` 由 SecretRef 管理时，`install` 会验证 SecretRef 可解析，但不会将解析后的令牌持久化到服务环境元数据中。
- 如果令牌认证需要令牌且配置的令牌 SecretRef 未解析，install 会安全失败。
- 如果同时配置了 `gateway.auth.token` 和 `gateway.auth.password` 且 `gateway.auth.mode` 未设置，install 会被阻止直到显式设置模式。

## 推荐

使用 [`openclaw gateway`](/cli/gateway) 查看当前文档和示例。
