import { formatRelativeTimestamp, formatDurationHuman, formatMs } from "./format.ts";
import type { CronJob, GatewaySessionRow, PresenceEntry } from "./types.ts";
import { t } from "../i18n/index.ts";

export function formatPresenceSummary(entry: PresenceEntry): string {
  const host = entry.host ?? t("usageExtra2.unknown");
  const ip = entry.ip ? `(${entry.ip})` : "";
  const mode = entry.mode ?? "";
  const version = entry.version ?? "";
  return `${host} ${ip} ${mode} ${version}`.trim();
}

export function formatPresenceAge(entry: PresenceEntry): string {
  const ts = entry.ts ?? null;
  return ts ? formatRelativeTimestamp(ts) : t("presenterExtra.na");
}

export function formatNextRun(ms?: number | null) {
  if (!ms) {
    return t("presenterExtra.na");
  }
  const weekday = new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday}, ${formatMs(ms)} (${formatRelativeTimestamp(ms)})`;
}

export function formatSessionTokens(row: GatewaySessionRow) {
  if (row.totalTokens == null) {
    return t("presenterExtra.na");
  }
  const total = row.totalTokens ?? 0;
  const ctx = row.contextTokens ?? 0;
  return ctx ? `${total} / ${ctx}` : String(total);
}

export function formatEventPayload(payload: unknown): string {
  if (payload == null) {
    return "";
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    // oxlint-disable typescript/no-base-to-string
    return String(payload);
  }
}

export function formatCronState(job: CronJob) {
  const state = job.state ?? {};
  const next = state.nextRunAtMs ? formatMs(state.nextRunAtMs) : t("presenterExtra.na");
  const last = state.lastRunAtMs ? formatMs(state.lastRunAtMs) : t("presenterExtra.na");
  const status = state.lastStatus ?? t("presenterExtra.na");
  return `${status} · ${t("presenterExtra.next")} ${next} · ${t("presenterExtra.last")} ${last}`;
}

export function formatCronSchedule(job: CronJob) {
  const s = job.schedule;
  if (s.kind === "at") {
    const atMs = Date.parse(s.at);
    return Number.isFinite(atMs) ? t("presenterExtra.atTime", { time: formatMs(atMs) }) : t("presenterExtra.atTime", { time: s.at });
  }
  if (s.kind === "every") {
    return t("presenterExtra.every", { duration: formatDurationHuman(s.everyMs) });
  }
  return t("presenterExtra.cronExpr", { expr: `${s.expr}${s.tz ? ` (${s.tz})` : ""}` });
}

export function formatCronPayload(job: CronJob) {
  const p = job.payload;
  if (p.kind === "systemEvent") {
    return t("presenterExtra.systemPrefix", { text: p.text });
  }
  const base = t("presenterExtra.agentPrefix", { message: p.message });
  const delivery = job.delivery;
  if (delivery && delivery.mode !== "none") {
    const target =
      delivery.mode === "webhook"
        ? delivery.to
          ? ` (${delivery.to})`
          : ""
        : delivery.channel || delivery.to
          ? ` (${delivery.channel ?? t("deliveryLabels.last")}${delivery.to ? ` -> ${delivery.to}` : ""})`
          : "";
    return `${base} · ${t(`deliveryLabels.${delivery.mode}`) || delivery.mode}${target}`;
  }
  return base;
}
