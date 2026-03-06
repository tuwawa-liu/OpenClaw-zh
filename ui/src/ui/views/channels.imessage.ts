import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import type { IMessageStatus } from "../types.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import type { ChannelsProps } from "./channels.types.ts";

export function renderIMessageCard(params: {
  props: ChannelsProps;
  imessage?: IMessageStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, imessage, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">${t("channelIMessage.title")}</div>
      <div class="card-sub">${t("channelIMessage.subtitle")}</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">${t("channelCommon.configured")}</span>
          <span>${imessage?.configured ? t("channelCommon.yes") : t("channelCommon.no")}</span>
        </div>
        <div>
          <span class="label">${t("channelCommon.running")}</span>
          <span>${imessage?.running ? t("channelCommon.yes") : t("channelCommon.no")}</span>
        </div>
        <div>
          <span class="label">${t("channelCommon.lastStart")}</span>
          <span>${imessage?.lastStartAt ? formatRelativeTimestamp(imessage.lastStartAt) : t("channelCommon.na")}</span>
        </div>
        <div>
          <span class="label">${t("channelCommon.lastProbe")}</span>
          <span>${imessage?.lastProbeAt ? formatRelativeTimestamp(imessage.lastProbeAt) : t("channelCommon.na")}</span>
        </div>
      </div>

      ${
        imessage?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${imessage.lastError}
          </div>`
          : nothing
      }

      ${
        imessage?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            Probe ${imessage.probe.ok ? t("channelCommon.probeOk") : t("channelCommon.probeFailed")} ·
            ${imessage.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "imessage", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channelCommon.probe")}
        </button>
      </div>
    </div>
  `;
}
