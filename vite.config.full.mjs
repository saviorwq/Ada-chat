import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 完整版 full.html 单文件构建（AI.php）
 * Single JS output for full-app-entry — second step of npm run build (emptyOutDir: false)
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    manifest: true,
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'full.html'),
      output: {
        // 单入口 + 内联动态 import，产出唯一 full-*.js（无额外 shared chunk）
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
