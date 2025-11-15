/**
 * 工单异步聊天页面
 */
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Input, Button, Typography, Spin } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { getTicketByToken } from '../../services/ticket.service';
import type { Message } from '../../types';
import MessageList from '../../components/Chat/MessageList';

const { TextArea } = Input;

const TicketChatPage = () => {
  const { token } = useParams<{ token: string }>();
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;

    const loadTicket = async () => {
      try {
        const ticketData = await getTicketByToken(token);
        setTicket(ticketData);
        // TODO: 加载工单消息
      } catch (error) {
        console.error('加载工单失败:', error);
      }
    };

    loadTicket();
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const content = inputValue.trim();
    if (!content) {
      return;
    }
    const newMessage: Message = {
      id: Date.now().toString(),
      sessionId: ticket?.id ?? 'temp',
      senderType: 'PLAYER',
      messageType: 'TEXT',
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
  };

  if (!ticket) {
    return (
      <div className="loading-container">
        <Spin size="large" />
        <div className="loading-text">加载工单中...</div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <Typography.Title level={4} style={{ margin: 0, color: 'white' }}>
          工单 #{ticket.ticketNo}
        </Typography.Title>
        <div className="status-badge in-progress">
          异步处理中
        </div>
      </div>
      
      <div className="chat-content">
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
          <MessageList messages={messages} />
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="chat-input-area">
        <div style={{ display: 'flex', gap: '8px' }}>
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="输入消息..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ borderRadius: '8px' }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!inputValue.trim()}
            style={{ 
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none'
            }}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TicketChatPage;
