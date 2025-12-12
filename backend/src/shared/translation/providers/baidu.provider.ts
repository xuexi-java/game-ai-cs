
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { DetectResult, TranslateResult, TranslationProvider } from '../translation.interface';

@Injectable()
export class BaiduTranslationProvider implements TranslationProvider {
    private readonly logger = new Logger(BaiduTranslationProvider.name);
    private readonly appId: string;
    private readonly secret: string;
    // 百度翻译 API 地址（使用 HTTPS）
    private readonly apiUrl = 'https://fanyi-api.baidu.com/api/trans/vip/translate';
    // 环境检查：是否为生产环境
    private readonly isProduction: boolean;

    constructor(private readonly configService: ConfigService) {
        // 初始化环境检查
        this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
        // 获取并清理环境变量，去除可能的空白字符和隐藏字符
        const rawAppId = this.configService.get<string>('BAIDU_TRANSLATE_APP_ID') || '';
        const rawSecret = this.configService.get<string>('BAIDU_TRANSLATE_SECRET') || '';

        // 详细的诊断日志
        this.logger.log(`[Baidu Translation Provider Initialization]`);
        this.logger.log(`  Raw App ID from env: "${rawAppId}" (length: ${rawAppId.length})`);
        this.logger.log(`  Raw Secret from env: "${rawSecret ? '*'.repeat(rawSecret.length) : 'missing'}" (length: ${rawSecret?.length || 0})`);

        // 更严格的清理：去除首尾空白字符、引号、换行符、制表符等
        this.appId = rawAppId.trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t]/g, '');
        this.secret = rawSecret.trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t]/g, '');

        this.logger.log(`  Cleaned App ID: "${this.appId}" (length: ${this.appId.length})`);
        this.logger.log(`  Cleaned Secret: "${this.secret ? '*'.repeat(this.secret.length) : 'missing'}" (length: ${this.secret?.length || 0})`);

        // 🚨 检测 Secret 是否是星号字符串（严重错误）
        if (this.secret && /^\*+$/.test(this.secret)) {
            this.logger.error('❌ 严重错误：Secret 值是星号字符串！');
            this.logger.error(`  检测到 Secret 值为: "${this.secret}"`);
            this.logger.error(`  这说明 .env 文件中可能配置了占位符而不是真实密钥`);
            this.logger.error(`  💡 请立即修复 .env 文件:`);
            this.logger.error(`     将 BAIDU_TRANSLATE_SECRET=********************`);
            this.logger.error(`     改为 BAIDU_TRANSLATE_SECRET=H1dETwWWqk45uN2DzGxK`);
            this.logger.error(`  然后重启后端服务`);
        }

        if (!this.appId || !this.secret) {
            this.logger.error('❌ Baidu Translate API credentials are missing!');
            this.logger.error(`  App ID: "${this.appId}" (length: ${this.appId.length})`);
            this.logger.error(`  Secret: "${this.secret ? '*'.repeat(this.secret.length) : 'missing'}" (length: ${this.secret?.length || 0})`);
            this.logger.error(`  💡 请检查 .env 文件中是否包含以下配置:`);
            this.logger.error(`     BAIDU_TRANSLATE_APP_ID=20250311002299702`);
            this.logger.error(`     BAIDU_TRANSLATE_SECRET=H1dETwWWqk45uN2DzGxK`);
        } else {
            this.logger.log(`✅ Baidu Translate API configured successfully`);
            this.logger.log(`  App ID: ${this.appId}`);
            this.logger.log(`  Secret length: ${this.secret.length}`);

            // 验证 Secret 长度（百度翻译 API 的 Secret 通常是 20 个字符）
            if (this.secret.length !== 20) {
                this.logger.warn(`⚠️  Warning: Secret length is ${this.secret.length}, expected 20. This may cause signature errors.`);
            } else {
                this.logger.log(`  ✅ Secret length is correct (20)`);
            }

            // 验证 Secret 是否包含非ASCII字符或特殊字符（Secret应该只包含字母和数字）
            if (!/^[a-zA-Z0-9]+$/.test(this.secret)) {
                this.logger.warn(`⚠️  Warning: Secret contains non-alphanumeric characters. This may cause signature errors.`);
                // 输出Secret中每个字符的详细信息
                const invalidChars = this.secret.split('').filter(c => !/^[a-zA-Z0-9]$/.test(c));
                this.logger.warn(`  Invalid characters found: ${invalidChars.map(c => `'${c}' (code: ${c.charCodeAt(0)})`).join(', ')}`);
            } else {
                this.logger.log(`  ✅ Secret format is valid (alphanumeric only)`);
            }

            // 验证 Secret 值是否正确（通过前3个和后3个字符）
            if (this.secret.length >= 6) {
                const expectedStart = 'H1d';
                const expectedEnd = 'zGxK';
                const actualStart = this.secret.substring(0, 3);
                const actualEnd = this.secret.substring(this.secret.length - 4);
                if (actualStart === expectedStart && actualEnd === expectedEnd) {
                    this.logger.log(`  ✅ Secret value appears to be correct (verified by prefix/suffix)`);
                } else {
                    this.logger.warn(`⚠️  Warning: Secret value may be incorrect`);
                    this.logger.warn(`  Expected start: "${expectedStart}", actual: "${actualStart}"`);
                    this.logger.warn(`  Expected end: "${expectedEnd}", actual: "${actualEnd}"`);
                }
            }
        }
    }

    /**
     * 脱敏文本内容（保护用户隐私）
     * 生产环境：返回 [REDACTED] length=XX
     * 开发/测试环境：返回完整内容
     */
    private redactText(text: string): string {
        if (this.isProduction) {
            return `[REDACTED] length=${text.length}`;
        }
        return text;
    }

    /**
     * 脱敏 Secret 密钥（保护安全）
     * 任何环境下都只显示前3位和后3位，中间用...代替
     */
    private redactSecret(secret: string): string {
        if (!secret || secret.length === 0) {
            return '[REDACTED]';
        }
        if (secret.length >= 6) {
            return `${secret.substring(0, 3)}...${secret.substring(secret.length - 3)}`;
        }
        // 如果长度小于6，只显示长度信息
        return `[REDACTED] length=${secret.length}`;
    }

    /**
     * 脱敏 API 响应数据（保护用户隐私）
     * 脱敏 trans_result 中的 src 和 dst 字段
     */
    private sanitizeApiResponse(data: any): any {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const sanitized = { ...data };

        // 脱敏翻译结果中的文本内容
        if (sanitized.trans_result && Array.isArray(sanitized.trans_result)) {
            sanitized.trans_result = sanitized.trans_result.map((item: any) => ({
                ...item,
                src: this.isProduction 
                    ? `[REDACTED] length=${item.src?.length || 0}` 
                    : item.src, // 开发环境保留完整内容便于调试
                dst: this.isProduction 
                    ? `[REDACTED] length=${item.dst?.length || 0}` 
                    : item.dst, // 开发环境保留完整内容便于调试
            }));
        }

        return sanitized;
    }

    private sign(q: string, salt: string): string {
        // 百度翻译 API 签名计算：appid + 原文（未编码）+ salt + 密钥
        // 注意：签名计算使用原始文本，不需要 URL 编码
        // 确保文本是字符串类型，不进行任何修改（包括 trim）
        const query = String(q || '');

        // 验证必要的参数
        if (!this.appId || !this.secret) {
            throw new Error('Baidu Translate API credentials are not configured');
        }

        // 拼接签名字符串：appid + 原文 + salt + 密钥
        // 重要：按照百度API文档，顺序必须是 appid + q + salt + secret
        const str = this.appId + query + salt + this.secret;

        // MD5 加密，生成 32 位小写十六进制字符串
        // 使用 UTF-8 编码确保中文字符正确处理
        const sign = crypto.createHash('md5').update(str, 'utf8').digest('hex');

        // 详细的调试日志（环境感知，保护隐私）
        this.logger.log(`[Sign Calculation]`);
        this.logger.log(`  appId: "${this.appId}" (length: ${this.appId.length})`);
        this.logger.log(`  query: "${this.redactText(query)}" (length: ${query.length}, bytes: ${Buffer.from(query, 'utf8').length})`);
        this.logger.log(`  salt: "${salt}"`);
        this.logger.log(`  secret: "${'*'.repeat(this.secret.length)}" (length: ${this.secret.length})`);
        // 显示签名字符串（脱敏处理，任何环境都脱敏用户输入）
        this.logger.log(`  sign string: "${this.appId}[REDACTED]${salt}[REDACTED]" (length: ${str.length})`);
        this.logger.log(`  sign (MD5): "${sign}"`);
        this.logger.log(`  sign string length: ${str.length}, sign string bytes: ${Buffer.from(str, 'utf8').length}`);

        return sign;
    }

    async detect(text: string): Promise<DetectResult> {
        try {
            // Baidu efficient detection via side-effect
            const res = await this.translate(text, 'en', 'auto');
            return {
                language: res.sourceLanguage,
                confidence: 0.8,
            };
        } catch (error) {
            this.logger.error('Detection failed', error);
            return { language: 'auto', confidence: 0 };
        }
    }

    async translate(text: string, to: string, from: string = 'auto'): Promise<TranslateResult> {
        if (!text) {
            return { content: '', sourceLanguage: from, targetLanguage: to, provider: 'baidu' };
        }

        const salt = Date.now().toString();

        try {
            // 检查 API 凭证
            if (!this.appId || !this.secret) {
                this.logger.error('Baidu Translate API credentials are missing! Cannot translate.');
                throw new Error('Baidu Translate API credentials are not configured');
            }

            this.logger.log(`Translating text (length: ${text.length}) from ${from} to ${to}`);

            // 计算签名（使用原始文本，不需要 URL 编码）
            // 百度 API 要求：appid + 原文 + salt + 密钥，然后 MD5
            const sign = this.sign(text, salt);

            // 发送请求（axios 会自动对参数进行 URL 编码）
            // 注意：签名计算使用原始文本，但请求参数会被 axios 自动 URL 编码
            this.logger.log(`[Request Parameters]`);
            this.logger.log(`  q: "${this.redactText(text)}"`);
            this.logger.log(`  from: ${from}`);
            this.logger.log(`  to: ${to}`);
            this.logger.log(`  appid: ${this.appId}`);
            this.logger.log(`  salt: ${salt}`);
            this.logger.log(`  sign: ${sign}`);

            const response = await axios.get(this.apiUrl, {
                params: {
                    q: text,  // axios 会自动进行 URL 编码
                    from: from,
                    to: to,
                    appid: this.appId,
                    salt: salt,
                    sign: sign,
                },
                timeout: 10000, // 10秒超时
            });

            const data = response.data;

            // 记录 API 响应（脱敏处理）
            const sanitizedResponse = this.sanitizeApiResponse(data);
            this.logger.log(`[API Response] ${JSON.stringify(sanitizedResponse).substring(0, 200)}`);

            if (data.error_code) {
                this.logger.error(`Baidu Translation Error: ${data.error_code} - ${data.error_msg}`);

                // 针对常见错误码提供更详细的错误信息
                let errorMessage = data.error_msg;
                switch (data.error_code) {
                    case 54001:
                        // 签名错误 - 提供详细的诊断信息
                        errorMessage = `签名错误 (${data.error_msg})。请检查：\n` +
                            `1. App ID 是否正确（当前: ${this.appId}）\n` +
                            `2. Secret 是否正确（长度: ${this.secret.length}，应为20）\n` +
                            `3. 环境变量 BAIDU_TRANSLATE_APP_ID 和 BAIDU_TRANSLATE_SECRET 是否正确设置\n` +
                            `4. Secret 是否包含隐藏字符或空格（Secret应只包含字母和数字）\n` +
                            `5. 请登录百度翻译开放平台验证 App ID 和 Secret 是否正确`;
                        this.logger.error(`[Signature Error Diagnosis]`);
                        this.logger.error(`  App ID: "${this.appId}" (length: ${this.appId.length})`);
                        this.logger.error(`  Secret length: ${this.secret.length} (expected: 20)`);
                        this.logger.error(`  Secret format valid: ${/^[a-zA-Z0-9]+$/.test(this.secret)}`);
                        // 输出Secret的脱敏信息（任何环境下都脱敏）
                        this.logger.error(`  Secret preview: "${this.redactSecret(this.secret)}"`);
                        // 脱敏 Sign string 中的文本内容（任何环境都脱敏）
                        this.logger.error(`  Sign string used: "${this.appId}[REDACTED]${salt}[REDACTED]"`);
                        this.logger.error(`  💡 提示: 请使用 test-baidu-sign.js 脚本验证 Secret 是否正确`);
                        break;
                    case 54003:
                        errorMessage = `访问频率受限 (${data.error_msg})。请稍后重试。`;
                        break;
                    case 54004:
                        errorMessage = `账户余额不足 (${data.error_msg})。`;
                        break;
                    case 54005:
                        errorMessage = `请求频率过快 (${data.error_msg})。请稍后重试。`;
                        break;
                }

                throw new Error(`Translation failed: ${errorMessage}`);
            }

            // 处理翻译结果
            if (!data.trans_result || !Array.isArray(data.trans_result) || data.trans_result.length === 0) {
                throw new Error('Translation failed: No translation result returned');
            }

            const dst = data.trans_result.map((item: any) => item.dst).join('\n');
            const src = data.trans_result[0].src || from;

            this.logger.log(`Translation successful: ${src} -> ${to}, result length: ${dst.length}`);

            return {
                content: dst,
                sourceLanguage: src,
                targetLanguage: to,
                provider: 'baidu',
            };
        } catch (error: any) {
            this.logger.error(`Baidu Translation Request Failed: ${error.message}`);
            // 脱敏错误响应数据（可能包含用户输入）
            const errorData = error.response?.data || error.message;
            if (error.response?.data && typeof error.response.data === 'object') {
                // 如果是对象，脱敏可能包含用户文本的字段
                const sanitizedData = { ...error.response.data };
                if (sanitizedData.trans_result && Array.isArray(sanitizedData.trans_result)) {
                    // 脱敏翻译结果中的文本内容
                    sanitizedData.trans_result = sanitizedData.trans_result.map((item: any) => ({
                        ...item,
                        src: this.isProduction ? `[REDACTED] length=${item.src?.length || 0}` : item.src,
                        dst: this.isProduction ? `[REDACTED] length=${item.dst?.length || 0}` : item.dst,
                    }));
                }
                this.logger.error(`Error details: ${JSON.stringify(sanitizedData)}`);
            } else {
                this.logger.error(`Error details: ${JSON.stringify(errorData)}`);
            }

            // 只有在明确是服务关闭的情况下才使用 Mock（避免在开发环境自动 fallback）
            if (error.message.includes('service close') || error.response?.data?.error_code === 58002) {
                this.logger.warn('Using Mock Translation due to service closure');
                return {
                    content: `[MockData] ${text}`,
                    sourceLanguage: from === 'auto' ? 'en' : from,
                    targetLanguage: to,
                    provider: 'mock',
                };
            }

            // 其他错误直接抛出，让调用方处理
            throw error;
        }
    }
}
