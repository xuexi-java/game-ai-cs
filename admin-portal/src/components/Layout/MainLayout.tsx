import { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Typography, Space } from 'antd';
import {
  DashboardOutlined,
  CustomerServiceOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  BellOutlined,
  WifiOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useSessionStore } from '../../stores/sessionStore';
import { websocketService } from '../../services/websocket.service';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { queuedSessions } = useSessionStore();

  // 菜单项配置
  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘',
    },
    {
      key: '/workbench',
      icon: <CustomerServiceOutlined />,
      label: '客服工作台',
      children: [
        {
          key: '/workbench/queue',
          label: '待接入队列',
        },
        {
          key: '/workbench/active',
          label: '活跃会话',
        },
      ],
    },
    {
      key: '/tickets',
      icon: <FileTextOutlined />,
      label: '工单管理',
    },
    {
      key: '/games',
      icon: <AppstoreOutlined />,
      label: '游戏管理',
      visible: user?.role === 'ADMIN',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
      visible: user?.role === 'ADMIN',
      children: [
        {
          key: '/settings/urgency-rules',
          label: '紧急规则',
        },
        {
          key: '/settings/users',
          label: '用户管理',
        },
      ],
    },
  ].filter(item => item.visible !== false);

  // 用户下拉菜单
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        websocketService.disconnect();
        logout();
        navigate('/login');
      },
    },
  ];

  // 处理菜单点击
  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  // 获取当前选中的菜单项
  const getSelectedKeys = () => {
    const path = location.pathname;
    // 找到匹配的菜单项
    for (const item of menuItems) {
      if (item.children) {
        for (const child of item.children) {
          if (path.startsWith(child.key)) {
            return [child.key];
          }
        }
      } else if (path.startsWith(item.key)) {
        return [item.key];
      }
    }
    return ['/dashboard'];
  };

  // 获取展开的菜单项
  const getOpenKeys = () => {
    const path = location.pathname;
    const openKeys: string[] = [];
    
    for (const item of menuItems) {
      if (item.children) {
        for (const child of item.children) {
          if (path.startsWith(child.key)) {
            openKeys.push(item.key);
            break;
          }
        }
      }
    }
    return openKeys;
  };

  return (
    <Layout className="main-layout">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={240}
        className="layout-sider"
      >
        <div className="logo">
          <AppstoreOutlined />
          {!collapsed && <span>AI客服管理</span>}
        </div>
        
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={getSelectedKeys()}
          defaultOpenKeys={getOpenKeys()}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      
      <Layout className="site-layout">
        <Header className="layout-header">
          <div className="header-left">
            <button
              className="trigger"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
          </div>
          
          <div className="header-right">
            <Space size="middle">
              {/* WebSocket连接状态 */}
              <div className="connection-status">
                <WifiOutlined 
                  style={{ 
                    color: websocketService.isConnected() ? '#52c41a' : '#ff4d4f' 
                  }} 
                />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {websocketService.isConnected() ? '已连接' : '未连接'}
                </Text>
              </div>
              
              {/* 通知铃铛 */}
              <Badge count={queuedSessions.length} size="small">
                <BellOutlined style={{ fontSize: '16px' }} />
              </Badge>
              
              {/* 用户信息 */}
              <Dropdown
                menu={{ items: userMenuItems }}
                placement="bottomRight"
                arrow
              >
                <div className="user-info">
                  <Avatar size="small" icon={<UserOutlined />} />
                  <span className="username">{user?.username}</span>
                </div>
              </Dropdown>
            </Space>
          </div>
        </Header>
        
        <Content className="layout-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
