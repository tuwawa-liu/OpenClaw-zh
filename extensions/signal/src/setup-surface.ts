import {
  createDetectedBinaryStatus,
  setSetupChannelEnabled,
  type ChannelSetupWizard,
} from "openclaw/plugin-sdk/setup";
import { detectBinary, installSignalCli } from "openclaw/plugin-sdk/setup-tools";
import { listSignalAccountIds, resolveSignalAccount } from "./accounts.js";
import {
  createSignalCliPathTextInput,
  normalizeSignalAccountInput,
  parseSignalAllowFromEntries,
  signalCompletionNote,
  signalDmPolicy,
  signalNumberTextInput,
  signalSetupAdapter,
} from "./setup-core.js";

const channel = "signal" as const;

export const signalSetupWizard: ChannelSetupWizard = {
  channel,
  status: createDetectedBinaryStatus({
    channelLabel: "Signal",
    binaryLabel: "signal-cli",
    configuredLabel: "configured",
    unconfiguredLabel: "needs setup",
    configuredHint: "signal-cli found",
    unconfiguredHint: "signal-cli missing",
    configuredScore: 1,
    unconfiguredScore: 0,
    resolveConfigured: ({ cfg }) =>
      listSignalAccountIds(cfg).some(
        (accountId) => resolveSignalAccount({ cfg, accountId }).configured,
      ),
    resolveBinaryPath: ({ cfg }) => cfg.channels?.signal?.cliPath ?? "signal-cli",
    detectBinary,
  }),
  prepare: async ({ cfg, accountId, credentialValues, runtime, prompter, options }) => {
    if (!options?.allowSignalInstall) {
      return;
    }
    const currentCliPath =
      (typeof credentialValues.cliPath === "string" ? credentialValues.cliPath : undefined) ??
      resolveSignalAccount({ cfg, accountId }).config.cliPath ??
      "signal-cli";
    const cliDetected = await detectBinary(currentCliPath);
    const wantsInstall = await prompter.confirm({
      message: cliDetected
        ? "signal-cli 已检测到。重新安装/更新？"
        : "signal-cli 未找到。立即安装？",
      initialValue: !cliDetected,
    });
    if (!wantsInstall) {
      return;
    }
    try {
      const result = await installSignalCli(runtime);
      if (result.ok && result.cliPath) {
        await prompter.note(`已安装 signal-cli 到 ${result.cliPath}`, "Signal");
        return {
          credentialValues: {
            cliPath: result.cliPath,
          },
        };
      }
      if (!result.ok) {
        await prompter.note(result.error ?? "signal-cli 安装失败。", "Signal");
      }
    } catch (error) {
      await prompter.note(`signal-cli 安装失败：${String(error)}`, "Signal");
    }
  },
  credentials: [],
  textInputs: [
    createSignalCliPathTextInput(async ({ currentValue }) => {
      return !(await detectBinary(currentValue ?? "signal-cli"));
    }),
    signalNumberTextInput,
  ],
  completionNote: signalCompletionNote,
  dmPolicy: signalDmPolicy,
  disable: (cfg) => setSetupChannelEnabled(cfg, channel, false),
};

export { normalizeSignalAccountInput, parseSignalAllowFromEntries, signalSetupAdapter };
