import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface DifyTriageResponse {
  initial_reply: string;
  suggested_options: string[];
  detected_intent: string;
  urgency: 'urgent' | 'non_urgent';
}

export interface DifyChatMessageResponse {
  answer: string;
  conversation_id?: string;
  message_id?: string;
  metadata?: any;
}

@Injectable()
export class DifyService {
  private axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.axiosInstance = axios.create({
      timeout: 30000,
    });
  }

  /**
   * 调用Dify进行问题分流（使用工作流API）
   * 注意：如果您的Dify配置使用的是工作流，使用此方法
   */
  async triage(
    description: string,
    apiKey: string,
    baseUrl: string,
  ): Promise<DifyTriageResponse> {
    try {
      // 尝试使用工作流API（如果配置了工作流）
      const response = await this.axiosInstance.post(
        `${baseUrl}/workflows/run`,
        {
          inputs: {
            description,
          },
          response_mode: 'blocking',
          user: 'system',
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // 解析Dify返回的数据
      const output = response.data?.outputs || {};
      
      return {
        initial_reply: output.initial_reply || '您好，我正在为您分析问题...',
        suggested_options: output.suggested_options || [],
        detected_intent: output.detected_intent || 'unknown',
        urgency: output.urgency === 'urgent' ? 'urgent' : 'non_urgent',
      };
    } catch (error: any) {
      console.error('Dify 工作流API调用失败，尝试使用对话API:', error.message);
      
      // 如果工作流API失败，尝试使用对话API
      try {
        return await this.triageWithChatAPI(description, apiKey, baseUrl);
      } catch (chatError: any) {
        console.error('Dify 对话API调用失败:', chatError.message);
        
        // 返回默认响应
        return {
          initial_reply: '您好，感谢您的反馈。我们正在为您处理，请稍候...',
          suggested_options: ['转人工客服', '查看常见问题'],
          detected_intent: 'unknown',
          urgency: 'non_urgent',
        };
      }
    }
  }

  /**
   * 使用对话API进行问题分流
   * 根据您提供的API文档，使用 /chat-messages 端点
   */
  async triageWithChatAPI(
    description: string,
    apiKey: string,
    baseUrl: string,
  ): Promise<DifyTriageResponse> {
    try {
      const response = await this.axiosInstance.post(
        `${baseUrl}/chat-messages`,
        {
          inputs: {
            description,
          },
          query: description,
          response_mode: 'blocking',
          user: 'system',
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // 解析Dify对话API返回的数据
      const answer = response.data?.answer || '您好，我正在为您分析问题...';
      const metadata = response.data?.metadata || {};
      
      return {
        initial_reply: answer,
        suggested_options: metadata.suggested_options || ['转人工客服', '查看常见问题'],
        detected_intent: metadata.detected_intent || 'unknown',
        urgency: metadata.urgency === 'urgent' ? 'urgent' : 'non_urgent',
      };
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * 发送对话消息（支持会话持久化）
   * 根据您提供的API文档：POST /chat-messages
   */
  async sendChatMessage(
    query: string,
    apiKey: string,
    baseUrl: string,
    conversationId?: string,
    userId?: string,
  ): Promise<DifyChatMessageResponse> {
    try {
      const requestBody: any = {
        inputs: {},
        query,
        response_mode: 'blocking',
        user: userId || 'system',
      };

      // 如果提供了会话ID，添加到请求中（支持会话持久化）
      if (conversationId) {
        requestBody.conversation_id = conversationId;
      }

      const response = await this.axiosInstance.post(
        `${baseUrl}/chat-messages`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        answer: response.data?.answer || '',
        conversation_id: response.data?.conversation_id,
        message_id: response.data?.id,
        metadata: response.data?.metadata,
      };
    } catch (error: any) {
      console.error('Dify发送对话消息失败:', error.message);
      throw new HttpException(
        `Dify API调用失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 优化客服回复（AI辅助）
   * 使用对话API优化回复内容
   */
  async optimizeReply(
    content: string,
    context: string,
    apiKey: string,
    baseUrl: string,
    conversationId?: string,
  ): Promise<string> {
    try {
      const query = `请优化以下客服回复内容，使其更加专业和友好：\n${content}\n\n上下文信息：\n${context}`;
      
      const response = await this.sendChatMessage(
        query,
        apiKey,
        baseUrl,
        conversationId,
        'system',
      );

      return response.answer || content;
    } catch (error: any) {
      console.error('Dify优化回复失败:', error.message);
      return content; // 失败时返回原文
    }
  }

  /**
   * 获取会话历史消息
   * GET /messages?conversation_id={conversation_id}
   */
  async getConversationHistory(
    conversationId: string,
    apiKey: string,
    baseUrl: string,
    limit: number = 20,
  ): Promise<any[]> {
    try {
      const response = await this.axiosInstance.get(
        `${baseUrl}/messages`,
        {
          params: {
            conversation_id: conversationId,
            limit,
          },
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      return response.data?.data || [];
    } catch (error: any) {
      console.error('获取会话历史失败:', error.message);
      return [];
    }
  }

  /**
   * 获取会话列表
   * GET /conversations
   */
  async getConversationList(
    apiKey: string,
    baseUrl: string,
    userId?: string,
    limit: number = 20,
  ): Promise<any[]> {
    try {
      const response = await this.axiosInstance.get(
        `${baseUrl}/conversations`,
        {
          params: {
            user: userId || 'system',
            limit,
          },
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      return response.data?.data || [];
    } catch (error: any) {
      console.error('获取会话列表失败:', error.message);
      return [];
    }
  }
}
