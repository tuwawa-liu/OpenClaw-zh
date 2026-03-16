import type { AvailableCommand } from "@agentclientprotocol/sdk";

export function getAvailableCommands(): AvailableCommand[] {
  return [
    { name: "help", description: "显示帮助和常用命令。" },
    { name: "commands", description: "列出可用命令。" },
    { name: "status", description: "显示当前状态。" },
    {
      name: "context",
      description: "查看上下文使用情况 (list|detail|json)。",
      input: { hint: "list | detail | json" },
    },
    { name: "whoami", description: "显示发送者 ID（别名：/id）。" },
    { name: "id", description: "/whoami 的别名。" },
    { name: "subagents", description: "列出或管理子代理。" },
    { name: "config", description: "读取或写入配置（仅所有者）。" },
    { name: "debug", description: "设置运行时覆盖（仅所有者）。" },
    { name: "usage", description: "切换用量页脚 (off|tokens|full)。" },
    { name: "stop", description: "停止当前运行。" },
    { name: "restart", description: "重启网关（如果已启用）。" },
    { name: "dock-telegram", description: "将回复路由到 Telegram。" },
    { name: "dock-discord", description: "将回复路由到 Discord。" },
    { name: "dock-slack", description: "将回复路由到 Slack。" },
    { name: "activation", description: "设置群组激活方式 (mention|always)。" },
    { name: "send", description: "设置发送模式 (on|off|inherit)。" },
    { name: "reset", description: "重置会话 (/new)。" },
    { name: "new", description: "重置会话 (/reset)。" },
    {
      name: "think",
      description: "设置思考级别 (off|minimal|low|medium|high|xhigh)。",
    },
    { name: "verbose", description: "设置详细模式 (on|full|off)。" },
    { name: "reasoning", description: "切换推理输出 (on|off|stream)。" },
    { name: "elevated", description: "切换提升模式 (on|off)。" },
    { name: "model", description: "选择模型 (list|status|<name>)。" },
    { name: "queue", description: "调整队列模式和选项。" },
    { name: "bash", description: "运行主机命令（如果已启用）。" },
    { name: "compact", description: "压缩会话历史。" },
  ];
}
