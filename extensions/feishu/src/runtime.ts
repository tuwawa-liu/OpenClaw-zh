import type { PluginRuntime } from "openclaw/plugin-sdk/feishu";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setFeishuRuntime, getRuntime: getFeishuRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Feishu 运行时未初始化");
export { getFeishuRuntime, setFeishuRuntime };
