import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import { DifyService, DifyMessageResult } from '../../dify/dify.service';
import { MessageService } from '../../message/message.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';

@Injectable()
export class SessionAIService {
  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
    private difyService: DifyService,
    private messageService: MessageService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
  ) {
    this.logger.setContext('SessionAIService');
  }

  /**
   * Async AI response trigger (non-blocking)
   * Uses setImmediate to ensure session creation returns immediately
   */
  triggerAIResponseAsync(
    sessionId: string,
    ticket: { description: string; game: { difyApiKey: string; difyBaseUrl: string } },
  ): void {
    setImmediate(async () => {
      try {
        const difyResponse = await this.difyService.triage(
          ticket.description,
          ticket.game.difyApiKey,
          ticket.game.difyBaseUrl,
        );

        await this.prisma.session.update({
          where: { id: sessionId },
          data: {
            detectedIntent: difyResponse.detectedIntent,
            aiUrgency: difyResponse.urgency === 'urgent' ? 'URGENT' : 'NON_URGENT',
            difyStatus: difyResponse.status ? String(difyResponse.status) : null,
          },
        });

        const aiMessage = await this.messageService.createAIMessage(
          sessionId,
          difyResponse.text || 'Hello, I am analyzing your issue...',
          { suggestedOptions: difyResponse.suggestedOptions },
        );
        this.websocketGateway.notifyMessage(sessionId, aiMessage);
      } catch (error) {
        this.logger.error(
          `AI response failed for session ${sessionId}`,
          error instanceof Error ? error.stack : String(error),
        );
        try {
          const fallback = await this.messageService.createAIMessage(
            sessionId,
            'Thank you for your feedback. We are processing your request...',
          );
          this.websocketGateway.notifyMessage(sessionId, fallback);
        } catch (fallbackError) {
          this.logger.error(
            `Fallback message failed for session ${sessionId}`,
            fallbackError instanceof Error ? fallbackError.stack : String(fallbackError),
          );
        }
      }
    });
  }

  /**
   * 处理AI回复
   */
  async processAiReply(sessionId: string, content: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        ticket: {
          include: {
            game: true,
          },
        },
      },
    });

    if (!session) {
      this.logger.warn(`AI reply skipped: session not found (${sessionId})`);
      return;
    }

    if (session.status === 'CLOSED') {
      return;
    }

    if (session.ticket?.status === 'RESOLVED') {
      return;
    }

    if (session.status === 'QUEUED') {
      return;
    }

    if (session.status === 'IN_PROGRESS' && session.agentId) {
      return;
    }

    if (
      !session.ticket?.game?.difyApiKey ||
      !session.ticket?.game?.difyBaseUrl
    ) {
      await this.sendAiFallback(sessionId, 'AI 配置缺失');
      return;
    }

    let difyResult: DifyMessageResult | null = null;
    try {
      difyResult = await this.difyService.sendChatMessage(
        content,
        session.ticket.game.difyApiKey,
        session.ticket.game.difyBaseUrl,
        session.difyConversationId || undefined,
        session.ticket.playerIdOrName || 'player',
      );
    } catch (error: any) {
      this.logger.error(
        `Dify chat failed for session ${sessionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.sendAiFallback(sessionId, 'AI 服务暂时不可用');
      return;
    }

    const updateData: Record<string, any> = {};
    if (
      difyResult.conversationId &&
      difyResult.conversationId !== session.difyConversationId
    ) {
      updateData.difyConversationId = difyResult.conversationId;
    }
    if (difyResult.status) {
      updateData.difyStatus = String(difyResult.status);
    }
    if (Object.keys(updateData).length > 0) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: updateData,
      });
    }

    if (!difyResult.text) {
      await this.sendAiFallback(sessionId, 'AI 返回内容为空');
      return;
    }

    const latestSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true, agentId: true },
    });
    if (latestSession?.status === 'IN_PROGRESS' && latestSession.agentId) {
      return;
    }
    if (
      latestSession?.status === 'QUEUED' ||
      latestSession?.status === 'CLOSED'
    ) {
      return;
    }

    // 检测是否包含转人工关键词
    const transferKeywords = ['转人工', '人工', '客服', '真人客服', 'Human', 'Agent'];
    const shouldSuggestTransfer = transferKeywords.some((k) =>
      content.toLowerCase().includes(k.toLowerCase()),
    );

    let finalOptions = difyResult.suggestedOptions || [];
    if (shouldSuggestTransfer && !finalOptions.includes('转人工')) {
      finalOptions = [...finalOptions, '转人工'];
    }

    const aiMessage = await this.messageService.createAIMessage(
      sessionId,
      difyResult.text,
      {
        suggestedOptions: finalOptions,
        difyStatus: difyResult.status,
      },
    );
    this.logger.log(`发送AI消息到会话房间: sessionId=${sessionId}, messageId=${aiMessage.id}`);
    this.websocketGateway.notifyMessage(sessionId, aiMessage);
  }

  /**
   * 发送AI降级消息
   */
  async sendAiFallback(sessionId: string, reason: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true, agentId: true },
    });

    if (!session || session.status === 'CLOSED') {
      return;
    }

    if (session.status === 'IN_PROGRESS' && session.agentId) {
      return;
    }

    const fallbackMessage = await this.messageService.createAIMessage(
      sessionId,
      `AI 暂时无法回复（${reason}），请稍后再试或转人工客服。`,
    );
    this.websocketGateway.notifyMessage(sessionId, fallbackMessage);
  }
}
