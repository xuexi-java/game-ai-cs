/**
 * 工单异步聊天页面 - 与 Chat 页面保持一致的设计
 */
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Input, Button, Spin, message as antdMessage, Tag } from 'antd';
import { SendOutlined, CustomerServiceOutlined, UserOutlined } from '@ant-design/icons';
import { io, Socket } from 'socket.io-client';
import {
  getTicketByToken,
  getTicketMessagesByToken,
  sendTicketMessageByToken,
  type TicketMessage,
} from '../../services/ticket.service';
import type { Message, TicketDetail } from '../../types';
import MessageList from '../../components/Chat/MessageList';
import { WS_URL } from '../../config/api';
import '../Chat/index.css'; // 使用 Chat 页面的样式

const { TextArea } = Input;

const TicketChatPage = () => {
  const { token } = useParams<{ token: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const tempMessageIdRef = useRef<string | null>(null); // 跟踪临时消息 ID

  // 将 TicketMessage 转换为 Message 类型
  const convertTicketMessageToMessage = (ticketMsg: TicketMessage): Message => {
    const isPlayer = !ticketMsg.senderId; // 没有 senderId 表示是玩家消息
    return {
      id: ticketMsg.id,
      sessionId: ticketMsg.ticketId,
      senderType: isPlayer ? 'PLAYER' : 'AGENT',
      messageType: 'TEXT',
      content: ticketMsg.content,
      createdAt: ticketMsg.createdAt,
    };
  };

  // 获取工单状态显示文本
  const getStatusText = (status: string) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      NEW: { text: '待处理', color: 'blue' },
      IN_PROGRESS: { text: '处理中', color: 'processing' },
      WAITING: { text: '等待回复', color: 'orange' },
      RESOLVED: { text: '已解决', color: 'success' },
      CLOSED: { text: '已关闭', color: 'default' },
    };
    return statusMap[status] || { text: '未知', color: 'default' };
  };

  // 加载工单和消息
  useEffect(() => {
    if (!token) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // 并行加载工单和消息
        const [ticketData, messagesData] = await Promise.all([
          getTicketByToken(token),
          getTicketMessagesByToken(token),
        ]);

        setTicket(ticketData);
        
        // 转换消息格式并按时间排序
        const convertedMessages = messagesData
          .map(convertTicketMessageToMessage)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(convertedMessages);
      } catch (error: any) {
        console.error('加载数据失败:', error);
        antdMessage.error(error?.response?.data?.message || '加载数据失败，请刷新重试');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token]);

  // 连接 WebSocket 接收实时消息
  useEffect(() => {
    if (!ticket?.id) return;

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket 连接成功（工单）');
      setWsConnected(true);
      // 加入工单房间
      socket.emit('join-ticket', { ticketId: ticket.id });
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket 连接错误:', error);
      setWsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket 断开连接:', reason);
      setWsConnected(false);
    });

    // 接收工单消息
    socket.on('ticket-message', (ticketMsg: TicketMessage) => {
      console.log('收到工单消息:', ticketMsg);
      const convertedMessage = convertTicketMessageToMessage(ticketMsg);
      
      setMessages((prev) => {
        // 检查是否已存在该消息（避免重复）- 使用 ID 和内容双重检查
        const existsById = prev.some((msg) => msg.id === convertedMessage.id);
        if (existsById) {
          console.log('消息已存在，跳过:', convertedMessage.id);
          return prev;
        }

        // 如果有临时消息，尝试替换它（通过内容匹配）
        if (tempMessageIdRef.current) {
          const tempIndex = prev.findIndex((msg) => msg.id === tempMessageIdRef.current);
          if (tempIndex !== -1) {
            const tempMsg = prev[tempIndex];
            // 如果临时消息的内容和发送者类型匹配，则替换
            if (
              tempMsg.content === convertedMessage.content &&
              tempMsg.senderType === convertedMessage.senderType
            ) {
              console.log('替换临时消息:', tempMessageIdRef.current, '->', convertedMessage.id);
              tempMessageIdRef.current = null;
              return prev.map((msg, index) =>
                index === tempIndex ? convertedMessage : msg
              );
            }
          }
        }

        // 检查是否有相同内容的消息（避免重复添加）
        const existsByContent = prev.some(
          (msg) =>
            msg.content === convertedMessage.content &&
            msg.senderType === convertedMessage.senderType &&
            Math.abs(new Date(msg.createdAt).getTime() - new Date(convertedMessage.createdAt).getTime()) < 5000 // 5秒内的相同消息视为重复
        );
        if (existsByContent) {
          console.log('检测到重复消息（内容相同），跳过');
          return prev;
        }

        // 添加新消息
        console.log('添加新消息:', convertedMessage.id);
        return [...prev, convertedMessage];
      });
    });

    // 监听工单状态更新
    socket.on('ticket-update', (data: Partial<TicketDetail>) => {
      console.log('工单状态更新:', data);
      setTicket((prev) => (prev ? { ...prev, ...data } : null));
    });

    return () => {
      console.log('清理 WebSocket 连接（工单）');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [ticket?.id]);

  // 自动滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const handleExitSession = async () => {
    if (!ticket?.id) return;
    
    try {
      // 查找关联的会话
      const sessionId = ticket.sessions?.[0]?.id;
      if (sessionId) {
        // 调用退出会话API
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/sessions/${sessionId}/close-player`, {
          method: 'PATCH',
        });
        
        if (response.ok) {
          // 发送系统消息
          const systemMessage: Message = {
            id: `system-${Date.now()}`,
            sessionId: ticket.id,
            senderType: 'SYSTEM',
            messageType: 'TEXT',
            content: '玩家已离开',
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMessage]);
          antdMessage.success('已退出会话');
        }
      }
    } catch (error) {
      console.error('退出会话失败:', error);
      antdMessage.error('退出会话失败');
    }
  };

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || !token) {
      return;
    }

    setSending(true);
    try {
      // 先乐观更新 UI
      const tempId = `temp-${Date.now()}`;
      tempMessageIdRef.current = tempId;
      const tempMessage: Message = {
        id: tempId,
        sessionId: ticket?.id ?? 'temp',
        senderType: 'PLAYER',
        messageType: 'TEXT',
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMessage]);
      setInputValue('');

      // 发送消息到服务器
      const sentMessage = await sendTicketMessageByToken(token, content);
      
      // 替换临时消息为真实消息（如果还没有被 WebSocket 替换）
      setMessages((prev) => {
        const tempIndex = prev.findIndex((msg) => msg.id === tempId);
        if (tempIndex !== -1) {
          // 检查是否已经有真实消息了（可能 WebSocket 已经推送了）
          const realMessageExists = prev.some(
            (msg) =>
              msg.id === sentMessage.id ||
              (msg.content === sentMessage.content &&
                msg.senderType === 'PLAYER' &&
                !msg.id.startsWith('temp-'))
          );
          
          if (realMessageExists) {
            // 如果已经有真实消息，移除临时消息
            tempMessageIdRef.current = null;
            return prev.filter((msg) => msg.id !== tempId);
          } else {
            // 否则替换临时消息
            tempMessageIdRef.current = null;
            return prev.map((msg) =>
              msg.id === tempId
                ? convertTicketMessageToMessage(sentMessage)
                : msg
            );
          }
        }
        return prev;
      });
    } catch (error: any) {
      console.error('发送消息失败:', error);
      antdMessage.error(error?.response?.data?.message || '发送消息失败，请重试');
      
      // 移除临时消息
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessageIdRef.current));
      tempMessageIdRef.current = null;
      
      // 恢复输入框内容
      setInputValue(content);
    } finally {
      setSending(false);
    }
  };

  if (loading || !ticket) {
    return (
      <div className="chat-loading-container">
        <Spin size="large" />
        <div className="chat-loading-text">加载中...</div>
      </div>
    );
  }

  const statusInfo = getStatusText(ticket.status);
  const isClosed = ticket.status === 'CLOSED';

  return (
    <div className="chat-container-v3">
      {/* Header */}
      <header className="chat-header-v3 header-agent">
        <div className="header-left">
          <div className="header-avatar-wrapper">
            <div className="header-avatar avatar-player">
              <UserOutlined />
            </div>
            {wsConnected && <span className="status-dot online"></span>}
          </div>
          <div className="header-info">
            <h1 className="header-name">工单 #{ticket.ticketNo}</h1>
            <p className="header-status">
              {ticket.game?.name}
              {ticket.server && ` · ${ticket.server.name}`}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <Button 
            type="text" 
            danger 
            onClick={handleExitSession}
            style={{ marginRight: 8 }}
          >
            退出会话
          </Button>
          <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
        </div>
      </header>

      {/* Chat Body */}
      <main className="chat-body-v3">
        <div className="chat-messages-wrapper">
          <MessageList messages={messages} />
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Footer */}
      <footer className="chat-footer-v3">
        <div className="chat-input-wrapper-v3">
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isClosed ? '工单已关闭，无法继续发送消息' : '输入消息...（Shift+Enter 换行）'}
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={sending || isClosed}
            className="chat-input-v3"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={sending}
            disabled={!inputValue.trim() || sending || isClosed}
            className="send-btn-v3"
          />
        </div>
      </footer>
    </div>
  );
};

export default TicketChatPage;
