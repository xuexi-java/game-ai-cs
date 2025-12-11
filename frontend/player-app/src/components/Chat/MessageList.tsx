/**
 * 消息列表组件 - V3.0  
 */
import type { Message } from '../../types';
import dayjs from 'dayjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RobotOutlined, UserOutlined, CustomerServiceOutlined, LoadingOutlined, TranslationOutlined, GlobalOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../config/api';
import { useState } from 'react';
import { useMessage } from '../../hooks/useMessage';
import { translateMessage } from '../../services/message.service';
import { translateTicketMessage } from '../../services/ticket.service';
import { Dropdown, type MenuProps } from 'antd';
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

interface MessageListProps {
  messages: Message[];
  aiTyping?: boolean;
  onRetryUpload?: (pendingUploadId: string) => void;
  onMessageUpdate?: (message: Message) => void;
  playerLanguage?: string;
  isTicketChat?: boolean;
  preferredTargetLang?: string;
}

// 语言选项
const LANGUAGES: MenuProps['items'] = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
  { key: 'ja', label: '日本語' },
  { key: 'ko', label: '한국어' },
  { key: 'es', label: 'Español' },
  { key: 'fr', label: 'Français' },
  { key: 'de', label: 'Deutsch' },
  { key: 'ru', label: 'Русский' },
];

const MessageList = ({ messages, aiTyping = false, onRetryUpload, onMessageUpdate, playerLanguage, isTicketChat = false, preferredTargetLang }: MessageListProps) => {
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Set<string>>(new Set());
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const messageApi = useMessage();

  if (messages.length === 0) {
    return (
      <div className="message-list-empty">
        暂无消息
      </div>
    );
  }

  const handleTranslate = async (messageId: string, targetLang: string) => {
    if (translatingMessageIds.has(messageId)) return;

    setTranslatingMessageIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });

    try {
      // 根据消息类型选择正确的翻译API
      const translated = isTicketChat
        ? await translateTicketMessage(messageId, targetLang)
        : await translateMessage(messageId, targetLang);

      // 查找对应的消息
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      // 将翻译结果转换为Message格式
      const translatedMessage: Message = {
        ...message,
        metadata: {
          ...message.metadata,
          translation: (translated as any).metadata?.translation,
        },
      };

      if (onMessageUpdate && translatedMessage) {
        onMessageUpdate(translatedMessage);
      }

      // 检查是否有翻译内容
      const hasTranslation = translatedMessage.metadata?.translation?.translatedContent;
      if (hasTranslation) {
        messageApi.success('翻译成功');
      } else {
        messageApi.warning('翻译完成，但未获取到翻译内容');
      }
    } catch (error: any) {
      console.error('Translation failed:', error);

      // 提供更详细的错误提示
      let errorMessage = '翻译失败，请稍后重试';
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      messageApi.error(errorMessage);
    } finally {
      setTranslatingMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

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
        const metadata = message.metadata || {};
        const translatedContent = metadata.translation?.translatedContent;
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
                    {/* 显示原文或译文 */}
                    {translatedContent && !showOriginal[message.id] ? (
                      <>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {translatedContent}
                        </ReactMarkdown>
                        <div
                          className="translation-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowOriginal((prev) => ({
                              ...prev,
                              [message.id]: true,
                            }));
                          }}
                          style={{
                            fontSize: '12px',
                            color: '#1890ff',
                            cursor: 'pointer',
                            marginTop: '4px'
                          }}
                        >
                          查看原文
                        </div>
                      </>
                    ) : (
                      <>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {parseContent(message.content)}
                        </ReactMarkdown>
                        {translatedContent && showOriginal[message.id] && (
                          <>
                            <div className="translation-indicator" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f0f0f0' }}>
                              <small style={{ color: '#8c8c8c', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                                [已翻译]
                              </small>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {translatedContent}
                              </ReactMarkdown>
                            </div>
                            <div
                              className="translation-toggle"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowOriginal((prev) => ({
                                  ...prev,
                                  [message.id]: false,
                                }));
                              }}
                              style={{
                                fontSize: '12px',
                                color: '#1890ff',
                                cursor: 'pointer',
                                marginTop: '4px'
                              }}
                            >
                              查看译文
                            </div>
                          </>
                        )}
                        {/* 翻译按钮：仅针对非玩家消息且没有翻译的 */}
                        {!isPlayer && !translatedContent && (
                          <Dropdown
                            menu={{
                              items: LANGUAGES,
                              onClick: ({ key }) => handleTranslate(message.id!, key),
                            }}
                            trigger={['click']}
                            placement="bottomLeft"
                          >
                            <div
                              style={{
                                marginTop: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                                color: '#666'
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {translatingMessageIds.has(message.id) ? (
                                <LoadingOutlined style={{ fontSize: '14px' }} />
                              ) : (
                                <>
                                  <GlobalOutlined style={{ fontSize: '14px' }} />
                                  <span style={{ fontSize: '12px' }}>翻译</span>
                                </>
                              )}
                            </div>
                          </Dropdown>
                        )}
                      </>
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
