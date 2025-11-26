import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { UpdateReplyDto } from './dto/update-reply.dto';
import { QueryReplyDto, SortByEnum } from './dto/query-reply.dto';

@Injectable()
export class QuickReplyService {
  constructor(private prisma: PrismaService) {}

  // ========== 分类管理 ==========

  /**
   * 获取分类列表
   */
  async getCategories(userId: string, isAdmin: boolean) {
    try {
      const where: any = {
        isActive: true,
        deletedAt: null,
      };

      if (!isAdmin) {
        // 普通用户只能看到全局分类和自己的分类
        where.OR = [{ isGlobal: true }, { creatorId: userId }];
      }
      // 管理员可以看到全部分类（不限制条件）

      const categories = await this.prisma.quickReplyCategory.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
      });

      // 如果分类为空，直接返回空数组
      if (categories.length === 0) {
        return [];
      }

      // 批量查询所有分类的回复数量，提高性能
      const categoryIds = categories.map((cat) => cat.id);
      const replyCounts = await this.prisma.quickReply.groupBy({
        by: ['categoryId'],
        where: {
          categoryId: { in: categoryIds },
          isActive: true,
          deletedAt: null,
        },
        _count: {
          id: true,
        },
      });

      // 创建回复数量的映射
      const countMap = new Map(
        replyCounts.map((item) => [item.categoryId, item._count.id]),
      );

      // 为每个分类添加回复数量
      return categories.map((category) => ({
        ...category,
        _count: {
          replies: countMap.get(category.id) || 0,
        },
      }));
    } catch (error) {
      console.error('获取分类列表失败:', error);
      throw error;
    }
  }

  /**
   * 创建分类
   */
  async createCategory(
    userId: string,
    isAdmin: boolean,
    createCategoryDto: CreateCategoryDto,
  ) {
    // ⭐ 权限检查：只有管理员能创建全局分类
    if (createCategoryDto.isGlobal && !isAdmin) {
      throw new ForbiddenException('仅管理员可创建全局分类');
    }

    return this.prisma.quickReplyCategory.create({
      data: {
        ...createCategoryDto,
        creatorId: createCategoryDto.isGlobal ? null : userId,
      },
    });
  }

  /**
   * 更新分类
   */
  async updateCategory(
    categoryId: string,
    userId: string,
    isAdmin: boolean,
    updateCategoryDto: UpdateCategoryDto,
  ) {
    const category = await this.prisma.quickReplyCategory.findUniqueOrThrow({
      where: { id: categoryId },
    });

    // ⭐ 权限检查
    this.validateCategoryAccess(category, userId, isAdmin);

    // ⭐ 禁止非管理员修改全局标记
    if (
      updateCategoryDto.isGlobal !== undefined &&
      !isAdmin &&
      updateCategoryDto.isGlobal
    ) {
      throw new ForbiddenException('仅管理员可修改全局标记');
    }

    return this.prisma.quickReplyCategory.update({
      where: { id: categoryId },
      data: updateCategoryDto,
    });
  }

  /**
   * 删除分类（软删除）
   */
  async deleteCategory(
    categoryId: string,
    userId: string,
    isAdmin: boolean,
  ) {
    const category = await this.prisma.quickReplyCategory.findUniqueOrThrow({
      where: { id: categoryId },
    });

    // ⭐ 权限检查
    this.validateCategoryAccess(category, userId, isAdmin);

    return this.prisma.quickReplyCategory.update({
      where: { id: categoryId },
      data: { deletedAt: new Date() },
    });
  }

  // ========== 快捷回复管理 ==========

  /**
   * 获取快捷回复列表
   */
  async getReplies(userId: string, isAdmin: boolean, query: QueryReplyDto) {
    try {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const skip = (page - 1) * pageSize;

      // 构建 WHERE 条件
      const where: any = {
        isActive: true,
        deletedAt: null,
      };

      if (query.categoryId) {
        where.categoryId = query.categoryId;
      }

      // 权限过滤：用户只能看到全局回复和自己创建的回复
      if (!isAdmin) {
        where.OR = [{ isGlobal: true }, { creatorId: userId }];
      }

      // 只看收藏的回复
      if (query.onlyFavorites) {
        const favoriteIds = await this.prisma.quickReplyFavorite
          .findMany({
            where: { userId },
            select: { replyId: true },
          })
          .then((fav) => fav.map((f) => f.replyId));

        if (favoriteIds.length === 0) {
          // 如果没有收藏，直接返回空结果
          return {
            data: [],
            pagination: {
              total: 0,
              page,
              pageSize,
              totalPages: 0,
            },
          };
        }

        where.id = { in: favoriteIds };
      }

      // 只看最近使用的回复
      if (query.onlyRecent) {
        where.lastUsedAt = { not: null };
      }

      // 构建排序条件
      let orderBy = this.buildOrderBy(query.sortBy);

      console.log('查询条件:', JSON.stringify({ where, orderBy, skip, take: pageSize }, null, 2));

      // 查询数据和总数
      let data, total, favoriteIdsSet;
      try {
        [data, total, favoriteIdsSet] = await Promise.all([
          this.prisma.quickReply.findMany({
            where,
            orderBy,
            skip,
            take: pageSize,
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                  isGlobal: true,
                  isActive: true,
                  sortOrder: true,
                },
              },
            },
          }),
          this.prisma.quickReply.count({ where }),
          // 获取当前用户收藏的所有回复 ID
          this.prisma.quickReplyFavorite
            .findMany({
              where: { userId },
              select: { replyId: true },
            })
            .then((favs) => new Set(favs.map((f) => f.replyId))),
        ]);
      } catch (dbError: any) {
        console.error('数据库查询错误:', dbError);
        console.error('错误类型:', dbError.constructor?.name);
        console.error('错误代码:', dbError.code);
        console.error('错误消息:', dbError.message);
        console.error('错误堆栈:', dbError.stack);
        
        // 如果是排序问题，尝试使用默认排序
        if (dbError.code === 'P2009' || dbError.message?.includes('orderBy') || dbError.message?.includes('sort')) {
          console.log('检测到排序错误，尝试使用默认排序...');
          orderBy = { createdAt: 'desc' };
          [data, total, favoriteIdsSet] = await Promise.all([
            this.prisma.quickReply.findMany({
              where,
              orderBy,
              skip,
              take: pageSize,
              include: {
                category: {
                  select: {
                    id: true,
                    name: true,
                    isGlobal: true,
                    isActive: true,
                    sortOrder: true,
                  },
                },
              },
            }),
            this.prisma.quickReply.count({ where }),
            this.prisma.quickReplyFavorite
              .findMany({
                where: { userId },
                select: { replyId: true },
              })
              .then((favs) => new Set(favs.map((f) => f.replyId))),
          ]);
        } else {
          throw dbError;
        }
      }

      // 如果按 lastUsedAt 排序，对结果进行二次排序（将 null 值排在最后）
      let sortedData = data;
      if (query.sortBy === 'lastUsedAt' || query.sortBy === SortByEnum.LAST_USED_AT) {
        sortedData = [...data].sort((a, b) => {
          // 如果两个都是 null，按 createdAt 排序
          if (!a.lastUsedAt && !b.lastUsedAt) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          // 如果 a 是 null，排在后面
          if (!a.lastUsedAt) return 1;
          // 如果 b 是 null，排在后面
          if (!b.lastUsedAt) return -1;
          // 两个都不是 null，按 lastUsedAt 排序
          return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
        });
      }

      return {
        data: sortedData.map((reply) => ({
          ...reply,
          isFavorited: favoriteIdsSet.has(reply.id),
        })),
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      console.error('获取快捷回复列表失败:', error);
      console.error('错误详情:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      throw error;
    }
  }

  /**
   * 创建快捷回复
   */
  async createReply(
    userId: string,
    isAdmin: boolean,
    createReplyDto: CreateReplyDto,
  ) {
    // 验证分类存在且有访问权限
    const category = await this.prisma.quickReplyCategory.findUniqueOrThrow({
      where: { id: createReplyDto.categoryId },
    });

    // ⭐ 检查分类访问权限
    if (!category.isGlobal && category.creatorId !== userId && !isAdmin) {
      throw new ForbiddenException('无权在此分类中添加回复');
    }

    // ⭐ 权限检查：只有管理员能创建全局回复
    if (createReplyDto.isGlobal && !isAdmin) {
      throw new ForbiddenException('仅管理员可创建全局回复');
    }

    return this.prisma.quickReply.create({
      data: {
        ...createReplyDto,
        creatorId: createReplyDto.isGlobal ? null : userId,
      },
      include: { category: true },
    });
  }

  /**
   * 更新快捷回复
   */
  async updateReply(
    replyId: string,
    userId: string,
    isAdmin: boolean,
    updateReplyDto: UpdateReplyDto,
  ) {
    const reply = await this.prisma.quickReply.findUniqueOrThrow({
      where: { id: replyId },
    });

    // ⭐ 权限检查：非管理员只能修改自己创建的回复
    if (!isAdmin && reply.creatorId !== userId) {
      throw new ForbiddenException('无权修改此回复');
    }

    // ⭐ 权限检查：非管理员不能修改全局标记
    if (
      updateReplyDto.isGlobal !== undefined &&
      !isAdmin &&
      updateReplyDto.isGlobal
    ) {
      throw new ForbiddenException('仅管理员可修改全局标记');
    }

    return this.prisma.quickReply.update({
      where: { id: replyId },
      data: updateReplyDto,
      include: { category: true },
    });
  }

  /**
   * 删除快捷回复（软删除）
   */
  async deleteReply(
    replyId: string,
    userId: string,
    isAdmin: boolean,
  ) {
    const reply = await this.prisma.quickReply.findUniqueOrThrow({
      where: { id: replyId },
    });

    // ⭐ 权限检查
    if (!isAdmin && reply.creatorId !== userId) {
      throw new ForbiddenException('无权删除此回复');
    }

    return this.prisma.quickReply.update({
      where: { id: replyId },
      data: { deletedAt: new Date() },
    });
  }

  // ========== 收藏管理 ==========

  /**
   * 切换收藏状态
   */
  async toggleFavorite(replyId: string, userId: string): Promise<void> {
    // ⭐ 验证回复存在
    await this.prisma.quickReply.findUniqueOrThrow({
      where: { id: replyId },
    });

    // ⭐ 使用事务保证原子性
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.quickReplyFavorite.findUnique({
        where: {
          userId_replyId: { userId, replyId },
        },
      });

      if (existing) {
        // 取消收藏
        await tx.quickReplyFavorite.delete({
          where: { id: existing.id },
        });
        await tx.quickReply.update({
          where: { id: replyId },
          data: { favoriteCount: { decrement: 1 } },
        });
      } else {
        // 添加收藏
        await tx.quickReplyFavorite.create({
          data: { userId, replyId },
        });
        await tx.quickReply.update({
          where: { id: replyId },
          data: { favoriteCount: { increment: 1 } },
        });
      }
    });
  }

  /**
   * 获取用户收藏列表
   */
  async getUserFavorites(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.quickReplyFavorite.findMany({
        where: { userId },
        include: {
          reply: {
            include: { category: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.quickReplyFavorite.count({ where: { userId } }),
    ]);

    return {
      data: data.map((fav) => ({
        ...fav.reply,
        isFavorited: true, // 收藏列表中的都是已收藏的
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ========== 使用统计 ==========

  /**
   * 增加使用次数
   */
  async incrementUsage(replyId: string): Promise<void> {
    await this.prisma.quickReply.update({
      where: { id: replyId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }

  // ========== 辅助方法 ==========

  /**
   * 验证分类访问权限
   */
  private validateCategoryAccess(
    category: any,
    userId: string,
    isAdmin: boolean,
  ): void {
    if (!category.isGlobal && category.creatorId !== userId && !isAdmin) {
      throw new ForbiddenException('无权访问此分类');
    }
  }

  /**
   * 构建排序条件
   */
  private buildOrderBy(sortBy?: SortByEnum | string): any {
    const sortValue = sortBy || SortByEnum.USAGE_COUNT;
    switch (sortValue) {
      case SortByEnum.USAGE_COUNT:
      case 'usageCount':
        return { usageCount: 'desc' };
      case SortByEnum.FAVORITE_COUNT:
      case 'favoriteCount':
        return { favoriteCount: 'desc' };
      case SortByEnum.LAST_USED_AT:
      case 'lastUsedAt':
        // 对于 lastUsedAt，只按 lastUsedAt 排序
        // 在 PostgreSQL 中，null 值在降序排序时会自动排在最后
        // 如果遇到问题，可以在应用层进行二次排序
        return { lastUsedAt: 'desc' };
      default:
        return { usageCount: 'desc' };
    }
  }
}
