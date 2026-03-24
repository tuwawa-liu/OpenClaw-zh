---
read_when: You want a dedicated explanation of sandboxing or need to tune agents.defaults.sandbox.
status: active
summary: OpenClaw 沙箱隔离的工作原理：模式、作用域、工作区访问和镜像
title: 沙箱隔离
x-i18n:
  generated_at: "2026-02-03T07:49:29Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 184fc53001fc6b2847bbb1963cc9c54475d62f74555a581a262a448a0333a209
  source_path: gateway/sandboxing.md
  workflow: 15
---

# 沙箱隔离

OpenClaw can run **tools inside sandbox backends** to reduce blast radius.
This is **optional** and controlled by configuration (`agents.defaults.sandbox` or
`agents.list[].sandbox`). If sandboxing is off, tools run on the host.
The Gateway stays on the host; tool execution runs in an isolated sandbox
when enabled.

这不是完美的安全边界，但当模型做出愚蠢行为时，它实质性地限制了文件系统和进程访问。

## 什么会被沙箱隔离

- 工具执行（`exec`、`read`、`write`、`edit`、`apply_patch`、`process` 等）。
- 可选的沙箱浏览器（`agents.defaults.sandbox.browser`）。
  - 默认情况下，当浏览器工具需要时，沙箱浏览器会自动启动（确保 CDP 可达）。
    通过 `agents.defaults.sandbox.browser.autoStart` 和 `agents.defaults.sandbox.browser.autoStartTimeoutMs` 配置。
  - `agents.defaults.sandbox.browser.allowHostControl` 允许沙箱会话显式定位主机浏览器。
  - 可选的允许列表限制 `target: "custom"`：`allowedControlUrls`、`allowedControlHosts`、`allowedControlPorts`。

不被沙箱隔离：

- Gateway 网关进程本身。
- 任何明确允许在主机上运行的工具（例如 `tools.elevated`）。
  - **提权 exec 在主机上运行并绕过沙箱隔离。**
  - 如果沙箱隔离关闭，`tools.elevated` 不会改变执行（已经在主机上）。参见[提权模式](/tools/elevated)。

## 模式

`agents.defaults.sandbox.mode` 控制**何时**使用沙箱隔离：

- `"off"`：不使用沙箱隔离。
- `"non-main"`：仅沙箱隔离**非主**会话（如果你想让普通聊天在主机上运行，这是默认值）。
- `"all"`：每个会话都在沙箱中运行。
  注意：`"non-main"` 基于 `session.mainKey`（默认 `"main"`），而不是智能体 ID。
  群组/频道会话使用它们自己的键，因此它们算作非主会话并将被沙箱隔离。

## 作用域

`agents.defaults.sandbox.scope` 控制**创建多少容器**：

- `"session"`（默认）：每个会话一个容器。
- `"agent"`：每个智能体一个容器。
- `"shared"`：所有沙箱会话共享一个容器。

## Backend

`agents.defaults.sandbox.backend` controls **which runtime** provides the sandbox:

- `"docker"` (default): local Docker-backed sandbox runtime.
- `"ssh"`: generic SSH-backed remote sandbox runtime.
- `"openshell"`: OpenShell-backed sandbox runtime.

SSH-specific config lives under `agents.defaults.sandbox.ssh`.
OpenShell-specific config lives under `plugins.entries.openshell.config`.

### Choosing a backend

|                     | Docker                           | SSH                            | OpenShell                                           |
| ------------------- | -------------------------------- | ------------------------------ | --------------------------------------------------- |
| **Where it runs**   | Local container                  | Any SSH-accessible host        | OpenShell managed sandbox                           |
| **Setup**           | `scripts/sandbox-setup.sh`       | SSH key + target host          | OpenShell plugin enabled                            |
| **Workspace model** | Bind-mount or copy               | Remote-canonical (seed once)   | `mirror` or `remote`                                |
| **Network control** | `docker.network` (default: none) | Depends on remote host         | Depends on OpenShell                                |
| **Browser sandbox** | Supported                        | Not supported                  | Not supported yet                                   |
| **Bind mounts**     | `docker.binds`                   | N/A                            | N/A                                                 |
| **Best for**        | Local dev, full isolation        | Offloading to a remote machine | Managed remote sandboxes with optional two-way sync |

### SSH backend

Use `backend: "ssh"` when you want OpenClaw to sandbox `exec`, file tools, and media reads on
an arbitrary SSH-accessible machine.

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "all",
        backend: "ssh",
        scope: "session",
        workspaceAccess: "rw",
        ssh: {
          target: "user@gateway-host:22",
          workspaceRoot: "/tmp/openclaw-sandboxes",
          strictHostKeyChecking: true,
          updateHostKeys: true,
          identityFile: "~/.ssh/id_ed25519",
          certificateFile: "~/.ssh/id_ed25519-cert.pub",
          knownHostsFile: "~/.ssh/known_hosts",
          // Or use SecretRefs / inline contents instead of local files:
          // identityData: { source: "env", provider: "default", id: "SSH_IDENTITY" },
          // certificateData: { source: "env", provider: "default", id: "SSH_CERTIFICATE" },
          // knownHostsData: { source: "env", provider: "default", id: "SSH_KNOWN_HOSTS" },
        },
      },
    },
  },
}
```

How it works:

- OpenClaw creates a per-scope remote root under `sandbox.ssh.workspaceRoot`.
- On first use after create or recreate, OpenClaw seeds that remote workspace from the local workspace once.
- After that, `exec`, `read`, `write`, `edit`, `apply_patch`, prompt media reads, and inbound media staging run directly against the remote workspace over SSH.
- OpenClaw does not sync remote changes back to the local workspace automatically.

Authentication material:

- `identityFile`, `certificateFile`, `knownHostsFile`: use existing local files and pass them through OpenSSH config.
- `identityData`, `certificateData`, `knownHostsData`: use inline strings or SecretRefs. OpenClaw resolves them through the normal secrets runtime snapshot, writes them to temp files with `0600`, and deletes them when the SSH session ends.
- If both `*File` and `*Data` are set for the same item, `*Data` wins for that SSH session.

This is a **remote-canonical** model. The remote SSH workspace becomes the real sandbox state after the initial seed.

Important consequences:

- Host-local edits made outside OpenClaw after the seed step are not visible remotely until you recreate the sandbox.
- `openclaw sandbox recreate` deletes the per-scope remote root and seeds again from local on next use.
- Browser sandboxing is not supported on the SSH backend.
- `sandbox.docker.*` settings do not apply to the SSH backend.

### OpenShell backend

Use `backend: "openshell"` when you want OpenClaw to sandbox tools in an
OpenShell-managed remote environment. For the full setup guide, configuration
reference, and workspace mode comparison, see the dedicated
[OpenShell page](/gateway/openshell).

OpenShell reuses the same core SSH transport and remote filesystem bridge as the
generic SSH backend, and adds OpenShell-specific lifecycle
(`sandbox create/get/delete`, `sandbox ssh-config`) plus the optional `mirror`
workspace mode.

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "all",
        backend: "openshell",
        scope: "session",
        workspaceAccess: "rw",
      },
    },
  },
  plugins: {
    entries: {
      openshell: {
        enabled: true,
        config: {
          from: "openclaw",
          mode: "remote", // mirror | remote
          remoteWorkspaceDir: "/sandbox",
          remoteAgentWorkspaceDir: "/agent",
        },
      },
    },
  },
}
```

OpenShell modes:

- `mirror` (default): local workspace stays canonical. OpenClaw syncs local files into OpenShell before exec and syncs the remote workspace back after exec.
- `remote`: OpenShell workspace is canonical after the sandbox is created. OpenClaw seeds the remote workspace once from the local workspace, then file tools and exec run directly against the remote sandbox without syncing changes back.

Remote transport details:

- OpenClaw asks OpenShell for sandbox-specific SSH config via `openshell sandbox ssh-config <name>`.
- Core writes that SSH config to a temp file, opens the SSH session, and reuses the same remote filesystem bridge used by `backend: "ssh"`.
- In `mirror` mode only the lifecycle differs: sync local to remote before exec, then sync back after exec.

Current OpenShell limitations:

- sandbox browser is not supported yet
- `sandbox.docker.binds` is not supported on the OpenShell backend
- Docker-specific runtime knobs under `sandbox.docker.*` still apply only to the Docker backend

#### Workspace modes

OpenShell has two workspace models. This is the part that matters most in practice.

##### `mirror`

Use `plugins.entries.openshell.config.mode: "mirror"` when you want the **local workspace to stay canonical**.

Behavior:

- Before `exec`, OpenClaw syncs the local workspace into the OpenShell sandbox.
- After `exec`, OpenClaw syncs the remote workspace back to the local workspace.
- File tools still operate through the sandbox bridge, but the local workspace remains the source of truth between turns.

Use this when:

- you edit files locally outside OpenClaw and want those changes to show up in the sandbox automatically
- you want the OpenShell sandbox to behave as much like the Docker backend as possible
- you want the host workspace to reflect sandbox writes after each exec turn

Tradeoff:

- extra sync cost before and after exec

##### `remote`

Use `plugins.entries.openshell.config.mode: "remote"` when you want the **OpenShell workspace to become canonical**.

Behavior:

- When the sandbox is first created, OpenClaw seeds the remote workspace from the local workspace once.
- After that, `exec`, `read`, `write`, `edit`, and `apply_patch` operate directly against the remote OpenShell workspace.
- OpenClaw does **not** sync remote changes back into the local workspace after exec.
- Prompt-time media reads still work because file and media tools read through the sandbox bridge instead of assuming a local host path.
- Transport is SSH into the OpenShell sandbox returned by `openshell sandbox ssh-config`.

Important consequences:

- If you edit files on the host outside OpenClaw after the seed step, the remote sandbox will **not** see those changes automatically.
- If the sandbox is recreated, the remote workspace is seeded from the local workspace again.
- With `scope: "agent"` or `scope: "shared"`, that remote workspace is shared at that same scope.

Use this when:

- the sandbox should live primarily on the remote OpenShell side
- you want lower per-turn sync overhead
- you do not want host-local edits to silently overwrite remote sandbox state

Choose `mirror` if you think of the sandbox as a temporary execution environment.
Choose `remote` if you think of the sandbox as the real workspace.

#### OpenShell lifecycle

OpenShell sandboxes are still managed through the normal sandbox lifecycle:

- `openclaw sandbox list` shows OpenShell runtimes as well as Docker runtimes
- `openclaw sandbox recreate` deletes the current runtime and lets OpenClaw recreate it on next use
- prune logic is backend-aware too

For `remote` mode, recreate is especially important:

- recreate deletes the canonical remote workspace for that scope
- the next use seeds a fresh remote workspace from the local workspace

For `mirror` mode, recreate mainly resets the remote execution environment
because the local workspace remains canonical anyway.

## Workspace access

`agents.defaults.sandbox.workspaceAccess` 控制**沙箱可以看到什么**：

- `"none"`（默认）：工具看到 `~/.openclaw/sandboxes` 下的沙箱工作区。
- `"ro"`：以只读方式在 `/agent` 挂载智能体工作区（禁用 `write`/`edit`/`apply_patch`）。
- `"rw"`：以读写方式在 `/workspace` 挂载智能体工作区。

With the OpenShell backend:

- `mirror` mode still uses the local workspace as the canonical source between exec turns
- `remote` mode uses the remote OpenShell workspace as the canonical source after the initial seed
- `workspaceAccess: "ro"` and `"none"` still restrict write behavior the same way

Inbound media is copied into the active sandbox workspace (`media/inbound/*`).
Skills note: the `read` tool is sandbox-rooted. With `workspaceAccess: "none"`,
OpenClaw mirrors eligible skills into the sandbox workspace (`.../skills`) so
they can be read. With `"rw"`, workspace skills are readable from
`/workspace/skills`.

## 自定义绑定挂载

`agents.defaults.sandbox.docker.binds` 将额外的主机目录挂载到容器中。
格式：`host:container:mode`（例如 `"/home/user/source:/source:rw"`）。

全局和每智能体的绑定是**合并**的（不是替换）。在 `scope: "shared"` 下，每智能体的绑定被忽略。

示例（只读源码 + docker 套接字）：

```json5
{
  agents: {
    defaults: {
      sandbox: {
        docker: {
          binds: ["/home/user/source:/source:ro", "/var/run/docker.sock:/var/run/docker.sock"],
        },
      },
    },
    list: [
      {
        id: "build",
        sandbox: {
          docker: {
            binds: ["/mnt/cache:/cache:rw"],
          },
        },
      },
    ],
  },
}
```

安全注意事项：

- 绑定绕过沙箱文件系统：它们以你设置的任何模式（`:ro` 或 `:rw`）暴露主机路径。
- 敏感挂载（例如 `docker.sock`、密钥、SSH 密钥）应该是 `:ro`，除非绝对必要。
- 如果你只需要对工作区的读取访问，请结合 `workspaceAccess: "ro"`；绑定模式保持独立。
- 参见[沙箱 vs 工具策略 vs 提权](/gateway/sandbox-vs-tool-policy-vs-elevated)了解绑定如何与工具策略和提权 exec 交互。

## 镜像 + 设置

Default Docker image: `openclaw-sandbox:bookworm-slim`

构建一次：

```bash
scripts/sandbox-setup.sh
```

注意：默认镜像**不**包含 Node。如果 Skills 需要 Node（或其他运行时），要么构建自定义镜像，要么通过 `sandbox.docker.setupCommand` 安装（需要网络出口 + 可写根 + root 用户）。

沙箱浏览器镜像：

```bash
scripts/sandbox-browser-setup.sh
```

By default, Docker sandbox containers run with **no network**.
Override with `agents.defaults.sandbox.docker.network`.

Docker 安装和容器化 Gateway 网关在此：
[Docker](/install/docker)

For Docker gateway deployments, `scripts/docker/setup.sh` can bootstrap sandbox config.
Set `OPENCLAW_SANDBOX=1` (or `true`/`yes`/`on`) to enable that path. You can
override socket location with `OPENCLAW_DOCKER_SOCKET`. Full setup and env
reference: [Docker](/install/docker#enable-agent-sandbox-for-docker-gateway).

`setupCommand` 在沙箱容器创建后**运行一次**（不是每次运行）。
它通过 `sh -lc` 在容器内执行。

路径：

- 全局：`agents.defaults.sandbox.docker.setupCommand`
- 每智能体：`agents.list[].sandbox.docker.setupCommand`

常见陷阱：

- 默认 `docker.network` 是 `"none"`（无出口），因此包安装会失败。
- `readOnlyRoot: true` 阻止写入；设置 `readOnlyRoot: false` 或构建自定义镜像。
- `user` 必须是 root 才能安装包（省略 `user` 或设置 `user: "0:0"`）。
- 沙箱 exec **不**继承主机 `process.env`。使用 `agents.defaults.sandbox.docker.env`（或自定义镜像）设置 Skills API 密钥。

## 工具策略 + 逃逸通道

工具允许/拒绝策略仍在沙箱规则之前应用。如果工具在全局或每智能体被拒绝，沙箱隔离不会恢复它。

`tools.elevated` 是一个显式的逃逸通道，在主机上运行 `exec`。
`/exec` 指令仅适用于授权发送者并按会话持久化；要硬禁用 `exec`，使用工具策略拒绝（参见[沙箱 vs 工具策略 vs 提权](/gateway/sandbox-vs-tool-policy-vs-elevated)）。

调试：

- 使用 `openclaw sandbox explain` 检查生效的沙箱模式、工具策略和修复配置键。
- 参见[沙箱 vs 工具策略 vs 提权](/gateway/sandbox-vs-tool-policy-vs-elevated)了解"为什么被阻止？"的心智模型。
  保持锁定。

## 多智能体覆盖

每个智能体可以覆盖沙箱 + 工具：
`agents.list[].sandbox` 和 `agents.list[].tools`（加上 `agents.list[].tools.sandbox.tools` 用于沙箱工具策略）。
参见[多智能体沙箱与工具](/tools/multi-agent-sandbox-tools)了解优先级。

## 最小启用示例

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main",
        scope: "session",
        workspaceAccess: "none",
      },
    },
  },
}
```

## 相关文档

- [OpenShell](/gateway/openshell) -- managed sandbox backend setup, workspace modes, and config reference
- [Sandbox Configuration](/gateway/configuration-reference#agentsdefaultssandbox)
- [Sandbox vs Tool Policy vs Elevated](/gateway/sandbox-vs-tool-policy-vs-elevated) -- debugging "why is this blocked?"
- [Multi-Agent Sandbox & Tools](/tools/multi-agent-sandbox-tools) -- per-agent overrides and precedence
- [Security](/gateway/security)
