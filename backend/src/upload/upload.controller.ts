import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Post('ticket-attachment')
  @UseInterceptors(FileInterceptor('file'))
  async uploadTicketAttachment(
    @UploadedFile() file: any,
    @Body('ticketId') ticketId: string,
    @Body('sortOrder') sortOrder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }

    if (!ticketId) {
      throw new BadRequestException('工单ID不能为空');
    }

    // 验证工单存在
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new BadRequestException('工单不存在');
    }

    // 保存文件
    const fileInfo = await this.uploadService.saveFile(file, ticketId);

    // 创建附件记录
    const attachment = await this.prisma.ticketAttachment.create({
      data: {
        ticketId,
        fileUrl: fileInfo.fileUrl,
        fileName: fileInfo.fileName,
        fileType: fileInfo.fileType,
        fileSize: fileInfo.fileSize,
        sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      },
    });

    return attachment;
  }
}

