# 认证凭证语义

本文档定义了以下组件使用的规范凭证资格和解析语义：

- `resolveAuthProfileOrder`
- `resolveApiKeyForProfile`
- `models status --probe`
- `doctor-auth`

目标是保持选择时和运行时行为一致。

## 稳定的原因代码

- `ok`
- `missing_credential`
- `invalid_expires`
- `expired`
- `unresolved_ref`

## 令牌凭证

令牌凭证（`type: "token"`）支持内联 `token` 和/或 `tokenRef`。

### 资格规则

1. 当 `token` 和 `tokenRef` 都不存在时，令牌配置文件不合格。
2. `expires` 是可选的。
3. 如果存在 `expires`，它必须是大于 `0` 的有限数字。
4. 如果 `expires` 无效（`NaN`、`0`、负数、非有限或类型错误），配置文件因 `invalid_expires` 而不合格。
5. 如果 `expires` 已过期，配置文件因 `expired` 而不合格。
6. `tokenRef` 不会绕过 `expires` 验证。

### 解析规则

1. 解析器对 `expires` 的语义与资格语义一致。
2. 对于合格的配置文件，令牌材料可以从内联值或 `tokenRef` 解析。
3. 不可解析的引用在 `models status --probe` 输出中产生 `unresolved_ref`。

## 旧版兼容消息

为了脚本兼容性，探测错误保持第一行不变：

`Auth profile credentials are missing or expired.`

后续行可以添加人类友好的详情和稳定的原因代码。
