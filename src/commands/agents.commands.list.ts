import { formatCliCommand } from "../cli/command-format.js";
import { t } from "../i18n/index.js";
import { listRouteBindings } from "../config/bindings.js";
import type { AgentRouteBinding } from "../config/types.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { type RuntimeEnv, writeRuntimeJson } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";
import { describeBinding } from "./agents.bindings.js";
import { requireValidConfig } from "./agents.command-shared.js";
import type { AgentSummary } from "./agents.config.js";
import { buildAgentSummaries } from "./agents.config.js";
import {
  buildProviderStatusIndex,
  listProvidersForAgent,
  summarizeBindings,
} from "./agents.providers.js";

type AgentsListOptions = {
  json?: boolean;
  bindings?: boolean;
};

function formatSummary(summary: AgentSummary) {
  const defaultTag = summary.isDefault ? ` ${t("commands.agentsList.defaultTag")}` : "";
  const header =
    summary.name && summary.name !== summary.id
      ? `${summary.id}${defaultTag} (${summary.name})`
      : `${summary.id}${defaultTag}`;

  const identityParts = [];
  if (summary.identityEmoji) {
    identityParts.push(summary.identityEmoji);
  }
  if (summary.identityName) {
    identityParts.push(summary.identityName);
  }
  const identityLine = identityParts.length > 0 ? identityParts.join(" ") : null;
  const identitySource =
    summary.identitySource === "identity"
      ? "IDENTITY.md"
      : summary.identitySource === "config"
        ? "config"
        : null;

  const lines = [`- ${header}`];
  if (identityLine) {
    lines.push(`  ${t("commands.agentsList.identityLabel")} ${identityLine}${identitySource ? ` (${identitySource})` : ""}`);
  }
  lines.push(`  ${t("commands.agentsList.workspaceLabel")} ${shortenHomePath(summary.workspace)}`);
  lines.push(`  ${t("commands.agentsList.agentDirLabel")} ${shortenHomePath(summary.agentDir)}`);
  if (summary.model) {
    lines.push(`  ${t("commands.agentsList.modelLabel")} ${summary.model}`);
  }
  lines.push(`  ${t("commands.agentsList.routingRulesLabel")} ${summary.bindings}`);

  if (summary.routes?.length) {
    lines.push(`  ${t("commands.agentsList.routingLabel")} ${summary.routes.join(", ")}`);
  }
  if (summary.providers?.length) {
    lines.push(`  ${t("commands.agentsList.providersLabel")}`);
    for (const provider of summary.providers) {
      lines.push(`    - ${provider}`);
    }
  }

  if (summary.bindingDetails?.length) {
    lines.push(`  ${t("commands.agentsList.routingRulesLabel")}`);
    for (const binding of summary.bindingDetails) {
      lines.push(`    - ${binding}`);
    }
  }
  return lines.join("\n");
}

export async function agentsListCommand(
  opts: AgentsListOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }

  const summaries = buildAgentSummaries(cfg);
  const bindingMap = new Map<string, AgentRouteBinding[]>();
  for (const binding of listRouteBindings(cfg)) {
    const agentId = normalizeAgentId(binding.agentId);
    const list = bindingMap.get(agentId) ?? [];
    list.push(binding);
    bindingMap.set(agentId, list);
  }

  if (opts.bindings) {
    for (const summary of summaries) {
      const bindings = bindingMap.get(summary.id) ?? [];
      if (bindings.length > 0) {
        summary.bindingDetails = bindings.map((binding) => describeBinding(binding));
      }
    }
  }

  const providerStatus = await buildProviderStatusIndex(cfg);

  for (const summary of summaries) {
    const bindings = bindingMap.get(summary.id) ?? [];
    const routes = summarizeBindings(cfg, bindings);
    if (routes.length > 0) {
      summary.routes = routes;
    } else if (summary.isDefault) {
      summary.routes = [t("commands.agentsList.defaultRouting")];
    }

    const providerLines = listProvidersForAgent({
      summaryIsDefault: summary.isDefault,
      cfg,
      bindings,
      providerStatus,
    });
    if (providerLines.length > 0) {
      summary.providers = providerLines;
    }
  }

  if (opts.json) {
    writeRuntimeJson(runtime, summaries);
    return;
  }

  const lines = [t("commands.agentsList.agentsTitle"), ...summaries.map(formatSummary)];
  lines.push(t("commands.agentsList.routingHint"));
  lines.push(
    t("commands.agentsList.channelStatusHint", { command: formatCliCommand("openclaw channels status --probe") }),
  );
  runtime.log(lines.join("\n"));
}
