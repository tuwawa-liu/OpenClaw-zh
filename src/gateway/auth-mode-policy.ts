import type { OpenClawConfig } from "../config/config.js";
import { hasConfiguredSecretInput } from "../config/types.secrets.js";

export const EXPLICIT_GATEWAY_AUTH_MODE_REQUIRED_ERROR =
  "无效配置：gateway.auth.token 和 gateway.auth.password 同时配置，但 gateway.auth.mode 未设置。请将 gateway.auth.mode 设置为 token 或 password。";

export function hasAmbiguousGatewayAuthModeConfig(cfg: OpenClawConfig): boolean {
  const auth = cfg.gateway?.auth;
  if (!auth) {
    return false;
  }
  if (typeof auth.mode === "string" && auth.mode.trim().length > 0) {
    return false;
  }
  const defaults = cfg.secrets?.defaults;
  const tokenConfigured = hasConfiguredSecretInput(auth.token, defaults);
  const passwordConfigured = hasConfiguredSecretInput(auth.password, defaults);
  return tokenConfigured && passwordConfigured;
}

export function assertExplicitGatewayAuthModeWhenBothConfigured(cfg: OpenClawConfig): void {
  if (!hasAmbiguousGatewayAuthModeConfig(cfg)) {
    return;
  }
  throw new Error(EXPLICIT_GATEWAY_AUTH_MODE_REQUIRED_ERROR);
}
