import { useState } from 'react';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Button,
} from 'antd';
import {
  DashboardOutlined,
  CustomerServiceOutlined,
  FileTextOutlined,
  MessageOutlined,
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { websocketService } from '../../services/websocket.service';
import { resolveAvatarUrl } from '../../utils/avatar';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const rawMenuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘',
      visible: isAdmin,
    },
    {
      key: '/workbench/active',
      icon: <CustomerServiceOutlined />,
      label: '客服工作台',
    },
    {
      key: '/tickets',
      icon: <FileTextOutlined />,
      label: '工单管理',
    },
    {
      key: '/sessions',
      icon: <MessageOutlined />,
      label: '会话管理',
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
          label: '问题类型规则',
        },
        {
          key: '/settings/users',
          label: '用户管理',
        },
      ],
    },
  ];

  const menuItems = rawMenuItems
    .filter((item) => item.visible !== false)
    .map(({ visible, ...item }) => item);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleProfileClick = () => {
    navigate('/profile');
  };

  const handleLogout = () => {
    websocketService.disconnect();
    logout();
    navigate('/login');
  };

  const getSelectedKeys = () => {
    const path = location.pathname;
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
        width={200}
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
            <Button
              className="trigger"
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
          </div>

          <div className="header-right">
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'profile',
                    icon: <UserOutlined />,
                    label: '个人资料',
                    onClick: handleProfileClick,
                  },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: '退出登录',
                    onClick: handleLogout,
                  },
                ],
              }}
              placement="bottomRight"
              arrow
            >
              <div className="header-user-info">
                <Avatar 
                  size={32} 
                  icon={<UserOutlined />} 
                  src={resolveAvatarUrl(user?.avatar)} 
                />
                <div className="header-user-details">
                  <span className="header-username">{user?.username}</span>
                  <span className="header-user-role">
                    {user?.role === 'ADMIN' ? '管理员' : '客服'}
                  </span>
                </div>
              </div>
            </Dropdown>
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
