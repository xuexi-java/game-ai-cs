# AI 客服系统 - 玩家端 WebView

基于 Vue 3 + TypeScript + Tailwind CSS 的玩家客服聊天界面，支持嵌入游戏内 WebView、原生 App（iOS/Android）及 Web 浏览器。

## 📋 目录

- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [核心功能](#核心功能)
- [平台接入](#平台接入)
- [配置说明](#配置说明)
- [开发指南](#开发指南)
- [构建部署](#构建部署)
- [常见问题](#常见问题)

---

## 🚀 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue 3 | 3.4.15 | UI 框架 |
| TypeScript | 5.3.3 | 类型安全 |
| Vite | 5.0.11 | 构建工具 |
| Pinia | 2.1.7 | 状态管理 |
| Socket.io Client | 4.7.2 | WebSocket 实时通信 |
| Tailwind CSS | 3.4.1 | 样式框架 |
| Marked | 17.0.1 | Markdown 渲染 |
| Crypto-js | 4.2.0 | 签名加密 |

---

## ⚡ 快速开始

### 1. 环境准备

确保已安装 Node.js 20+：

```bash
node -v  # v20.x.x
```

### 2. 安装依赖

```bash
cd frontend/webview-player
npm install
```

### 3. 配置后端 API 地址

在 `src/services/api.ts` 中配置后端地址：

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:21101/api/v1';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:21101';
```

**可选**：创建 `.env` 文件（推荐）：

```env
VITE_API_BASE_URL=http://localhost:21101/api/v1
VITE_WS_URL=ws://localhost:21101
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173 查看应用。

**测试参数**（URL Query）：
```
http://localhost:5173/?gameId=your-game-id&playerId=test-player-123
```

---

## 📁 项目结构

```
frontend/webview-player/
├── src/
│   ├── components/                  # Vue 组件
│   │   ├── ChatHeader.vue           # 聊天头部（标题、关闭按钮）
│   │   ├── ChatMain.vue             # 聊天主体（消息列表）
│   │   ├── ChatFooter.vue           # 聊天底部（输入框、发送按钮）
│   │   ├── MessageItem.vue          # 消息项（支持文本、图片、系统消息）
│   │   ├── MenuMessage.vue          # 菜单消息（多选项按钮）
│   │   ├── ImagePreview.vue         # 图片预览组件
│   │   ├── QueueBanner.vue          # 排队提示横幅
│   │   ├── TypingIndicator.vue      # 输入状态指示器
│   │   ├── RatingCard.vue           # 满意度评价卡片
│   │   ├── TicketResumeModal.vue    # 工单恢复弹窗
│   │   ├── AgentOfflineModal.vue    # 客服离线提示
│   │   └── CloseConfirmModal.vue    # 关闭确认弹窗
│   ├── services/                    # 服务层
│   │   ├── api.ts                   # HTTP API 封装
│   │   ├── socket.ts                # WebSocket 连接管理
│   │   ├── bridge.ts                # 平台桥接器（统一接口）
│   │   └── bridges/                 # 平台桥接实现
│   │       ├── android.ts           # Android Bridge
│   │       ├── ios.ts               # iOS Bridge
│   │       └── web.ts               # Web Bridge
│   ├── stores/                      # Pinia 状态管理
│   │   ├── chat.ts                  # 聊天状态（消息、会话）
│   │   └── connection.ts            # 连接状态（Socket、网络）
│   ├── composables/                 # 组合式 API
│   │   └── useChat.ts               # 聊天逻辑封装
│   ├── types/                       # TypeScript 类型定义
│   │   └── index.ts                 # 消息、会话、工单类型
│   ├── utils/                       # 工具函数
│   │   └── imageCompressor.ts       # 图片压缩工具
│   ├── styles/                      # 样式文件
│   │   └── main.css                 # 全局样式（Tailwind）
│   ├── App.vue                      # 根组件
│   └── main.ts                      # 应用入口
├── public/                          # 静态资源
├── index.html                       # HTML 模板
├── vite.config.ts                   # Vite 配置
├── tailwind.config.js               # Tailwind CSS 配置
├── tsconfig.json                    # TypeScript 配置
└── package.json
```

### 核心模块说明

| 模块 | 职责 | 关键文件 |
|------|------|----------|
| **Components** | UI 组件（聊天界面、消息项、弹窗） | `components/*.vue` |
| **Services** | API 调用、WebSocket、平台桥接 | `services/api.ts`<br>`services/socket.ts`<br>`services/bridge.ts` |
| **Stores** | 状态管理（消息、会话、连接状态） | `stores/chat.ts`<br>`stores/connection.ts` |
| **Composables** | 业务逻辑封装（聊天功能） | `composables/useChat.ts` |
| **Bridges** | 平台适配层（Android/iOS/Web） | `services/bridges/` |

---

## 🔑 核心功能

### 1. 实时聊天

**功能特点**：
- 发送/接收文本消息
- 图片上传与发送（自动压缩）
- 消息状态显示（发送中、已发送、失败）
- 消息时间戳
- 系统消息提示
- 菜单式消息（多选项按钮）
- Markdown 渲染支持

**消息类型**：
```typescript
type MessageType = 'TEXT' | 'IMAGE' | 'SYSTEM' | 'MENU';
```

### 2. 排队系统

**功能特点**：
- 实时显示排队位置
- 排队人数动态更新
- 预计等待时间提示
- 客服接入通知

**UI 展示**：
```
🔔 当前排队位置：第 3 位，请稍候...
```

### 3. 满意度评价

**功能特点**：
- 工单关闭后自动弹出评价卡片
- 1-5 星评分
- 可选文字评价
- 评价后自动关闭会话

**触发时机**：
- 客服关闭工单后
- 玩家主动关闭会话前

### 4. 输入状态指示

**功能特点**：
- 显示客服正在输入
- 300ms 防抖优化
- 自动隐藏（3 秒无输入）

**UI 展示**：
```
客服正在输入...
```

### 5. 工单恢复

**功能特点**：
- 检测未完成工单
- 弹窗询问是否恢复
- 加载历史消息
- 继续会话

**触发条件**：
- 玩家重新打开聊天窗口
- 存在未完成的工单

### 6. 图片上传

**功能特点**：
- 支持相册选择/拍照
- 自动压缩（最大 800x800，质量 0.7）
- 上传进度提示
- 图片预览与放大

**调用平台能力**：
```typescript
// Android
window.AndroidBridge.selectImage();

// iOS
window.webkit.messageHandlers.selectImage.postMessage({});

// Web
<input type="file" accept="image/*" />
```

### 7. 平台桥接（Bridge）

**支持平台**：
- **Android**：通过 `AndroidBridge` 对象
- **iOS**：通过 `webkit.messageHandlers`
- **Web**：使用 HTML5 API 降级

**统一接口**：
```typescript
interface Bridge {
  selectImage(): void;            // 选择图片
  closeWebView(): void;           // 关闭 WebView
  getDeviceInfo(): DeviceInfo;    // 获取设备信息
  navigateToGame(): void;         // 返回游戏
}
```

**自动检测**：
```typescript
// 自动识别运行平台
const platform = detectPlatform(); // 'android' | 'ios' | 'web'
const bridge = getBridge(platform);
```

### 8. 离线检测

**功能特点**：
- 检测网络断开
- 自动重连 WebSocket
- 离线提示弹窗
- 消息队列缓存

**重连策略**：
- 指数退避（1s → 2s → 4s → 8s）
- 最大重试次数：10 次
- 手动重连按钮

---

## 🔌 平台接入

### Android 接入

**1. 配置 WebView**：
```java
WebSettings settings = webView.getSettings();
settings.setJavaScriptEnabled(true);
settings.setDomStorageEnabled(true);
```

**2. 注入 Bridge 对象**：
```java
webView.addJavascriptInterface(new AndroidBridge(context), "AndroidBridge");

public class AndroidBridge {
    private Context context;

    @JavascriptInterface
    public void selectImage() {
        // 打开图片选择器
        Intent intent = new Intent(Intent.ACTION_PICK);
        intent.setType("image/*");
        activity.startActivityForResult(intent, REQUEST_IMAGE);
    }

    @JavascriptInterface
    public void closeWebView() {
        activity.finish();
    }

    @JavascriptInterface
    public String getDeviceInfo() {
        JSONObject info = new JSONObject();
        info.put("platform", "android");
        info.put("version", Build.VERSION.RELEASE);
        return info.toString();
    }
}
```

**3. 加载 WebView URL**：
```java
String url = "https://your-domain.com/player?gameId=" + gameId
           + "&playerId=" + playerId
           + "&sign=" + generateSign(gameId, playerId, timestamp);
webView.loadUrl(url);
```

**4. 处理图片选择回调**：
```java
@Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == REQUEST_IMAGE && resultCode == RESULT_OK) {
        Uri imageUri = data.getData();
        String base64 = convertToBase64(imageUri);

        // 调用 JS 回调
        webView.evaluateJavascript(
            "window.onImageSelected('" + base64 + "')",
            null
        );
    }
}
```

### iOS 接入

**1. 配置 WKWebView**：
```swift
let config = WKWebViewConfiguration()
config.preferences.javaScriptEnabled = true

let webView = WKWebView(frame: .zero, configuration: config)
```

**2. 注册消息处理器**：
```swift
// 选择图片
config.userContentController.add(self, name: "selectImage")

// 关闭 WebView
config.userContentController.add(self, name: "closeWebView")

// 实现代理
extension ViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                              didReceive message: WKScriptMessage) {
        switch message.name {
        case "selectImage":
            presentImagePicker()
        case "closeWebView":
            dismiss(animated: true)
        default:
            break
        }
    }
}
```

**3. 加载 URL**：
```swift
let urlString = "https://your-domain.com/player?gameId=\(gameId)&playerId=\(playerId)&sign=\(sign)"
let url = URL(string: urlString)!
let request = URLRequest(url: url)
webView.load(request)
```

**4. 图片选择回调**：
```swift
func imagePickerController(_ picker: UIImagePickerController,
                          didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
    if let image = info[.originalImage] as? UIImage {
        let base64 = image.jpegData(compressionQuality: 0.7)?.base64EncodedString()

        // 调用 JS 回调
        let js = "window.onImageSelected('\(base64!)')"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
    picker.dismiss(animated: true)
}
```

### Web 接入

**直接嵌入 iframe**：
```html
<iframe
  src="https://your-domain.com/player?gameId=game1&playerId=player123&sign=xxx"
  width="100%"
  height="600px"
  frameborder="0"
  allow="camera;microphone"
></iframe>
```

**或通过新窗口打开**：
```javascript
const url = `https://your-domain.com/player?gameId=${gameId}&playerId=${playerId}&sign=${sign}`;
window.open(url, '_blank', 'width=400,height=600');
```

---

## ⚙️ 配置说明

### 环境变量（可选）

创建 `.env` 文件：

```env
# API 服务器地址
VITE_API_BASE_URL=https://api.your-domain.com/api/v1

# WebSocket 服务器地址
VITE_WS_URL=wss://api.your-domain.com
```

### URL 参数（必需）

| 参数 | 必需 | 说明 | 示例 |
|------|------|------|------|
| `gameId` | ✅ | 游戏 ID | `game-001` |
| `playerId` | ✅ | 玩家 ID | `player-12345` |
| `sign` | ✅ | 签名（防篡改） | `abc123...` |
| `timestamp` | ✅ | 时间戳（毫秒） | `1706000000000` |
| `playerName` | ❌ | 玩家昵称 | `张三` |
| `playerAvatar` | ❌ | 玩家头像 URL | `https://...` |
| `vipLevel` | ❌ | VIP 等级 | `5` |

**签名生成算法**（后端实现）：

```typescript
// Node.js 示例
import crypto from 'crypto';

function generateSign(gameId: string, playerId: string, timestamp: number, secretKey: string): string {
  const data = `${gameId}:${playerId}:${timestamp}`;
  return crypto.createHmac('sha256', secretKey).update(data).digest('hex');
}
```

**完整 URL 示例**：
```
https://your-domain.com/player?gameId=game1&playerId=p123&timestamp=1706000000000&sign=abc123def456&playerName=张三&vipLevel=3
```

### Tailwind 配置

**tailwind.config.js**：

```javascript
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1890ff',
        secondary: '#52c41a',
      },
    },
  },
};
```

### Vite 配置

**vite.config.ts**：

```typescript
export default defineConfig({
  server: {
    port: 5173,
    host: '0.0.0.0', // 允许外部访问（移动设备测试）
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
```

---

## 🛠️ 开发指南

### 本地开发

```bash
# 启动开发服务器
npm run dev

# 类型检查
npm run type-check
```

**移动设备测试**：
1. 确保设备与开发机在同一局域网
2. 访问 `http://你的IP:5173`
3. 添加测试参数

### 添加新消息类型

**1. 定义类型**（src/types/index.ts）：
```typescript
export type MessageType = 'TEXT' | 'IMAGE' | 'SYSTEM' | 'MENU' | 'YOUR_NEW_TYPE';
```

**2. 更新 MessageItem 组件**：
```vue
<template>
  <div v-if="message.type === 'YOUR_NEW_TYPE'">
    <!-- 自定义渲染 -->
  </div>
</template>
```

### 添加新 Bridge 方法

**1. 在 Bridge 接口添加方法**：
```typescript
// services/bridge.ts
export interface Bridge {
  yourNewMethod(): void;
}
```

**2. 实现各平台**：
```typescript
// services/bridges/android.ts
yourNewMethod() {
  window.AndroidBridge.yourNewMethod();
}

// services/bridges/ios.ts
yourNewMethod() {
  window.webkit.messageHandlers.yourNewMethod.postMessage({});
}

// services/bridges/web.ts
yourNewMethod() {
  console.log('Web platform does not support this method');
}
```

### 调试技巧

**Chrome 远程调试（Android）**：
```bash
# 1. 启用 USB 调试
# 2. 连接设备
# 3. 访问 chrome://inspect
```

**Safari 远程调试（iOS）**：
```
1. iPhone 设置 → Safari → 高级 → Web 检查器（开启）
2. Mac Safari → 开发 → 选择设备
```

**Weinre 调试（通用）**：
```bash
npm install -g weinre
weinre --boundHost -all-
# 在页面添加 <script src="http://YOUR_IP:8080/target/target-script-min.js"></script>
```

---

## 🚢 构建部署

### 构建生产版本

```bash
npm run build
```

构建产物在 `dist/` 目录。

### 部署到静态服务器

**Nginx 配置**：
```nginx
server {
    listen 80;
    server_name player.your-domain.com;

    root /var/www/webview-player;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://backend:21101;
    }

    # WebSocket 代理
    location /socket.io/ {
        proxy_pass http://backend:21101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 部署到 CDN

1. 构建项目
2. 上传 `dist/` 到 CDN（如阿里云 OSS）
3. 配置 CORS 头
4. 设置缓存策略：
   - `index.html`：不缓存
   - 静态资源（JS/CSS）：长缓存（1 年）

### Docker 部署

**Dockerfile**：
```dockerfile
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## ❓ 常见问题

### 1. WebSocket 连接失败

**问题**：无法连接到服务器

**解决方案**：
- 检查 `VITE_WS_URL` 配置
- 生产环境必须使用 `wss://`（HTTPS 页面）
- 确认后端 WebSocket 服务正常

### 2. 签名验证失败

**问题**：API 返回签名错误

**解决方案**：
- 检查 `timestamp` 是否为毫秒级时间戳
- 确认签名算法与后端一致
- 验证 `secretKey` 配置正确

### 3. 图片上传失败

**问题**：上传图片无响应

**解决方案**：
- 检查文件大小（默认限制 10MB）
- 确认后端 `UPLOAD_TOKEN_SECRET` 配置
- 验证 Bridge 方法是否正确实现

### 4. iOS 图片显示白屏

**问题**：iOS WebView 图片不显示

**解决方案**：
- 检查图片 URL 是否为 HTTPS
- 添加 `img-src *` 到 CSP 策略
- 使用 `blob:` URL 代替 `data:` URL

### 5. Android 关闭按钮无效

**问题**：点击关闭按钮无反应

**解决方案**：
- 确认 `AndroidBridge.closeWebView()` 方法已实现
- 检查 JavaScript 接口是否正确注入
- 验证 `@JavascriptInterface` 注解

### 6. 消息未实时更新

**问题**：新消息不显示

**解决方案**：
- 检查 WebSocket 连接状态
- 确认已订阅 `message` 事件
- 查看控制台是否有错误

### 7. 排队位置不更新

**问题**：排队位置一直不变

**解决方案**：
- 检查 WebSocket `queueUpdate` 事件
- 确认会话状态为 `QUEUED`
- 验证后端队列服务正常

### 8. 工单恢复弹窗不显示

**问题**：有未完成工单但不提示恢复

**解决方案**：
- 检查 `playerId` 和 `gameId` 是否正确
- 确认后端返回了未完成工单
- 查看控制台是否有错误

### 9. 样式错误

**问题**：Tailwind 样式不生效

**解决方案**：
```bash
# 重新生成 Tailwind CSS
npm run build
```

### 10. 性能优化

**如何提升性能**：

- **懒加载图片**：
```vue
<img loading="lazy" :src="imageUrl" />
```

- **虚拟滚动**（长消息列表）
- **消息分页加载**（每次加载 20 条）
- **图片压缩**（已内置）
- **减少重渲染**：使用 `v-memo`

---

## 🔧 常用命令速查

```bash
# 开发
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm run preview          # 预览构建产物
npm run type-check       # TypeScript 类型检查

# 依赖管理
npm install              # 安装依赖
npm update               # 更新依赖
npm outdated             # 查看过期依赖
```

---

## 📚 相关文档

- [客服系统接入文档](../../docs/客服系统接入文档.md)
- [APK 壳子开发说明](../../docs/APK壳子开发说明.md)
- [后端 API 文档](../../backend/README.md)
- [Vue 3 文档](https://cn.vuejs.org/)
- [Tailwind CSS 文档](https://tailwindcss.com/)

---

## 📞 技术支持

如有问题，请联系开发团队或提交 Issue。

**应用版本**：v1.0.0
**最后更新**：2026-01-22
