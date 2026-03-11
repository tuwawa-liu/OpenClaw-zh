import { ensureAuthProfileStore, listProfilesForProvider } from "../agents/auth-profiles.js";
import { t } from "../i18n/index.js";
import { hasUsableCustomProviderApiKey, resolveEnvApiKey } from "../agents/model-auth.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import { resolveDefaultModelForAgent } from "../agents/model-selection.js";
import type { OpenClawConfig } from "../config/config.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { OPENAI_CODEX_DEFAULT_MODEL } from "./openai-codex-model-default.js";

export async function warnIfModelConfigLooksOff(
  config: OpenClawConfig,
  prompter: WizardPrompter,
  options?: { agentId?: string; agentDir?: string },
) {
  const ref = resolveDefaultModelForAgent({
    cfg: config,
    agentId: options?.agentId,
  });
  const warnings: string[] = [];
  const catalog = await loadModelCatalog({
    config,
    useCache: false,
  });
  if (catalog.length > 0) {
    const known = catalog.some(
      (entry) => entry.provider === ref.provider && entry.id === ref.model,
    );
    if (!known) {
      warnings.push(
        t("commands.authModelCheck.modelNotFound", { provider: ref.provider, model: ref.model }),
      );
    }
  }

  const store = ensureAuthProfileStore(options?.agentDir);
  const hasProfile = listProfilesForProvider(store, ref.provider).length > 0;
  const envKey = resolveEnvApiKey(ref.provider);
  const hasCustomKey = hasUsableCustomProviderApiKey(config, ref.provider);
  if (!hasProfile && !envKey && !hasCustomKey) {
    warnings.push(
      t("commands.authModelCheck.noAuth", { provider: ref.provider }),
    );
  }

  if (ref.provider === "openai") {
    const hasCodex = listProfilesForProvider(store, "openai-codex").length > 0;
    if (hasCodex) {
      warnings.push(
        t("commands.authModelCheck.codexDetected", { model: OPENAI_CODEX_DEFAULT_MODEL }),
      );
    }
  }

  if (warnings.length > 0) {
    await prompter.note(warnings.join("\n"), t("commands.authModelCheck.modelCheck"));
  }
}
