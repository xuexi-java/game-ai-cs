// Mock axios 模块
const mockPost = jest.fn();
const mockCreate = jest.fn(() => ({ post: mockPost }));

export default {
  create: mockCreate,
};

export { mockPost, mockCreate };

