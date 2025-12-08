import { useState, useEffect } from 'react';
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
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useSessionStore } from '../../stores/sessionStore';
import { resolveAvatarUrl } from '../../utils/avatar';
import { Badge } from 'antd';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { getTotalUnread } = useSessionStore();
  const isAdmin = user?.role === 'ADMIN';
  const totalUnread = getTotalUnread();
  
  // 检测是否为移动端（使用 useEffect 监听窗口大小变化）
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

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
      label: (
        <span>
          客服工作台
          {totalUnread > 0 && (
            <Badge 
              count={totalUnread} 
              size="small" 
              style={{ marginLeft: 10 }}
              overflowCount={99}
            />
          )}
        </span>
      ),
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
      key: '/quick-replies',
      icon: <ThunderboltOutlined />,
      label: '快捷回复',
      visible: !isAdmin, // 管理员不显示，使用系统设置下的快捷回复管理
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
        {
          key: '/settings/quick-replies',
          label: '快捷回复管理',
        },
      ],
    },
  ];

  const menuItems = rawMenuItems
    .filter((item) => item.visible !== false)
    .map(({ visible, ...item }) => item);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    // 移动端点击菜单后自动关闭侧边栏
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };
  
  const handleToggleMenu = () => {
    if (isMobile) {
      setMobileMenuOpen(!mobileMenuOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };
  
  // 点击遮罩层关闭移动端菜单
  const handleOverlayClick = () => {
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };

  const handleProfileClick = () => {
    navigate('/profile');
  };

  const handleLogout = async () => {
    // 延迟导入避免循环依赖
    const { websocketService } = await import('../../services/websocket.service');
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
    <Layout className="main-layout" style={{ minHeight: '100vh' }}>
      {/* 移动端遮罩层 */}
      {isMobile && mobileMenuOpen && (
        <div
          className="mobile-menu-overlay"
          onClick={handleOverlayClick}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999,
          }}
        />
      )}
      
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={200}
        className={`layout-sider ${isMobile && mobileMenuOpen ? 'mobile-open' : ''}`}
        style={{
          position: 'fixed',
          left: isMobile ? (mobileMenuOpen ? 0 : -200) : 0,
          top: 0,
          height: '100vh',
          overflow: 'auto',
          transition: 'left 0.3s ease',
          zIndex: 1000,
        }}
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

      <Layout
        className="site-layout"
        style={{ 
          marginLeft: isMobile ? 0 : (collapsed ? 80 : 200), 
          transition: 'margin-left 0.2s' 
        }}
      >
        <Header className="layout-header">
          <div className="header-left">
            <Button
              className="trigger"
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={handleToggleMenu}
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
