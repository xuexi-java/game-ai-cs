import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { setGlobalMessage } from './utils/message';

// 配置 dayjs 语言
dayjs.locale('zh-cn');

// 页面组件
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import TicketsPage from './pages/Tickets';
import SessionsPage from './pages/Sessions';
import ActivePage from './pages/Workbench/ActivePage';
import GamesPage from './pages/Games';
import UrgencyRulesPage from './pages/Settings/UrgencyRules';
import UsersPage from './pages/Settings/Users';
import ProfilePage from './pages/Profile';

// 布局组件
import MainLayout from './components/Layout/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';

// 状态管理
import { useAuthStore } from './stores/authStore';

import './App.css';

const RoleBasedHomeRedirect = () => {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  const targetPath =
    user?.role === 'ADMIN' ? '/dashboard' : '/workbench/active';
  return <Navigate to={targetPath} replace />;
};

const AntdMessageBridge = ({ children }: { children: ReactNode }) => {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    setGlobalMessage(message);
  }, [message]);
  return <>{children}</>;
};

function App() {
  const { initAuth } = useAuthStore();

  useEffect(() => {
    // 初始化认证状态
    initAuth();
  }, [initAuth]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 8,
          colorBgContainer: '#ffffff',
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 40,
          },
          Input: {
            borderRadius: 8,
            controlHeight: 40,
          },
          Select: {
            borderRadius: 8,
            controlHeight: 40,
          },
          Card: {
            borderRadius: 12,
          },
          Layout: {
            headerBg: '#ffffff',
            siderBg: '#001529',
          },
        },
      }}
    >
      <AntdApp>
        <AntdMessageBridge>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Routes>
              {/* 登录页面 */}
              <Route path="/login" element={<LoginPage />} />

              {/* 受保护的路由 */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                {/* 默认重定向到角色对应的首页 */}
                <Route index element={<RoleBasedHomeRedirect />} />

                {/* 仪表盘 */}
                <Route
                  path="dashboard"
                  element={
                    <ProtectedRoute requiredRole="ADMIN">
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* 工单管理 */}
                <Route path="tickets" element={<TicketsPage />} />

                {/* 会话管理 */}
                <Route path="sessions" element={<SessionsPage />} />

                {/* 客服工作台 */}
                <Route path="workbench/active" element={<ActivePage />} />

                {/* 游戏管理 - 仅管理员 */}
                <Route
                  path="games"
                  element={
                    <ProtectedRoute requiredRole="ADMIN">
                      <GamesPage />
                    </ProtectedRoute>
                  }
                />

                {/* 系统设置 - 仅管理员 */}
                <Route path="settings">
                  <Route
                    path="urgency-rules"
                    element={
                      <ProtectedRoute requiredRole="ADMIN">
                        <UrgencyRulesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <ProtectedRoute requiredRole="ADMIN">
                        <UsersPage />
                      </ProtectedRoute>
                    }
                  />
                </Route>

                {/* 个人资料 */}
                <Route
                  path="profile"
                  element={<ProfilePage />}
                />
              </Route>

              {/* 404 页面 */}
              <Route path="*" element={<RoleBasedHomeRedirect />} />
            </Routes>
          </BrowserRouter>
        </AntdMessageBridge>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
