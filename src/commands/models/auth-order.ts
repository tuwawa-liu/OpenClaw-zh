import { resolveAgentDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import {
  type AuthProfileStore,
  ensureAuthProfileStore,
  setAuthProfileOrder,
} from "../../agents/auth-profiles.js";
import { normalizeProviderId } from "../../agents/model-selection.js";
import { t } from "../../i18n/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import { normalizeStringEntries } from "../../shared/string-normalization.js";
import { shortenHomePath } from "../../utils.js";
import { loadModelsConfig } from "./load-config.js";
import { resolveKnownAgentId } from "./shared.js";

function resolveTargetAgent(
  cfg: Awaited<ReturnType<typeof loadModelsConfig>>,
  raw?: string,
): {
  agentId: string;
  agentDir: string;
} {
  const agentId = resolveKnownAgentId({ cfg, rawAgentId: raw }) ?? resolveDefaultAgentId(cfg);
  const agentDir = resolveAgentDir(cfg, agentId);
  return { agentId, agentDir };
}

function describeOrder(store: AuthProfileStore, provider: string): string[] {
  const providerKey = normalizeProviderId(provider);
  const order = store.order?.[providerKey];
  return Array.isArray(order) ? order : [];
}

async function resolveAuthOrderContext(
  opts: { provider: string; agent?: string },
  runtime: RuntimeEnv,
) {
  const rawProvider = opts.provider?.trim();
  if (!rawProvider) {
    throw new Error("Missing --provider.");
  }
  const provider = normalizeProviderId(rawProvider);
  const cfg = await loadModelsConfig({ commandName: "models auth-order", runtime });
  const { agentId, agentDir } = resolveTargetAgent(cfg, opts.agent);
  return { cfg, agentId, agentDir, provider };
}

export async function modelsAuthOrderGetCommand(
  opts: { provider: string; agent?: string; json?: boolean },
  runtime: RuntimeEnv,
) {
  const { agentId, agentDir, provider } = await resolveAuthOrderContext(opts, runtime);
  const store = ensureAuthProfileStore(agentDir, {
    allowKeychainPrompt: false,
  });
  const order = describeOrder(store, provider);

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          agentId,
          agentDir,
          provider,
          authStorePath: shortenHomePath(`${agentDir}/auth-profiles.json`),
          order: order.length > 0 ? order : null,
        },
        null,
        2,
      ),
    );
    return;
  }

  runtime.log(t("modelsCli.agentLabel", { id: agentId }));
  runtime.log(t("modelsCli.providerLabel", { provider }));
  runtime.log(
    t("modelsCli.authFileLabel", { path: shortenHomePath(`${agentDir}/auth-profiles.json`) }),
  );
  runtime.log(
    order.length > 0
      ? t("modelsCli.orderOverride", { order: order.join(", ") })
      : t("modelsCli.orderOverrideNone"),
  );
}

export async function modelsAuthOrderClearCommand(
  opts: { provider: string; agent?: string },
  runtime: RuntimeEnv,
) {
  const { agentId, agentDir, provider } = await resolveAuthOrderContext(opts, runtime);
  const updated = await setAuthProfileOrder({
    agentDir,
    provider,
    order: null,
  });
  if (!updated) {
    throw new Error("更新 auth-profiles.json 失败（锁忙？）。");
  }

  runtime.log(t("modelsCli.agentLabel", { id: agentId }));
  runtime.log(t("modelsCli.providerLabel", { provider }));
  runtime.log(t("modelsCli.orderCleared"));
}

export async function modelsAuthOrderSetCommand(
  opts: { provider: string; agent?: string; order: string[] },
  runtime: RuntimeEnv,
) {
  const { agentId, agentDir, provider } = await resolveAuthOrderContext(opts, runtime);

  const store = ensureAuthProfileStore(agentDir, {
    allowKeychainPrompt: false,
  });
  const providerKey = provider;
  const requested = normalizeStringEntries(opts.order ?? []);
  if (requested.length === 0) {
    throw new Error("Missing profile ids. Provide one or more profile ids.");
  }

  for (const profileId of requested) {
    const cred = store.profiles[profileId];
    if (!cred) {
      throw new Error(`Auth profile "${profileId}" not found in ${agentDir}.`);
    }
    if (normalizeProviderId(cred.provider) !== providerKey) {
      throw new Error(`Auth profile "${profileId}" is for ${cred.provider}, not ${provider}.`);
    }
  }

  const updated = await setAuthProfileOrder({
    agentDir,
    provider,
    order: requested,
  });
  if (!updated) {
    throw new Error("更新 auth-profiles.json 失败（锁忙？）。");
  }

  runtime.log(t("modelsCli.agentLabel", { id: agentId }));
  runtime.log(t("modelsCli.providerLabel", { provider }));
  runtime.log(t("modelsCli.orderOverride", { order: describeOrder(updated, provider).join(", ") }));
}
