# 阿里云 OSS 配置说明

## 配置步骤

### 1. 更新 .env 文件

在 `backend/.env` 文件中添加以下配置：

```env
# 阿里云 OSS 配置
# 请将以下配置添加到 backend/.env 文件中（不要提交到 Git）
OSS_ACCESS_KEY_ID=your-access-key-id
OSS_ACCESS_KEY_SECRET=your-access-key-secret
OSS_BUCKET=your-bucket-name
OSS_REGION=oss-cn-shenzhen
OSS_ENDPOINT=oss-cn-shenzhen.aliyuncs.com
```

### 2. 安装依赖

```bash
cd backend
npm install
```

### 3. 配置说明

- **OSS_ACCESS_KEY_ID**: 阿里云 AccessKey ID
- **OSS_ACCESS_KEY_SECRET**: 阿里云 AccessKey Secret
- **OSS_BUCKET**: OSS Bucket 名称
- **OSS_REGION**: OSS 地域（oss-cn-shenzhen 表示华南1深圳）
- **OSS_ENDPOINT**: OSS 访问端点（可选，如果不配置会自动根据 region 生成）

### 4. 存储路径

文件在 OSS 中的存储路径格式：
```
tickets/{ticketId}/{uuid}.{ext}
```

例如：
```
tickets/ticket-123/550e8400-e29b-41d4-a716-446655440000.jpg
```

### 5. 访问 URL

上传成功后，文件 URL 格式为：
```
https://game-ai-cs.oss-cn-shenzhen.aliyuncs.com/tickets/{ticketId}/{uuid}.{ext}
```

### 6. 回退到本地存储

如果未配置 OSS 相关环境变量，系统会自动使用本地文件存储（`./uploads` 目录）。

### 7. 安全建议

⚠️ **重要**: 
- `.env` 文件已添加到 `.gitignore`，不会被提交到 Git
- 生产环境请使用环境变量或密钥管理服务
- 定期轮换 AccessKey
- 为 OSS Bucket 配置适当的访问权限策略

### 8. Bucket 权限配置

根据您的截图，当前 Bucket 的读写权限是"公共读写"。建议：

1. **生产环境**: 改为"私有"，使用签名 URL 访问
2. **开发环境**: 可以保持"公共读写"以便测试

如果需要使用签名 URL，可以修改 `upload.service.ts` 中的 `saveFile` 方法，使用 `signatureUrl` 生成临时访问链接。

