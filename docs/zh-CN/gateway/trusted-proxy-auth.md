---
summary: "在受信代理后面使用基于标头的身份验证运行 OpenClaw 网关"
read_when:
  - 在 Pomerium、Caddy、nginx 或 Traefik 后面运行 OpenClaw
  - 调试基于标头的跳过令牌/密码认证
  - 寻找与受信代理身份验证相关的安全问题
title: "受信代理身份验证"
---

# 受信代理身份验证

受信代理模式允许 OpenClaw 网关将身份验证委托给上游反向代理。
代理对用户进行身份验证并设置包含已验证身份的标头。
网关信任该标头并跳过自身的令牌/密码验证。

> **仅限内部/零信任网络使用。**
> 如果网关可以从代理以外的来源访问，攻击者可以伪造该标头。

## 何时使用

- 您已经拥有一个处理身份验证的反向代理（Pomerium、Caddy + oauth2、nginx + OIDC、Traefik + ForwardAuth 等）。
- 您希望避免管理单独的 OpenClaw 令牌或密码来访问 Web UI / API。
- 您的部署在受信环境中运行（Tailscale、VPN 或私有网络）。

## 配置

### 最小配置

```yaml
gateway:
  auth:
    mode: "trusted-proxy"
    trustedProxy:
      headerName: "X-Forwarded-User"
```

### 完整选项

```yaml
gateway:
  auth:
    mode: "trusted-proxy"
    trustedProxy:
      headerName: "X-Forwarded-User" # 必填：包含已验证身份的标头
      allowedValues: # 可选：将访问限制为特定身份
        - "alice@example.com"
        - "bob@example.com"
      stripHeader: true # 默认 true：从代理上游请求中移除标头
      requireTls: true # 默认 true：拒绝非 TLS 连接
```

## 工作原理

1. 客户端请求到达您的反向代理。
2. 代理对用户进行身份验证（OAuth2、OIDC、mTLS 等）。
3. 代理设置配置的标头（例如 `X-Forwarded-User: alice@example.com`）并转发请求。
4. OpenClaw 网关读取标头，跳过令牌/密码检查，并将请求与标识的用户关联。

## 代理设置示例

### Pomerium

```yaml
routes:
  - from: https://openclaw.internal.example.com
    to: http://localhost:3000
    policy:
      - allow:
          or:
            - email:
                is: alice@example.com
            - email:
                is: bob@example.com
    set_request_headers:
      X-Forwarded-User: "${pomerium.email}"
```

### Caddy

```caddyfile
openclaw.internal.example.com {
    forward_auth authelia:9091 {
        uri /api/verify?rd=https://auth.example.com
        copy_headers Remote-User
    }
    reverse_proxy localhost:3000
}
```

OpenClaw 配置使用 `headerName: "Remote-User"`。

### nginx + OAuth2 Proxy

```nginx
server {
    listen 443 ssl;
    server_name openclaw.internal.example.com;

    location /oauth2/ {
        proxy_pass http://127.0.0.1:4180;
    }

    location / {
        auth_request /oauth2/auth;
        auth_request_set $user $upstream_http_x_auth_request_email;
        proxy_set_header X-Forwarded-User $user;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

### Traefik + ForwardAuth

```yaml
http:
  middlewares:
    auth:
      forwardAuth:
        address: "http://authelia:9091/api/verify?rd=https://auth.example.com"
        authResponseHeaders:
          - "Remote-User"
  routers:
    openclaw:
      rule: "Host(`openclaw.internal.example.com`)"
      middlewares:
        - auth
      service: openclaw
  services:
    openclaw:
      loadBalancer:
        servers:
          - url: "http://localhost:3000"
```

## 安全清单

- [ ] 网关绑定到 `127.0.0.1` 或私有网络接口（不是 `0.0.0.0`），除非只有代理可以到达。
- [ ] 代理是唯一能到达网关端口的网络路径。
- [ ] `stripHeader: true`（默认），这样代理发送前会移除任何预先存在的 `X-Forwarded-User`。
- [ ] `requireTls: true`（默认），除非代理和网关之间是同一主机的回环通信。
- [ ] 如果使用 `allowedValues`，列表仅包含预期用户。
- [ ] 代理本身强制执行 TLS 终止和 HSTS。

## TLS 和 HSTS 指南

### 代理 ↔ 网关通信

- 如果代理和网关在 **同一主机** 上并通过 `127.0.0.1` 通信，则此路径可以不加密。设置 `requireTls: false`。
- 如果它们在 **不同主机** 上，在代理和网关之间使用 TLS 或安全隧道。

### 客户端 ↔ 代理通信

始终由代理终止 TLS。在代理上启用 HSTS 以防止降级攻击：

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### 流量示意图

```
客户端 ──TLS──▶ 代理 ──可选 TLS / 回环──▶ 网关 (127.0.0.1:3000)
```

## 故障排除

### 匿名请求仍然通过

- 验证代理在 **所有** 请求路径中设置了标头，包括 WebSocket 升级。
- 确认 `headerName` 与代理发送的标头完全匹配（区分大小写）。

### 403 被禁止但标头存在

- 检查 `allowedValues` 是否包含代理发送的确切值。
- 检查值中是否有多余空格或大小写不匹配。

### WebSocket 未认证

- 某些代理不转发 WebSocket 升级的标头。检查代理文档中的 WebSocket 特定配置。
- Pomerium 和 Caddy 默认转发标头。nginx 需要显式的 `proxy_set_header` 用于升级请求。

### 标头被覆盖

- 确保 `stripHeader: true` 以便网关在检查前移除客户端提供的标头。
- 验证代理设置标头的位置在身份验证 **之后**，而不是之前。

## 与其他认证模式的比较

| 功能             | 令牌/密码 | Tailscale            | 受信代理           |
| ---------------- | --------- | -------------------- | ------------------ |
| 需要代理         | 否        | 否                   | 是                 |
| 每用户身份       | 否        | 是（Tailscale 用户） | 是（通过代理标头） |
| 零配置设置       | 否        | 部分                 | 否                 |
| 适用于公共互联网 | 是        | 是                   | 需要谨慎配置       |
| SSO 集成         | 否        | 通过 Tailscale       | 是（代理处理）     |
