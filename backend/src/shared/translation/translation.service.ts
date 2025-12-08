
import { Injectable } from '@nestjs/common';
import { DetectResult, TranslateResult } from './translation.interface';
import { BaiduTranslationProvider } from './providers/baidu.provider';

@Injectable()
export class TranslationService {
    constructor(private readonly provider: BaiduTranslationProvider) { }

    async detect(text: string): Promise<DetectResult> {
        return this.provider.detect(text);
    }

    async translate(text: string, to: string, from: string = 'auto'): Promise<TranslateResult> {
        return this.provider.translate(text, to, from);
    }
}
