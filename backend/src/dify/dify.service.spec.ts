/**
 * Dify AI 服务单元测试
 * 
 * 测试覆盖：
 * - AI分流功能
 * - 优化客服回复
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DifyService } from './dify.service';

// Mock axios 模块（使用 __mocks__ 目录中的 mock）
jest.mock('axios');
import axios from 'axios';
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('DifyService', () => {
  let service: DifyService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockPost = jest.fn();
  const mockAxiosInstance = { post: mockPost };

  beforeEach(async () => {
    // 重置所有mock
    jest.clearAllMocks();
    
    // 设置 axios.create 的返回值
    (mockAxios.create as jest.Mock) = jest.fn(() => mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DifyService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DifyService>(DifyService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('triage', () => {
    it('应该成功调用Dify API并返回分流结果', async () => {
      const mockResponse = {
        data: {
          outputs: {
            initial_reply: 'AI初始回复',
            suggested_options: ['选项1', '选项2'],
            detected_intent: 'complaint',
            urgency: 'urgent',
          },
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const result = await service.triage(
        '问题描述',
        'api-key',
        'https://api.dify.ai',
      );

      expect(result).toEqual({
        initial_reply: 'AI初始回复',
        suggested_options: ['选项1', '选项2'],
        detected_intent: 'complaint',
        urgency: 'urgent',
      });

      expect(mockAxios.create).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith(
        'https://api.dify.ai/workflows/run',
        {
          inputs: {
            description: '问题描述',
          },
          response_mode: 'blocking',
          user: 'system',
        },
        {
          headers: {
            Authorization: 'Bearer api-key',
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('应该在工作流API失败时回退到对话API', async () => {
      // 工作流API失败
      mockPost.mockRejectedValueOnce(new Error('工作流API调用失败'));
      
      // 对话API成功
      const chatResponse = {
        data: {
          answer: '对话API回复',
          metadata: {
            suggested_options: ['选项1'],
            detected_intent: 'inquiry',
            urgency: 'non_urgent',
          },
        },
      };
      mockPost.mockResolvedValueOnce(chatResponse);

      const result = await service.triage(
        '问题描述',
        'api-key',
        'http://118.89.16.95/v1',
      );

      expect(result).toEqual({
        initial_reply: '对话API回复',
        suggested_options: ['选项1'],
        detected_intent: 'inquiry',
        urgency: 'non_urgent',
      });
      
      // 验证调用了对话API
      expect(mockPost).toHaveBeenCalledWith(
        'http://118.89.16.95/v1/chat-messages',
        expect.objectContaining({
          query: '问题描述',
        }),
        expect.any(Object),
      );
    });

    it('应该返回默认值当所有API调用失败', async () => {
      // 工作流API失败
      mockPost.mockRejectedValueOnce(new Error('工作流API调用失败'));
      // 对话API也失败
      mockPost.mockRejectedValueOnce(new Error('对话API调用失败'));

      const result = await service.triage(
        '问题描述',
        'api-key',
        'http://118.89.16.95/v1',
      );

      expect(result).toEqual({
        initial_reply: '您好，感谢您的反馈。我们正在为您处理，请稍候...',
        suggested_options: ['转人工客服', '查看常见问题'],
        detected_intent: 'unknown',
        urgency: 'non_urgent',
      });
    });

    it('应该处理非紧急情况', async () => {
      const mockResponse = {
        data: {
          outputs: {
            initial_reply: 'AI回复',
            suggested_options: ['选项1'],
            detected_intent: 'inquiry',
            urgency: 'non_urgent',
          },
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const result = await service.triage(
        '问题描述',
        'api-key',
        'https://api.dify.ai',
      );

      expect(result.urgency).toBe('non_urgent');
    });
  });

  describe('sendChatMessage', () => {
    it('应该成功发送对话消息', async () => {
      const mockResponse = {
        data: {
          answer: 'AI回复内容',
          conversation_id: 'conv-123',
          id: 'msg-456',
          metadata: {},
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const result = await service.sendChatMessage(
        '用户问题',
        'api-key',
        'http://118.89.16.95/v1',
      );

      expect(result).toEqual({
        answer: 'AI回复内容',
        conversation_id: 'conv-123',
        message_id: 'msg-456',
        metadata: {},
      });

      expect(mockPost).toHaveBeenCalledWith(
        'http://118.89.16.95/v1/chat-messages',
        expect.objectContaining({
          query: '用户问题',
          response_mode: 'blocking',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer api-key',
          }),
        }),
      );
    });

    it('应该支持会话持久化', async () => {
      const mockResponse = {
        data: {
          answer: '继续对话',
          conversation_id: 'conv-123',
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      await service.sendChatMessage(
        '后续问题',
        'api-key',
        'http://118.89.16.95/v1',
        'conv-123',
        'user-123',
      );

      expect(mockPost).toHaveBeenCalledWith(
        'http://118.89.16.95/v1/chat-messages',
        expect.objectContaining({
          conversation_id: 'conv-123',
          user: 'user-123',
        }),
        expect.any(Object),
      );
    });
  });

  describe('optimizeReply', () => {
    it('应该成功优化客服回复', async () => {
      const mockResponse = {
        data: {
          answer: '优化后的回复内容',
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const result = await service.optimizeReply(
        '原始回复',
        '上下文信息',
        'api-key',
        'http://118.89.16.95/v1',
      );

      expect(result).toBe('优化后的回复内容');
    });

    it('应该返回原文当优化失败', async () => {
      mockPost.mockRejectedValue(new Error('优化失败'));

      const result = await service.optimizeReply(
        '原始回复',
        '上下文信息',
        'api-key',
        'http://118.89.16.95/v1',
      );

      expect(result).toBe('原始回复');
    });
  });
});
