import type { PluginRuntime } from "openclaw/plugin-sdk/matrix";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setMatrixRuntime, getRuntime: getMatrixRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Matrix 运行时未初始化");
export { getMatrixRuntime, setMatrixRuntime };
