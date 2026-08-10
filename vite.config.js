import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 开发服务器（npm run dev）：双入口 index + full
 * 生产构建请用 npm run build → scripts/build-dist.mjs（full 单文件 + manifest 合并）
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // 相对路径：dist 可放在任意子目录或由 PHP 静态托管，避免 /assets 指向站点根目录
  base: './',
  server: {
    // 确保 Vite 开发服务器运行在一个与 PHP 服务器不同的端口
    strictPort: true,
    port: 5173,
    proxy: {
      // 将所有对 .php 文件的请求代理到正在运行的 PHP 服务器
      '/ai_proxy.php': {
        target: 'http://127.0.0.1:8920',
        changeOrigin: true,
      },
      '/api.php': {
        target: 'http://127.0.0.1:8920',
        changeOrigin: true,
      },
      // 调试接口：避免被 Vite 的 SPA 回退劫持，直接转发到 PHP
      '/_api_test': {
        target: 'http://127.0.0.1:8920',
        changeOrigin: true,
      },
    },
  },
})
