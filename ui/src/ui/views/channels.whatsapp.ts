import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import type { WhatsAppStatus } from "../types.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import type { ChannelsProps } from "./channels.types.ts";

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">WhatsApp</div>
      <div class="card-sub">${t("channelWhatsApp.subtitle")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channelCommon.configured")}</span>
          <span>${whatsapp?.configured ? t("channelCommon.yes") : t("channelCommon.no")}</span>
        </div>
        <div>
          <span class="label">${t("channelWhatsApp.linked")}</span>
          <span>${whatsapp?.linked ? t("channelCommon.yes") : t("channelCommon.no")}</span>
        </div>
        <div>
          <span class="label">${t("channelCommon.running")}</span>
          <span>${whatsapp?.running ? t("channelCommon.yes") : t("channelCommon.no")}</span>
        </div>
        <div>
          <span class="label">${t("channelWhatsApp.connected")}</span>
          <span>${whatsapp?.connected ? t("channelCommon.yes") : t("channelCommon.no")}</span>
        </div>
        <div>
          <span class="label">${t("channelWhatsApp.lastConnect")}</span>
          <span>
            ${whatsapp?.lastConnectedAt ? formatRelativeTimestamp(whatsapp.lastConnectedAt) : t("channelCommon.na")}
          </span>
        </div>
        <div>
          <span class="label">${t("channelWhatsApp.lastMessage")}</span>
          <span>
            ${whatsapp?.lastMessageAt ? formatRelativeTimestamp(whatsapp.lastMessageAt) : t("channelCommon.na")}
          </span>
        </div>
        <div>
          <span class="label">${t("channelWhatsApp.authAge")}</span>
          <span>
            ${whatsapp?.authAgeMs != null ? formatDurationHuman(whatsapp.authAgeMs) : t("channelCommon.na")}
          </span>
        </div>
      </div>

      ${
        whatsapp?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${whatsapp.lastError}
          </div>`
          : nothing
      }

      ${
        props.whatsappMessage
          ? html`<div class="callout" style="margin-top: 12px;">
            ${props.whatsappMessage}
          </div>`
          : nothing
      }

      ${
        props.whatsappQrDataUrl
          ? html`<div class="qr-wrap">
            <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" />
          </div>`
          : nothing
      }

      <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
        <button
          class="btn primary"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppStart(false)}
        >
          ${props.whatsappBusy ? t("channelWhatsApp.working") : t("channelWhatsApp.showQR")}
        </button>
        <button
          class="btn"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppStart(true)}
        >
          ${t("channelWhatsApp.relink")}
        </button>
        <button
          class="btn"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppWait()}
        >
          ${t("channelWhatsApp.waitForScan")}
        </button>
        <button
          class="btn danger"
          ?disabled=${props.whatsappBusy}
          @click=${() => props.onWhatsAppLogout()}
        >
          ${t("channelWhatsApp.logout")}
        </button>
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channelCommon.refresh")}
        </button>
      </div>

      ${renderChannelConfigSection({ channelId: "whatsapp", props })}
    </div>
  `;
}
