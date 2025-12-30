import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import { QueueService } from '../../queue/queue.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';

@Injectable()
export class SessionQueueService {
  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
    private queueService: QueueService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
  ) {
    this.logger.setContext('SessionQueueService');
  }

  /**
   * 重新排序队列（公开方法，供其他服务调用）
   * 使用 Redis Zset 优化性能
   */
  async reorderQueue() {
    // 检查 Redis 是否可用
    const isRedisAvailable = await this.queueService.isRedisAvailable();

    if (!isRedisAvailable) {
      // Redis 不可用，回退到数据库方案
      this.logger.warn('Redis 不可用，使用数据库方案重新排序队列');
      return this.reorderQueueFallback();
    }

    try {
      // 获取在线客服数量（包括管理员）
      const onlineAgentsCount = await this.prisma.user.count({
        where: {
          role: { in: ['AGENT', 'ADMIN'] },
          isOnline: true,
          deletedAt: null,
        },
      });

      // 计算平均处理时间（分钟），默认5分钟
      const averageProcessingTime = 5;

      // 1. 处理已分配客服的会话
      const assignedSessions = await this.prisma.session.findMany({
        where: {
          status: 'QUEUED',
          agentId: { not: null },
        },
        select: {
          id: true,
          agentId: true,
          priorityScore: true,
          queuedAt: true,
        },
      });

      // 按客服ID分组
      const sessionsByAgent = new Map<string, typeof assignedSessions>();
      for (const session of assignedSessions) {
        if (session.agentId && session.queuedAt) {
          if (!sessionsByAgent.has(session.agentId)) {
            sessionsByAgent.set(session.agentId, []);
          }
          sessionsByAgent.get(session.agentId)!.push(session);
        }
      }

      // 更新每个客服队列中的会话位置
      for (const [agentId, sessions] of sessionsByAgent.entries()) {
        for (const session of sessions) {
          if (session.queuedAt) {
            // 确保会话在 Redis 队列中（使用重试机制）
            await this.queueService.addToAgentQueueWithRetry(
              session.id,
              agentId,
              session.priorityScore || 0,
              session.queuedAt,
            );

            // 从 Redis 获取实时排队位置
            const queuePosition = await this.queueService.getQueuePosition(
              session.id,
              agentId,
            );

            if (queuePosition !== null) {
              // 更新数据库
              await this.prisma.session.update({
                where: { id: session.id },
                data: { queuePosition },
              });

              // 计算预计等待时间
              const estimatedWaitTime = Math.ceil(
                queuePosition * averageProcessingTime,
              );

              // 发送 WebSocket 通知
              this.websocketGateway.notifyQueueUpdate(
                session.id,
                queuePosition,
                estimatedWaitTime,
              );
            }
          }
        }
      }

      // 2. 处理未分配的会话
      const unassignedSessions = await this.prisma.session.findMany({
        where: {
          status: 'QUEUED',
          agentId: null,
        },
        select: {
          id: true,
          priorityScore: true,
          queuedAt: true,
        },
      });

      for (const session of unassignedSessions) {
        if (session.queuedAt) {
          // 确保会话在 Redis 队列中（使用重试机制）
          await this.queueService.addToUnassignedQueueWithRetry(
            session.id,
            session.priorityScore || 0,
            session.queuedAt,
          );

          // 从 Redis 获取实时排队位置
          const queuePosition = await this.queueService.getQueuePosition(
            session.id,
            null,
          );

          if (queuePosition !== null) {
            // 更新数据库
            await this.prisma.session.update({
              where: { id: session.id },
              data: { queuePosition },
            });

            // 计算预计等待时间
            const estimatedWaitTime =
              onlineAgentsCount > 0
                ? Math.ceil(
                    (queuePosition / onlineAgentsCount) * averageProcessingTime,
                  )
                : null;

            // 发送 WebSocket 通知
            this.websocketGateway.notifyQueueUpdate(
              session.id,
              queuePosition,
              estimatedWaitTime,
            );
          }
        }
      }

      this.logger.debug(
        `队列重新排序完成：已分配 ${assignedSessions.length} 个，未分配 ${unassignedSessions.length} 个`,
      );
    } catch (error: any) {
      this.logger.error(
        `使用 Redis 重新排序队列失败: ${error.message}`,
        error.stack,
      );
      // 回退到数据库方案
      this.logger.warn('回退到数据库方案重新排序队列');
      return this.reorderQueueFallback();
    }
  }

  /**
   * 数据库方案（降级方案）
   */
  async reorderQueueFallback() {
    // 按分配的客服分组处理排队位置
    // 1. 获取所有已分配客服的排队会话，按客服分组
    const assignedSessions = await this.prisma.session.findMany({
      where: {
        status: 'QUEUED',
        agentId: { not: null },
      },
      orderBy: [{ priorityScore: 'desc' }, { queuedAt: 'asc' }],
    });

    // 按客服ID分组
    const sessionsByAgent = new Map<string, typeof assignedSessions>();
    for (const session of assignedSessions) {
      if (session.agentId) {
        if (!sessionsByAgent.has(session.agentId)) {
          sessionsByAgent.set(session.agentId, []);
        }
        sessionsByAgent.get(session.agentId)!.push(session);
      }
    }

    // 2. 获取未分配的排队会话
    const unassignedSessions = await this.prisma.session.findMany({
      where: {
        status: 'QUEUED',
        agentId: null,
      },
      orderBy: [{ priorityScore: 'desc' }, { queuedAt: 'asc' }],
    });

    // 获取在线客服数量（包括管理员）
    const onlineAgentsCount = await this.prisma.user.count({
      where: {
        role: { in: ['AGENT', 'ADMIN'] },
        isOnline: true,
        deletedAt: null,
      },
    });

    // 计算平均处理时间（分钟），默认5分钟
    const averageProcessingTime = 5;

    // 3. 更新已分配会话的排队位置（按客服分组计算）
    for (const [agentId, sessions] of sessionsByAgent.entries()) {
      for (let i = 0; i < sessions.length; i++) {
        const queuePosition = i + 1; // 在该客服的队列中的位置
        await this.prisma.session.update({
          where: { id: sessions[i].id },
          data: { queuePosition },
        });

        // 计算预计等待时间（分钟）
        // 对于已分配的会话，预计等待时间 = 在该客服队列中的位置 * 平均处理时间
        const estimatedWaitTime = Math.ceil(
          queuePosition * averageProcessingTime,
        );

        // 发送 WebSocket 通知
        this.websocketGateway.notifyQueueUpdate(
          sessions[i].id,
          queuePosition,
          estimatedWaitTime,
        );
      }
    }

    // 4. 更新未分配会话的排队位置（全局排名）
    for (let i = 0; i < unassignedSessions.length; i++) {
      const queuePosition = i + 1;
      await this.prisma.session.update({
        where: { id: unassignedSessions[i].id },
        data: { queuePosition },
      });

      // 计算预计等待时间（分钟）
      // 公式：预计等待时间 = (前面排队人数 / 在线客服数量) * 平均处理时间
      // 如果没有在线客服，预计等待时间设为 null
      const estimatedWaitTime =
        onlineAgentsCount > 0
          ? Math.ceil(
              (queuePosition / onlineAgentsCount) * averageProcessingTime,
            )
          : null;

      // 发送 WebSocket 通知
      this.websocketGateway.notifyQueueUpdate(
        unassignedSessions[i].id,
        queuePosition,
        estimatedWaitTime,
      );
    }
  }

  /**
   * 获取排队位置（按分配的客服计算排名）
   * 优先从 Redis 获取，如果 Redis 不可用则回退到数据库查询
   */
  async getQueuePosition(sessionId: string): Promise<number> {
    // 优先从 Redis 获取
    const isRedisAvailable = await this.queueService.isRedisAvailable();
    if (isRedisAvailable) {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { agentId: true },
      });

      if (session) {
        const queuePosition = await this.queueService.getQueuePosition(
          sessionId,
          session.agentId,
        );
        if (queuePosition !== null) {
          return queuePosition;
        }
      }
    }

    // Redis 不可用或未找到，回退到数据库查询
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || !session.queuedAt) return 0;

    // 如果已经分配了客服，只计算该客服的排队位置
    if (session.agentId) {
      const aheadCount = await this.prisma.session.count({
        where: {
          status: 'QUEUED',
          agentId: session.agentId, // 只计算分配给同一客服的会话
          OR: [
            { priorityScore: { gt: session.priorityScore } },
            {
              AND: [
                { priorityScore: session.priorityScore },
                { queuedAt: { lt: session.queuedAt } },
              ],
            },
          ],
        },
      });

      return aheadCount + 1;
    }

    // 如果还没有分配客服，计算全局排名
    const aheadCount = await this.prisma.session.count({
      where: {
        status: 'QUEUED',
        agentId: null, // 只计算未分配的会话
        OR: [
          { priorityScore: { gt: session.priorityScore } },
          {
            AND: [
              { priorityScore: session.priorityScore },
              { queuedAt: { lt: session.queuedAt } },
            ],
          },
        ],
      },
    });

    return aheadCount + 1;
  }
}
