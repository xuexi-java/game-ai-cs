import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Popconfirm,
  Typography,
  Tabs,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getGames,
  createGame,
  updateGame,
  deleteGame,
  getGameServers,
  createServer,
  updateServer,
  deleteServer,
} from '../../services/game.service';
import type { Game, Server } from '../../types';
import './index.css';

const { Title } = Typography;
const { TabPane } = Tabs;

const GamesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<Game[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [gameModalVisible, setGameModalVisible] = useState(false);
  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [gameForm] = Form.useForm();
  const [serverForm] = Form.useForm();

  // 加载游戏列表
  const loadGames = async () => {
    setLoading(true);
    try {
      const gamesData = await getGames();
      // 确保 gamesData 是数组
      const gamesArray = Array.isArray(gamesData) ? gamesData : [];
      setGames(gamesArray);
      
      // 如果有选中的游戏，加载其服务器列表
      if (selectedGameId) {
        loadServers(selectedGameId);
      } else if (gamesArray.length > 0) {
        setSelectedGameId(gamesArray[0].id);
        loadServers(gamesArray[0].id);
      }
    } catch (error) {
      console.error('加载游戏列表失败:', error);
      setGames([]); // 出错时设置为空数组
    } finally {
      setLoading(false);
    }
  };

  // 加载服务器列表
  const loadServers = async (gameId: string) => {
    try {
      const serversData = await getGameServers(gameId);
      // 确保 serversData 是数组
      setServers(Array.isArray(serversData) ? serversData : []);
    } catch (error) {
      console.error('加载服务器列表失败:', error);
      setServers([]); // 出错时设置为空数组
    }
  };

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    if (selectedGameId) {
      loadServers(selectedGameId);
    }
  }, [selectedGameId]);

  // 游戏相关操作
  const handleCreateGame = () => {
    setEditingGame(null);
    gameForm.resetFields();
    setGameModalVisible(true);
  };

  const handleEditGame = (game: Game) => {
    setEditingGame(game);
    gameForm.setFieldsValue(game);
    setGameModalVisible(true);
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
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    try {
      await deleteGame(gameId);
      message.success('游戏删除成功');
      loadGames();
    } catch (error) {
      console.error('删除游戏失败:', error);
    }
  };

  // 服务器相关操作
  const handleCreateServer = () => {
    setEditingServer(null);
    serverForm.resetFields();
    setServerModalVisible(true);
  };

  const handleEditServer = (server: Server) => {
    setEditingServer(server);
    serverForm.setFieldsValue(server);
    setServerModalVisible(true);
  };

  const handleServerSubmit = async (values: any) => {
    try {
      if (editingServer) {
        await updateServer(editingServer.id, values);
        message.success('服务器更新成功');
      } else {
        await createServer(selectedGameId, values);
        message.success('服务器创建成功');
      }
      
      setServerModalVisible(false);
      loadServers(selectedGameId);
    } catch (error) {
      console.error('保存服务器失败:', error);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    try {
      await deleteServer(serverId);
      message.success('服务器删除成功');
      loadServers(selectedGameId);
    } catch (error) {
      console.error('删除服务器失败:', error);
    }
  };

  // 游戏表格列定义
  const gameColumns: ColumnsType<Game> = [
    {
      title: '游戏名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '图标',
      dataIndex: 'icon',
      key: 'icon',
      render: (icon) => icon ? (
        <img src={icon} alt="游戏图标" style={{ width: 32, height: 32 }} />
      ) : '-',
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled) => (
        <Switch checked={enabled} disabled />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
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
            title="确定删除这个游戏吗？"
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

  // 服务器表格列定义
  const serverColumns: ColumnsType<Server> = [
    {
      title: '服务器名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (text) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled) => (
        <Switch checked={enabled} disabled />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditServer(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除这个服务器吗？"
            onConfirm={() => handleDeleteServer(record.id)}
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
    <div className="games-container">
      <Card>
        <Title level={3}>
          <AppstoreOutlined /> 游戏管理
        </Title>

        <Tabs
          activeKey={selectedGameId || 'games'}
          onChange={(key) => {
            if (key === 'games') {
              setSelectedGameId('');
            } else {
              setSelectedGameId(key);
            }
          }}
          tabBarExtraContent={
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreateGame}
              >
                添加游戏
              </Button>
              {selectedGameId && (
                <Button
                  icon={<PlusOutlined />}
                  onClick={handleCreateServer}
                >
                  添加服务器
                </Button>
              )}
            </Space>
          }
        >
          <TabPane tab="游戏列表" key="games">
            <Table
              columns={gameColumns}
              dataSource={games}
              rowKey="id"
              loading={loading}
              onRow={(record) => ({
                onClick: () => setSelectedGameId(record.id),
                className: 'clickable-row',
              })}
            />
          </TabPane>
          
          {Array.isArray(games) && games.map((game) => (
            <TabPane
              tab={
                <span>
                  <DatabaseOutlined />
                  {game.name}
                </span>
              }
              key={game.id}
            >
              <Table
                columns={serverColumns}
                dataSource={servers}
                rowKey="id"
                loading={loading}
              />
            </TabPane>
          ))}
        </Tabs>
      </Card>

      {/* 游戏编辑弹窗 */}
      <Modal
        title={editingGame ? '编辑游戏' : '添加游戏'}
        open={gameModalVisible}
        onCancel={() => setGameModalVisible(false)}
        footer={null}
      >
        <Form
          form={gameForm}
          layout="vertical"
          onFinish={handleGameSubmit}
        >
          <Form.Item
            name="name"
            label="游戏名称"
            rules={[{ required: true, message: '请输入游戏名称' }]}
          >
            <Input placeholder="请输入游戏名称" />
          </Form.Item>

          <Form.Item name="icon" label="游戏图标">
            <Input placeholder="请输入图标URL" />
          </Form.Item>

          <Form.Item name="enabled" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="difyApiKey" label="Dify API Key">
            <Input.Password placeholder="请输入Dify API Key" />
          </Form.Item>

          <Form.Item name="difyBaseUrl" label="Dify Base URL">
            <Input placeholder="请输入Dify Base URL" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button onClick={() => setGameModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 服务器编辑弹窗 */}
      <Modal
        title={editingServer ? '编辑服务器' : '添加服务器'}
        open={serverModalVisible}
        onCancel={() => setServerModalVisible(false)}
        footer={null}
      >
        <Form
          form={serverForm}
          layout="vertical"
          onFinish={handleServerSubmit}
        >
          <Form.Item
            name="name"
            label="服务器名称"
            rules={[{ required: true, message: '请输入服务器名称' }]}
          >
            <Input placeholder="请输入服务器名称" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="请输入服务器描述" rows={3} />
          </Form.Item>

          <Form.Item name="enabled" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button onClick={() => setServerModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GamesPage;
