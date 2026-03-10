import { t } from "./i18n/index.js";

export type PollInput = {
  question: string;
  options: string[];
  maxSelections?: number;
  /**
   * Poll duration in seconds.
   * Channel-specific limits apply (e.g. Telegram open_period is 5-600s).
   */
  durationSeconds?: number;
  /**
   * Poll duration in hours.
   * Used by channels that model duration in hours (e.g. Discord).
   */
  durationHours?: number;
};

export type NormalizedPollInput = {
  question: string;
  options: string[];
  maxSelections: number;
  durationSeconds?: number;
  durationHours?: number;
};

type NormalizePollOptions = {
  maxOptions?: number;
};

export function resolvePollMaxSelections(
  optionCount: number,
  allowMultiselect: boolean | undefined,
): number {
  return allowMultiselect ? Math.max(2, optionCount) : 1;
}

export function normalizePollInput(
  input: PollInput,
  options: NormalizePollOptions = {},
): NormalizedPollInput {
  const question = input.question.trim();
  if (!question) {
    throw new Error(t("polls.questionRequired"));
  }
  const pollOptions = (input.options ?? []).map((option) => option.trim());
  const cleaned = pollOptions.filter(Boolean);
  if (cleaned.length < 2) {
    throw new Error(t("polls.minTwoOptions"));
  }
  if (options.maxOptions !== undefined && cleaned.length > options.maxOptions) {
    throw new Error(t("polls.maxOptions", { maxOptions: String(options.maxOptions) }));
  }
  const maxSelectionsRaw = input.maxSelections;
  const maxSelections =
    typeof maxSelectionsRaw === "number" && Number.isFinite(maxSelectionsRaw)
      ? Math.floor(maxSelectionsRaw)
      : 1;
  if (maxSelections < 1) {
    throw new Error(t("polls.minSelections"));
  }
  if (maxSelections > cleaned.length) {
    throw new Error(t("polls.maxSelectionsExceed"));
  }

  const durationSecondsRaw = input.durationSeconds;
  const durationSeconds =
    typeof durationSecondsRaw === "number" && Number.isFinite(durationSecondsRaw)
      ? Math.floor(durationSecondsRaw)
      : undefined;
  if (durationSeconds !== undefined && durationSeconds < 1) {
    throw new Error(t("polls.minDurationSeconds"));
  }

  const durationRaw = input.durationHours;
  const durationHours =
    typeof durationRaw === "number" && Number.isFinite(durationRaw)
      ? Math.floor(durationRaw)
      : undefined;
  if (durationHours !== undefined && durationHours < 1) {
    throw new Error(t("polls.minDurationHours"));
  }
  if (durationSeconds !== undefined && durationHours !== undefined) {
    throw new Error(t("polls.durationExclusive"));
  }
  return {
    question,
    options: cleaned,
    maxSelections,
    durationSeconds,
    durationHours,
  };
}

export function normalizePollDurationHours(
  value: number | undefined,
  options: { defaultHours: number; maxHours: number },
): number {
  const base =
    typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : options.defaultHours;
  return Math.min(Math.max(base, 1), options.maxHours);
}
