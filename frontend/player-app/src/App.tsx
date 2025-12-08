import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

// 配置 dayjs 语言
dayjs.locale('zh-cn');

// 修复 DatePicker 的 okText 显示问题（"确定是" -> "确定"）
// 这是 Ant Design 5.x 版本的一个已知问题，需要自定义 locale
const customZhCN = {
  ...zhCN,
  DatePicker: {
    ...zhCN.DatePicker,
    okText: '确定',
  },
};

// 页面组件
import IdentityCheckPage from './pages/IdentityCheck';
import EscapeHatchPage from './pages/EscapeHatch';
import IntakeFormPage from './pages/IntakeForm';
import ChatPage from './pages/Chat';
import QueuePage from './pages/Queue';
import TicketChatPage from './pages/TicketChat';
import TicketQueryPage from './pages/TicketQuery';
import TicketQueryByNoPage from './pages/TicketQueryByNo';
import SubmitTicketPage from './pages/SubmitTicket';

// 公共组件
import ErrorBoundary from './components/ErrorBoundary';

import './App.css';

function App() {
  return (
    <ConfigProvider 
      locale={customZhCN}
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
              <Route path="/" element={<Navigate to="/submit-ticket" replace />} />
              <Route path="/identity-check" element={<Navigate to="/submit-ticket" replace />} />
              <Route path="/escape-hatch" element={<EscapeHatchPage />} />
              <Route path="/intake-form" element={<Navigate to="/submit-ticket" replace />} />
              <Route path="/chat/:sessionId" element={<ChatPage />} />
              <Route path="/queue/:sessionId" element={<QueuePage />} />
              <Route path="/ticket/:token" element={<TicketChatPage />} />
              <Route path="/ticket-query" element={<TicketQueryByNoPage />} />
              <Route path="/ticket-query-by-info" element={<TicketQueryPage />} />
              <Route path="/submit-ticket" element={<SubmitTicketPage />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
