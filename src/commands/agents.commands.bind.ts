import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { isRouteBinding, listRouteBindings } from "../config/bindings.js";
import { writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { t } from "../i18n/index.js";
import type { AgentRouteBinding } from "../config/types.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { type RuntimeEnv, writeRuntimeJson } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import {
  applyAgentBindings,
  describeBinding,
  parseBindingSpecs,
  removeAgentBindings,
} from "./agents.bindings.js";
import { requireValidConfig } from "./agents.command-shared.js";
import { buildAgentSummaries } from "./agents.config.js";

type AgentsBindingsListOptions = {
  agent?: string;
  json?: boolean;
};

type AgentsBindOptions = {
  agent?: string;
  bind?: string[];
  json?: boolean;
};

type AgentsUnbindOptions = {
  agent?: string;
  bind?: string[];
  all?: boolean;
  json?: boolean;
};

function resolveAgentId(
  cfg: Awaited<ReturnType<typeof requireValidConfig>>,
  agentInput: string | undefined,
  params?: { fallbackToDefault?: boolean },
): string | null {
  if (!cfg) {
    return null;
  }
  if (agentInput?.trim()) {
    return normalizeAgentId(agentInput);
  }
  if (params?.fallbackToDefault) {
    return resolveDefaultAgentId(cfg);
  }
  return null;
}

function hasAgent(cfg: Awaited<ReturnType<typeof requireValidConfig>>, agentId: string): boolean {
  if (!cfg) {
    return false;
  }
  return buildAgentSummaries(cfg).some((summary) => summary.id === agentId);
}

function formatBindingOwnerLine(binding: AgentRouteBinding): string {
  return `${normalizeAgentId(binding.agentId)} <- ${describeBinding(binding)}`;
}

function resolveTargetAgentIdOrExit(params: {
  cfg: Awaited<ReturnType<typeof requireValidConfig>>;
  runtime: RuntimeEnv;
  agentInput: string | undefined;
}): string | null {
  const agentId = resolveAgentId(params.cfg, params.agentInput?.trim(), {
    fallbackToDefault: true,
  });
  if (!agentId) {
    params.runtime.error(t("commands.agentsBind.unableResolve"));
    params.runtime.exit(1);
    return null;
  }
  if (!hasAgent(params.cfg, agentId)) {
    params.runtime.error(t("commands.agentsBind.agentNotFound", { agentId }));
    params.runtime.exit(1);
    return null;
  }
  return agentId;
}

function formatBindingConflicts(
  conflicts: Array<{ binding: AgentRouteBinding; existingAgentId: string }>,
): string[] {
  return conflicts.map(
    (conflict) => `${describeBinding(conflict.binding)} (agent=${conflict.existingAgentId})`,
  );
}

function resolveParsedBindingsOrExit(params: {
  runtime: RuntimeEnv;
  cfg: NonNullable<Awaited<ReturnType<typeof requireValidConfig>>>;
  agentId: string;
  bindValues: string[] | undefined;
  emptyMessage: string;
}): ReturnType<typeof parseBindingSpecs> | null {
  const specs = (params.bindValues ?? []).map((value) => value.trim()).filter(Boolean);
  if (specs.length === 0) {
    params.runtime.error(params.emptyMessage);
    params.runtime.exit(1);
    return null;
  }

  const parsed = parseBindingSpecs({ agentId: params.agentId, specs, config: params.cfg });
  if (parsed.errors.length > 0) {
    params.runtime.error(parsed.errors.join("\n"));
    params.runtime.exit(1);
    return null;
  }
  return parsed;
}

function emitJsonPayload(params: {
  runtime: RuntimeEnv;
  json: boolean | undefined;
  payload: unknown;
  conflictCount?: number;
}): boolean {
  if (!params.json) {
    return false;
  }
  writeRuntimeJson(params.runtime, params.payload);
  if ((params.conflictCount ?? 0) > 0) {
    params.runtime.exit(1);
  }
  return true;
}

async function resolveConfigAndTargetAgentIdOrExit(params: {
  runtime: RuntimeEnv;
  agentInput: string | undefined;
}): Promise<{
  cfg: NonNullable<Awaited<ReturnType<typeof requireValidConfig>>>;
  agentId: string;
} | null> {
  const cfg = await requireValidConfig(params.runtime);
  if (!cfg) {
    return null;
  }
  const agentId = resolveTargetAgentIdOrExit({
    cfg,
    runtime: params.runtime,
    agentInput: params.agentInput,
  });
  if (!agentId) {
    return null;
  }
  return { cfg, agentId };
}

export async function agentsBindingsCommand(
  opts: AgentsBindingsListOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }

  const filterAgentId = resolveAgentId(cfg, opts.agent?.trim());
  if (opts.agent && !filterAgentId) {
    runtime.error(t("commands.agentsBind.agentIdRequired"));
    runtime.exit(1);
    return;
  }
  if (filterAgentId && !hasAgent(cfg, filterAgentId)) {
    runtime.error(t("commands.agentsBind.agentNotFound", { agentId: filterAgentId }));
    runtime.exit(1);
    return;
  }

  const filtered = listRouteBindings(cfg).filter(
    (binding) => !filterAgentId || normalizeAgentId(binding.agentId) === filterAgentId,
  );
  if (opts.json) {
    writeRuntimeJson(
      runtime,
      filtered.map((binding) => ({
        agentId: normalizeAgentId(binding.agentId),
        match: binding.match,
        description: describeBinding(binding),
      })),
    );
    return;
  }

  if (filtered.length === 0) {
    runtime.log(
      filterAgentId ? t("commands.agentsBind.noBindingsAgent", { agentId: filterAgentId }) : t("commands.agentsBind.noBindings"),
    );
    return;
  }

  runtime.log(
    [
      t("commands.agentsBind.routingBindings"),
      ...filtered.map((binding) => `- ${formatBindingOwnerLine(binding)}`),
    ].join("\n"),
  );
}

export async function agentsBindCommand(
  opts: AgentsBindOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const resolved = await resolveConfigAndTargetAgentIdOrExit({
    runtime,
    agentInput: opts.agent,
  });
  if (!resolved) {
    return;
  }
  const { cfg, agentId } = resolved;

  const parsed = resolveParsedBindingsOrExit({
    runtime,
    cfg,
    agentId,
    bindValues: opts.bind,
    emptyMessage: t("commands.agentsBind.provideBindArg"),
  });
  if (!parsed) {
    return;
  }

  const result = applyAgentBindings(cfg, parsed.bindings);
  if (result.added.length > 0 || result.updated.length > 0) {
    await writeConfigFile(result.config);
    if (!opts.json) {
      logConfigUpdated(runtime);
    }
  }

  const payload = {
    agentId,
    added: result.added.map(describeBinding),
    updated: result.updated.map(describeBinding),
    skipped: result.skipped.map(describeBinding),
    conflicts: formatBindingConflicts(result.conflicts),
  };
  if (
    emitJsonPayload({ runtime, json: opts.json, payload, conflictCount: result.conflicts.length })
  ) {
    return;
  }

  if (result.added.length > 0) {
    runtime.log(t("commands.agentsBind.addedBindings"));
    for (const binding of result.added) {
      runtime.log(`- ${describeBinding(binding)}`);
    }
  } else if (result.updated.length === 0) {
    runtime.log(t("commands.agentsBind.noNewBindings"));
  }

  if (result.updated.length > 0) {
    runtime.log(t("commands.agentsBind.updatedBindings"));
    for (const binding of result.updated) {
      runtime.log(`- ${describeBinding(binding)}`);
    }
  }

  if (result.skipped.length > 0) {
    runtime.log(t("commands.agentsBind.alreadyPresent"));
    for (const binding of result.skipped) {
      runtime.log(`- ${describeBinding(binding)}`);
    }
  }

  if (result.conflicts.length > 0) {
    runtime.error(t("commands.agentsBind.skippedConflicts"));
    for (const conflict of result.conflicts) {
      runtime.error(`- ${describeBinding(conflict.binding)} (agent=${conflict.existingAgentId})`);
    }
    runtime.exit(1);
  }
}

export async function agentsUnbindCommand(
  opts: AgentsUnbindOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const resolved = await resolveConfigAndTargetAgentIdOrExit({
    runtime,
    agentInput: opts.agent,
  });
  if (!resolved) {
    return;
  }
  const { cfg, agentId } = resolved;
  if (opts.all && (opts.bind?.length ?? 0) > 0) {
    runtime.error(t("commands.agentsBind.useAllOrBind"));
    runtime.exit(1);
    return;
  }

  if (opts.all) {
    const existing = listRouteBindings(cfg);
    const removed = existing.filter((binding) => normalizeAgentId(binding.agentId) === agentId);
    const keptRoutes = existing.filter((binding) => normalizeAgentId(binding.agentId) !== agentId);
    const nonRoutes = (cfg.bindings ?? []).filter((binding) => !isRouteBinding(binding));
    if (removed.length === 0) {
      runtime.log(t("commands.agentsBind.noBindingsToRemove", { agentId }));
      return;
    }
    const next = {
      ...cfg,
      bindings:
        [...keptRoutes, ...nonRoutes].length > 0 ? [...keptRoutes, ...nonRoutes] : undefined,
    };
    await writeConfigFile(next);
    if (!opts.json) {
      logConfigUpdated(runtime);
    }
    const payload = {
      agentId,
      removed: removed.map(describeBinding),
      missing: [] as string[],
      conflicts: [] as string[],
    };
    if (emitJsonPayload({ runtime, json: opts.json, payload })) {
      return;
    }
    runtime.log(t("commands.agentsBind.removedCount", { count: String(removed.length), agentId }));
    return;
  }

  const parsed = resolveParsedBindingsOrExit({
    runtime,
    cfg,
    agentId,
    bindValues: opts.bind,
    emptyMessage: t("commands.agentsBind.provideBindOrAll"),
  });
  if (!parsed) {
    return;
  }

  const result = removeAgentBindings(cfg, parsed.bindings);
  if (result.removed.length > 0) {
    await writeConfigFile(result.config);
    if (!opts.json) {
      logConfigUpdated(runtime);
    }
  }

  const payload = {
    agentId,
    removed: result.removed.map(describeBinding),
    missing: result.missing.map(describeBinding),
    conflicts: formatBindingConflicts(result.conflicts),
  };
  if (
    emitJsonPayload({ runtime, json: opts.json, payload, conflictCount: result.conflicts.length })
  ) {
    return;
  }

  if (result.removed.length > 0) {
    runtime.log(t("commands.agentsBind.removedBindings"));
    for (const binding of result.removed) {
      runtime.log(`- ${describeBinding(binding)}`);
    }
  } else {
    runtime.log(t("commands.agentsBind.noBindingsRemoved"));
  }
  if (result.missing.length > 0) {
    runtime.log(t("commands.agentsBind.notFound"));
    for (const binding of result.missing) {
      runtime.log(`- ${describeBinding(binding)}`);
    }
  }
  if (result.conflicts.length > 0) {
    runtime.error(t("commands.agentsBind.ownedByAnother"));
    for (const conflict of result.conflicts) {
      runtime.error(`- ${describeBinding(conflict.binding)} (agent=${conflict.existingAgentId})`);
    }
    runtime.exit(1);
  }
}
