import { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Button,
  Tag,
  Space,
  Input,
  Select,
  Modal,
  Descriptions,
  Typography,
  message,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import { getTickets, getTicketById, updateTicketStatus, updateTicketPriority } from '../../services/ticket.service';
import { getGames } from '../../services/game.service';
import type { Ticket, Game } from '../../types';
import './index.css';

const { Option } = Select;
const { Title } = Typography;

const TicketsPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // 筛选条件
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    gameId: '',
    search: '',
  });

  // 状态映射
  const statusMap = {
    OPEN: { color: 'processing', text: '进行中' },
    IN_PROGRESS: { color: 'warning', text: '处理中' },
    CLOSED: { color: 'success', text: '已关闭' },
  };

  const priorityMap = {
    LOW: { color: 'default', text: '低' },
    MEDIUM: { color: 'blue', text: '中' },
    HIGH: { color: 'orange', text: '高' },
    URGENT: { color: 'red', text: '紧急' },
  };

  // 加载数据
  const loadTickets = async () => {
    setLoading(true);
    try {
      const response = await getTickets({
        page: currentPage,
        pageSize,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        gameId: filters.gameId || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      
      setTickets(response.items);
      setTotal(response.total);
    } catch (error) {
      console.error('加载工单列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载游戏列表
  const loadGames = async () => {
    try {
      const gamesData = await getGames();
      // 确保 gamesData 是数组
      setGames(Array.isArray(gamesData) ? gamesData : []);
    } catch (error) {
      console.error('加载游戏列表失败:', error);
      setGames([]); // 出错时设置为空数组
    }
  };

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    loadTickets();
  }, [currentPage, pageSize, filters]);

  // 查看工单详情
  const handleViewDetail = async (ticketId: string) => {
    try {
      const ticket = await getTicketById(ticketId);
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
    {
      title: '游戏',
      dataIndex: ['game', 'name'],
      key: 'game',
      width: 100,
    },
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
      width: 100,
      render: (status, record) => (
          <Select
            value={status}
            size="small"
            style={{ width: '100%' }}
            onChange={(value) => handleUpdateStatus(record.id, value)}
          >
            {Object.entries(statusMap).map(([key, info]) => (
              <Option key={key} value={key}>
                <Tag color={info.color}>{info.text}</Tag>
              </Option>
            ))}
          </Select>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (priority, record) => (
        <Select
          value={priority}
          size="small"
          style={{ width: '100%' }}
          onChange={(value) => handleUpdatePriority(record.id, value)}
        >
          {Object.entries(priorityMap).map(([key, info]) => (
            <Option key={key} value={key}>
              <Tag color={info.color}>{info.text}</Tag>
            </Option>
          ))}
        </Select>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (text) => dayjs(text).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record.id)}
          >
            详情
          </Button>
        </Space>
      ),
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
              
              <Select
                placeholder="选择游戏"
                value={filters.gameId}
                onChange={(value) => setFilters({ ...filters, gameId: value })}
                style={{ width: 150 }}
                allowClear
              >
                {Array.isArray(games) && games.map(game => (
                  <Option key={game.id} value={game.id}>
                    {game.name}
                  </Option>
                ))}
              </Select>
              
              <Select
                placeholder="状态"
                value={filters.status}
                onChange={(value) => setFilters({ ...filters, status: value })}
                style={{ width: 120 }}
                allowClear
              >
                {Object.entries(statusMap).map(([key, info]) => (
                  <Option key={key} value={key}>
                    {info.text}
                  </Option>
                ))}
              </Select>
              
              <Select
                placeholder="优先级"
                value={filters.priority}
                onChange={(value) => setFilters({ ...filters, priority: value })}
                style={{ width: 120 }}
                allowClear
              >
                {Object.entries(priorityMap).map(([key, info]) => (
                  <Option key={key} value={key}>
                    {info.text}
                  </Option>
                ))}
              </Select>
              
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
              <Typography.Text copyable>
                {selectedTicket.ticketNo}
              </Typography.Text>
            </Descriptions.Item>
            
            <Descriptions.Item label="游戏">
              {selectedTicket.game.name}
            </Descriptions.Item>
            
            <Descriptions.Item label="区服">
              {selectedTicket.server?.name || '-'}
            </Descriptions.Item>
            
            <Descriptions.Item label="玩家ID/昵称">
              {selectedTicket.playerIdOrName}
            </Descriptions.Item>
            
            <Descriptions.Item label="状态">
              <Tag color={statusMap[selectedTicket.status as keyof typeof statusMap].color}>
                {statusMap[selectedTicket.status as keyof typeof statusMap].text}
              </Tag>
            </Descriptions.Item>
            
            <Descriptions.Item label="优先级">
              <Tag color={priorityMap[selectedTicket.priority as keyof typeof priorityMap].color}>
                {priorityMap[selectedTicket.priority as keyof typeof priorityMap].text}
              </Tag>
            </Descriptions.Item>
            
            <Descriptions.Item label="创建时间">
              {dayjs(selectedTicket.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            
            <Descriptions.Item label="更新时间">
              {dayjs(selectedTicket.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            
            <Descriptions.Item label="问题发生时间">
              {selectedTicket.occurredAt 
                ? dayjs(selectedTicket.occurredAt).format('YYYY-MM-DD HH:mm:ss')
                : '-'
              }
            </Descriptions.Item>
            
            <Descriptions.Item label="充值订单号">
              {selectedTicket.paymentOrderNo || '-'}
            </Descriptions.Item>
            
            <Descriptions.Item label="问题描述" span={2}>
            <div className="ticket-description">
              {selectedTicket.description}
            </div>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default TicketsPage;
