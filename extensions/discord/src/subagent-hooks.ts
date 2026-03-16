import type { OpenClawPluginApi } from "openclaw/plugin-sdk/discord";
import {
  autoBindSpawnedDiscordSubagent,
  listThreadBindingsBySessionKey,
  resolveDiscordAccount,
  unbindThreadBindingsBySessionKey,
} from "openclaw/plugin-sdk/discord";

function summarizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return "error";
}

export function registerDiscordSubagentHooks(api: OpenClawPluginApi) {
  const resolveThreadBindingFlags = (accountId?: string) => {
    const account = resolveDiscordAccount({
      cfg: api.config,
      accountId,
    });
    const baseThreadBindings = api.config.channels?.discord?.threadBindings;
    const accountThreadBindings =
      api.config.channels?.discord?.accounts?.[account.accountId]?.threadBindings;
    return {
      enabled:
        accountThreadBindings?.enabled ??
        baseThreadBindings?.enabled ??
        api.config.session?.threadBindings?.enabled ??
        true,
      spawnSubagentSessions:
        accountThreadBindings?.spawnSubagentSessions ??
        baseThreadBindings?.spawnSubagentSessions ??
        false,
    };
  };

  api.on("subagent_spawning", async (event) => {
    if (!event.threadRequested) {
      return;
    }
    const channel = event.requester?.channel?.trim().toLowerCase();
    if (channel !== "discord") {
      // Ignore non-Discord channels so channel-specific plugins can handle
      // their own thread/session provisioning without Discord blocking them.
      return;
    }
    const threadBindingFlags = resolveThreadBindingFlags(event.requester?.accountId);
    if (!threadBindingFlags.enabled) {
      return {
        status: "error" as const,
        error:
          "Discord 线程绑定已禁用（设置 channels.discord.threadBindings.enabled=true 以为此账户启用，或 session.threadBindings.enabled=true 全局启用）。",
      };
    }
    if (!threadBindingFlags.spawnSubagentSessions) {
      return {
        status: "error" as const,
        error:
          "Discord 线程绑定的子代理生成已禁用（设置 channels.discord.threadBindings.spawnSubagentSessions=true 以启用）。",
      };
    }
    try {
      const binding = await autoBindSpawnedDiscordSubagent({
        accountId: event.requester?.accountId,
        channel: event.requester?.channel,
        to: event.requester?.to,
        threadId: event.requester?.threadId,
        childSessionKey: event.childSessionKey,
        agentId: event.agentId,
        label: event.label,
        boundBy: "system",
      });
      if (!binding) {
        return {
          status: "error" as const,
          error: "无法为此子代理会话创建或绑定 Discord 线程。此目标不支持会话模式。",
        };
      }
      return { status: "ok" as const, threadBindingReady: true };
    } catch (err) {
      return {
        status: "error" as const,
        error: `Discord 线程绑定失败：${summarizeError(err)}`,
      };
    }
  });

  api.on("subagent_ended", (event) => {
    unbindThreadBindingsBySessionKey({
      targetSessionKey: event.targetSessionKey,
      accountId: event.accountId,
      targetKind: event.targetKind,
      reason: event.reason,
      sendFarewell: event.sendFarewell,
    });
  });

  api.on("subagent_delivery_target", (event) => {
    if (!event.expectsCompletionMessage) {
      return;
    }
    const requesterChannel = event.requesterOrigin?.channel?.trim().toLowerCase();
    if (requesterChannel !== "discord") {
      return;
    }
    const requesterAccountId = event.requesterOrigin?.accountId?.trim();
    const requesterThreadId =
      event.requesterOrigin?.threadId != null && event.requesterOrigin.threadId !== ""
        ? String(event.requesterOrigin.threadId).trim()
        : "";
    const bindings = listThreadBindingsBySessionKey({
      targetSessionKey: event.childSessionKey,
      ...(requesterAccountId ? { accountId: requesterAccountId } : {}),
      targetKind: "subagent",
    });
    if (bindings.length === 0) {
      return;
    }

    let binding: (typeof bindings)[number] | undefined;
    if (requesterThreadId) {
      binding = bindings.find((entry) => {
        if (entry.threadId !== requesterThreadId) {
          return false;
        }
        if (requesterAccountId && entry.accountId !== requesterAccountId) {
          return false;
        }
        return true;
      });
    }
    if (!binding && bindings.length === 1) {
      binding = bindings[0];
    }
    if (!binding) {
      return;
    }
    return {
      origin: {
        channel: "discord",
        accountId: binding.accountId,
        to: `channel:${binding.threadId}`,
        threadId: binding.threadId,
      },
    };
  });
}
