import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

// 配置 dayjs 语言
dayjs.locale('zh-cn');

// 页面组件
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import TicketsPage from './pages/Tickets';
import QueuePage from './pages/Workbench/QueuePage';
import ActivePage from './pages/Workbench/ActivePage';
import GamesPage from './pages/Games';

// 布局组件
import MainLayout from './components/Layout/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';

// 状态管理
import { useAuthStore } from './stores/authStore';

import './App.css';

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
        <BrowserRouter>
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
              {/* 默认重定向到仪表盘 */}
              <Route index element={<Navigate to="/dashboard" replace />} />
              
              {/* 仪表盘 */}
              <Route path="dashboard" element={<DashboardPage />} />
              
              {/* 工单管理 */}
              <Route path="tickets" element={<TicketsPage />} />
              
              {/* 客服工作台 */}
              <Route path="workbench">
                <Route path="queue" element={<QueuePage />} />
                <Route path="active" element={<ActivePage />} />
              </Route>
              
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
                      <div>紧急规则管理页面开发中...</div>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute requiredRole="ADMIN">
                      <div>用户管理页面开发中...</div>
                    </ProtectedRoute>
                  }
                />
              </Route>
            </Route>
            
            {/* 404 页面 */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
