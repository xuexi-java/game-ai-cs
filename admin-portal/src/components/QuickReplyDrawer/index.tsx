import { useState, useEffect } from 'react';
import {
  Drawer,
  List,
  Input,
  Tabs,
  Button,
  Space,
  Empty,
  Spin,
  message,
  Tag,
} from 'antd';
import {
  HeartOutlined,
  HeartFilled,
} from '@ant-design/icons';
import { quickReplyService } from '../../services/quickReply.service';
import { useAuthStore } from '../../stores/authStore';
import './index.css';

const { Search } = Input;

interface QuickReplyDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (content: string) => void;
}

interface Reply {
  id: string;
  content: string;
  category: {
    id: string;
    name: string;
  };
  usageCount: number;
  favoriteCount: number;
  isFavorited: boolean;
  isGlobal: boolean;
}

interface Category {
  id: string;
  name: string;
  _count?: {
    replies: number;
  };
}

export default function QuickReplyDrawer({
  open,
  onClose,
  onSelect,
}: QuickReplyDrawerProps) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'recent'>('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 加载分类列表
  useEffect(() => {
    if (open) {
      loadCategories();
    }
  }, [open]);

  // 加载快捷回复
  useEffect(() => {
    if (open) {
      if (selectedCategoryId || activeTab === 'favorites') {
        loadReplies();
      } else if (categories.length > 0 && !selectedCategoryId) {
        // 如果分类已加载但还没有选中分类，自动选中第一个
        setSelectedCategoryId(categories[0].id);
      }
    }
  }, [open, selectedCategoryId, activeTab, categories]);

  const loadCategories = async () => {
    try {
      const data = await quickReplyService.getCategories();
      console.log('加载的分类数据:', data);
      setCategories(data);
      if (data.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(data[0].id);
      }
    } catch (error) {
      console.error('加载分类失败:', error);
      message.error('加载分类失败');
    }
  };

  const loadReplies = async () => {
    setLoading(true);
    try {
      let data;
      if (activeTab === 'favorites') {
        const result = await quickReplyService.getUserFavorites(1, 100);
        data = result.data || [];
      } else if (activeTab === 'recent') {
        const result = await quickReplyService.getReplies({
          categoryId: selectedCategoryId || undefined,
          sortBy: 'lastUsedAt',
          pageSize: 100,
        });
        data = result.data || [];
      } else {
        const result = await quickReplyService.getReplies({
          categoryId: selectedCategoryId || undefined,
          sortBy: 'usageCount',
          pageSize: 100,
        });
        data = result.data || [];
      }

      console.log('加载的快捷回复数据:', data);

      // 过滤搜索关键词
      if (searchKeyword.trim()) {
        data = data.filter((reply: Reply) =>
          reply.content.toLowerCase().includes(searchKeyword.toLowerCase())
        );
      }

      setReplies(data);
    } catch (error) {
      console.error('加载快捷回复失败:', error);
      message.error('加载快捷回复失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (reply: Reply) => {
    try {
      // 增加使用次数
      await quickReplyService.incrementUsage(reply.id);
      onSelect(reply.content);
      message.success('已插入回复');
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleToggleFavorite = async (replyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await quickReplyService.toggleFavorite(replyId);
      // 更新本地状态
      setReplies((prev) =>
        prev.map((reply) =>
          reply.id === replyId
            ? {
                ...reply,
                isFavorited: !reply.isFavorited,
                favoriteCount: reply.isFavorited
                  ? reply.favoriteCount - 1
                  : reply.favoriteCount + 1,
              }
            : reply
        )
      );
    } catch (error) {
      message.error('收藏失败');
    }
  };

  const handleSearch = (value: string) => {
    setSearchKeyword(value);
    // 延迟搜索，避免频繁请求
    setTimeout(() => {
      loadReplies();
    }, 300);
  };

  return (
    <Drawer
      title="快捷回复"
      placement="right"
      width={500}
      open={open}
      onClose={onClose}
      className="quick-reply-drawer"
    >
      <div className="quick-reply-drawer-content">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key as 'all' | 'favorites' | 'recent');
          }}
          items={[
            { key: 'all', label: '全部' },
            { key: 'favorites', label: '收藏' },
            { key: 'recent', label: '最近使用' },
          ]}
        />

        <Search
          placeholder="搜索快捷回复..."
          allowClear
          onSearch={handleSearch}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        <div className="category-list">
          <div className="category-header">分类</div>
          <List
            size="small"
            dataSource={categories}
            renderItem={(category) => (
              <List.Item
                className={selectedCategoryId === category.id ? 'active' : ''}
                onClick={() => setSelectedCategoryId(category.id)}
                style={{ cursor: 'pointer', padding: '8px 16px' }}
              >
                <Space>
                  <span>{category.name}</span>
                  {category._count && (
                    <Tag size="small">{category._count.replies}</Tag>
                  )}
                </Space>
              </List.Item>
            )}
          />
        </div>

        <div className="reply-list">
          <Spin spinning={loading}>
            {replies.length === 0 ? (
              <Empty description="暂无快捷回复" />
            ) : (
              <List
                dataSource={replies}
                renderItem={(reply) => (
                  <List.Item
                    className="reply-item"
                    onClick={() => handleSelect(reply)}
                    actions={[
                      <Button
                        type="text"
                        size="small"
                        icon={
                          reply.isFavorited ? (
                            <HeartFilled style={{ color: '#ff4d4f' }} />
                          ) : (
                            <HeartOutlined />
                          )
                        }
                        onClick={(e) => handleToggleFavorite(reply.id, e)}
                      />,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <span>{reply.category.name}</span>
                          {reply.isGlobal && <Tag size="small">全局</Tag>}
                        </Space>
                      }
                      description={
                        <div className="reply-content">{reply.content}</div>
                      }
                    />
                    <div className="reply-stats">
                      <Tag size="small">使用 {reply.usageCount}</Tag>
                      <Tag size="small">收藏 {reply.favoriteCount}</Tag>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Spin>
        </div>
      </div>
    </Drawer>
  );
}

