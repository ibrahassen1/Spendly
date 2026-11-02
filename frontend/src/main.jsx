import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ClerkProvider } from '@clerk/react'
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

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkKey) {
  document.getElementById('root').textContent = 'Missing VITE_CLERK_PUBLISHABLE_KEY. Add your Clerk publishable key to frontend/.env.local.';
} else createRoot(
  document.getElementById('root')
).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
      <AuthGate />
    </ClerkProvider>
  </StrictMode>,
)
