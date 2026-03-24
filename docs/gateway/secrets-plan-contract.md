---
summary: "SecretRef 计划文件结构和合约细节"
read_when:
  - 调试 `secrets configure` 的计划生成或验证逻辑
  - 扩展计划到新的目标类型
title: "SecretRef 计划合约"
---

# SecretRef 计划合约

本页面记录 `secrets configure` 生成、 `secrets apply` 消费的计划文件结构和验证规则。

## 计划文件结构

计划是一个有序的条目数组。每个条目描述一个凭证操作。

```ts
type PlanEntry = {
  target:
    | { type: "config"; path: string } // openclaw.json 路径
    | {
        type: "auth-profile";
        profileId: string;
        field: "key" | "token";
        agentId?: string;
      };
  source:
    | { type: "manual" } // 用户手动提供
    | { type: "env"; envVar: string } // 从环境变量解析
    | { type: "secretRef"; refName: string }; // 从 SecretRef 后端解析
  status: "pending" | "done" | "skipped" | "failed";
  reason?: string;
};
```

## 目标类型

### `config`

用于 `openclaw.json` 凭证路径。

- `path` 使用点号表示法（例如 `models.providers.openai.apiKey`）。
- 通配符路径中的 `*` 匹配恰好一个键段。
- 路径必须存在于支持的凭证表面中（参见 [SecretRef 凭证表面](/reference/secretref-credential-surface)）。

### `auth-profile`

用于 `auth-profiles.json` 凭证。

- `profileId` 标识认证配置文件条目。
- `field` 是 `"key"`（API 密钥）或 `"token"`（令牌）。
- `agentId` 是可选的代理范围。

## 来源类型

- `manual`：用户在向导期间交互式提供值。
- `env`：值从环境变量获取。
- `secretRef`：值在运行时从 SecretRef 后端解析。

## 路径验证

计划生成使用受支持凭证表面列表验证路径。

- 不在支持列表中的路径会被拒绝。
- 支持的路径包含通配符（`*`）以匹配动态段。
- 通配符匹配使用逐段比较。

## 状态生命周期

1. `secrets configure` 生成所有条目为 `pending` 的计划。
2. `secrets apply` 按序处理条目。
3. 每个条目根据结果转为 `done`、`skipped` 或 `failed`。
4. `secrets audit` 报告应用后各条目的状态。

## 失败行为

## Exec provider consent behavior

- `--dry-run` skips exec SecretRef checks by default.
- Plans containing exec SecretRefs/providers are rejected in write mode unless `--allow-exec` is set.
- When validating/applying exec-containing plans, pass `--allow-exec` in both dry-run and write commands.

## Runtime and audit scope notes

## 审计输出

`secrets audit` 会针对每个计划条目报告：

- 路径或配置文件 ID
- 当前状态（`done`、`skipped`、`failed`、`pending`）
- 是否配置了 SecretRef 后端
- 凭证是否存在于目标中

# Then apply for real
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json

# For exec-containing plans, opt in explicitly in both modes
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --dry-run --allow-exec
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --allow-exec
```

If apply fails with an invalid target path message, regenerate the plan with `openclaw secrets configure` or fix the target path to a supported shape above.

## Related docs

- [Secrets Management](/gateway/secrets)
- [CLI `secrets`](/cli/secrets)
- [SecretRef Credential Surface](/reference/secretref-credential-surface)
- [Configuration Reference](/gateway/configuration-reference)
