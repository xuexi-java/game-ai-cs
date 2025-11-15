# Dify API 配置说明

## 您的 Dify API 配置

根据您提供的 Dify API 信息：

- **基础 URL**: `http://118.89.16.95/v1`
- **认证方式**: `Authorization: Bearer {API_KEY}`
- **API 类型**: 工作流编排对话型应用 API
- **主要端点**: `/chat-messages` (POST)

## 配置步骤

### 1. 在游戏配置中添加 Dify API 信息

在管理后台的游戏设置中，为每个游戏配置：

- **Dify API Key**: 您的 API 密钥
- **Dify Base URL**: `http://118.89.16.95/v1`

### 2. 环境变量配置（可选）

如果需要设置默认的 Dify 配置，可以在 `.env` 文件中添加：

```env
# Dify AI 默认配置（可选，实际使用游戏配置）
DIFY_API_KEY=your-default-api-key
DIFY_BASE_URL=http://118.89.16.95/v1
```

## API 端点说明

### 1. 发送对话消息

**端点**: `POST /chat-messages`

**功能**: 创建会话消息，支持会话持久化

**请求示例**:
```json
{
  "inputs": {},
  "query": "用户的问题描述",
  "response_mode": "blocking",
  "user": "user-id",
  "conversation_id": "conversation-id" // 可选，用于会话持久化
}
```

**响应示例**:
```json
{
  "answer": "AI回复内容",
  "conversation_id": "conversation-id",
  "id": "message-id",
  "metadata": {}
}
```

### 2. 获取会话历史消息

**端点**: `GET /messages?conversation_id={conversation_id}`

**功能**: 获取指定会话的历史消息

### 3. 获取会话列表

**端点**: `GET /conversations?user={user_id}`

**功能**: 获取用户的会话列表

## 使用方式

### 在代码中使用

```typescript
// 1. 发送对话消息（首次，创建新会话）
const response = await difyService.sendChatMessage(
  '用户问题',
  apiKey,
  baseUrl,
);

// 2. 继续对话（使用会话ID，支持上下文）
const followUpResponse = await difyService.sendChatMessage(
  '后续问题',
  apiKey,
  baseUrl,
  response.conversation_id, // 使用之前的会话ID
  'user-id',
);

// 3. 获取会话历史
const history = await difyService.getConversationHistory(
  conversationId,
  apiKey,
  baseUrl,
);
```

## 会话持久化

Dify API 支持会话持久化，可以将之前的聊天记录作为上下文进行回答。在调用 `sendChatMessage` 时：

- **首次调用**: 不提供 `conversationId`，Dify 会创建新会话
- **后续调用**: 提供 `conversationId`，Dify 会使用该会话的历史记录作为上下文

## 注意事项

1. **API Key 安全**: 
   - 不要将 API Key 提交到 Git
   - 建议存储在数据库的游戏配置中，而不是环境变量

2. **超时设置**: 
   - 默认超时时间为 30 秒
   - 如果响应较慢，可以调整 `timeout` 配置

3. **错误处理**: 
   - 所有 API 调用都包含错误处理
   - 失败时会返回默认响应，不会中断业务流程

4. **响应模式**: 
   - 当前使用 `blocking` 模式（同步等待响应）
   - 如需异步处理，可以使用 `streaming` 模式

## 测试 API

您可以使用以下命令测试 Dify API：

```bash
curl -X POST http://118.89.16.95/v1/chat-messages \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {},
    "query": "测试消息",
    "response_mode": "blocking",
    "user": "test-user"
  }'
```

