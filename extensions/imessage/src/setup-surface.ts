import {
  detectBinary,
  setSetupChannelEnabled,
  type ChannelSetupWizard,
} from "openclaw/plugin-sdk/setup";
import { listIMessageAccountIds, resolveIMessageAccount } from "./accounts.js";
import {
  createIMessageCliPathTextInput,
  imessageCompletionNote,
  imessageDmPolicy,
  imessageSetupAdapter,
  imessageSetupStatusBase,
  parseIMessageAllowFromEntries,
} from "./setup-core.js";

const channel = "imessage" as const;

export const imessageSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    ...imessageSetupStatusBase,
    resolveStatusLines: async ({ cfg, configured }) => {
      const cliPath = cfg.channels?.imessage?.cliPath ?? "imsg";
      const cliDetected = await detectBinary(cliPath);
      return [
        `iMessage：${configured ? "已配置" : "需要设置"}`,
        `imsg：${cliDetected ? "已找到" : "未找到"} (${cliPath})`,
      ];
    },
    resolveSelectionHint: async ({ cfg }) => {
      const cliPath = cfg.channels?.imessage?.cliPath ?? "imsg";
      return (await detectBinary(cliPath)) ? "imsg 已找到" : "imsg 未找到";
    },
    resolveQuickstartScore: async ({ cfg }) => {
      const cliPath = cfg.channels?.imessage?.cliPath ?? "imsg";
      return (await detectBinary(cliPath)) ? 1 : 0;
    },
  },
  credentials: [],
  textInputs: [
    createIMessageCliPathTextInput(async ({ currentValue }) => {
      return !(await detectBinary(currentValue ?? "imsg"));
    }),
  ],
  completionNote: imessageCompletionNote,
  dmPolicy: imessageDmPolicy,
  disable: (cfg) => setSetupChannelEnabled(cfg, channel, false),
};

export { imessageSetupAdapter, parseIMessageAllowFromEntries };
