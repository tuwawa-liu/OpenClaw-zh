import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import type { ChannelAccountSnapshot, TelegramStatus } from "../types.ts";
import { renderChannelConfigSection } from "./channels.config.ts";
import type { ChannelsProps } from "./channels.types.ts";

export function renderTelegramCard(params: {
  props: ChannelsProps;
  telegram?: TelegramStatus;
  telegramAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, telegram, telegramAccounts, accountCountLabel } = params;
  const hasMultipleAccounts = telegramAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { bot?: { username?: string } } | undefined;
    const botUsername = probe?.bot?.username;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${botUsername ? `@${botUsername}` : label}
          </div>
          <div class="account-card-id">${account.accountId}</div>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">${t("channelCommon.running")}</span>
            <span>${account.running ? t("channelCommon.yes") : t("channelCommon.no")}</span>
          </div>
          <div>
            <span class="label">${t("channelCommon.configured")}</span>
            <span>${account.configured ? t("channelCommon.yes") : t("channelCommon.no")}</span>
          </div>
          <div>
            <span class="label">${t("channelCommon.lastInbound")}</span>
            <span>${account.lastInboundAt ? formatRelativeTimestamp(account.lastInboundAt) : t("channelCommon.na")}</span>
          </div>
          ${
            account.lastError
              ? html`
                <div class="account-card-error">
                  ${account.lastError}
                </div>
              `
              : nothing
          }
        </div>
      </div>
    `;
  };

  return html`
    <div class="card">
      <div class="card-title">Telegram</div>
      <div class="card-sub">${t("channelCommon.botStatus")}</div>
      ${accountCountLabel}

      ${
        hasMultipleAccounts
          ? html`
            <div class="account-card-list">
              ${telegramAccounts.map((account) => renderAccountCard(account))}
            </div>
          `
          : html`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">${t("channelCommon.configured")}</span>
                <span>${telegram?.configured ? t("channelCommon.yes") : t("channelCommon.no")}</span>
              </div>
              <div>
                <span class="label">${t("channelCommon.running")}</span>
                <span>${telegram?.running ? t("channelCommon.yes") : t("channelCommon.no")}</span>
              </div>
              <div>
                <span class="label">${t("channelCommon.mode")}</span>
                <span>${telegram?.mode ?? t("channelCommon.na")}</span>
              </div>
              <div>
                <span class="label">${t("channelCommon.lastStart")}</span>
                <span>${telegram?.lastStartAt ? formatRelativeTimestamp(telegram.lastStartAt) : t("channelCommon.na")}</span>
              </div>
              <div>
                <span class="label">${t("channelCommon.lastProbe")}</span>
                <span>${telegram?.lastProbeAt ? formatRelativeTimestamp(telegram.lastProbeAt) : t("channelCommon.na")}</span>
              </div>
            </div>
          `
      }

      ${
        telegram?.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${telegram.lastError}
          </div>`
          : nothing
      }

      ${
        telegram?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
            Probe ${telegram.probe.ok ? t("channelCommon.probeOk") : t("channelCommon.probeFailed")} ·
            ${telegram.probe.status ?? ""} ${telegram.probe.error ?? ""}
          </div>`
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "telegram", props })}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${() => props.onRefresh(true)}>
          ${t("channelCommon.probe")}
        </button>
      </div>
    </div>
  `;
}
