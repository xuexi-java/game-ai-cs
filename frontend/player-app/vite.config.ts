import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 20102,
    proxy: {
      '/api': {
        target: 'http://localhost:21101',
        changeOrigin: true,
      },
    },
  },
  build: {
    // 使用 esbuild 压缩（Vite 默认，比 terser 更快）
    minify: 'esbuild',
  },
  esbuild: {
    // 生产环境移除 console 和 debugger
    drop: ['console', 'debugger'],
  },
})
