import { ClerkProvider } from '@clerk/react';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './AuthGate.jsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => {
        console.error(
          'Service worker registration failed:',
          error
        )
      })
  })
}

createRoot(
  document.getElementById('root')
).render(
  <StrictMode>
    <ClerkProvider afterSignOutUrl="/">
<AuthGate />
</ClerkProvider>
  </StrictMode>,
)