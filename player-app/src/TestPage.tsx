/**
 * 测试页面 - 用于验证React是否正常工作
 */
const TestPage = () => {
  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#f0f0f0', 
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h1 style={{ color: '#333', marginBottom: '20px' }}>
          🎉 React 应用正常运行！
        </h1>
        <p style={{ color: '#666', fontSize: '16px' }}>
          如果您能看到这个页面，说明基础架构没有问题。
        </p>
        <div style={{ marginTop: '20px' }}>
          <button 
            style={{
              padding: '10px 20px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            onClick={() => alert('按钮点击正常！')}
          >
            测试按钮
          </button>
        </div>
      </div>
    </div>
  );
};

export default TestPage;
