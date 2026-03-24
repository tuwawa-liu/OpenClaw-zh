---
read_when:
  - 你想在 GCP 上 24/7 运行 OpenClaw
  - 你想要在自己的 VM 上运行生产级、常驻的 Gateway 网关
  - 你想完全控制持久化、二进制文件和重启行为
summary: 在 GCP Compute Engine VM（Docker）上 24/7 运行 OpenClaw Gateway 网关并持久化状态
title: GCP
x-i18n:
  generated_at: "2026-02-03T07:52:50Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: abb236dd421505d307bb3869340c9a0c940de095b93af9ad1f130cc08a9deadb
  source_path: platforms/gcp.md
  workflow: 15
---

# 在 GCP Compute Engine 上运行 OpenClaw（Docker，生产 VPS 指南）

## 目标

使用 Docker 在 GCP Compute Engine VM 上运行持久化的 OpenClaw Gateway 网关，具有持久状态、内置二进制文件和安全的重启行为。

如果你想要"OpenClaw 24/7 大约 $5-12/月"，这是在 Google Cloud 上的可靠设置。
价格因机器类型和区域而异；选择适合你工作负载的最小 VM，如果遇到 OOM 则扩容。

## 我们在做什么（简单说明）？

- 创建 GCP 项目并启用计费
- 创建 Compute Engine VM
- 安装 Docker（隔离的应用运行时）
- 在 Docker 中启动 OpenClaw Gateway 网关
- 在主机上持久化 `~/.openclaw` + `~/.openclaw/workspace`（重启/重建后仍保留）
- 通过 SSH 隧道从你的笔记本电脑访问控制 UI

Gateway 网关可以通过以下方式访问：

- 从你的笔记本电脑进行 SSH 端口转发
- 如果你自己管理防火墙和令牌，可以直接暴露端口

本指南使用 GCP Compute Engine 上的 Debian。
Ubuntu 也可以；请相应地映射软件包。
有关通用 Docker 流程，请参阅 [Docker](/install/docker)。

---

## 快速路径（有经验的运维人员）

1. 创建 GCP 项目 + 启用 Compute Engine API
2. 创建 Compute Engine VM（e2-small，Debian 12，20GB）
3. SSH 进入 VM
4. 安装 Docker
5. 克隆 OpenClaw 仓库
6. 创建持久化主机目录
7. 配置 `.env` 和 `docker-compose.yml`
8. 内置所需二进制文件、构建并启动

---

## 你需要什么

- GCP 账户（e2-micro 符合免费层条件）
- 已安装 gcloud CLI（或使用 Cloud Console）
- 从你的笔记本电脑 SSH 访问
- 对 SSH + 复制/粘贴有基本了解
- 约 20-30 分钟
- Docker 和 Docker Compose
- 模型认证凭证
- 可选的提供商凭证
  - WhatsApp QR
  - Telegram bot token
  - Gmail OAuth

---

<Steps>
  <Step title="Install gcloud CLI (or use Console)">
    **Option A: gcloud CLI** (recommended for automation)

    Install from [https://cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)

    Initialize and authenticate:

    ```bash
    gcloud init
    gcloud auth login
    ```

    **Option B: Cloud Console**

    All steps can be done via the web UI at [https://console.cloud.google.com](https://console.cloud.google.com)

  </Step>

  <Step title="Create a GCP project">
    **CLI:**

    ```bash
    gcloud projects create my-openclaw-project --name="OpenClaw Gateway"
    gcloud config set project my-openclaw-project
    ```

    Enable billing at [https://console.cloud.google.com/billing](https://console.cloud.google.com/billing) (required for Compute Engine).

    Enable the Compute Engine API:

    ```bash
    gcloud services enable compute.googleapis.com
    ```

    **Console:**

    1. Go to IAM & Admin > Create Project
    2. Name it and create
    3. Enable billing for the project
    4. Navigate to APIs & Services > Enable APIs > search "Compute Engine API" > Enable

  </Step>

  <Step title="Create the VM">
    **Machine types:**

    | Type      | Specs                    | Cost               | Notes                                        |
    | --------- | ------------------------ | ------------------ | -------------------------------------------- |
    | e2-medium | 2 vCPU, 4GB RAM          | ~$25/mo            | Most reliable for local Docker builds        |
    | e2-small  | 2 vCPU, 2GB RAM          | ~$12/mo            | Minimum recommended for Docker build         |
    | e2-micro  | 2 vCPU (shared), 1GB RAM | Free tier eligible | Often fails with Docker build OOM (exit 137) |

    **CLI:**

    ```bash
    gcloud compute instances create openclaw-gateway \
      --zone=us-central1-a \
      --machine-type=e2-small \
      --boot-disk-size=20GB \
      --image-family=debian-12 \
      --image-project=debian-cloud
    ```

    **Console:**

    1. Go to Compute Engine > VM instances > Create instance
    2. Name: `openclaw-gateway`
    3. Region: `us-central1`, Zone: `us-central1-a`
    4. Machine type: `e2-small`
    5. Boot disk: Debian 12, 20GB
    6. Create

  </Step>

  <Step title="SSH into the VM">
    **CLI:**

    ```bash
    gcloud compute ssh openclaw-gateway --zone=us-central1-a
    ```

    **Console:**

    Click the "SSH" button next to your VM in the Compute Engine dashboard.

    Note: SSH key propagation can take 1-2 minutes after VM creation. If connection is refused, wait and retry.

  </Step>

  <Step title="Install Docker (on the VM)">
    ```bash
    sudo apt-get update
    sudo apt-get install -y git curl ca-certificates
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    ```

    Log out and back in for the group change to take effect:

    ```bash
    exit
    ```

    Then SSH back in:

    ```bash
    gcloud compute ssh openclaw-gateway --zone=us-central1-a
    ```

    Verify:

    ```bash
    docker --version
    docker compose version
    ```

  </Step>

  <Step title="Clone the OpenClaw repository">
    ```bash
    git clone https://github.com/openclaw/openclaw.git
    cd openclaw
    ```

    This guide assumes you will build a custom image to guarantee binary persistence.

  </Step>

  <Step title="Create persistent host directories">
    Docker containers are ephemeral.
    All long-lived state must live on the host.

    ```bash
    mkdir -p ~/.openclaw
    mkdir -p ~/.openclaw/workspace
    ```

  </Step>

  <Step title="Configure environment variables">
    Create `.env` in the repository root.

    ```bash
    OPENCLAW_IMAGE=openclaw:latest
    OPENCLAW_GATEWAY_TOKEN=change-me-now
    OPENCLAW_GATEWAY_BIND=lan
    OPENCLAW_GATEWAY_PORT=18789

    OPENCLAW_CONFIG_DIR=/home/$USER/.openclaw
    OPENCLAW_WORKSPACE_DIR=/home/$USER/.openclaw/workspace

    GOG_KEYRING_PASSWORD=change-me-now
    XDG_CONFIG_HOME=/home/node/.openclaw
    ```

    Generate strong secrets:

    ```bash
    openssl rand -hex 32
    ```

    **Do not commit this file.**

  </Step>

  <Step title="Docker Compose configuration">
    Create or update `docker-compose.yml`.

    ```yaml
    services:
      openclaw-gateway:
        image: ${OPENCLAW_IMAGE}
        build: .
        restart: unless-stopped
        env_file:
          - .env
        environment:
          - HOME=/home/node
          - NODE_ENV=production
          - TERM=xterm-256color
          - OPENCLAW_GATEWAY_BIND=${OPENCLAW_GATEWAY_BIND}
          - OPENCLAW_GATEWAY_PORT=${OPENCLAW_GATEWAY_PORT}
          - OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
          - GOG_KEYRING_PASSWORD=${GOG_KEYRING_PASSWORD}
          - XDG_CONFIG_HOME=${XDG_CONFIG_HOME}
          - PATH=/home/linuxbrew/.linuxbrew/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
        volumes:
          - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
          - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace
        ports:
          # Recommended: keep the Gateway loopback-only on the VM; access via SSH tunnel.
          # To expose it publicly, remove the `127.0.0.1:` prefix and firewall accordingly.
          - "127.0.0.1:${OPENCLAW_GATEWAY_PORT}:18789"
        command:
          [
            "node",
            "dist/index.js",
            "gateway",
            "--bind",
            "${OPENCLAW_GATEWAY_BIND}",
            "--port",
            "${OPENCLAW_GATEWAY_PORT}",
            "--allow-unconfigured",
          ]
    ```

    `--allow-unconfigured` is only for bootstrap convenience, it is not a replacement for a proper gateway configuration. Still set auth (`gateway.auth.token` or password) and use safe bind settings for your deployment.

  </Step>

  <Step title="Shared Docker VM runtime steps">
    Use the shared runtime guide for the common Docker host flow:

    - [Bake required binaries into the image](/install/docker-vm-runtime#bake-required-binaries-into-the-image)
    - [Build and launch](/install/docker-vm-runtime#build-and-launch)
    - [What persists where](/install/docker-vm-runtime#what-persists-where)
    - [Updates](/install/docker-vm-runtime#updates)

  </Step>

  <Step title="GCP-specific launch notes">
    On GCP, if build fails with `Killed` or `exit code 137` during `pnpm install --frozen-lockfile`, the VM is out of memory. Use `e2-small` minimum, or `e2-medium` for more reliable first builds.

    When binding to LAN (`OPENCLAW_GATEWAY_BIND=lan`), configure a trusted browser origin before continuing:

    ```bash
    docker compose run --rm openclaw-cli config set gateway.controlUi.allowedOrigins '["http://127.0.0.1:18789"]' --strict-json
    ```

    If you changed the gateway port, replace `18789` with your configured port.

  </Step>

  <Step title="Access from your laptop">
    Create an SSH tunnel to forward the Gateway port:

    ```bash
    gcloud compute ssh openclaw-gateway --zone=us-central1-a -- -L 18789:127.0.0.1:18789
    ```

    Open in your browser:

    `http://127.0.0.1:18789/`

    Fetch a fresh tokenized dashboard link:

    ```bash
    docker compose run --rm openclaw-cli dashboard --no-open
    ```

    Paste the token from that URL.

    If Control UI shows `unauthorized` or `disconnected (1008): pairing required`, approve the browser device:

    ```bash
    docker compose run --rm openclaw-cli devices list
    docker compose run --rm openclaw-cli devices approve <requestId>
    ```

    Need the shared persistence and update reference again?
    See [Docker VM Runtime](/install/docker-vm-runtime#what-persists-where) and [Docker VM Runtime updates](/install/docker-vm-runtime#updates).

  </Step>
</Steps>

---

## 什么持久化在哪里（真实来源）

OpenClaw 在 Docker 中运行，但 Docker 不是真实来源。
所有长期状态必须在重启、重建和重启后仍然存在。

| 组件             | 位置                              | 持久化机制    | 说明                        |
| ---------------- | --------------------------------- | ------------- | --------------------------- |
| Gateway 网关配置 | `/home/node/.openclaw/`           | 主机卷挂载    | 包括 `openclaw.json`、令牌  |
| 模型认证配置文件 | `/home/node/.openclaw/`           | 主机卷挂载    | OAuth 令牌、API 密钥        |
| Skill 配置       | `/home/node/.openclaw/skills/`    | 主机卷挂载    | Skill 级别状态              |
| 智能体工作区     | `/home/node/.openclaw/workspace/` | 主机卷挂载    | 代码和智能体产物            |
| WhatsApp 会话    | `/home/node/.openclaw/`           | 主机卷挂载    | 保留 QR 登录                |
| Gmail 密钥环     | `/home/node/.openclaw/`           | 主机卷 + 密码 | 需要 `GOG_KEYRING_PASSWORD` |
| 外部二进制文件   | `/usr/local/bin/`                 | Docker 镜像   | 必须在构建时内置            |
| Node 运行时      | 容器文件系统                      | Docker 镜像   | 每次镜像构建时重建          |
| OS 包            | 容器文件系统                      | Docker 镜像   | 不要在运行时安装            |
| Docker 容器      | 临时                              | 可重启        | 可以安全销毁                |

---

## 更新

在 VM 上更新 OpenClaw：

```bash
cd ~/openclaw
git pull
docker compose build
docker compose up -d
```

---

## 故障排除

**SSH 连接被拒绝**

VM 创建后 SSH 密钥传播可能需要 1-2 分钟。等待并重试。

**OS Login 问题**

检查你的 OS Login 配置文件：

```bash
gcloud compute os-login describe-profile
```

确保你的账户具有所需的 IAM 权限（Compute OS Login 或 Compute OS Admin Login）。

**内存不足（OOM）**

如果使用 e2-micro 并遇到 OOM，升级到 e2-small 或 e2-medium：

```bash
# 首先停止 VM
gcloud compute instances stop openclaw-gateway --zone=us-central1-a

# 更改机器类型
gcloud compute instances set-machine-type openclaw-gateway \
  --zone=us-central1-a \
  --machine-type=e2-small

# 启动 VM
gcloud compute instances start openclaw-gateway --zone=us-central1-a
```

---

## 服务账户（安全最佳实践）

对于个人使用，你的默认用户账户就可以。

对于自动化或 CI/CD 管道，创建具有最小权限的专用服务账户：

1. 创建服务账户：

   ```bash
   gcloud iam service-accounts create openclaw-deploy \
     --display-name="OpenClaw Deployment"
   ```

2. 授予 Compute Instance Admin 角色（或更窄的自定义角色）：
   ```bash
   gcloud projects add-iam-policy-binding my-openclaw-project \
     --member="serviceAccount:openclaw-deploy@my-openclaw-project.iam.gserviceaccount.com" \
     --role="roles/compute.instanceAdmin.v1"
   ```

避免为自动化使用 Owner 角色。使用最小权限原则。

参阅 https://cloud.google.com/iam/docs/understanding-roles 了解 IAM 角色详情。

---

## 下一步

- 设置消息渠道：[渠道](/channels)
- 将本地设备配对为节点：[节点](/nodes)
- 配置 Gateway 网关：[Gateway 网关配置](/gateway/configuration)
