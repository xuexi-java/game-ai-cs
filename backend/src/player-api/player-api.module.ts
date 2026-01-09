import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { PlayerApiController } from './player-api.controller';
import { PlayerApiService } from './player-api.service';
import { SignGuard } from './guards/sign.guard';
import { NonceService } from './services/nonce.service';
import { KeyService } from './services/key.service';
import { TokenService } from './services/token.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadModule } from '../upload/upload.module';
import { EncryptionModule } from '../common/encryption/encryption.module';

@Module({
  imports: [
    PrismaModule,
    UploadModule,
    EncryptionModule,
    // 注册缓存模块，用于 NonceService 和 KeyService
    CacheModule.register({
      ttl: 5 * 60 * 1000, // 默认 TTL: 5 分钟
      max: 10000, // 最大缓存条目数
    }),
  ],
  controllers: [PlayerApiController],
  providers: [
    PlayerApiService,
    SignGuard,
    NonceService,
    KeyService,
    TokenService,
  ],
  exports: [KeyService, NonceService, TokenService],
})
export class PlayerApiModule {}
