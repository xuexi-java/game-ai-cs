import { Module } from '@nestjs/common';
import { DifyService } from './dify.service';
import { DifyController } from './dify.controller';
import { GameModule } from '../game/game.module';

@Module({
  imports: [GameModule],
  controllers: [DifyController],
  providers: [DifyService],
  exports: [DifyService],
})
export class DifyModule {}
