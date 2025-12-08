/**
 * 消息列表组件 - V3.0
 */
import type { Message } from '../../types';
import dayjs from 'dayjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RobotOutlined, UserOutlined, CustomerServiceOutlined, LoadingOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../config/api';
import './MessageList.css';

// 解析媒体URL（图片等）
const resolveMediaUrl = (url?: string) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return `${apiOrigin}${normalized}`;
};

type UploadStatus = 'UPLOADING' | 'FAILED';

interface MessageListProps {
  messages: Message[];
  aiTyping?: boolean;
  onRetryUpload?: (pendingId: string) => void;
}

const MessageList = ({ messages, aiTyping = false, onRetryUpload }: MessageListProps) => {
  if (messages.length === 0) {
    return (
      <div className="message-list-empty">
        暂无消息
      </div>
    );
  }

  const parseContent = (content: string): string => {
    let parsed = content || '';
    // 处理 Dify 返回的 JSON 格式文本
    if (typeof parsed === 'string' && parsed.includes('</think>')) {
      const jsonMatch = parsed.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[0]);
          if (jsonData.text) {
            parsed = jsonData.text;
          }
        } catch (e) {
          parsed = parsed.replace(/<\/redacted_reasoning>[\s\S]*$/, '').trim();
        }
      } else {
        parsed = parsed.replace(/<\/redacted_reasoning>[\s\S]*$/, '').trim();
      }
    }
    // 如果整个内容是 JSON，尝试解析
    if (typeof parsed === 'string' && parsed.trim().startsWith('{') && parsed.trim().endsWith('}')) {
      try {
        const jsonData = JSON.parse(parsed);
        if (jsonData.text) {
          parsed = jsonData.text;
        }
      } catch (e) {
        // 不是有效的 JSON，继续使用原始文本
      }
    }
    return parsed;
  };

  return (
    <div className="message-list-v3">
      {messages.map((message) => {
        const isPlayer = message.senderType === 'PLAYER';
        const isAI = message.senderType === 'AI';
        const isAgent = message.senderType === 'AGENT';
        const isSystem = message.senderType === 'SYSTEM';
        const formattedTime = message.createdAt ? dayjs(message.createdAt).format('HH:mm') : '';
        const isTempMessage = message.id?.startsWith('temp-');
        const metadata = (message.metadata || {}) as {
          uploadStatus?: UploadStatus;
          pendingUploadId?: string;
          isLocalPreview?: boolean;
          translatedContent?: string;
        };
        const uploadStatus = metadata.uploadStatus;
        const isSending = uploadStatus === 'UPLOADING' || isTempMessage;
        const isFailed = uploadStatus === 'FAILED';
        const showRetry = isFailed && metadata.pendingUploadId && typeof onRetryUpload === 'function';

        if (isSystem) {
          return (
            <div key={message.id} className="message-item-v3 message-system-v3">
              <div className="system-message-v3">{message.content}</div>
            </div>
          );
        }

        return (
          <div
            key={message.id}
            className={`message-item-v3 ${isPlayer ? 'message-player-v3' : isAI ? 'message-ai-v3' : 'message-agent-v3'}`}
          >
            {/* 玩家端：只显示对方的头像（AI和客服），不显示自己的头像 */}
            {!isPlayer && (
              <div className={`message-avatar-v3 ${isAI ? 'avatar-ai-v3' : 'avatar-agent-v3'}`}>
                {isAI ? <RobotOutlined /> : <CustomerServiceOutlined />}
              </div>
            )}
            <div className="message-content-wrapper-v3">
              <div className="message-meta-row-v3">
                <span className="message-sender-name-v3">
                  {isPlayer ? '我' : isAI ? 'AI 助手' : '客服'}
                </span>
                {formattedTime && <span className="message-time-v3">{formattedTime}</span>}
              </div>
              <div
                className={`message-bubble-v3 ${isPlayer ? 'bubble-player-v3' : isAI ? 'bubble-ai-v3' : 'bubble-agent-v3'} ${isSending ? 'bubble-sending' : ''
                  } ${isFailed ? 'bubble-failed' : ''}`}
              >
                {message.messageType === 'IMAGE' ? (
                  <img
                    src={resolveMediaUrl(message.content)}
                    alt="图片消息"
                    className="message-image-v3"
                    onError={(e) => {
                      console.error('图片加载失败:', message.content);
                      // 如果图片加载失败，可以显示占位符
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="message-text-v3">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {metadata.translatedContent
                        ? metadata.translatedContent
                        : parseContent(message.content)}
                    </ReactMarkdown>
                    {metadata.translatedContent && (
                      <div className="translation-indicator">
                        <small style={{ color: '#8c8c8c', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                          [已翻译] 原文: {parseContent(message.content)}
                        </small>
                      </div>
                    )}
                  </div>
                )}
                {isSending && (
                  <div className="message-bubble-overlay">
                    <LoadingOutlined />
                  </div>
                )}
              </div>
              {(isSending || isFailed) && (
                <div className="message-status-row-v3">
                  {isSending && <span className="message-status-v3 sending">发送中...</span>}
                  {isFailed && (
                    <span className="message-status-v3 failed">
                      发送失败
                      {showRetry && (
                        <button
                          type="button"
                          className="message-retry-btn"
                          onClick={() => onRetryUpload?.(metadata.pendingUploadId!)}
                        >
                          重试
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* 玩家消息不显示头像 */}
          </div>
        );
      })}
      {/* AI正在回复时的动画提示 */}
      {aiTyping && (
        <div className="message-item-v3 message-ai-v3">
          <div className="message-avatar-v3 avatar-ai-v3 ai-typing">
            <RobotOutlined />
          </div>
          <div className="message-content-wrapper-v3">
            <div className="message-meta-row-v3">
              <span className="message-sender-name-v3">AI 助手</span>
              <span className="message-time-v3">{dayjs().format('HH:mm')}</span>
            </div>
            <div className="message-bubble-v3 bubble-ai-v3">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageList;
