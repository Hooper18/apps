import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { logVisit } from './lib/metrics'
import { installAppHeight } from './lib/viewport'

// 先定好外壳高度再渲染，避免 iPhone 主屏幕模式下首帧底部露出一条空白。
installAppHeight()

logVisit('ledger')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
