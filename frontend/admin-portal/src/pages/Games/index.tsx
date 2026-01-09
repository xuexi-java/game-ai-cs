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
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, CopyOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { getGames, createGame, updateGame, deleteGame } from '../../services/game.service';
import type { Game } from '../../types';
import { useMessage } from '../../hooks/useMessage';
import './index.css';

const { Text } = Typography;

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
    });
    setGameModalVisible(true);
  };

  const handleEditGame = (game: Game) => {
    setEditingGame(game);
    gameForm.setFieldsValue({
      name: game.name,
      icon: game.icon,
      enabled: game.enabled,
      difyApiKey: game.difyApiKey,
      difyBaseUrl: game.difyBaseUrl,
      // 玩家API配置（密钥不回显，需重新输入）
      playerApiNonce: game.playerApiNonce,
      playerApiEnabled: game.playerApiEnabled ?? true,
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
      if (editingGame) {
        await updateGame(editingGame.id, values);
        message.success('游戏更新成功');
      } else {
        await createGame(values);
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
          {record.icon && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              图标：{record.icon}
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
          <Text>{maskApiKey(value)}</Text>
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
        destroyOnHidden
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

          <Form.Item name="icon" label="图标地址">
            <Input placeholder="请输入图标 URL（可选）" />
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
            label="Dify API Key"
            rules={[{ required: true, message: '请输入 Dify API Key' }]}
          >
            <Input.Password placeholder="请输入该游戏对应的 Dify API Key" />
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
            label="签名密钥 (Secret)"
            extra={editingGame ? "留空表示不修改，填写则更新密钥" : "8-64位字符串，用于生成签名"}
            rules={[
              { min: 8, message: '密钥长度不能少于8位' },
              { max: 64, message: '密钥长度不能超过64位' },
            ]}
          >
            <Input.Password placeholder="请输入签名密钥" />
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

