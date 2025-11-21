import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Input,
  Select,
  Button,
  Typography,
  Modal,
  Descriptions,
  Image,
  Divider,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined,
  SearchOutlined,
  MessageOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Session, User, Game, Message } from '../../types';
import {
  getSessions,
  getSessionById,
  type SessionQueryParams,
} from '../../services/session.service';
import { getUsers } from '../../services/user.service';
import { getGames } from '../../services/game.service';
import { getSessionMessages } from '../../services/message.service';
import { useAuthStore } from '../../stores/authStore';
import { useMessage } from '../../hooks/useMessage';
import { API_BASE_URL } from '../../config/api';
import './index.css';

const { Option } = Select;
const { Title } = Typography;
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

const resolveAttachmentUrl = (url?: string) => {
  if (!url) {
    return '';
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return `${API_ORIGIN}${normalized}`;
};

const statusMap: Record<
  Session['status'],
  { text: string; color: string }
> = {
  PENDING: { text: '进行中', color: 'processing' },
  QUEUED: { text: '排队中', color: 'processing' },
  IN_PROGRESS: { text: '人工处理中', color: 'warning' },
  CLOSED: { text: '已关闭', color: 'success' },
};

const SessionsPage: React.FC = () => {
  const { user } = useAuthStore();
  const message = useMessage();
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [agents, setAgents] = useState<User[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Message[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    agentId: '',
    gameId: '',
    search: '',
    transferredToAgent: undefined as boolean | undefined, // undefined: 全部, true: 已转人工, false: 未转人工
  });

  const isAdmin = user?.role === 'ADMIN';

  const loadSessions = async () => {
    setLoading(true);
    try {
      const params: SessionQueryParams = {
        page: currentPage,
        pageSize,
        status: filters.status || undefined,
        search: filters.search && filters.search.trim() ? filters.search.trim() : undefined,
        transferredToAgent: filters.transferredToAgent,
      };

      if (isAdmin && filters.agentId) {
        params.agentId = filters.agentId;
      }

      if (isAdmin && filters.gameId) {
        params.gameId = filters.gameId;
      }

      const result = await getSessions(params);
      let items = result.items ?? [];
      let totalCount = result.total ?? 0;

      if (filters.transferredToAgent !== undefined) {
        const filteredItems = items.filter((session) => {
          const hasAgent = Boolean(session.agent?.id || session.agentId);
          return filters.transferredToAgent ? hasAgent : !hasAgent;
        });
        items = filteredItems;
        totalCount = filteredItems.length;
      }

      setSessions(items);
      setTotal(totalCount);
    } catch (error) {
      console.error('加载会话列表失败:', error);
      message.error('加载会话失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const loadGames = async () => {
    if (!isAdmin) {
      setGames([]);
      return;
    }
    try {
      const gamesData = await getGames();
      const gamesList = Array.isArray(gamesData) ? gamesData : [];
      setGames(gamesList);
    } catch (error) {
      console.error('加载游戏列表失败:', error);
      setGames([]);
    }
  };

  const handleViewDetail = async (session: Session) => {
    setSelectedSession(session);
    setDetailModalVisible(true);
    setLoadingDetail(true);
    try {
      const [detail, messages] = await Promise.all([
        getSessionById(session.id),
        getSessionMessages(session.id),
      ]);
      setSelectedSession(detail);
      setSessionMessages(messages);
    } catch (error) {
      console.error('加载会话详情失败:', error);
      message.error('加载会话详情失败');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadGames();
    } else {
      setGames([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setAgents([]);
      return;
    }

    const fetchAgents = async () => {
      try {
        const result = await getUsers({ role: 'AGENT', page: 1, pageSize: 100 });
        setAgents(result.items ?? []);
      } catch (error) {
        console.error('加载客服列表失败:', error);
      }
    };

    fetchAgents();
  }, [isAdmin]);

  // 搜索防抖定时器引用
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, filters.status, filters.agentId, filters.gameId, filters.transferredToAgent]);

  // 搜索使用防抖，避免频繁请求
  useEffect(() => {
    // 清除之前的定时器
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    // 如果搜索框为空，立即加载（清除搜索）
    if (!filters.search || filters.search.trim() === '') {
      loadSessions();
      return;
    }

    // 设置新的防抖定时器
    searchTimerRef.current = setTimeout(() => {
      loadSessions();
    }, 500); // 500ms 防抖

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const handleSearch = (value: string) => {
    setFilters((prev) => ({ ...prev, search: value }));
    setCurrentPage(1);
  };

  // 处理搜索框回车或失焦 - 立即搜索
  const handleSearchSubmit = () => {
    // 清除防抖定时器，立即执行搜索
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    loadSessions();
  };

  const columns: ColumnsType<Session> = useMemo(
    () => [
      {
        title: '工单编号',
        dataIndex: ['ticket', 'ticketNo'],
        key: 'ticketNo',
        width: 160,
        ellipsis: {
          showTitle: true,
        },
        render: (_, record) => {
          const ticketNo = record.ticket?.ticketNo;
          if (!ticketNo) return '-';
          return (
            <Typography.Text copyable={{ text: ticketNo }} strong>
              {ticketNo}
            </Typography.Text>
          );
        },
      },
      {
        title: '游戏',
        dataIndex: ['ticket', 'game', 'name'],
        key: 'game',
        width: 140,
        render: (_, record) => record.ticket?.game?.name || '-',
      },
      {
        title: '区服',
        key: 'server',
        width: 120,
        render: (_, record) =>
          record.ticket?.server?.name || record.ticket?.serverName || '-',
      },
      {
        title: '玩家ID/昵称',
        dataIndex: ['ticket', 'playerIdOrName'],
        key: 'player',
        width: 160,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: Session['status']) => {
          const info = statusMap[status];
          return <Tag color={info.color}>{info.text}</Tag>;
        },
      },
      {
        title: '处理客服',
        key: 'agent',
        width: 200,
        render: (_, record) => {
          if (record.agent?.realName || record.agent?.username) {
            return record.agent?.realName || record.agent?.username;
          }
          const gameName = record.ticket?.game?.name;
          if (gameName) {
            return `${gameName}智能客服`;
          }
          return '智能客服';
        },
      },
      {
        title: '排队时间',
        dataIndex: 'queuedAt',
        key: 'queuedAt',
        width: 180,
        render: (value?: string) =>
          value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 180,
        render: (value?: string) =>
          value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 100,
        fixed: 'right',
        render: (_, record) => (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="sessions-page">
      <Card className="sessions-card">
        <div className="sessions-card__header">
          <div className="sessions-card__title">
            <MessageOutlined />
            <Title level={4}>会话管理</Title>
          </div>

          <Space size="middle" wrap>
            <Input
              placeholder="搜索工单编号或玩家"
              prefix={<SearchOutlined />}
              allowClear
              value={filters.search}
              onChange={(e) => handleSearch(e.target.value)}
              onPressEnter={handleSearchSubmit}
              onBlur={handleSearchSubmit}
              style={{ width: 240 }}
            />

            <Select
              placeholder="状态"
              value={filters.status || undefined}
              onChange={(value) => {
                setFilters((prev) => ({ ...prev, status: value || '' }));
                setCurrentPage(1);
              }}
              allowClear
              style={{ width: 150 }}
            >
              {Object.entries(statusMap).map(([key, info]) => (
                <Option key={key} value={key}>
                  {info.text}
                </Option>
              ))}
            </Select>

            {isAdmin && (
              <Select
                placeholder="选择游戏"
                value={filters.gameId ? filters.gameId : undefined}
                onChange={(value) => {
                  setFilters((prev) => ({ ...prev, gameId: value || '' }));
                  setCurrentPage(1);
                }}
                allowClear
                style={{ width: 150 }}
                loading={games.length === 0 && isAdmin}
                notFoundContent={
                  games.length === 0 && isAdmin ? '暂无游戏，请先创建游戏' : undefined
                }
                showSearch
                filterOption={(input, option) => {
                  const label = String(option?.label || '');
                  return label.toLowerCase().includes(input.toLowerCase());
                }}
              >
                {Array.isArray(games) &&
                  games.length > 0 &&
                  games.map((game) => {
                    const gameName = game.name || `游戏 ${game.id}`;
                    return (
                      <Option key={game.id} value={game.id} label={gameName}>
                        {gameName}
                      </Option>
                    );
                  })}
              </Select>
            )}

            {isAdmin && (
              <Select
                placeholder="客服"
                value={filters.agentId || undefined}
                onChange={(value) => {
                  setFilters((prev) => ({ ...prev, agentId: value || '' }));
                  setCurrentPage(1);
                }}
                allowClear
                style={{ width: 180 }}
                notFoundContent={agents.length === 0 ? '暂无客服' : undefined}
              >
                {agents.map((agent) => (
                  <Option key={agent.id} value={agent.id}>
                    {agent.realName || agent.username}
                  </Option>
                ))}
              </Select>
            )}

            <Select
              placeholder="转人工"
              value={
                filters.transferredToAgent === undefined
                  ? undefined
                  : filters.transferredToAgent
                  ? 'true'
                  : 'false'
              }
              onChange={(value) => {
                setFilters((prev) => ({
                  ...prev,
                  transferredToAgent:
                    value === undefined
                      ? undefined
                      : value === 'true'
                      ? true
                      : false,
                }));
                setCurrentPage(1);
              }}
              allowClear
              style={{ width: 120 }}
            >
              <Option value="true">已转人工</Option>
              <Option value="false">未转人工</Option>
            </Select>

            <Button
              icon={<ReloadOutlined />}
              onClick={loadSessions}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
            showTotal: (t) => `共 ${t} 条`,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 会话详情 Modal */}
      <Modal
        title="会话详情"
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedSession(null);
          setSessionMessages([]);
        }}
        footer={null}
        width={800}
        loading={loadingDetail}
      >
        {selectedSession && (
          <div>
            <Descriptions title="会话信息" bordered column={2}>
              <Descriptions.Item label="会话ID">
                {selectedSession.id}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[selectedSession.status].color}>
                  {statusMap[selectedSession.status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="工单编号">
                {selectedSession.ticket?.ticketNo || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="游戏">
                {selectedSession.ticket?.game?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="区服">
                {selectedSession.ticket?.server?.name || selectedSession.ticket?.serverName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="玩家ID/昵称">
                {selectedSession.ticket?.playerIdOrName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="处理客服">
                {selectedSession.agent?.realName ||
                  selectedSession.agent?.username ||
                  (selectedSession.ticket?.game?.name
                    ? `${selectedSession.ticket.game.name}智能客服`
                    : '智能客服')}
              </Descriptions.Item>
              <Descriptions.Item label="优先级分数">
                {selectedSession.priorityScore || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {dayjs(selectedSession.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              {selectedSession.ticket?.description && (
                <Descriptions.Item label="问题描述" span={2}>
                  {selectedSession.ticket.description}
                </Descriptions.Item>
              )}
            </Descriptions>

            {selectedSession.ticket?.attachments &&
              selectedSession.ticket.attachments.length > 0 && (
                <>
                  <Divider />
                  <div>
                    <Typography.Text strong>问题截图：</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      <Image.PreviewGroup>
                        {selectedSession.ticket.attachments.map((file) => {
                          const src = resolveAttachmentUrl(file.fileUrl);
                          return (
                            <Image
                              key={file.id}
                              src={src}
                              alt={file.fileName}
                              width={80}
                              height={80}
                              style={{
                                objectFit: 'cover',
                                borderRadius: 8,
                                marginRight: 8,
                                marginBottom: 8,
                              }}
                            />
                          );
                        })}
                      </Image.PreviewGroup>
                    </div>
                  </div>
                </>
              )}

            {sessionMessages.length > 0 && (
              <>
                <Divider />
                <div>
                  <Typography.Text strong>会话消息：</Typography.Text>
                  <div
                    style={{
                      maxHeight: 400,
                      overflowY: 'auto',
                      marginTop: 8,
                      padding: 16,
                      backgroundColor: '#f5f5f5',
                      borderRadius: 8,
                    }}
                  >
                    {sessionMessages.map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          marginBottom: 12,
                          padding: 8,
                          backgroundColor: '#fff',
                          borderRadius: 4,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <Typography.Text strong>
                            {msg.senderType === 'AGENT'
                              ? '客服'
                              : msg.senderType === 'PLAYER'
                              ? '玩家'
                              : msg.senderType === 'AI'
                              ? 'AI'
                              : '系统'}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(msg.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                          </Typography.Text>
                        </div>
                        {msg.messageType === 'IMAGE' ? (
                          <Image
                            src={resolveAttachmentUrl(msg.content)}
                            alt="消息图片"
                            width={200}
                            style={{ borderRadius: 4 }}
                          />
                        ) : (
                          <Typography.Text>{msg.content}</Typography.Text>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SessionsPage;
