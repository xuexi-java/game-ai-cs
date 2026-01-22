import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Switch,
  Popconfirm,
  Tag,
  Typography,
  Divider,
  Tooltip,
  Checkbox,
  TimePicker,
} from 'antd';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, CopyOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { getGames, createGame, updateGame, deleteGame } from '../../services/game.service';
import type { Game } from '../../types';
import { useMessage } from '../../hooks/useMessage';
import './index.css';

const { Text } = Typography;

// 工作日选项
const WEEKDAYS = [
  { label: '周日', value: 0 },
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
];

// 默认工作时间配置
const DEFAULT_WORKING_HOURS = {
  workDays: [1, 2, 3, 4, 5],
  periods: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  displayText: '周一至周五 9:00-12:00, 14:00-18:00',
};

// 生成显示文本
const generateDisplayText = (workDays: number[], periods: { start: string; end: string }[]) => {
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const sortedDays = [...workDays].sort((a, b) => a - b);

  // 简化工作日显示
  let daysText = '';
  if (sortedDays.length === 7) {
    daysText = '每天';
  } else if (JSON.stringify(sortedDays) === JSON.stringify([1, 2, 3, 4, 5])) {
    daysText = '周一至周五';
  } else if (JSON.stringify(sortedDays) === JSON.stringify([0, 6])) {
    daysText = '周末';
  } else {
    daysText = sortedDays.map(d => dayNames[d]).join('、');
  }

  const periodsText = periods.map(p => `${p.start}-${p.end}`).join(', ');
  return `${daysText} ${periodsText}`;
};

const maskApiKey = (key?: string) => {
  if (!key) return '-';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
};

const GamesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<Game[]>([]);
  const [gameModalVisible, setGameModalVisible] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [gameForm] = Form.useForm();
  const message = useMessage();

  const loadGames = async () => {
    setLoading(true);
    try {
      const response = await getGames();
      setGames(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('加载游戏列表失败:', error);
      setGames([]);
      message.error('加载游戏列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGames();
  }, []);

  const handleCreateGame = () => {
    setEditingGame(null);
    gameForm.resetFields();
    gameForm.setFieldsValue({
      enabled: true,
      playerApiEnabled: true,
      // 默认工作时间配置
      workDays: DEFAULT_WORKING_HOURS.workDays,
      workPeriod1Start: dayjs(DEFAULT_WORKING_HOURS.periods[0].start, 'HH:mm'),
      workPeriod1End: dayjs(DEFAULT_WORKING_HOURS.periods[0].end, 'HH:mm'),
      workPeriod2Start: dayjs(DEFAULT_WORKING_HOURS.periods[1].start, 'HH:mm'),
      workPeriod2End: dayjs(DEFAULT_WORKING_HOURS.periods[1].end, 'HH:mm'),
    });
    setGameModalVisible(true);
  };

  const handleEditGame = (game: Game) => {
    setEditingGame(game);
    gameForm.resetFields();  // 先重置表单，清空所有字段

    // 解析工作时间配置
    const workingHours = game.workingHours as typeof DEFAULT_WORKING_HOURS | null;
    const periods = workingHours?.periods || DEFAULT_WORKING_HOURS.periods;

    gameForm.setFieldsValue({
      name: game.name,
      gameCode: game.gameCode,
      enabled: game.enabled,
      // difyApiKey: game.difyApiKey,  // 不回显密钥，避免重复加密
      difyBaseUrl: game.difyBaseUrl,
      // 玩家API配置（密钥不回显，需重新输入）
      playerApiNonce: game.playerApiNonce,
      playerApiEnabled: game.playerApiEnabled ?? true,
      // 工作时间配置
      workDays: workingHours?.workDays || DEFAULT_WORKING_HOURS.workDays,
      workPeriod1Start: periods[0] ? dayjs(periods[0].start, 'HH:mm') : undefined,
      workPeriod1End: periods[0] ? dayjs(periods[0].end, 'HH:mm') : undefined,
      workPeriod2Start: periods[1] ? dayjs(periods[1].start, 'HH:mm') : undefined,
      workPeriod2End: periods[1] ? dayjs(periods[1].end, 'HH:mm') : undefined,
    });
    setGameModalVisible(true);
  };

  const handleDeleteGame = async (gameId: string) => {
    try {
      await deleteGame(gameId);
      message.success('游戏删除成功');
      loadGames();
    } catch (error) {
      console.error('删除游戏失败:', error);
      message.error('删除游戏失败');
    }
  };

  const handleGameSubmit = async (values: any) => {
    try {
      // 组装工作时间配置
      const periods: { start: string; end: string }[] = [];
      if (values.workPeriod1Start && values.workPeriod1End) {
        periods.push({
          start: values.workPeriod1Start.format('HH:mm'),
          end: values.workPeriod1End.format('HH:mm'),
        });
      }
      if (values.workPeriod2Start && values.workPeriod2End) {
        periods.push({
          start: values.workPeriod2Start.format('HH:mm'),
          end: values.workPeriod2End.format('HH:mm'),
        });
      }

      const workingHours = {
        workDays: values.workDays || DEFAULT_WORKING_HOURS.workDays,
        periods: periods.length > 0 ? periods : DEFAULT_WORKING_HOURS.periods,
        displayText: generateDisplayText(
          values.workDays || DEFAULT_WORKING_HOURS.workDays,
          periods.length > 0 ? periods : DEFAULT_WORKING_HOURS.periods
        ),
      };

      // 移除临时字段，添加组装后的配置
      const { workDays, workPeriod1Start, workPeriod1End, workPeriod2Start, workPeriod2End, ...submitValues } = values;
      submitValues.workingHours = workingHours;

      if (editingGame) {
        await updateGame(editingGame.id, submitValues);
        message.success('游戏更新成功');
      } else {
        await createGame(submitValues);
        message.success('游戏创建成功');
      }
      setGameModalVisible(false);
      loadGames();
    } catch (error) {
      console.error('保存游戏失败:', error);
      message.error('保存游戏失败');
    }
  };

  const gameColumns: ColumnsType<Game> = [
    {
      title: '游戏名称',
      dataIndex: 'name',
      key: 'name',
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          {record.gameCode && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              代码：{record.gameCode}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '启用状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'}>{enabled ? '启用' : '停用'}</Tag>
      ),
    },
    {
      title: 'Dify Base URL',
      dataIndex: 'difyBaseUrl',
      key: 'difyBaseUrl',
      render: (value?: string) => value || '-',
    },
    {
      title: 'Dify API Key',
      dataIndex: 'difyApiKey',
      key: 'difyApiKey',
      render: (value?: string) => (
        <Space>
          <ApiOutlined />
          {value ? (
            <Tag color="green">已配置</Tag>
          ) : (
            <Tag color="red">未配置</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '玩家API',
      dataIndex: 'playerApiEnabled',
      key: 'playerApiEnabled',
      render: (enabled: boolean, record) => (
        <Space direction="vertical" size={0}>
          <Tag color={enabled ? 'green' : 'default'}>{enabled ? '已启用' : '未启用'}</Tag>
          {record.playerApiNonce && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Nonce: {record.playerApiNonce.slice(0, 6)}...
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditGame(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该游戏吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => handleDeleteGame(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="games-page">
      <Card
        title="游戏配置"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateGame}>
            新增游戏
          </Button>
        }
      >
        <Table<Game>
          columns={gameColumns}
          dataSource={games}
          rowKey="id"
          loading={loading}
        />
      </Card>

      <Modal
        title={editingGame ? '编辑游戏' : '新增游戏'}
        open={gameModalVisible}
        onCancel={() => setGameModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={gameForm}
          layout="vertical"
          onFinish={handleGameSubmit}
          initialValues={{ enabled: true }}
        >
          <Form.Item
            name="name"
            label="游戏名称"
            rules={[{ required: true, message: '请输入游戏名称' }]}
          >
            <Input placeholder="请输入游戏名称" />
          </Form.Item>

          <Form.Item
            name="gameCode"
            label="游戏代码"
            rules={[
              { required: true, message: '请输入游戏代码' },
              { 
                validator: (_, value) => {
                  if (!value && editingGame && !editingGame.gameCode) {
                    return Promise.reject(new Error('游戏代码不能为空'));
                  }
                  return Promise.resolve();
                }
              }
            ]}
            extra="游戏的唯一标识码，创建后不可修改"
          >
            <Input 
              placeholder="请输入游戏代码（如：10001）" 
              disabled={editingGame && !!editingGame.gameCode}
            />
          </Form.Item>

          <Form.Item name="enabled" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item
            name="difyBaseUrl"
            label="Dify Base URL"
            rules={[{ required: true, message: '请输入 Dify Base URL' }]}
          >
            <Input placeholder="例如：https://api.dify.ai/v1" />
          </Form.Item>

          <Form.Item
            name="difyApiKey"
            label={
              <Space>
                <span>Dify API Key</span>
                {editingGame && editingGame.difyApiKey && (
                  <Tag color="green" style={{ marginLeft: 8 }}>已配置</Tag>
                )}
              </Space>
            }
            rules={[
              {
                required: !editingGame,  // 仅创建时必填
                message: '请输入 Dify API Key'
              }
            ]}
            extra={editingGame ? "留空保持现有密钥不变，填写新值则更新" : undefined}
          >
            <Input.Password
              placeholder={
                editingGame
                  ? "输入新密钥以更新，或留空保持不变"
                  : "请输入该游戏对应的 Dify API Key"
              }
            />
          </Form.Item>

          <Divider orientation="left">
            玩家API配置
            <Tooltip title="用于游戏客户端调用客服API的签名验证">
              <QuestionCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
            </Tooltip>
          </Divider>

          <Form.Item name="playerApiEnabled" label="启用玩家API" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item
            name="playerApiSecret"
            label={
              <Space>
                <span>签名密钥 (Secret)</span>
                {editingGame && editingGame.playerApiSecret && (
                  <Tag color="green" style={{ marginLeft: 8 }}>已配置</Tag>
                )}
              </Space>
            }
            rules={[
              { min: 8, message: '密钥长度不能少于8位' },
              { max: 64, message: '密钥长度不能超过64位' },
            ]}
            extra={editingGame ? "留空保持现有密钥不变，填写新值则更新" : undefined}
          >
            <Input.Password placeholder={editingGame ? "输入新密钥以更新，或留空保持不变" : "请输入签名密钥（8-64位）"} />
          </Form.Item>

          <Form.Item
            name="playerApiNonce"
            label="固定Nonce"
            extra="8-32位字符串，与游戏客户端约定的固定值"
            rules={[
              { min: 8, message: 'Nonce长度不能少于8位' },
              { max: 32, message: 'Nonce长度不能超过32位' },
            ]}
          >
            <Input placeholder="例如: a1b2c3d4e5f6g7h8" />
          </Form.Item>

          <Divider orientation="left">
            客服工作时间
            <Tooltip title="设置客服在线服务时间，非工作时间将提示玩家">
              <QuestionCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
            </Tooltip>
          </Divider>

          <Form.Item
            name="workDays"
            label="工作日"
          >
            <Checkbox.Group options={WEEKDAYS} />
          </Form.Item>

          <Form.Item label="工作时段 1">
            <Space>
              <Form.Item name="workPeriod1Start" noStyle>
                <TimePicker format="HH:mm" placeholder="开始时间" />
              </Form.Item>
              <span>至</span>
              <Form.Item name="workPeriod1End" noStyle>
                <TimePicker format="HH:mm" placeholder="结束时间" />
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item label="工作时段 2" extra="可选，用于设置午休等分段工作时间">
            <Space>
              <Form.Item name="workPeriod2Start" noStyle>
                <TimePicker format="HH:mm" placeholder="开始时间" />
              </Form.Item>
              <span>至</span>
              <Form.Item name="workPeriod2End" noStyle>
                <TimePicker format="HH:mm" placeholder="结束时间" />
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button onClick={() => setGameModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GamesPage;

