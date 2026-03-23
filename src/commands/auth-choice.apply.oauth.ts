import { applyAuthProfileConfig, writeOAuthCredentials } from "../plugins/provider-auth-helpers.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { t } from "../i18n/index.js";
import { loginChutes } from "./chutes-oauth.js";
import { isRemoteEnvironment } from "./oauth-env.js";
import { createVpsAwareOAuthHandlers } from "./oauth-flow.js";
import { openUrl } from "./onboard-helpers.js";

export async function applyAuthChoiceOAuth(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice === "chutes") {
    let nextConfig = params.config;
    const isRemote = isRemoteEnvironment();
    const redirectUri =
      process.env.CHUTES_OAUTH_REDIRECT_URI?.trim() || "http://127.0.0.1:1456/oauth-callback";
    const scopes = process.env.CHUTES_OAUTH_SCOPES?.trim() || "openid profile chutes:invoke";
    const clientId =
      process.env.CHUTES_CLIENT_ID?.trim() ||
      String(
        await params.prompter.text({
          message: "输入 Chutes OAuth 客户端 ID",
          placeholder: "cid_xxx",
          validate: (value) => (value?.trim() ? undefined : t("commands.authApiKey.required")),
        }),
      ).trim();
    const clientSecret = process.env.CHUTES_CLIENT_SECRET?.trim() || undefined;

    await params.prompter.note(
      isRemote
        ? t("commands.authOauth.remoteNote", { redirectUri })
        : t("commands.authOauth.localNote", { redirectUri }),
      t("commands.authOauth.chutesOAuth"),
    );

    const spin = params.prompter.progress(t("commands.authOauth.startingOAuth"));
    try {
      const { onAuth, onPrompt } = createVpsAwareOAuthHandlers({
        isRemote,
        prompter: params.prompter,
        runtime: params.runtime,
        spin,
        openUrl,
        localBrowserMessage: t("commands.authOauth.browserSignIn"),
      });

      const creds = await loginChutes({
        app: {
          clientId,
          clientSecret,
          redirectUri,
          scopes: scopes.split(/\s+/).filter(Boolean),
        },
        manual: isRemote,
        onAuth,
        onPrompt,
        onProgress: (msg) => spin.update(msg),
      });

      spin.stop(t("commands.authOauth.oauthComplete"));
      const profileId = await writeOAuthCredentials("chutes", creds, params.agentDir);
      nextConfig = applyAuthProfileConfig(nextConfig, {
        profileId,
        provider: "chutes",
        mode: "oauth",
      });
    } catch (err) {
      spin.stop(t("commands.authOauth.oauthFailed"));
      params.runtime.error(String(err));
      await params.prompter.note(
        t("commands.authOauth.oauthHelp", { redirectUri }),
        t("commands.authOauth.oauthHelpTitle"),
      );
    }
    return { config: nextConfig };
  }

  return null;
}
