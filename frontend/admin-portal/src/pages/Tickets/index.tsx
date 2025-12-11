import { useState, useEffect, useMemo} from 'react';
import {
  Table,
  Card,
  Button,
  Tag,
  Space,
  Input,
  Select,
  DatePicker,
  Modal,
  Descriptions,
  Typography,
  Tooltip,
  Image,
} from 'antd';
import {
  SearchOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getTickets,
  getTicketById,
  updateTicketStatus,
  updateTicketPriority,
} from '../../services/ticket.service';
import { getGames } from '../../services/game.service';
import { getAllIssueTypes } from '../../services/issueType.service';
import { getUsers } from '../../services/user.service';
import { assignSession, joinSessionByTicketId } from '../../services/session.service';
import type { Ticket, Game, IssueType, User } from '../../types';
import { useMessage } from '../../hooks/useMessage';
import { useAuthStore } from '../../stores/authStore';
import { API_BASE_URL } from '../../config/api';
import './index.css';

const { Option } = Select;
const { Title } = Typography;
const { RangePicker } = DatePicker;

type TicketStatus = Ticket['status'];
type TicketPriority = Ticket['priority'];

type StatusDisplay = { text: string; color: string };
type PriorityDisplay = { text: string; color: string };
type DateRangeValue = [dayjs.Dayjs, dayjs.Dayjs] | null;

const STATUS_OPTIONS: Array<{
  value: TicketStatus;
  text: string;
  color: string;
}> = [
  { value: 'WAITING', text: '待人工', color: 'orange' },
  { value: 'IN_PROGRESS', text: '处理中', color: 'warning' },
  { value: 'RESOLVED', text: '已解决', color: 'blue' },
];

const PRIORITY_OPTIONS: Array<{
  value: TicketPriority;
  text: string;
  color: string;
}> = [
  { value: 'LOW', text: '低', color: 'default' },
  { value: 'NORMAL', text: '普通', color: 'blue' },
  { value: 'HIGH', text: '高', color: 'orange' },
  { value: 'URGENT', text: '紧急', color: 'red' },
];

const getStatusDisplay = (status?: string): StatusDisplay => {
  const option = STATUS_OPTIONS.find((item) => item.value === status);
  return option ?? { text: status || '未知状态', color: 'default' };
};

const getPriorityDisplay = (priority?: string): PriorityDisplay => {
  const option = PRIORITY_OPTIONS.find((item) => item.value === priority);
  return option ?? { text: priority || '未知优先级', color: 'default' };
};

const STATUS_ORDER: Record<TicketStatus, number> = {
  WAITING: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
};

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

const TicketsPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assigningSessionId, setAssigningSessionId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const message = useMessage();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  // 筛选条件
  const [filters, setFilters] = useState({
    status: '',
    issueTypeId: '',
    gameId: '',
    search: '',
    dateRange: null as DateRangeValue,
  });

  // 加载数据
  const loadTickets = async () => {
    setLoading(true);
    try {
      const response = await getTickets({
        page: currentPage,
        pageSize,
        status: filters.status || undefined,
        issueTypeId: filters.issueTypeId || undefined,
        gameId: isAdmin ? filters.gameId || undefined : undefined,
        startDate: filters.dateRange?.[0]
          ? filters.dateRange[0].startOf('day').format('YYYY-MM-DD')
          : undefined,
        endDate: filters.dateRange?.[1]
          ? filters.dateRange[1].endOf('day').format('YYYY-MM-DD')
          : undefined,
        // 使用当前排序设置（后端排序，支持所有数据）
        sortBy: sortField,
        sortOrder: sortOrder,
      });

      // 转换后端返回的数据格式，将 ticketIssueTypes 转换为 issueTypes
      const transformedTickets = (response?.items ?? []).map((ticket: any) => {
        if (ticket.ticketIssueTypes && Array.isArray(ticket.ticketIssueTypes) && ticket.ticketIssueTypes.length > 0) {
          ticket.issueTypes = ticket.ticketIssueTypes.map((item: any) => ({
            id: item.issueType?.id || item.issueTypeId,
            name: item.issueType?.name || '未知类型',
          }));
          delete ticket.ticketIssueTypes;
        } else {
          // 如果没有问题类型，设置为空数组
          ticket.issueTypes = [];
        }
        return ticket;
      });

      setTickets(transformedTickets);
      setTotal(response?.total ?? 0);
    } catch (error) {
      console.error('加载工单列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载游戏列表
  const loadGames = async () => {
    if (!isAdmin) {
      setGames([]);
      return;
    }
    try {
      const gamesData = await getGames();
      // 确保 gamesData 是数组
      setGames(Array.isArray(gamesData) ? gamesData : []);
    } catch (error) {
      console.error('加载游戏列表失败:', error);
      setGames([]); // 出错时设置为空数组
    }
  };

  // 加载问题类型列表
  const loadIssueTypes = async () => {
    try {
      const issueTypesData = await getAllIssueTypes();
      setIssueTypes(Array.isArray(issueTypesData) ? issueTypesData : []);
    } catch (error) {
      console.error('加载问题类型列表失败:', error);
      setIssueTypes([]);
    }
  };

  // 加载客服列表
  const loadAgents = async () => {
    if (!isAdmin) {
      setAgents([]);
      return;
    }
    try {
      // 加载所有客服和管理员（管理员可以给自己分配）
      const [agentsResult, adminsResult] = await Promise.all([
        getUsers({ role: 'AGENT', page: 1, pageSize: 100 }),
        getUsers({ role: 'ADMIN', page: 1, pageSize: 100 }),
      ]);
      const allUsers = [
        ...(agentsResult.items ?? []),
        ...(adminsResult.items ?? []),
      ];
      setAgents(allUsers);
    } catch (error) {
      console.error('加载用户列表失败:', error);
      setAgents([]);
    }
  };

  useEffect(() => {
    loadGames();
    loadIssueTypes();
    if (isAdmin) {
      loadAgents();
    }
    if (!isAdmin && filters.gameId) {
      setFilters((prev) => ({ ...prev, gameId: '' }));
    }
  }, [isAdmin]);

  useEffect(() => {
    loadTickets();
  }, [currentPage, pageSize, filters, sortField, sortOrder]);

  // 查看工单详情
  const handleViewDetail = async (ticketId: string) => {
    try {
      const ticket: any = await getTicketById(ticketId);
      // 转换后端返回的数据格式，将 ticketIssueTypes 转换为 issueTypes
      if (ticket.ticketIssueTypes && Array.isArray(ticket.ticketIssueTypes) && ticket.ticketIssueTypes.length > 0) {
        ticket.issueTypes = ticket.ticketIssueTypes.map((item: any) => ({
          id: item.issueType?.id || item.issueTypeId,
          name: item.issueType?.name || '未知类型',
        }));
        delete ticket.ticketIssueTypes;
      } else {
        ticket.issueTypes = [];
      }
      setSelectedTicket(ticket);
      setDetailModalVisible(true);
    } catch (error) {
      console.error('获取工单详情失败:', error);
    }
  };

  // 更新工单状态
  const handleUpdateStatus = async (ticketId: string, status: string) => {
    try {
      await updateTicketStatus(ticketId, status);
      message.success('状态更新成功');
      loadTickets();
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  // 更新工单优先级
  const handleUpdatePriority = async (ticketId: string, priority: string) => {
    try {
      await updateTicketPriority(ticketId, priority);
      message.success('优先级更新成功');
      loadTickets();
    } catch (error) {
      console.error('更新优先级失败:', error);
    }
  };

  const handleDateRangeChange = (value: DateRangeValue) => {
    setFilters((prev) => ({ ...prev, dateRange: value }));
    setCurrentPage(1);
  };

  // 手动分配会话给客服（支持多次分配）
  const handleManualAssign = async () => {
    if (!assigningSessionId || !selectedAgentId) {
      message.warning('请选择客服');
      return;
    }
    try {
      // ✅ 修复：如果工单没有会话（assigningSessionId 以 ticket- 开头），先创建会话
      if (assigningSessionId.startsWith('ticket-')) {
        const ticketId = assigningSessionId.replace('ticket-', '');
        // 先通过工单ID接入会话（会自动创建会话）
        const session = await joinSessionByTicketId(ticketId);
        // 如果当前用户不是选中的客服，需要重新分配
        if (session.agentId !== selectedAgentId) {
          await assignSession(session.id, selectedAgentId);
        }
      } else {
        // 正常分配已有会话
        await assignSession(assigningSessionId, selectedAgentId);
      }
      message.success('分配成功，会话记录已更新');
      setAssignModalVisible(false);
      setAssigningSessionId(null);
      setSelectedAgentId('');
      // 立即刷新工单列表以更新客服信息
      await loadTickets();
      // 如果详情弹窗已打开，刷新详情数据
      if (detailModalVisible && selectedTicket) {
        await handleViewDetail(selectedTicket.id);
      }
    } catch (error: any) {
      console.error('分配失败:', error);
      message.error(error?.response?.data?.message || '分配失败，请重试');
    }
  };

  // 打开手动分配弹窗（支持多次分配）
  const handleOpenAssignModal = (ticket: Ticket) => {
    // ✅ 只检查工单状态，不检查会话状态
    if (ticket.status === 'RESOLVED') {
      message.warning('已解决的工单无法分配客服');
      return;
    }
    
    // 获取工单的最新会话
    const latestSession = ticket.sessions && ticket.sessions.length > 0 
      ? ticket.sessions[0] 
      : null;
    
    // ✅ 修复：如果工单没有会话，使用工单ID作为标识，后端会自动创建会话
    if (!latestSession) {
      // 对于没有会话的工单，使用工单ID作为会话ID（后端会处理）
      setAssigningSessionId(`ticket-${ticket.id}`);
      setSelectedAgentId('');
      setAssignModalVisible(true);
      return;
    }
    
    // ✅ 移除会话状态检查，允许对已关闭会话的工单进行分配
    
    setAssigningSessionId(latestSession.id);
    // 如果已经分配过，默认选中当前客服
    setSelectedAgentId(latestSession.agentId || '');
    setAssignModalVisible(true);
  };

  // 表格列定义
  const columns: ColumnsType<Ticket> = [
    {
      title: '工单号',
      dataIndex: 'ticketNo',
      key: 'ticketNo',
      width: 120,
      render: (text) => (
        <Typography.Text copyable={{ text }} strong>
          {text}
        </Typography.Text>
      ),
    },
    ...(isAdmin
      ? [
          {
            title: '游戏',
            dataIndex: ['game', 'name'],
            key: 'game',
            width: 100,
          },
        ]
      : []),
    {
      title: '区服',
      dataIndex: ['server', 'name'],
      key: 'server',
      width: 80,
      render: (text) => text || '-',
    },
    {
      title: '玩家',
      dataIndex: 'playerIdOrName',
      key: 'playerIdOrName',
      width: 120,
    },
    {
      title: '问题描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: {
        showTitle: false,
      },
      render: (text) => (
        <Tooltip title={text}>
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status, record) => {
        return (
          <Select
            value={status}
            size="small"
            style={{ width: '100%' }}
            onChange={(value) => handleUpdateStatus(record.id, value)}
            optionLabelProp="children"
          >
            {STATUS_OPTIONS.map(({ value, color, text }) => (
              <Option key={value} value={value}>
                <Tag color={color}>{text}</Tag>
              </Option>
            ))}
          </Select>
        );
      },
    },
    {
      title: '问题类型',
      dataIndex: 'issueTypes',
      key: 'issueTypes',
      width: 150,
      render: (issueTypes: Array<{ id: string; name: string }> | undefined, record) => {
        if (issueTypes && issueTypes.length > 0) {
          return (
            <Space size={[4, 4]} wrap>
              {issueTypes.map((issueType) => (
                <Tag key={issueType.id} color="blue">
                  {issueType.name}
                </Tag>
              ))}
            </Space>
          );
        }
        return <span>-</span>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      // 使用后端排序，确保排序基于整个数据集
      sorter: true,
      sortOrder: sortField === 'createdAt' ? (sortOrder === 'desc' ? 'descend' : 'ascend') : null,
      defaultSortOrder: 'descend',
      // 确保排序字段名称与后端一致
      sortDirections: ['descend', 'ascend'],
      render: (text) => dayjs(text).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: isAdmin ? 240 : 120,
      render: (_, record) => {
        const latestSession = record.sessions && record.sessions.length > 0 
          ? record.sessions[0] 
          : null;
        const hasSession = latestSession !== null;
        const isResolved = record.status === 'RESOLVED';
        const isAssigned = latestSession?.agentId && latestSession?.status === 'IN_PROGRESS';
        // ✅ 移除会话状态检查，只检查工单状态
        
        return (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.id)}
            >
              详情
            </Button>
            {isAdmin && hasSession && (
              <Button
                type="link"
                size="small"
                disabled={isResolved} // ✅ 只检查工单状态
                onClick={() => handleOpenAssignModal(record)}
              >
                {isAssigned ? '重新分配' : '分配客服'}
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  // 分页配置
  const paginationConfig: TablePaginationConfig = {
    current: currentPage,
    pageSize,
    total,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
    onChange: (page, size) => {
      setCurrentPage(page);
      setPageSize(size || 10);
    },
  };

  // 移除前端排序，使用表格列的排序功能
  // 如果需要在初始加载时按创建时间倒序，可以在后端查询时设置 sortBy 和 sortOrder
  // const sortedTickets = useMemo(() => {
  //   return [...tickets].sort((a, b) => {
  //     const statusDiff =
  //       (STATUS_ORDER[a.status as TicketStatus] ?? 99) -
  //       (STATUS_ORDER[b.status as TicketStatus] ?? 99);
  //     if (statusDiff !== 0) {
  //       return statusDiff;
  //     }

  //     const scoreDiff = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
  //     if (scoreDiff !== 0) {
  //       return scoreDiff;
  //     }

  //     return dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf();
  //   });
  // }, [tickets]);

  return (
    <div className="tickets-container">
      <Card>
        <div className="tickets-header">
          <Title level={3}>工单管理</Title>
          
          {/* 筛选条件 */}
          <div className="tickets-filters">
            <Space wrap>
              <Input
                placeholder="搜索工单号或玩家"
                prefix={<SearchOutlined />}
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                style={{ width: 200 }}
                allowClear
              />
              
              {isAdmin && (
                <Select
                  placeholder="选择游戏"
                  value={filters.gameId ? filters.gameId : undefined}
                  onChange={(value) => setFilters({ ...filters, gameId: value || '' })}
                  style={{ width: 150 }}
                  allowClear
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
              
              <Select
                placeholder="状态"
                value={filters.status || undefined}
                onChange={(value) =>
                  setFilters({ ...filters, status: value || '' })
                }
                style={{ width: 140 }}
                allowClear
              >
                {STATUS_OPTIONS.map(({ value, text }) => (
                  <Option key={value} value={value}>
                    {text}
                  </Option>
                ))}
              </Select>
              
              <Select
                placeholder="问题类型"
                value={filters.issueTypeId || undefined}
                onChange={(value) =>
                  setFilters({ ...filters, issueTypeId: value || '' })
                }
                style={{ width: 140 }}
                allowClear
              >
                {issueTypes.map((issueType) => (
                  <Option key={issueType.id} value={issueType.id}>
                    {issueType.name}
                  </Option>
                ))}
              </Select>
              
              <RangePicker
                value={filters.dateRange || null}
                onChange={handleDateRangeChange}
                allowClear
                style={{ width: 280 }}
                placeholder={['开始日期', '结束日期']}
                format="YYYY-MM-DD"
                // 允许选择任意日期范围，不限制天数
                disabledDate={(current) => {
                  // 不限制未来日期，只限制不能选择今天之后的日期（可选）
                  // return current && current > dayjs().endOf('day');
                  return false; // 允许选择所有日期
                }}
              />
              
              <Button
                icon={<ReloadOutlined />}
                onClick={loadTickets}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </div>
        </div>

        {/* 工单表格 */}
        <Table
          columns={columns}
          dataSource={tickets}
          rowKey="id"
          loading={loading}
          pagination={paginationConfig}
          scroll={{ x: 1200 }}
          className="tickets-table"
          onChange={(_pagination, _filters, sorter: any) => {
            // 处理排序变化
            // sorter 可能是单个对象或数组（多列排序时）
            const currentSorter = Array.isArray(sorter) ? sorter[0] : sorter;
            
            // 调试日志（开发环境）
            if (import.meta.env.DEV && currentSorter) {
              console.log('排序变化:', {
                sorter: currentSorter,
                field: currentSorter.field,
                order: currentSorter.order,
                currentSortField: sortField,
                currentSortOrder: sortOrder,
              });
            }
            
            if (currentSorter && currentSorter.field) {
              const newSortField = currentSorter.field as string;
              // Ant Design Table 的 order 值：'ascend' | 'descend' | null | undefined
              // 'ascend' = 升序（最早的在前面），'descend' = 降序（最新的在前面）
              let newSortOrder: 'asc' | 'desc' = 'desc';
              if (currentSorter.order === 'ascend') {
                newSortOrder = 'asc'; // 升序：从最早到最晚
              } else if (currentSorter.order === 'descend') {
                newSortOrder = 'desc'; // 降序：从最晚到最早
              } else {
                // 如果没有明确的 order（取消排序），恢复默认降序
                newSortOrder = 'desc';
              }
              
              // 只有当排序字段或顺序发生变化时才更新
              if (newSortField !== sortField || newSortOrder !== sortOrder) {
                setSortField(newSortField);
                setSortOrder(newSortOrder);
                setCurrentPage(1); // 重置到第一页，确保从排序后的第一页开始显示
              }
            } else {
              // 取消排序或没有排序，恢复默认（按创建时间降序：最新的在前）
              if (sortField !== 'createdAt' || sortOrder !== 'desc') {
                setSortField('createdAt');
                setSortOrder('desc');
                setCurrentPage(1);
              }
            }
          }}
        />
      </Card>

      {/* 工单详情弹窗 */}
      <Modal
        title="工单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedTicket && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="工单号" span={2}>
              <Typography.Text copyable>{selectedTicket.ticketNo}</Typography.Text>
            </Descriptions.Item>

            <Descriptions.Item label="游戏">
              {selectedTicket.game?.name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="区服">
              {selectedTicket.server?.name || selectedTicket.serverName || '-'}
            </Descriptions.Item>

            <Descriptions.Item label="玩家ID/昵称">
              {selectedTicket.playerIdOrName}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {(() => {
                const info = getStatusDisplay(selectedTicket.status);
                return <Tag color={info.color}>{info.text}</Tag>;
              })()}
            </Descriptions.Item>

            <Descriptions.Item label="问题类型">
              {selectedTicket.issueTypes && selectedTicket.issueTypes.length > 0 ? (
                <Space size={[4, 4]} wrap>
                  {selectedTicket.issueTypes.map((issueType: any) => (
                    <Tag key={issueType.id} color="blue">
                      {issueType.name}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <span>-</span>
              )}
            </Descriptions.Item>
            {selectedTicket.sessions && selectedTicket.sessions.length > 0 && (
              <>
                <Descriptions.Item label="处理客服">
                  {(() => {
                    const latestSession = selectedTicket.sessions[0];
                    if (latestSession?.agent) {
                      return (
                        <span>
                          {latestSession.agent.realName || latestSession.agent.username}
                          {latestSession.status === 'IN_PROGRESS' && (
                            <Tag color="green" style={{ marginLeft: 8 }}>处理中</Tag>
                          )}
                        </span>
                      );
                    }
                    return <span>-</span>;
                  })()}
                </Descriptions.Item>
                <Descriptions.Item label="会话状态">
                  {(() => {
                    const latestSession = selectedTicket.sessions[0];
                    const statusMap: Record<string, { text: string; color: string }> = {
                      PENDING: { text: '进行中', color: 'processing' },
                      QUEUED: { text: '排队中', color: 'processing' },
                      IN_PROGRESS: { text: '人工处理中', color: 'warning' },
                      CLOSED: { text: '已关闭', color: 'success' },
                    };
                    const statusInfo = statusMap[latestSession?.status] || { text: '未知', color: 'default' };
                    return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
                  })()}
                </Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="创建时间">
              {dayjs(selectedTicket.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>

            <Descriptions.Item label="更新时间">
              {dayjs(selectedTicket.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="问题发生时间">
              {selectedTicket.occurredAt
                ? dayjs(selectedTicket.occurredAt).format('YYYY-MM-DD HH:mm:ss')
                : '-'}
            </Descriptions.Item>

            <Descriptions.Item label="充值订单号">
              {selectedTicket.paymentOrderNo || '-'}
            </Descriptions.Item>

            <Descriptions.Item label="问题描述" span={2}>
              <div className="ticket-description">{selectedTicket.description}</div>
            </Descriptions.Item>

            {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
              <Descriptions.Item label="附件" span={2}>
                <Image.PreviewGroup>
                  <div className="ticket-attachments">
                    {selectedTicket.attachments.map((attachment) => {
                      const resolvedUrl = resolveAttachmentUrl(attachment.fileUrl);
                      const isImage =
                        attachment.fileType?.startsWith('image/') ||
                        /\.(png|jpe?g|gif|webp)$/i.test(attachment.fileName || '');

                      return (
                        <div className="ticket-attachment-item" key={attachment.id}>
                          {isImage ? (
                            <Image
                              width={96}
                              height={96}
                              src={resolvedUrl}
                              alt={attachment.fileName}
                              style={{ objectFit: 'cover', borderRadius: 8 }}
                            />
                          ) : (
                            <a href={resolvedUrl} target="_blank" rel="noreferrer">
                              {attachment.fileName}
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Image.PreviewGroup>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* 手动分配客服弹窗（支持多次分配） */}
      <Modal
        title="分配客服"
        open={assignModalVisible}
        onOk={handleManualAssign}
        onCancel={() => {
          setAssignModalVisible(false);
          setAssigningSessionId(null);
          setSelectedAgentId('');
        }}
        okText="确认分配"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>选择客服：</label>
          <Select
            style={{ width: '100%' }}
            value={selectedAgentId}
            onChange={setSelectedAgentId}
            placeholder="请选择客服"
            showSearch
            optionFilterProp="label"
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
          >
            {agents.map((agent) => (
              <Option 
                key={agent.id} 
                value={agent.id}
                label={agent.realName || agent.username}
              >
                {agent.realName || agent.username}
                {agent.isOnline && <Tag color="green" style={{ marginLeft: 8 }}>在线</Tag>}
                {!agent.isOnline && <Tag color="default" style={{ marginLeft: 8 }}>离线</Tag>}
              </Option> //Option这个标签是干什么的 
            ))}
          </Select>
        </div>
        <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <div style={{ fontSize: 12, color: '#666' }}>
            提示：可以多次分配，每次分配完成后会话记录中的客服信息会立即更新。
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default TicketsPage;
