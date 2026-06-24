import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { SessionProvider } from './context/SessionContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { ToastProvider } from './components/Toast'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <SessionProvider>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </SessionProvider>
    </ToastProvider>
  </StrictMode>,
)
