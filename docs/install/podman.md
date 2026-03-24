---
summary: "在无根 Podman 容器中运行 OpenClaw"
read_when:
  - 想使用 Podman 而非 Docker 运行容器化的 Gateway
title: "Podman"
---

# Podman

Run the OpenClaw Gateway in a **rootless** Podman container. Uses the same image as Docker (built from the repo [Dockerfile](https://github.com/openclaw/openclaw/blob/main/Dockerfile)).

## Prerequisites

- **Podman** (rootless mode)
- **sudo** access for one-time setup (creating the dedicated user and building the image)

## 快速开始

<Steps>
  <Step title="One-time setup">
    From the repo root, run the setup script. It creates a dedicated `openclaw` user, builds the container image, and installs the launch script:

    ```bash
    ./scripts/podman/setup.sh
    ```

    This also creates a minimal config at `~openclaw/.openclaw/openclaw.json` (sets `gateway.mode` to `"local"`) so the Gateway can start without running the wizard.

    By default the container is **not** installed as a systemd service -- you start it manually in the next step. For a production-style setup with auto-start and restarts, pass `--quadlet` instead:

    ```bash
    ./scripts/podman/setup.sh --quadlet
    ```

    (Or set `OPENCLAW_PODMAN_QUADLET=1`. Use `--container` to install only the container and launch script.)

    **Optional build-time env vars** (set before running `scripts/podman/setup.sh`):

    - `OPENCLAW_DOCKER_APT_PACKAGES` -- install extra apt packages during image build.
    - `OPENCLAW_EXTENSIONS` -- pre-install extension dependencies (space-separated names, e.g. `diagnostics-otel matrix`).

  </Step>

  <Step title="Start the Gateway">
    For a quick manual launch:

    ```bash
    ./scripts/run-openclaw-podman.sh launch
    ```

  </Step>

  <Step title="Run the onboarding wizard">
    To add channels or providers interactively:

    ```bash
    ./scripts/run-openclaw-podman.sh launch setup
    ```

    Then open `http://127.0.0.1:18789/` and use the token from `~openclaw/.openclaw/.env` (or the value printed by setup).

  </Step>
</Steps>

## Systemd（Quadlet，可选）

If you ran `./scripts/podman/setup.sh --quadlet` (or `OPENCLAW_PODMAN_QUADLET=1`), a [Podman Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit is installed so the gateway runs as a systemd user service for the openclaw user. The service is enabled and started at the end of setup.

- **启动：** `sudo systemctl --machine openclaw@ --user start openclaw.service`
- **停止：** `sudo systemctl --machine openclaw@ --user stop openclaw.service`
- **状态：** `sudo systemctl --machine openclaw@ --user status openclaw.service`
- **日志：** `sudo journalctl --machine openclaw@ --user -u openclaw.service -f`

Quadlet 文件位于 `~openclaw/.config/containers/systemd/openclaw.container`。要更改端口或环境变量，编辑该文件（或其引用的 `.env`），然后 `sudo systemctl --machine openclaw@ --user daemon-reload` 并重启服务。开机时，如果为 openclaw 启用了 lingering（setup 在 loginctl 可用时会执行此操作），服务会自动启动。

To add quadlet **after** an initial setup that did not use it, re-run: `./scripts/podman/setup.sh --quadlet`.

## openclaw 用户（非登录）

`scripts/podman/setup.sh` creates a dedicated system user `openclaw`:

- **Shell：** `nologin` — 不允许交互式登录；减少攻击面。
- **主目录：** 例如 `/home/openclaw` — 存放 `~/.openclaw`（配置、工作区）和启动脚本 `run-openclaw-podman.sh`。
- **无根 Podman：** 该用户必须拥有 **subuid** 和 **subgid** 范围。许多发行版在创建用户时会自动分配。如果 setup 打印警告，请在 `/etc/subuid` 和 `/etc/subgid` 中添加行：

  ```text
  openclaw:100000:65536
  ```

  然后以该用户身份启动 Gateway（例如通过 cron 或 systemd）：

  ```bash
  sudo -u openclaw /home/openclaw/run-openclaw-podman.sh
  sudo -u openclaw /home/openclaw/run-openclaw-podman.sh setup
  ```

- **配置：** 只有 `openclaw` 和 root 可以访问 `/home/openclaw/.openclaw`。要编辑配置：在 Gateway 运行后使用控制面板 UI，或 `sudo -u openclaw $EDITOR /home/openclaw/.openclaw/openclaw.json`。

## 环境变量和配置

- **Token:** Stored in `~openclaw/.openclaw/.env` as `OPENCLAW_GATEWAY_TOKEN`. `scripts/podman/setup.sh` and `run-openclaw-podman.sh` generate it if missing (uses `openssl`, `python3`, or `od`).
- **Optional:** In that `.env` you can set provider keys (e.g. `GROQ_API_KEY`, `OLLAMA_API_KEY`) and other OpenClaw env vars.
- **Host ports:** By default the script maps `18789` (gateway) and `18790` (bridge). Override the **host** port mapping with `OPENCLAW_PODMAN_GATEWAY_HOST_PORT` and `OPENCLAW_PODMAN_BRIDGE_HOST_PORT` when launching.
- **Gateway bind:** By default, `run-openclaw-podman.sh` starts the gateway with `--bind loopback` for safe local access. To expose on LAN, set `OPENCLAW_GATEWAY_BIND=lan` and configure `gateway.controlUi.allowedOrigins` (or explicitly enable host-header fallback) in `openclaw.json`.
- **Paths:** Host config and workspace default to `~openclaw/.openclaw` and `~openclaw/.openclaw/workspace`. Override the host paths used by the launch script with `OPENCLAW_CONFIG_DIR` and `OPENCLAW_WORKSPACE_DIR`.

## 常用命令

- **日志：** 使用 Quadlet：`sudo journalctl --machine openclaw@ --user -u openclaw.service -f`。使用脚本：`sudo -u openclaw podman logs -f openclaw`
- **停止：** 使用 Quadlet：`sudo systemctl --machine openclaw@ --user stop openclaw.service`。使用脚本：`sudo -u openclaw podman stop openclaw`
- **重新启动：** 使用 Quadlet：`sudo systemctl --machine openclaw@ --user start openclaw.service`。使用脚本：重新运行启动脚本或 `podman start openclaw`
- **移除容器：** `sudo -u openclaw podman rm -f openclaw` — 主机上的配置和工作区会保留

`scripts/podman/setup.sh` now stages the image tar in a private temp directory and prints the chosen base dir during setup. For non-root runs it accepts `TMPDIR` only when that base is safe to use; otherwise it falls back to `/var/tmp`, then `/tmp`. The saved tar stays owner-only and is streamed into the target user’s `podman load`, so private caller temp dirs do not block setup.

- **配置或 auth-profiles 上的权限被拒绝（EACCES）：** 容器默认使用 `--userns=keep-id`，以运行脚本的主机用户相同的 uid/gid 运行。确保你的主机 `OPENCLAW_CONFIG_DIR` 和 `OPENCLAW_WORKSPACE_DIR` 属于该用户。
- **Gateway 启动被阻止（缺少 `gateway.mode=local`）：** 确保 `~openclaw/.openclaw/openclaw.json` 存在并设置了 `gateway.mode="local"`。`setup-podman.sh` 在缺失时会创建此文件。
- **openclaw 用户的无根 Podman 失败：** 检查 `/etc/subuid` 和 `/etc/subgid` 是否包含 `openclaw` 的行（如 `openclaw:100000:65536`）。缺失时添加并重启。
- **容器名称已被使用：** 启动脚本使用 `podman run --replace`，因此重新启动时会替换现有容器。手动清理：`podman rm -f openclaw`。
- **以 openclaw 身份运行时找不到脚本：** 确保已运行 `setup-podman.sh`，`run-openclaw-podman.sh` 会被复制到 openclaw 的主目录（如 `/home/openclaw/run-openclaw-podman.sh`）。
- **Quadlet 服务找不到或启动失败：** 编辑 `.container` 文件后运行 `sudo systemctl --machine openclaw@ --user daemon-reload`。Quadlet 需要 cgroups v2：`podman info --format '{{.Host.CgroupsVersion}}'` 应显示 `2`。

## 可选：以你自己的用户运行

## Troubleshooting

- **Permission denied (EACCES) on config or auth-profiles:** The container defaults to `--userns=keep-id` and runs as the same uid/gid as the host user running the script. Ensure your host `OPENCLAW_CONFIG_DIR` and `OPENCLAW_WORKSPACE_DIR` are owned by that user.
- **Gateway start blocked (missing `gateway.mode=local`):** Ensure `~openclaw/.openclaw/openclaw.json` exists and sets `gateway.mode="local"`. `scripts/podman/setup.sh` creates this file if missing.
- **Rootless Podman fails for user openclaw:** Check `/etc/subuid` and `/etc/subgid` contain a line for `openclaw` (e.g. `openclaw:100000:65536`). Add it if missing and restart.
- **Container name in use:** The launch script uses `podman run --replace`, so the existing container is replaced when you start again. To clean up manually: `podman rm -f openclaw`.
- **Script not found when running as openclaw:** Ensure `scripts/podman/setup.sh` was run so that `run-openclaw-podman.sh` is copied to openclaw’s home (e.g. `/home/openclaw/run-openclaw-podman.sh`).
- **Quadlet service not found or fails to start:** Run `sudo systemctl --machine openclaw@ --user daemon-reload` after editing the `.container` file. Quadlet requires cgroups v2: `podman info --format '{{.Host.CgroupsVersion}}'` should show `2`.

## Optional: run as your own user

To run the gateway as your normal user (no dedicated openclaw user): build the image, create `~/.openclaw/.env` with `OPENCLAW_GATEWAY_TOKEN`, and run the container with `--userns=keep-id` and mounts to your `~/.openclaw`. The launch script is designed for the openclaw-user flow; for a single-user setup you can instead run the `podman run` command from the script manually, pointing config and workspace to your home. Recommended for most users: use `scripts/podman/setup.sh` and run as the openclaw user so config and process are isolated.
