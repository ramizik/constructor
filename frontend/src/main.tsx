import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DesignProto from './DesignProto.tsx'

// DesignProto is the primary UI. The original App is kept as a fallback,
// reachable at /legacy for comparison/rollback.
const isLegacy = window.location.pathname === '/legacy'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLegacy ? <App /> : <DesignProto />}
  </StrictMode>,
)
