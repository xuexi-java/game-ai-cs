import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 全局禁用所有 console 输出
const noop = () => {};
console.log = noop;
console.debug = noop;
console.info = noop;
console.warn = noop;
console.error = noop;

// 禁用 React DevTools 提示
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject: noop,
    onCommitFiberRoot: noop,
    onCommitFiberUnmount: noop,
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
