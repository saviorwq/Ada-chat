/**
 * Vite 精简版入口（模块化后仅负责挂载 bootstrap）
 * Vite slim entry — delegates to app-bootstrap
 */
import '../../style.css'
import { bootstrapSlimApp } from './app-bootstrap.js'

document.addEventListener('DOMContentLoaded', async () => {
  await bootstrapSlimApp()
})
