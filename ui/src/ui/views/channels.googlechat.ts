import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import type { GoogleChatStatus } from "../types.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import type { ChannelsProps } from "./channels.types.ts";

export function renderGoogleChatCard(params: {
  props: ChannelsProps;
  googleChat?: GoogleChatStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, googleChat, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">Google Chat</div>
      <div class="card-sub">${t("channelGoogleChat.subtitle")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channelCommon.configured")}</span>
          <span>${googleChat ? (googleChat.configured ? t("channelCommon.yes") : t("channelCommon.no")) : t("channelCommon.na")}</span>
        </div>
        <div>
          <span class="label">${t("channelCommon.running")}</span>
          <span>${googleChat ? (googleChat.running ? t("channelCommon.yes") : t("channelCommon.no")) : t("channelCommon.na")}</span>
        </div>
        <div>
          <span class="label">${t("channelGoogleChat.credential")}</span>
          <span>${googleChat?.credentialSource ?? t("channelCommon.na")}</span>
        </div>
        <div>
          <span class="label">${t("channelGoogleChat.audience")}</span>
          <span>
            ${
              googleChat?.audienceType
                ? `${googleChat.audienceType}${googleChat.audience ? ` · ${googleChat.audience}` : ""}`
                : t("channelCommon.na")
            }
          </span>
        </div>
        <div>
          <span class="label">${t("channelCommon.lastStart")}</span>
          <span>${googleChat?.lastStartAt ? formatRelativeTimestamp(googleChat.lastStartAt) : t("channelCommon.na")}</span>
        </div>
        <div>
          <span class="label">${t("channelCommon.lastProbe")}</span>
          <span>${googleChat?.lastProbeAt ? formatRelativeTimestamp(googleChat.lastProbeAt) : t("channelCommon.na")}</span>
        </div>
      </div>

      ${
        googleChat?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${googleChat.lastError}
          </div>`
          : nothing
      }

      ${
        googleChat?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            Probe ${googleChat.probe.ok ? t("channelCommon.probeOk") : t("channelCommon.probeFailed")} ·
            ${googleChat.probe.status ?? ""} ${googleChat.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "googlechat", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channelCommon.probe")}
        </button>
      </div>
    </div>
  `;
}
