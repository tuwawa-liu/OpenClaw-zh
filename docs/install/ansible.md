---
read_when:
  - 你想要带安全加固的自动化服务器部署
  - 你需要带 VPN 访问的防火墙隔离设置
  - 你正在部署到远程 Debian/Ubuntu 服务器
summary: 使用 Ansible、Tailscale VPN 和防火墙隔离进行自动化、加固的 OpenClaw 安装
title: Ansible
x-i18n:
  generated_at: "2026-02-03T07:49:29Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 896807f344d923f09039f377c13b4bf4a824aa94eec35159fc169596a3493b29
  source_path: install/ansible.md
  workflow: 15
---

# Ansible 安装

Deploy OpenClaw to production servers with **[openclaw-ansible](https://github.com/openclaw/openclaw-ansible)** -- an automated installer with security-first architecture.

<Info>
The [openclaw-ansible](https://github.com/openclaw/openclaw-ansible) repo is the source of truth for Ansible deployment. This page is a quick overview.
</Info>

## Prerequisites

| Requirement | Details                                                   |
| ----------- | --------------------------------------------------------- |
| **OS**      | Debian 11+ or Ubuntu 20.04+                               |
| **Access**  | Root or sudo privileges                                   |
| **Network** | Internet connection for package installation              |
| **Ansible** | 2.14+ (installed automatically by the quick-start script) |

## What You Get

- **Firewall-first security** -- UFW + Docker isolation (only SSH + Tailscale accessible)
- **Tailscale VPN** -- secure remote access without exposing services publicly
- **Docker** -- isolated sandbox containers, localhost-only bindings
- **Defense in depth** -- 4-layer security architecture
- **Systemd integration** -- auto-start on boot with hardening
- **One-command setup** -- complete deployment in minutes

## 快速开始

一条命令安装：

```bash
curl -fsSL https://raw.githubusercontent.com/openclaw/openclaw-ansible/main/install.sh | bash
```

## What Gets Installed

Ansible playbook 安装并配置：

1. **Tailscale** -- mesh VPN for secure remote access
2. **UFW firewall** -- SSH + Tailscale ports only
3. **Docker CE + Compose V2** -- for agent sandboxes
4. **Node.js 24 + pnpm** -- runtime dependencies (Node 22 LTS, currently `22.16+`, remains supported)
5. **OpenClaw** -- host-based, not containerized
6. **Systemd service** -- auto-start with security hardening

<Note>
The gateway runs directly on the host (not in Docker), but agent sandboxes use Docker for isolation. See [Sandboxing](/gateway/sandboxing) for details.
</Note>

## 安装后设置

<Steps>
  <Step title="Switch to the openclaw user">
    ```bash
    sudo -i -u openclaw
    ```
  </Step>
  <Step title="Run the onboarding wizard">
    The post-install script guides you through configuring OpenClaw settings.
  </Step>
  <Step title="Connect messaging providers">
    Log in to WhatsApp, Telegram, Discord, or Signal:
    ```bash
    openclaw channels login
    ```
  </Step>
  <Step title="Verify the installation">
    ```bash
    sudo systemctl status openclaw
    sudo journalctl -u openclaw -f
    ```
  </Step>
  <Step title="Connect to Tailscale">
    Join your VPN mesh for secure remote access.
  </Step>
</Steps>

### Quick Commands

```bash
# 检查服务状态
sudo systemctl status openclaw

# 查看实时日志
sudo journalctl -u openclaw -f

# 重启 Gateway 网关
sudo systemctl restart openclaw

# 提供商登录（以 openclaw 用户运行）
sudo -i -u openclaw
openclaw channels login
```

## 安全架构

The deployment uses a 4-layer defense model:

1. **Firewall (UFW)** -- only SSH (22) + Tailscale (41641/udp) exposed publicly
2. **VPN (Tailscale)** -- gateway accessible only via VPN mesh
3. **Docker isolation** -- DOCKER-USER iptables chain prevents external port exposure
4. **Systemd hardening** -- NoNewPrivileges, PrivateTmp, unprivileged user

To verify your external attack surface:

```bash
nmap -p- YOUR_SERVER_IP
```

Only port 22 (SSH) should be open. All other services (gateway, Docker) are locked down.

Docker is installed for agent sandboxes (isolated tool execution), not for running the gateway itself. See [Multi-Agent Sandbox and Tools](/tools/multi-agent-sandbox-tools) for sandbox configuration.

## 手动安装

如果你更喜欢手动控制而非自动化：

<Steps>
  <Step title="Install prerequisites">
    ```bash
    sudo apt update && sudo apt install -y ansible git
    ```
  </Step>
  <Step title="Clone the repository">
    ```bash
    git clone https://github.com/openclaw/openclaw-ansible.git
    cd openclaw-ansible
    ```
  </Step>
  <Step title="Install Ansible collections">
    ```bash
    ansible-galaxy collection install -r requirements.yml
    ```
  </Step>
  <Step title="Run the playbook">
    ```bash
    ./run-playbook.sh
    ```

    Alternatively, run directly and then manually execute the setup script afterward:
    ```bash
    ansible-playbook playbook.yml --ask-become-pass
    # Then run: /tmp/openclaw-setup.sh
    ```

  </Step>
</Steps>

## Updating

Ansible 安装程序设置 OpenClaw 为手动更新。标准更新流程参见[更新](/install/updating)。

To re-run the Ansible playbook (for example, for configuration changes):

```bash
cd openclaw-ansible
./run-playbook.sh
```

This is idempotent and safe to run multiple times.

## 故障排除

<AccordionGroup>
  <Accordion title="Firewall blocks my connection">
    - Ensure you can access via Tailscale VPN first
    - SSH access (port 22) is always allowed
    - The gateway is only accessible via Tailscale by design
  </Accordion>
  <Accordion title="Service will not start">
    ```bash
    # Check logs
    sudo journalctl -u openclaw -n 100

    # Verify permissions
    sudo ls -la /opt/openclaw

    # Test manual start
    sudo -i -u openclaw
    cd ~/openclaw
    openclaw gateway run
    ```

  </Accordion>
  <Accordion title="Docker sandbox issues">
    ```bash
    # Verify Docker is running
    sudo systemctl status docker

    # Check sandbox image
    sudo docker images | grep openclaw-sandbox

    # Build sandbox image if missing
    cd /opt/openclaw/openclaw
    sudo -u openclaw ./scripts/sandbox-setup.sh
    ```

  </Accordion>
  <Accordion title="Provider login fails">
    Make sure you are running as the `openclaw` user:
    ```bash
    sudo -i -u openclaw
    openclaw channels login
    ```
  </Accordion>
</AccordionGroup>

## 高级配置

For detailed security architecture and troubleshooting, see the openclaw-ansible repo:

- [安全架构](https://github.com/openclaw/openclaw-ansible/blob/main/docs/security.md)
- [技术详情](https://github.com/openclaw/openclaw-ansible/blob/main/docs/architecture.md)
- [故障排除指南](https://github.com/openclaw/openclaw-ansible/blob/main/docs/troubleshooting.md)

## 相关内容

- [openclaw-ansible](https://github.com/openclaw/openclaw-ansible) -- full deployment guide
- [Docker](/install/docker) -- containerized gateway setup
- [Sandboxing](/gateway/sandboxing) -- agent sandbox configuration
- [Multi-Agent Sandbox and Tools](/tools/multi-agent-sandbox-tools) -- per-agent isolation
