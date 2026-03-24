---
summary: "`openclaw secrets` 的 CLI 参考（reload、audit、configure、apply）"
read_when:
  - 在运行时重新解析密钥引用
  - 审计明文残留和未解析的引用
  - 配置 SecretRef 并应用单向清理更改
title: "secrets"
---

# `openclaw secrets`

使用 `openclaw secrets` 管理 SecretRef 并保持活动运行时快照健康。

命令角色：

- `reload`: gateway RPC (`secrets.reload`) that re-resolves refs and swaps runtime snapshot only on full success (no config writes).
- `audit`: read-only scan of configuration/auth/generated-model stores and legacy residues for plaintext, unresolved refs, and precedence drift (exec refs are skipped unless `--allow-exec` is set).
- `configure`: interactive planner for provider setup, target mapping, and preflight (TTY required).
- `apply`: execute a saved plan (`--dry-run` for validation only; dry-run skips exec checks by default, and write mode rejects exec-containing plans unless `--allow-exec` is set), then scrub targeted plaintext residues.

推荐的操作循环：

```bash
openclaw secrets audit --check
openclaw secrets configure
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --dry-run
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json
openclaw secrets audit --check
openclaw secrets reload
```

If your plan includes `exec` SecretRefs/providers, pass `--allow-exec` on both dry-run and write apply commands.

Exit code note for CI/gates:

- `audit --check` 在有发现时返回 `1`。
- 未解析的引用返回 `2`。

相关：

- 密钥管理指南：[密钥管理](/gateway/secrets)
- 凭证界面：[SecretRef 凭证界面](/reference/secretref-credential-surface)
- 安全指南：[安全](/gateway/security)

## 重载运行时快照

重新解析密钥引用并原子性地交换运行时快照。

```bash
openclaw secrets reload
openclaw secrets reload --json
```

说明：

- 使用 Gateway RPC 方法 `secrets.reload`。
- 如果解析失败，Gateway 保持最后已知良好快照并返回错误（不会部分激活）。
- JSON 响应包含 `warningCount`。

## 审计

扫描 OpenClaw 状态以查找：

- 明文密钥存储
- 未解析的引用
- 优先级偏移（`auth-profiles.json` 凭证遮蔽 `openclaw.json` 引用）
- 旧版残留（旧版认证存储条目、OAuth 提醒）

```bash
openclaw secrets audit
openclaw secrets audit --check
openclaw secrets audit --json
openclaw secrets audit --allow-exec
```

退出行为：

- `--check` 在有发现时以非零退出。
- 未解析引用以更高优先级的非零代码退出。

报告结构亮点：

- `status`: `clean | findings | unresolved`
- `resolution`: `refsChecked`, `skippedExecRefs`, `resolvabilityComplete`
- `summary`: `plaintextCount`, `unresolvedRefCount`, `shadowedRefCount`, `legacyResidueCount`
- finding codes:
  - `PLAINTEXT_FOUND`
  - `REF_UNRESOLVED`
  - `REF_SHADOWED`
  - `LEGACY_RESIDUE`

## 配置（交互式助手）

交互式构建提供商和 SecretRef 更改、运行预检，并可选择性应用：

```bash
openclaw secrets configure
openclaw secrets configure --plan-out /tmp/openclaw-secrets-plan.json
openclaw secrets configure --apply --yes
openclaw secrets configure --providers-only
openclaw secrets configure --skip-provider-setup
openclaw secrets configure --agent ops
openclaw secrets configure --json
```

流程：

- 先进行提供商设置（`secrets.providers` 别名的 `add/edit/remove`）。
- 然后进行凭证映射（选择字段并分配 `{source, provider, id}` 引用）。
- 最后进行预检和可选应用。

标志：

- `--providers-only`: configure `secrets.providers` only, skip credential mapping.
- `--skip-provider-setup`: skip provider setup and map credentials to existing providers.
- `--agent <id>`: scope `auth-profiles.json` target discovery and writes to one agent store.
- `--allow-exec`: allow exec SecretRef checks during preflight/apply (may execute provider commands).

说明：

- Requires an interactive TTY.
- You cannot combine `--providers-only` with `--skip-provider-setup`.
- `configure` targets secret-bearing fields in `openclaw.json` plus `auth-profiles.json` for the selected agent scope.
- `configure` supports creating new `auth-profiles.json` mappings directly in the picker flow.
- Canonical supported surface: [SecretRef Credential Surface](/reference/secretref-credential-surface).
- It performs preflight resolution before apply.
- If preflight/apply includes exec refs, keep `--allow-exec` set for both steps.
- Generated plans default to scrub options (`scrubEnv`, `scrubAuthProfilesForProviderTargets`, `scrubLegacyAuthJson` all enabled).
- Apply path is one-way for scrubbed plaintext values.
- Without `--apply`, CLI still prompts `Apply this plan now?` after preflight.
- With `--apply` (and no `--yes`), CLI prompts an extra irreversible confirmation.

Exec 提供商安全说明：

- Homebrew 安装通常在 `/opt/homebrew/bin/*` 下暴露符号链接的二进制文件。
- 仅在需要信任的包管理器路径时设置 `allowSymlinkCommand: true`，并配合 `trustedDirs`（例如 `["/opt/homebrew"]`）使用。
- 在 Windows 上，如果提供商路径的 ACL 验证不可用，OpenClaw 会安全失败。仅对信任的路径，在该提供商上设置 `allowInsecurePath: true` 以绕过路径安全检查。

## 应用保存的计划

应用或预检之前生成的计划：

```bash
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --allow-exec
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --dry-run
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --dry-run --allow-exec
openclaw secrets apply --from /tmp/openclaw-secrets-plan.json --json
```

Exec behavior:

- `--dry-run` validates preflight without writing files.
- exec SecretRef checks are skipped by default in dry-run.
- write mode rejects plans that contain exec SecretRefs/providers unless `--allow-exec` is set.
- Use `--allow-exec` to opt in to exec provider checks/execution in either mode.

Plan contract details (allowed target paths, validation rules, and failure semantics):

- [密钥应用计划契约](/gateway/secrets-plan-contract)

`apply` 可能更新的内容：

- `openclaw.json`（SecretRef 目标 + 提供商增删改）
- `auth-profiles.json`（提供商目标清理）
- 旧版 `auth.json` 残留
- `~/.openclaw/.env` 中已迁移值的已知密钥键

## 为什么没有回滚备份

`secrets apply` 故意不写入包含旧明文值的回滚备份。

安全性来自严格的预检 + 原子性的应用，以及失败时的尽力内存恢复。

## 示例

```bash
openclaw secrets audit --check
openclaw secrets configure
openclaw secrets audit --check
```

如果 `audit --check` 仍报告明文发现，请更新剩余报告的目标路径并重新运行审计。
