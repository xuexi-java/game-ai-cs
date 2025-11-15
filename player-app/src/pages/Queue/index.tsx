/**
 * 步骤5：排队页面
 */
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Typography, Spin, message } from 'antd';
import { getSession } from '../../services/session.service';
import { useSessionStore } from '../../stores/sessionStore';
import { io } from 'socket.io-client';
import { WS_URL } from '../../config/api';

const { Title, Paragraph } = Typography;

const QueuePage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, setSession, updateSession } = useSessionStore();

  useEffect(() => {
    if (!sessionId) return;

    // 加载会话信息
    const loadSession = async () => {
      try {
        const sessionData = await getSession(sessionId);
        setSession(sessionData);
      } catch (error) {
        console.error('加载会话失败:', error);
        message.error('加载会话失败');
      }
    };

    loadSession();

    // 连接 WebSocket 监听排队状态
    const newSocket = io(WS_URL, {
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      newSocket.emit('join-session', sessionId);
    });

    newSocket.on('queue-updated', (data) => {
      updateSession({
        priorityScore: data.priorityScore,
        queuedAt: data.queuedAt,
      });
    });

    newSocket.on('session-updated', (sessionData) => {
      updateSession(sessionData);
      if (sessionData.status === 'IN_PROGRESS') {
        // 客服已接入，跳转到聊天页面
        window.location.href = `/chat/${sessionId}`;
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [sessionId, setSession, updateSession]);

  if (!session) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <Spin size="large" />
          <div className="loading-text">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <Card className="page-card fade-in-up" style={{ textAlign: 'center' }}>
        <Spin size="large" style={{ marginBottom: '24px' }} />
        <Title level={3}>正在为您转接人工客服</Title>
        <Paragraph>请稍候，客服将尽快为您服务...</Paragraph>
        
        {session.priorityScore && (
          <Paragraph type="secondary">
            优先级评分: {session.priorityScore.toFixed(2)}
          </Paragraph>
        )}
      </Card>
    </div>
  );
};

export default QueuePage;
