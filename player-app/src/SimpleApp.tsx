/**
 * 简化版App - 用于调试
 */

const SimpleApp = () => {
  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#f0f2f5', 
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ color: '#1890ff', textAlign: 'center' }}>
        🚀 玩家端应用
      </h1>
      <div style={{ 
        maxWidth: '600px', 
        margin: '0 auto', 
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h2>系统状态检查</h2>
        <ul style={{ lineHeight: '2' }}>
          <li>✅ React 组件渲染正常</li>
          <li>✅ CSS 样式加载正常</li>
          <li>✅ JavaScript 执行正常</li>
          <li>✅ Vite 开发服务器运行正常</li>
        </ul>
        
        <div style={{ marginTop: '30px' }}>
          <h3>测试功能</h3>
          <button 
            style={{
              padding: '10px 20px',
              backgroundColor: '#52c41a',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginRight: '10px'
            }}
            onClick={() => {
              alert('按钮点击功能正常！');
            }}
          >
            测试点击
          </button>
          
          <button 
            style={{
              padding: '10px 20px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
            onClick={() => {
              console.log('控制台输出正常！');
              alert('请检查浏览器控制台');
            }}
          >
            测试控制台
          </button>
        </div>
        
        <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f6ffed', borderRadius: '6px' }}>
          <p><strong>如果您能看到这个页面：</strong></p>
          <p>说明基础的React应用已经正常运行。接下来我们可以逐步启用完整功能。</p>
        </div>
      </div>
    </div>
  );
};

export default SimpleApp;