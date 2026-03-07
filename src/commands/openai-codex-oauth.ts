import type { OAuthCredentials } from "@mariozechner/pi-ai";
import { loginOpenAICodex } from "@mariozechner/pi-ai";
import { t } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { createVpsAwareOAuthHandlers } from "./oauth-flow.js";
import {
  formatOpenAIOAuthTlsPreflightFix,
  runOpenAIOAuthTlsPreflight,
} from "./oauth-tls-preflight.js";

export async function loginOpenAICodexOAuth(params: {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  localBrowserMessage?: string;
}): Promise<OAuthCredentials | null> {
  const { prompter, runtime, isRemote, openUrl, localBrowserMessage } = params;
  const preflight = await runOpenAIOAuthTlsPreflight();
  if (!preflight.ok && preflight.kind === "tls-cert") {
    const hint = formatOpenAIOAuthTlsPreflightFix(preflight);
    runtime.error(hint);
    await prompter.note(hint, t("commands.openaiCodexOAuth.prerequisites"));
    throw new Error(preflight.message);
  }

  await prompter.note(
    isRemote
      ? t("commands.openaiCodexOAuth.remoteNote")
      : t("commands.openaiCodexOAuth.localNote"),
    t("commands.openaiCodexOAuth.openaiOAuthTitle"),
  );

  const spin = prompter.progress(t("commands.openaiCodexOAuth.startingOAuth"));
  try {
    const { onAuth: baseOnAuth, onPrompt } = createVpsAwareOAuthHandlers({
      isRemote,
      prompter,
      runtime,
      spin,
      openUrl,
      localBrowserMessage: localBrowserMessage ?? t("commands.authOpenai.browserSignIn"),
    });

    const creds = await loginOpenAICodex({
      onAuth: baseOnAuth,
      onPrompt,
      onProgress: (msg) => spin.update(msg),
    });
    spin.stop(t("commands.openaiCodexOAuth.oauthComplete"));
    return creds ?? null;
  } catch (err) {
    spin.stop(t("commands.openaiCodexOAuth.oauthFailed"));
    runtime.error(String(err));
    await prompter.note(t("commands.openaiCodexOAuth.troubleOAuth"), t("commands.openaiCodexOAuth.oauthHelp"));
    throw err;
  }
}
