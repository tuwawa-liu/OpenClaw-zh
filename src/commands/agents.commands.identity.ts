import fs from "node:fs/promises";
import path from "node:path";
import { t } from "../i18n/index.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { identityHasValues, parseIdentityMarkdown } from "../agents/identity-file.js";
import { DEFAULT_IDENTITY_FILENAME } from "../agents/workspace.js";
import { writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import type { IdentityConfig } from "../config/types.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { type RuntimeEnv, writeRuntimeJson } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath, shortenHomePath } from "../utils.js";
import { requireValidConfig } from "./agents.command-shared.js";
import {
  type AgentIdentity,
  findAgentEntryIndex,
  listAgentEntries,
  loadAgentIdentity,
} from "./agents.config.js";

type AgentsSetIdentityOptions = {
  agent?: string;
  workspace?: string;
  identityFile?: string;
  name?: string;
  emoji?: string;
  theme?: string;
  avatar?: string;
  fromIdentity?: boolean;
  json?: boolean;
};

const normalizeWorkspacePath = (input: string) => path.resolve(resolveUserPath(input));

const coerceTrimmed = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

async function loadIdentityFromFile(filePath: string): Promise<AgentIdentity | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = parseIdentityMarkdown(content);
    if (!identityHasValues(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveAgentIdByWorkspace(
  cfg: Parameters<typeof resolveAgentWorkspaceDir>[0],
  workspaceDir: string,
): string[] {
  const list = listAgentEntries(cfg);
  const ids =
    list.length > 0
      ? list.map((entry) => normalizeAgentId(entry.id))
      : [resolveDefaultAgentId(cfg)];
  const normalizedTarget = normalizeWorkspacePath(workspaceDir);
  return ids.filter(
    (id) => normalizeWorkspacePath(resolveAgentWorkspaceDir(cfg, id)) === normalizedTarget,
  );
}

export async function agentsSetIdentityCommand(
  opts: AgentsSetIdentityOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }

  const agentRaw = coerceTrimmed(opts.agent);
  const nameRaw = coerceTrimmed(opts.name);
  const emojiRaw = coerceTrimmed(opts.emoji);
  const themeRaw = coerceTrimmed(opts.theme);
  const avatarRaw = coerceTrimmed(opts.avatar);
  const hasExplicitIdentity = Boolean(nameRaw || emojiRaw || themeRaw || avatarRaw);

  const identityFileRaw = coerceTrimmed(opts.identityFile);
  const workspaceRaw = coerceTrimmed(opts.workspace);
  const wantsIdentityFile = Boolean(opts.fromIdentity || identityFileRaw || !hasExplicitIdentity);

  let identityFilePath: string | undefined;
  let workspaceDir: string | undefined;

  if (identityFileRaw) {
    identityFilePath = normalizeWorkspacePath(identityFileRaw);
    workspaceDir = path.dirname(identityFilePath);
  } else if (workspaceRaw) {
    workspaceDir = normalizeWorkspacePath(workspaceRaw);
  } else if (wantsIdentityFile || !agentRaw) {
    workspaceDir = path.resolve(process.cwd());
  }

  let agentId = agentRaw ? normalizeAgentId(agentRaw) : undefined;
  if (!agentId) {
    if (!workspaceDir) {
      runtime.error(t("commands.agentsIdentity.selectAgent"));
      runtime.exit(1);
      return;
    }
    const matches = resolveAgentIdByWorkspace(cfg, workspaceDir);
    if (matches.length === 0) {
      runtime.error(
        t("commands.agentsIdentity.noMatch", { workspace: shortenHomePath(workspaceDir) }),
      );
      runtime.exit(1);
      return;
    }
    if (matches.length > 1) {
      runtime.error(
        t("commands.agentsIdentity.multipleMatch", { workspace: shortenHomePath(workspaceDir), agents: matches.join(", ") }),
      );
      runtime.exit(1);
      return;
    }
    agentId = matches[0];
  }

  let identityFromFile: AgentIdentity | null = null;
  if (wantsIdentityFile) {
    if (identityFilePath) {
      identityFromFile = await loadIdentityFromFile(identityFilePath);
    } else if (workspaceDir) {
      identityFromFile = loadAgentIdentity(workspaceDir);
    }
    if (!identityFromFile) {
      const targetPath =
        identityFilePath ??
        (workspaceDir ? path.join(workspaceDir, DEFAULT_IDENTITY_FILENAME) : "IDENTITY.md");
      runtime.error(t("commands.agentsIdentity.noIdentityData", { path: shortenHomePath(targetPath) }));
      runtime.exit(1);
      return;
    }
  }

  const fileTheme =
    identityFromFile?.theme ?? identityFromFile?.creature ?? identityFromFile?.vibe ?? undefined;
  const incomingIdentity: IdentityConfig = {
    ...(nameRaw || identityFromFile?.name ? { name: nameRaw ?? identityFromFile?.name } : {}),
    ...(emojiRaw || identityFromFile?.emoji ? { emoji: emojiRaw ?? identityFromFile?.emoji } : {}),
    ...(themeRaw || fileTheme ? { theme: themeRaw ?? fileTheme } : {}),
    ...(avatarRaw || identityFromFile?.avatar
      ? { avatar: avatarRaw ?? identityFromFile?.avatar }
      : {}),
  };

  if (
    !incomingIdentity.name &&
    !incomingIdentity.emoji &&
    !incomingIdentity.theme &&
    !incomingIdentity.avatar
  ) {
    runtime.error(
      t("commands.agentsIdentity.noIdentityFields"),
    );
    runtime.exit(1);
    return;
  }

  const list = listAgentEntries(cfg);
  const index = findAgentEntryIndex(list, agentId);
  const base = index >= 0 ? list[index] : { id: agentId };
  const nextIdentity: IdentityConfig = {
    ...base.identity,
    ...incomingIdentity,
  };

  const nextEntry = {
    ...base,
    identity: nextIdentity,
  };

  const nextList = [...list];
  if (index >= 0) {
    nextList[index] = nextEntry;
  } else {
    const defaultId = normalizeAgentId(resolveDefaultAgentId(cfg));
    if (nextList.length === 0 && agentId !== defaultId) {
      nextList.push({ id: defaultId });
    }
    nextList.push(nextEntry);
  }

  const nextConfig = {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: nextList,
    },
  };

  await writeConfigFile(nextConfig);

  if (opts.json) {
    writeRuntimeJson(runtime, {
      agentId,
      identity: nextIdentity,
      workspace: workspaceDir ?? null,
      identityFile: identityFilePath ?? null,
    });
    return;
  }

  logConfigUpdated(runtime);
  runtime.log(`${t("commands.agentsIdentity.agentLabel")} ${agentId}`);
  if (nextIdentity.name) {
    runtime.log(`${t("commands.agentsIdentity.nameLabel")} ${nextIdentity.name}`);
  }
  if (nextIdentity.theme) {
    runtime.log(`${t("commands.agentsIdentity.themeLabel")} ${nextIdentity.theme}`);
  }
  if (nextIdentity.emoji) {
    runtime.log(`${t("commands.agentsIdentity.emojiLabel")} ${nextIdentity.emoji}`);
  }
  if (nextIdentity.avatar) {
    runtime.log(`${t("commands.agentsIdentity.avatarLabel")} ${nextIdentity.avatar}`);
  }
  if (workspaceDir) {
    runtime.log(`${t("commands.agentsIdentity.workspaceLabel")} ${shortenHomePath(workspaceDir)}`);
  }
}
