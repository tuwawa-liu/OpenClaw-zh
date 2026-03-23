import type { PluginRuntime } from "openclaw/plugin-sdk/mattermost";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setMattermostRuntime, getRuntime: getMattermostRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Mattermost 运行时未初始化");
export { getMattermostRuntime, setMattermostRuntime };
