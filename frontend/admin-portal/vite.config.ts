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
    // 使用 esbuild 压缩（Vite 默认，比 terser 更快）
    minify: 'esbuild',
  },
  esbuild: {
    // 生产环境移除 console 和 debugger
    drop: ['console', 'debugger'],
  },
})
