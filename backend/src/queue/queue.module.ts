import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueService } from './queue.service';
import { QueueSchedulerService } from './queue-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [QueueService, QueueSchedulerService],
  exports: [QueueService],
})
export class QueueModule {}
