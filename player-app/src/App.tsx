import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

// 配置 dayjs 语言
dayjs.locale('zh-cn');

// 页面组件
import TestPage from './TestPage';
import IdentityCheckPage from './pages/IdentityCheck';
import EscapeHatchPage from './pages/EscapeHatch';
import IntakeFormPage from './pages/IntakeForm';
import ChatPage from './pages/Chat';
import QueuePage from './pages/Queue';
import TicketChatPage from './pages/TicketChat';

// 公共组件
import ErrorBoundary from './components/ErrorBoundary';

import './App.css';

function App() {
  return (
    <ConfigProvider 
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#372B7B',
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
        },
      }}
    >
      <AntdApp>
        <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/identity-check" replace />} />
              <Route path="/test" element={<TestPage />} />
              <Route path="/identity-check" element={<IdentityCheckPage />} />
              <Route path="/escape-hatch" element={<EscapeHatchPage />} />
              <Route path="/intake-form" element={<IntakeFormPage />} />
              <Route path="/chat/:sessionId" element={<ChatPage />} />
              <Route path="/queue/:sessionId" element={<QueuePage />} />
              <Route path="/ticket/:token" element={<TicketChatPage />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
