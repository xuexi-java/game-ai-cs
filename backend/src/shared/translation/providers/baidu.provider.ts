
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
    private readonly apiUrl = 'http://api.fanyi.baidu.com/api/trans/vip/translate';

    constructor(private readonly configService: ConfigService) {
        this.appId = this.configService.get<string>('BAIDU_TRANSLATE_APP_ID') || '';
        this.secret = this.configService.get<string>('BAIDU_TRANSLATE_SECRET') || '';

        if (!this.appId || !this.secret) {
            this.logger.warn('Baidu Translate API credentials are missing!');
        }
    }

    private sign(q: string, salt: string): string {
        const str = this.appId + q + salt + this.secret;
        return crypto.createHash('md5').update(str).digest('hex');
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
        const sign = this.sign(text, salt);

        try {
            const response = await axios.get(this.apiUrl, {
                params: {
                    q: text,
                    from: from,
                    to: to,
                    appid: this.appId,
                    salt: salt,
                    sign: sign,
                },
            });

            const data = response.data;
            if (data.error_code) {
                this.logger.error(`Baidu Translation Error: ${data.error_code} - ${data.error_msg}`);
                // For 54000 (missing param) or 54001 (auth failed), throw specific errors if needed
                throw new Error(`Translation failed: ${data.error_msg}`);
            }

            const dst = data.trans_result.map((item: any) => item.dst).join('\n');
            const src = data.trans_result[0].src;

            return {
                content: dst,
                sourceLanguage: src,
                targetLanguage: to,
                provider: 'baidu',
            };
        } catch (error: any) {
            this.logger.error(`Baidu Translation Request Failed: ${error.message}`);
            // Fallback for development/testing if API is unavailable (e.g., 58002 service closed)
            if (process.env.NODE_ENV !== 'production' || error.message.includes('service close')) {
                this.logger.warn('Using Mock Translation due to API failure');
                return {
                    content: `[MockData] ${text}`,
                    sourceLanguage: from === 'auto' ? 'en' : from,
                    targetLanguage: to,
                    provider: 'mock',
                };
            }
            throw error;
        }
    }
}
