# OpenClaw Chrome 扩展（浏览器中继）

用途：将 OpenClaw 附加到现有的 Chrome 标签页，以便 Gateway 可以通过本地 CDP 中继服务器进行自动化操作。

## 开发 / 加载未打包扩展

1. 构建/运行启用了浏览器控制的 OpenClaw Gateway。
2. 确保中继服务器可在 `http://127.0.0.1:18792/`（默认）访问。
3. 将扩展安装到稳定路径：

   ```bash
   openclaw browser extension install
   openclaw browser extension path
   ```

4. Chrome -> `chrome://extensions` -> 启用"开发者模式"。
5. "加载已解压的扩展程序" -> 选择上面打印的路径。
6. 固定扩展。点击标签页上的图标来附加/分离。

## 选项

- `中继端口`：默认为 `18792`。
- `Gateway 令牌`：必须。将其设置为 `gateway.auth.token`（或 `OPENCLAW_GATEWAY_TOKEN`）。
