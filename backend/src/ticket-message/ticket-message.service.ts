import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { TranslationService } from '../shared/translation/translation.service';
import { MessageMetadata, SessionMetadata } from '../common/types/metadata.types';
import { TicketService } from '../ticket/ticket.service';

@Injectable()
export class TicketMessageService {
  private readonly logger = new Logger(TicketMessageService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    private translationService: TranslationService,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
  ) { }

  // 创建工单消息（异步工单回复）
  async create(ticketId: string, senderId: string, content: string) {
    // 验证工单存在
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    // 创建消息
    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId,
        content,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
      },
    });

    // 更新工单状态
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'WAITING',
      },
    });

    // 通过 WebSocket 通知工单消息（通知玩家端）
    this.websocketGateway.notifyTicketMessage(ticketId, message);

    // 自动翻译：如果是客服发出的消息，且已知玩家语言非中文，自动翻译给玩家
    if (senderId) {
      // 获取工单关联的会话以获取玩家语言
      const session = await this.prisma.session.findFirst({
        where: {
          ticketId,
          status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (session?.metadata) {
        const sessionMeta = session.metadata as SessionMetadata;
        const playerLang = sessionMeta.playerLanguage;

        this.logger.debug(`[AutoTranslate] Checking ticket message ${message.id} from AGENT. PlayerLang: ${playerLang}`);

        // 假设系统/客服默认语言是 zh，如果玩家语言存在且不是 zh，则翻译
        if (playerLang && playerLang !== 'zh') {
          this.logger.log(`[AutoTranslate] Triggering translation for ticket message ${message.id} to ${playerLang}`);
          this.translateMessage(message.id, playerLang).catch(err =>
            this.logger.error(`Auto-translation for ticket message ${message.id} failed:`, err)
          );
        } else {
          this.logger.debug(`[AutoTranslate] Skipped. PlayerLang is ${playerLang}`);
        }
      }
    }

    // TODO: 触发游戏内邮件通知

    return message;
  }

  // 获取工单消息列表
  async findByTicket(ticketId: string) {
    return this.prisma.ticketMessage.findMany({
      where: { ticketId },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
        ticket: {
          include: {
            sessions: {
              where: {
                status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] },
              },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // 翻译工单消息
  async translateMessage(messageId: string, targetLang?: string) {
    const message = await this.prisma.ticketMessage.findUnique({
      where: { id: messageId },
      include: {
        ticket: {
          include: {
            sessions: {
              where: {
                status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] },
              },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('消息不存在');
    }

    // 1. 检查是否已有缓存
    const meta = (message.metadata || {}) as MessageMetadata;

    // 确定目标语言：优先使用传入的 targetLang，否则使用 Session 中的玩家语言，最后默认使用中文
    let requestedTarget = targetLang;
    if (!requestedTarget && message.ticket?.sessions?.[0]?.metadata) {
      const sessionMeta = message.ticket.sessions[0].metadata as SessionMetadata;
      requestedTarget = sessionMeta.playerLanguage || 'zh';
    }
    requestedTarget = requestedTarget || 'zh';

    // 如果已有相同目标语言的翻译，直接返回（缓存命中）
    if (
      meta.translation &&
      meta.translation.targetLanguage === requestedTarget &&
      meta.translation.translatedContent &&
      meta.translation.translatedContent.trim().length > 0
    ) {
      this.logger.log(`Translation cache hit for ticket message ${messageId}, target: ${requestedTarget}`);
      return message;
    }

    // 2. 调用翻译服务
    try {
      this.logger.log(`Translating ticket message ${messageId}: content length=${message.content?.length || 0}, targetLang=${requestedTarget}`);

      // 确定源语言：如果是客服发送的消息（有 senderId），源语言为 'zh'；否则使用 'auto'
      const sourceLang = message.senderId ? 'zh' : 'auto';

      const result = await this.translationService.translate(
        message.content,
        requestedTarget,
        sourceLang, // 明确指定源语言
      );
      this.logger.log(`Translation successful: ${result.provider}, source=${result.sourceLanguage}, target=${result.targetLanguage}`);

      // 3. 更新消息 Metadata
      const updatedMeta: MessageMetadata = {
        ...meta,
        translation: {
          translatedContent: result.content,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          provider: result.provider,
          translatedAt: new Date().toISOString(),
        },
      };

      return await this.prisma.ticketMessage.update({
        where: { id: messageId },
        data: { metadata: updatedMeta as any },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              realName: true,
            },
          },
        },
      });
    } catch (error) {
      // 记录详细错误日志（LoggerService 会自动过滤敏感信息）
      this.logger.error('Translation failed', error);
      // 只记录错误消息，不记录整个错误对象（避免泄露用户输入）
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error details: ${errorMessage}`);
      this.logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'N/A'}`);

      // 返回更详细的错误信息
      const finalErrorMessage = error instanceof Error ? error.message : '翻译失败，请稍后重试';
      throw new BadRequestException(`翻译失败: ${finalErrorMessage}`);
    }
  }
}
