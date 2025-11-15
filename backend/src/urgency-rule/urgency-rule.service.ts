import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUrgencyRuleDto,
  UpdateUrgencyRuleDto,
} from './dto/create-urgency-rule.dto';

@Injectable()
export class UrgencyRuleService {
  constructor(private prisma: PrismaService) {}

  // 获取所有规则
  async findAll() {
    return this.prisma.urgencyRule.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 获取单个规则
  async findOne(id: string) {
    const rule = await this.prisma.urgencyRule.findUnique({
      where: { id, deletedAt: null },
    });

    if (!rule) {
      throw new NotFoundException('规则不存在');
    }

    return rule;
  }

  // 创建规则
  async create(createUrgencyRuleDto: CreateUrgencyRuleDto) {
    return this.prisma.urgencyRule.create({
      data: {
        ...createUrgencyRuleDto,
        conditions: createUrgencyRuleDto.conditions as any,
      },
    });
  }

  // 更新规则
  async update(id: string, updateUrgencyRuleDto: UpdateUrgencyRuleDto) {
    await this.findOne(id);
    return this.prisma.urgencyRule.update({
      where: { id },
      data: {
        ...updateUrgencyRuleDto,
        conditions: updateUrgencyRuleDto.conditions
          ? (updateUrgencyRuleDto.conditions as any)
          : undefined,
      },
    });
  }

  // 删除规则
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.urgencyRule.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // 重新计算队列排序
  async recalculateQueue() {
    const queuedSessions = await this.prisma.session.findMany({
      where: { status: 'QUEUED' },
      include: { ticket: true },
    });

    const rules = await this.prisma.urgencyRule.findMany({
      where: { enabled: true, deletedAt: null },
    });

    for (const session of queuedSessions) {
      let totalScore = 0;

      for (const rule of rules) {
        if (this.matchRule(rule.conditions as any, session.ticket, session)) {
          totalScore += rule.priorityWeight;
        }
      }

      await this.prisma.session.update({
        where: { id: session.id },
        data: { priorityScore: totalScore },
      });
    }

    // 重新排序
    await this.reorderQueue();

    return { message: '队列排序已重新计算' };
  }

  private matchRule(conditions: any, ticket: any, session: any): boolean {
    if (conditions.keywords && Array.isArray(conditions.keywords)) {
      const matches = conditions.keywords.some((keyword: string) =>
        ticket.description.includes(keyword),
      );
      if (!matches) return false;
    }

    if (conditions.intent && session.detectedIntent !== conditions.intent) {
      return false;
    }

    if (
      conditions.identityStatus &&
      ticket.identityStatus !== conditions.identityStatus
    ) {
      return false;
    }

    if (conditions.gameId && ticket.gameId !== conditions.gameId) {
      return false;
    }

    if (conditions.priority && ticket.priority !== conditions.priority) {
      return false;
    }

    return true;
  }

  private async reorderQueue() {
    const queuedSessions = await this.prisma.session.findMany({
      where: { status: 'QUEUED' },
      orderBy: [
        { priorityScore: 'desc' },
        { queuedAt: 'asc' },
      ],
    });

    for (let i = 0; i < queuedSessions.length; i++) {
      await this.prisma.session.update({
        where: { id: queuedSessions[i].id },
        data: { queuePosition: i + 1 },
      });
    }
  }
}

