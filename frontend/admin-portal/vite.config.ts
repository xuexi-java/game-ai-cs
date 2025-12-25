import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 20101,
    proxy: {
      '/api': {
        target: 'http://localhost:21101',
        changeOrigin: true,
      },
    },
  },
  build: {
    // 生产环境移除 console
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  esbuild: {
    // 开发环境也移除 console（可选）
    drop: ['console', 'debugger'],
  },
})
