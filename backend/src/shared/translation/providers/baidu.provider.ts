
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { DetectResult, TranslateResult, TranslationProvider } from '../translation.interface';
import { AppLogger } from '../../../common/logger/app-logger.service';

@Injectable()
export class BaiduTranslationProvider implements TranslationProvider {
    private readonly logger: AppLogger;
    private readonly appId: string;
    private readonly secret: string;
    // 百度翻译 API 地址（使用 HTTPS）
    private readonly apiUrl = 'https://fanyi-api.baidu.com/api/trans/vip/translate';

    constructor(
        private readonly configService: ConfigService,
        logger: AppLogger,
    ) {
        this.logger = logger;
        this.logger.setContext(BaiduTranslationProvider.name);
        // 获取并清理环境变量，去除可能的空白字符和隐藏字符
        const rawAppId = this.configService.get<string>('BAIDU_TRANSLATE_APP_ID') || '';
        const rawSecret = this.configService.get<string>('BAIDU_TRANSLATE_SECRET') || '';

        // 详细的诊断日志（DEBUG 级别）
        this.logger.debug(`[Baidu Translation Provider Initialization]`);
        this.logger.debug(`  Raw App ID from env: "${rawAppId}" (length: ${rawAppId.length})`);
        this.logger.debug(`  Raw Secret from env: "${rawSecret ? '*'.repeat(rawSecret.length) : 'missing'}" (length: ${rawSecret?.length || 0})`);

        // 更严格的清理：去除首尾空白字符、引号、换行符、制表符等
        this.appId = rawAppId.trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t]/g, '');
        this.secret = rawSecret.trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t]/g, '');

        this.logger.debug(`  Cleaned App ID: "${this.appId}" (length: ${this.appId.length})`);
        this.logger.debug(`  Cleaned Secret: "${this.secret ? '*'.repeat(this.secret.length) : 'missing'}" (length: ${this.secret?.length || 0})`);

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
            this.logger.debug(`✅ Baidu Translate API configured successfully`);
            this.logger.debug(`  App ID: ${this.appId}`);
            this.logger.debug(`  Secret length: ${this.secret.length}`);

            // 验证 Secret 长度（百度翻译 API 的 Secret 通常是 20 个字符）
            if (this.secret.length !== 20) {
                this.logger.warn(`⚠️  Warning: Secret length is ${this.secret.length}, expected 20. This may cause signature errors.`);
            } else {
                this.logger.debug(`  ✅ Secret length is correct (20)`);
            }

            // 验证 Secret 是否包含非ASCII字符或特殊字符（Secret应该只包含字母和数字）
            if (!/^[a-zA-Z0-9]+$/.test(this.secret)) {
                this.logger.warn(`⚠️  Warning: Secret contains non-alphanumeric characters. This may cause signature errors.`);
                // 输出Secret中每个字符的详细信息
                const invalidChars = this.secret.split('').filter(c => !/^[a-zA-Z0-9]$/.test(c));
                this.logger.warn(`  Invalid characters found: ${invalidChars.map(c => `'${c}' (code: ${c.charCodeAt(0)})`).join(', ')}`);
            } else {
                this.logger.debug(`  ✅ Secret format is valid (alphanumeric only)`);
            }

            // 验证 Secret 值是否正确（通过前3个和后3个字符）
            if (this.secret.length >= 6) {
                const expectedStart = 'H1d';
                const expectedEnd = 'zGxK';
                const actualStart = this.secret.substring(0, 3);
                const actualEnd = this.secret.substring(this.secret.length - 4);
                if (actualStart === expectedStart && actualEnd === expectedEnd) {
                    this.logger.debug(`  ✅ Secret value appears to be correct (verified by prefix/suffix)`);
                } else {
                    this.logger.warn(`⚠️  Warning: Secret value may be incorrect`);
                    this.logger.warn(`  Expected start: "${expectedStart}", actual: "${actualStart}"`);
                    this.logger.warn(`  Expected end: "${expectedEnd}", actual: "${actualEnd}"`);
                }
            }
        }
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

        // 详细的调试日志（仅 DEBUG 级别）
        this.logger.debug(`[Sign Calculation]`);
        this.logger.debug(`  appId: "${this.appId}" (length: ${this.appId.length})`);
        this.logger.debug(`  query: "${query}" (length: ${query.length}, bytes: ${Buffer.from(query, 'utf8').length})`);
        this.logger.debug(`  salt: "${salt}"`);
        this.logger.debug(`  secret: "${'*'.repeat(this.secret.length)}" (length: ${this.secret.length})`);
        // 显示完整的签名字符串（对于短文本）或预览（对于长文本）
        if (str.length <= 100) {
            this.logger.debug(`  sign string: "${this.appId}${query}${salt}${'*'.repeat(this.secret.length)}"`);
        } else {
            this.logger.debug(`  sign string preview: "${this.appId}${query.substring(0, 20)}...${query.substring(query.length - 20)}${salt}${'*'.repeat(this.secret.length)}"`);
        }
        this.logger.debug(`  sign (MD5): "${sign}"`);
        this.logger.debug(`  sign string length: ${str.length}, sign string bytes: ${Buffer.from(str, 'utf8').length}`);

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

            this.logger.debug(`Translating text (length: ${text.length}) from ${from} to ${to}`);

            // 计算签名（使用原始文本，不需要 URL 编码）
            // 百度 API 要求：appid + 原文 + salt + 密钥，然后 MD5
            const sign = this.sign(text, salt);

            // 发送请求（axios 会自动对参数进行 URL 编码）
            // 注意：签名计算使用原始文本，但请求参数会被 axios 自动 URL 编码
            this.logger.debug(`[Request Parameters]`);
            this.logger.debug(`  q: "${text}"`);
            this.logger.debug(`  from: ${from}`);
            this.logger.debug(`  to: ${to}`);
            this.logger.debug(`  appid: ${this.appId}`);
            this.logger.debug(`  salt: ${salt}`);
            this.logger.debug(`  sign: ${sign}`);

            const response = await axios.get(this.apiUrl, {
                params: {
                    q: text,  // axios 会自动进行 URL 编码
                    from: from,
                    to: to,
                    appid: this.appId,
                    salt: salt,
                    sign: sign,
                },
                timeout: 30000, // 增加到 30 秒超时
            });

            const data = response.data;

            // 记录 API 响应（仅 DEBUG 级别）
            this.logger.debug(`[API Response] ${JSON.stringify(data).substring(0, 200)}`);

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
                        // 输出Secret的前3个和后3个字符用于验证（仅用于诊断）
                        if (this.secret.length >= 6) {
                            this.logger.error(`  Secret preview (for verification): "${this.secret.substring(0, 3)}...${this.secret.substring(this.secret.length - 3)}"`);
                        } else {
                            this.logger.error(`  Secret preview: "${this.secret}"`);
                        }
                        this.logger.error(`  Sign string used: "${this.appId}${text.substring(0, Math.min(20, text.length))}${text.length > 20 ? '...' : ''}${salt}${'*'.repeat(this.secret.length)}"`);
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

            this.logger.log(`Translation success: ${from} -> ${to} (${text.length} chars)`);

            return {
                content: dst,
                sourceLanguage: src,
                targetLanguage: to,
                provider: 'baidu',
            };
        } catch (error: any) {
            this.logger.error(`Baidu Translation Request Failed: ${error.message}`);
            this.logger.error(`Error details: ${error.response?.data?.error_msg || error.message}`);

            // 网络超时或连接失败时，使用 Mock 翻译作为降级方案
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || error.message.includes('timeout')) {
                this.logger.warn('⚠️  网络连接失败，使用 Mock 翻译作为降级方案');
                this.logger.warn('💡 提示：请检查网络连接或配置代理（HTTP_PROXY/HTTPS_PROXY）');
                return {
                    content: `[网络不可用，原文] ${text}`,
                    sourceLanguage: from === 'auto' ? 'zh' : from,
                    targetLanguage: to,
                    provider: 'mock-network-error',
                };
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
