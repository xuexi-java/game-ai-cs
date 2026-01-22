# APK壳子开发说明（测试）

本文档用于指导测试 APK 壳子的开发与联调，重点覆盖「URL 传参模式」下的必要信息与注意事项。

## 1. 目标与范围
- 仅验证客服系统接入闭环：获取签名 → 打开 WebView → Bootstrap → WebSocket/上传
- 不包含账号体系、支付、推送等业务逻辑

## 2. 关键地址与环境
- `h5Url`：客服前端地址（WebView 加载的页面）
- `apiUrl`（可选）：客服后端 API 基址（H5 调用 `/api/v1/player/*`）
- `gameServerUrl`：游戏服务器地址（用于获取签名参数）

本地联调示例（可替换为内网 IP）：
- `h5Url`: `http://<IP>:5173`
- `apiUrl`: `http://<IP>:21101`（可选，按需传）
- `gameServerUrl`: `http://<IP>:3001`（mock-game-server）

## 3. 接入流程（URL 传参模式）
1. 玩家点击“客服中心”
2. APK 调用游戏服务器签名接口（带登录态/用户 Token）
3. 游戏服务器返回 `gameid/uid/areaid/playerName/ts/nonce/sign`
4. APK 拼接 URL（必要参数 + 可选 `apiUrl`）并打开 WebView
5. H5 使用 URL 参数调用客服后端 `/api/v1/player/connect`

## 4. 游戏服务器接口（示例）
在 mock 环境中，使用：
- `POST /api/get-cs-auth`
- 请求体：`{ "uid": "player001", "areaid": "1" }`
- 响应体（示例）：
```json
{
  "success": true,
  "data": {
    "gameid": "test_game",
    "uid": "player001",
    "areaid": "1",
    "playerName": "张三",
    "ts": 1737003600000,
    "nonce": "n7k9m2x4p6q8w3e5",
    "sign": "8149c825a2f85d7a034cda231f10903d",    "h5Url": "http://<IP>:5173"
  }
}  
```

## 5. WebView URL 拼接（APK 侧）
APK 负责拼接并打开完整 URL：
```
${h5Url}/?gameid=${gameid}&uid=${uid}&areaid=${areaid}&ts=${ts}&nonce=${nonce}&sign=${sign}&playerName=${playerName}&platform=android[&apiUrl=${apiUrl}]
```

注意：
- `ts/sign` 由游戏服务器生成，客户端不计算，不传 `secret`
- `ts` 有效期 2 小时，过期需要重新获取并刷新 URL
- `apiUrl` 可选：若 H5 构建时已配置 `VITE_API_URL` 或与后端同域反代，可不传；否则建议携带以避免默认 `localhost`
- URL 模式下不要注入 `roadWebViewService`，否则 H5 会优先走 Bridge 并忽略 URL

## 6. 签名规则（服务端计算）
```
sign = md5(gameid|uid|areaid|ts|nonce|secret).toLowerCase()
```
- `secret` 只保存在游戏服务器/后台配置，APK 不持有

## 7. WebView 配置建议
- 开启 JS：`javaScriptEnabled = true`
- 开启 DOM Storage：`domStorageEnabled = true`
- 允许文件访问：`allowFileAccess = true`
- 如果测试环境需要混合内容，设置 `mixedContentMode = MIXED_CONTENT_ALWAYS_ALLOW`

## 8. 文件上传与权限
若 H5 有图片上传：
- 实现 `WebChromeClient.onShowFileChooser`
- 动态申请权限：
  - Android 13+：`READ_MEDIA_IMAGES`
  - Android 12 及以下：`READ_EXTERNAL_STORAGE`
  - 如需拍照：`CAMERA`
- 在 `onActivityResult` 中回传 `ValueCallback<Uri[]>`

## 9. 错误处理与重试
- 网络错误：在 `onReceivedError` 中展示本地错误页并支持重试
- 签名过期：检测到 `SIGN_EXPIRED` 时重新请求签名并刷新 URL
- `MISSING_PARAMS`：检查 URL 是否缺字段或被截断

## 10. 调试建议
- Debug 构建开启 `WebView.setWebContentsDebuggingEnabled(true)`
- PC 使用 `chrome://inspect` 查看 H5 Console/Network

## 11. 本地测试步骤（参考）
1. 启动客服后端：`npm run dev:backend`
2. 启动玩家端 H5：`npm run dev:player`
3. 启动 mock 游戏服务器：`node test-tools/mock-game-server.js`
4. 使用 `http://localhost:3001/webview-test` 选择玩家并跳转
