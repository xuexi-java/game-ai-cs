import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  base: './',  // 使用相对路径，支持 WebView 本地加载
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // 代理 /api/v1 请求到后端
      '/api/v1': {
        target: 'http://localhost:21101',
        changeOrigin: true
      },
      // WebSocket 代理
      '/socket.io': {
        target: 'http://localhost:21101',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['vue', 'pinia', 'socket.io-client']
        }
      }
    }
  }
})
