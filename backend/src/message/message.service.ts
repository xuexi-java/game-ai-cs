import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { SenderType, MessageType } from '@prisma/client';
import { TranslationService } from '../shared/translation/translation.service';
import { SessionMetadata, MessageMetadata } from '../common/types/metadata.types';

@Injectable()
export class MessageService {
  constructor(
    private prisma: PrismaService,
    private translationService: TranslationService,
  ) { }

  // 创建消息
  async create(
    createMessageDto: CreateMessageDto,
    senderType: SenderType,
    senderId?: string,
    currentUser?: { id: string; role: string },
  ) {
    // 验证会话存在
    const session = await this.prisma.session.findUnique({
      where: { id: createMessageDto.sessionId },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    // 权限检查：如果是客服发送消息，只能发送到自己处理的会话
    if (senderType === 'AGENT' && senderId && currentUser) {
      if (currentUser.role === 'AGENT') {
        // 客服只能发送消息到自己处理的会话
        if (session.agentId !== senderId) {
          throw new NotFoundException(
            '无权发送消息：该会话已分配给其他客服，只有处理该会话的客服才能回复',
          );
        }
        // 检查会话状态，必须是IN_PROGRESS状态才能发送消息
        if (session.status !== 'IN_PROGRESS') {
          throw new BadRequestException(
            '会话未接入，请先接入会话后才能发送消息',
          );
        }
      }
    }

    const createdMessage = await this.prisma.message.create({
      data: {
        sessionId: createMessageDto.sessionId,
        senderType,
        senderId: senderId || null,
        content: createMessageDto.content,
        messageType:
          (createMessageDto.messageType as MessageType) || MessageType.TEXT,
      },
      include: {
        ...(senderType === 'AGENT' && senderId
          ? {
            agent: {
              select: {
                id: true,
                username: true,
                realName: true,
              },
            },
          }
          : {}),
        session: true, // 加载 session 以获取 metadata
      },
    });

    // 触发语言自动检测（仅针对玩家的第一条/前几条消息）
    if (senderType === 'PLAYER' && createdMessage.messageType === 'TEXT') {
      this.detectLanguageInBackground(session, createdMessage.content);
    }

    // 自动翻译：如果是 AI 或 客服发出的消息，且已知玩家语言非中文，自动翻译给玩家
    if ((senderType === 'AI' || senderType === 'AGENT') && createdMessage.messageType === 'TEXT') {
      const sessionMeta = (createdMessage.session?.metadata || {}) as SessionMetadata;
      const playerLang = sessionMeta.playerLanguage;

      console.log(`[AutoTranslate] Checking message ${createdMessage.id} from ${senderType}. PlayerLang: ${playerLang}`);

      // 假设系统/客服默认语言是 zh，如果玩家语言存在且不是 zh，则翻译
      if (playerLang && playerLang !== 'zh') {
        console.log(`[AutoTranslate] Triggering translation for message ${createdMessage.id} to ${playerLang}`);
        this.translateMessage(createdMessage.id, playerLang).catch(err =>
          console.error(`Auto-translation for message ${createdMessage.id} failed:`, err)
        );
      } else {
        console.log(`[AutoTranslate] Skipped. PlayerLang is ${playerLang}`);
      }
    }

    return createdMessage;
  }

  // 获取会话消息列表
  async findBySession(sessionId: string, limit?: number) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        agent: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
      },
    });
  }

  // 创建AI消息
  async createAIMessage(sessionId: string, content: string, metadata?: any) {
    const createDto = {
      sessionId,
      content,
      messageType: MessageType.TEXT as any,
    };
    return this.create(createDto, 'AI').then((message) => {
      if (metadata) {
        return this.prisma.message.update({
          where: { id: message.id },
          data: { metadata },
        });
      }
      return message;
    });
  }

  // 创建系统通知消息
  async createSystemMessage(sessionId: string, content: string) {
    const createDto = {
      sessionId,
      content,
      messageType: MessageType.SYSTEM_NOTICE as any,
    };
    return this.create(createDto, 'SYSTEM');
  }

  // 翻译指定消息
  async translateMessage(messageId: string, targetLang?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { session: true }, // 需要读取 session context
    });

    if (!message) {
      throw new NotFoundException('消息不存在');
    }

    // 1. 检查是否已有缓存
    const meta = (message.metadata || {}) as MessageMetadata;
    const requestedTarget = targetLang || 'zh'; // 默认翻译为中文，或者根据 Session 上下文推断

    // 如果已有相同目标语言的翻译，直接返回
    if (
      meta.translation &&
      meta.translation.targetLanguage === requestedTarget &&
      meta.translation.translatedContent
    ) {
      return message;
    }

    // 2. 调用翻译服务
    try {
      const result = await this.translationService.translate(
        message.content,
        requestedTarget,
      );

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

      return await this.prisma.message.update({
        where: { id: messageId },
        data: { metadata: updatedMeta as any },
      });
    } catch (error) {
      // 记录日志但不已崩溃
      console.error('Translation failed', error);
      throw new BadRequestException('翻译失败，请稍后重试');
    }
  }

  // 后台执行语言检测
  private async detectLanguageInBackground(session: any, content: string) {
    try {
      // 如果已经锁定语言，不再检测
      const sessionMeta = (session.metadata || {}) as SessionMetadata;
      if (sessionMeta.language?.isLocked) {
        return;
      }

      // 如果检测历史超过 20 次，不再频繁检测，但为了保持活跃可适当放宽
      const history = sessionMeta.languageDetectionHistory || [];
      if (history.length >= 20) {
        return;
      }

      // 执行检测
      const result = await this.translationService.detect(content);

      // 更新 Session Metadata
      const newHistoryItem = {
        messageId: 'auto', // 简化，或者传真实ID
        language: result.language,
        confidence: result.confidence || 0.8,
        detectedAt: new Date().toISOString(),
      };

      const updatedHistory = [...history, newHistoryItem];

      // 简单策略：如果置信度高，或者连续3次一致，则锁定
      const isConfident = (result.confidence || 0) > 0.9;
      const confirmLang = isConfident ? result.language : sessionMeta.playerLanguage || result.language;

      const newMeta: SessionMetadata = {
        ...sessionMeta,
        playerLanguage: confirmLang,
        languageDetectionHistory: updatedHistory,
        language: {
          ...(sessionMeta.language || {}),
          detected: confirmLang,
          confidence: result.confidence || 0,
          isLocked: isConfident, // 锁定条件可优化
          detectedAt: new Date().toISOString()
        }
      };

      await this.prisma.session.update({
        where: { id: session.id },
        data: { metadata: newMeta as any },
      });
    } catch (error) {
      console.error('Background language detection failed', error);
      // 不抛出异常，以免影响主流程
    }
  }
}
