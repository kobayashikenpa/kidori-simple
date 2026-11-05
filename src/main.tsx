import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { JobStoreProvider } from './store/JobStore.tsx'
import App from './ui/App.tsx'
import { listenInstallPrompt, registerServiceWorker } from './ui/platform/installPrompt'

// ホーム画面のアプリ（仕様書 30章）：インストールの確認の合図を受け取り、電波が無くても開けるようにする
listenInstallPrompt()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JobStoreProvider>
      <App />
    </JobStoreProvider>
  </StrictMode>,
)
