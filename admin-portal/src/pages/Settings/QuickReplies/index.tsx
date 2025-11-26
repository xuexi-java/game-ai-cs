import { useEffect, useState } from 'react';
import {
  Layout,
  List,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Checkbox,
  Space,
  Pagination,
  Empty,
  Spin,
  message,
  Tag,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  HeartFilled,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { quickReplyService } from '../../../services/quickReply.service';
import { useQuickReplyStore } from '../../../stores/quickReplyStore';
import { useAuthStore } from '../../../stores/authStore';
import './index.css';

export default function QuickReplies() {
  const location = useLocation();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const isSystemSettings = location.pathname.startsWith('/settings/quick-replies');
  const {
    categories,
    replies,
    totalReplies,
    selectedCategoryId,
    loading,
    sortBy,
    currentPage,
    pageSize,
    fetchCategories,
    fetchReplies,
    deleteReply,
    setSelectedCategory,
    setSortBy,
    createCategory,
  } = useQuickReplyStore();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [editingReply, setEditingReply] = useState(null);
  const [form] = Form.useForm();
  const [categoryForm] = Form.useForm();

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategoryId) {
      fetchReplies(currentPage);
    }
  }, [selectedCategoryId, sortBy, currentPage]);

  const handleAddReply = () => {
    setEditingReply(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEditReply = (reply: any) => {
    setEditingReply(reply);
    form.setFieldsValue({
      content: reply.content,
      // 如果不是系统设置页面，不显示全局选项
      isGlobal: isSystemSettings ? reply.isGlobal : false,
    });
    setIsModalVisible(true);
  };

  const handleSave = async (values: any) => {
    try {
      // 如果不是系统设置页面，强制设置为非全局（即使是管理员）
      if (!isSystemSettings) {
        values.isGlobal = false;
      } else if (!isAdmin) {
        // 如果是系统设置页面但不是管理员，强制设置为非全局
        values.isGlobal = false;
      }
      
      if (editingReply) {
        await quickReplyService.updateReply((editingReply as any).id, values);
        message.success('更新成功');
      } else {
        await quickReplyService.createReply({
          ...values,
          categoryId: selectedCategoryId,
        });
        message.success('创建成功');
      }
      setIsModalVisible(false);
      fetchReplies(1);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleDelete = (replyId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除此快捷回复吗？',
      okText: '删除',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteReply(replyId);
          message.success('删除成功');
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  };

  return (
    <Layout className="quick-reply-settings">
      <Layout.Sider width={250} className="categories-sidebar">
        <div className="sidebar-header">
          <h3>分类列表</h3>
          {isSystemSettings && (
            <Button 
              type="primary" 
              size="small" 
              icon={<PlusOutlined />}
              onClick={() => {
                categoryForm.resetFields();
                categoryForm.setFieldsValue({ isGlobal: false, sortOrder: 0 });
                setIsCategoryModalVisible(true);
              }}
            >
              新建分类
            </Button>
          )}
        </div>
        <List
          dataSource={categories}
          renderItem={(category) => (
            <List.Item
              className={
                selectedCategoryId === category.id ? 'active' : ''
              }
              onClick={() => setSelectedCategory(category.id)}
              style={{ cursor: 'pointer', padding: '8px 16px' }}
            >
              <div className="category-item">
                <span>{category.name}</span>
                <span className="count">({category._count.replies})</span>
              </div>
            </List.Item>
          )}
        />
      </Layout.Sider>

      <Layout.Content className="replies-content">
        <div className="content-header">
          <h2>{isSystemSettings ? '快捷回复管理（系统设置）' : '快捷回复'}</h2>
          <Space>
            <Select
              value={sortBy}
              onChange={setSortBy}
              style={{ width: 150 }}
            >
              <Select.Option value="usageCount">使用次数</Select.Option>
              <Select.Option value="favoriteCount">收藏次数</Select.Option>
              <Select.Option value="lastUsedAt">最近使用</Select.Option>
            </Select>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddReply}
            >
              新增回复
            </Button>
          </Space>
        </div>

        {!selectedCategoryId ? (
          <Empty description="请选择分类" />
        ) : (
          <>
            <Spin spinning={loading}>
              <List
                dataSource={replies}
                renderItem={(reply) => (
                  <List.Item
                    key={reply.id}
                    actions={[
                      <Button
                        type="text"
                        onClick={() => handleEditReply(reply)}
                        icon={<EditOutlined />}
                      />,
                      <Button
                        type="text"
                        danger
                        onClick={() => handleDelete(reply.id)}
                        icon={<DeleteOutlined />}
                      />,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <div className="reply-content">
                          {reply.content.substring(0, 100)}
                          {reply.content.length > 100 ? '...' : ''}
                        </div>
                      }
                      description={
                        <Space>
                          <span>使用: {reply.usageCount}</span>
                          <span>收藏: {reply.favoriteCount}</span>
                          {reply.isGlobal && <Tag size="small" color="blue">全局</Tag>}
                          {!reply.isGlobal && <Tag size="small">个人</Tag>}
                          {reply.isFavorited && <HeartFilled style={{ color: 'red' }} />}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Spin>

            {totalReplies > 0 && (
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={totalReplies}
                onChange={(page) => fetchReplies(page)}
                style={{ marginTop: 16, textAlign: 'center' }}
              />
            )}
          </>
        )}

        <Modal
          title={editingReply ? '编辑快捷回复' : '新增快捷回复'}
          open={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          onOk={() => form.submit()}
        >
          <Form form={form} onFinish={handleSave} layout="vertical">
            <Form.Item
              name="content"
              label="回复内容"
              rules={[
                { required: true, message: '请输入回复内容' },
                { max: 300, message: '内容不超过 300 字' },
              ]}
            >
              <Input.TextArea rows={4} showCount maxLength={300} />
            </Form.Item>

            {isAdmin && isSystemSettings && (
              <Form.Item
                name="isGlobal"
                valuePropName="checked"
                initialValue={false}
              >
                <Checkbox>设置为全局模板（所有客服可见）</Checkbox>
              </Form.Item>
            )}
          </Form>
        </Modal>

        {/* 分类创建/编辑模态框 */}
        <Modal
          title="新建分类"
          open={isCategoryModalVisible}
          onCancel={() => setIsCategoryModalVisible(false)}
          onOk={() => categoryForm.submit()}
        >
          <Form 
            form={categoryForm} 
            onFinish={async (values) => {
              try {
                // 如果不是系统设置页面，强制设置为非全局（即使是管理员）
                if (!isSystemSettings) {
                  values.isGlobal = false;
                } else if (!isAdmin) {
                  // 如果是系统设置页面但不是管理员，强制设置为非全局
                  values.isGlobal = false;
                }
                await createCategory(values);
                message.success('创建成功');
                setIsCategoryModalVisible(false);
              } catch (error: any) {
                message.error(error.message || '创建失败');
              }
            }} 
            layout="vertical"
          >
            <Form.Item
              name="name"
              label="分类名称"
              rules={[{ required: true, message: '请输入分类名称' }]}
            >
              <Input placeholder="请输入分类名称" />
            </Form.Item>
            {isAdmin && isSystemSettings && (
              <Form.Item
                name="isGlobal"
                valuePropName="checked"
                initialValue={false}
              >
                <Checkbox>设置为全局分类（所有客服可见）</Checkbox>
              </Form.Item>
            )}
            <Form.Item
              name="sortOrder"
              label="排序"
              initialValue={0}
            >
              <Input type="number" placeholder="数字越小越靠前" />
            </Form.Item>
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}

