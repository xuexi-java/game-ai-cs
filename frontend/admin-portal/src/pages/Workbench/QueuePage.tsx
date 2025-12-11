import { useState, useEffect } from 'react';
import {
  Card,
  List,
  Button,
  Tag,
  Space,
  Typography,
  Empty,
  Spin,
  Modal,
  Avatar,
  message,
} from 'antd';
import {
  CustomerServiceOutlined,
  ClockCircleOutlined,
  UserOutlined,
  PhoneOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSessionStore } from '../../stores/sessionStore';
import { getQueuedSessions, joinSession } from '../../services/session.service';
import type { Session } from '../../types';
import './QueuePage.css';

const { Title, Text } = Typography;
const { confirm } = Modal;

const QueuePage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { queuedSessions, setQueuedSessions } = useSessionStore();

  // 加载待接入会话列表
  const loadQueuedSessions = async () => {
    setLoading(true);
    try {
      const sessions = await getQueuedSessions();
      setQueuedSessions(sessions);
    } catch (error) {
      console.error('加载待接入会话失败:', error);
      message.error('加载待接入会话失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueuedSessions();
  }, []);

  // 接入会话
  const handleJoinSession = async (session: Session) => {
    if (!session || !session.id) {
      message.error('会话信息无效');
      return;
    }

    try {
      await joinSession(session.id);
      message.success('接入会话成功');
      await loadQueuedSessions(); // 重新加载列表
    } catch (error: any) {
      console.error('接入会话失败:', error);
      message.error(error?.response?.data?.message || '接入会话失败，请稍后重试');
    }
  };

  // 获取优先级颜色
  const getPriorityColor = (score?: number) => {
    if (!score) return 'default';
    if (score >= 80) return 'red';
    if (score >= 60) return 'orange';
    if (score >= 40) return 'blue';
    return 'default';
  };

  // 获取等待时间显示
  const getWaitTimeDisplay = (queuedAt?: string) => {
    if (!queuedAt) return '-';
    const waitTime = dayjs().diff(dayjs(queuedAt), 'minute');
    if (waitTime < 1) return '刚刚';
    if (waitTime < 60) return `${waitTime}分钟`;
    return `${Math.floor(waitTime / 60)}小时${waitTime % 60}分钟`;
  };

  // 获取紧急程度标签
  const getUrgencyTag = (session: Session) => {
    if (session.aiUrgency === 'URGENT') {
      return <Tag color="red">紧急</Tag>;
    }
    return <Tag color="blue">普通</Tag>;
  };

  if (loading && queuedSessions.length === 0) {
    return (
      <div className="queue-loading">
        <Spin size="large" />
        <p>加载排队会话中...</p>
      </div>
    );
  }

  return (
    <div className="queue-container">
      <Card>
        <div className="queue-header">
          <Title level={3}>
            <CustomerServiceOutlined /> 待接入队列
            {queuedSessions.length > 0 && (
              <span style={{ marginLeft: 12, fontSize: 14, color: '#1890ff', fontWeight: 500 }}>
                ({queuedSessions.length})
              </span>
            )}
          </Title>
          
          <Button 
            type="primary" 
            icon={<ReloadOutlined />}
            onClick={loadQueuedSessions}
            loading={loading}
          >
            刷新队列
          </Button>
        </div>

        {queuedSessions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无排队会话"
          />
        ) : (
          <List
            className="queue-list"
            itemLayout="vertical"
            dataSource={queuedSessions.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))}
            renderItem={(session, index) => (
              <List.Item
                key={session.id}
                className="queue-item"
                actions={[
                  <Button
                    type="primary"
                    icon={<PhoneOutlined />}
                    onClick={() => handleJoinSession(session)}
                  >
                    接入会话
                  </Button>
                ]}
              >
                <div className="queue-item-content">
                  <div className="queue-item-header">
                    <div className="queue-item-title">
                      <span className="queue-item-number">{index + 1}</span>
                      <Avatar icon={<UserOutlined />} style={{ marginRight: 12 }} />
                      <div>
                        <Title level={5} style={{ margin: 0 }}>
                          {session.ticket.ticketNo}
                        </Title>
                        <Text type="secondary">
                          {session.ticket.playerIdOrName} · {session.ticket.game.name}
                          {session.ticket.server && ` · ${session.ticket.server.name}`}
                        </Text>
                      </div>
                    </div>
                    
                    <div className="queue-item-tags">
                      {getUrgencyTag(session)}
                      <Tag color={getPriorityColor(session.priorityScore)}>
                        优先级: {session.priorityScore?.toFixed(1) || 0}
                      </Tag>
                    </div>
                  </div>
                  
                  <div className="queue-item-description">
                    <Text>{session.ticket.description}</Text>
                  </div>
                  
                  <div className="queue-item-meta">
                    <Space split={<span>·</span>}>
                      <span>
                        <ClockCircleOutlined /> 
                        等待时间: {getWaitTimeDisplay(session.queuedAt)}
                      </span>
                      
                      {session.detectedIntent && (
                        <span>
                          意图: {session.detectedIntent}
                        </span>
                      )}
                      
                      <span>
                        创建时间: {dayjs(session.createdAt).format('MM-DD HH:mm')}
                      </span>
                    </Space>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default QueuePage;
