import type { PluginRuntime } from "openclaw/plugin-sdk/msteams";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setMSTeamsRuntime, getRuntime: getMSTeamsRuntime } =
  createPluginRuntimeStore<PluginRuntime>("MSTeams 运行时未初始化");
export { getMSTeamsRuntime, setMSTeamsRuntime };
