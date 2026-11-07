import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import { ClerkProvider } from '@clerk/react'
import AuthGate from './AuthGate.jsx'
import AllocationStudio from './AllocationStudio.jsx'

// The old PWA worker cached JS using cache-first rules. That can leave users
// on an outdated login flow until they hard-refresh. Disable it for the
// private test release and remove only Spendly's old caches.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations
      .filter(registration => registration.scope.startsWith(window.location.origin + '/'))
      .map(registration => registration.unregister())))
    .catch(error => console.warn('Service worker cleanup failed:', error))
}
if ('caches' in window) {
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('spendly-'))
      .map(key => caches.delete(key))))
    .catch(error => console.warn('Cache cleanup failed:', error))
}

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (import.meta.env.VITE_SPENDLY_DEMO_MODE === 'true') {
  // Isolated, branch-only interactive preview. No Clerk login or live API calls.
  createRoot(document.getElementById('root')).render(
    <div className="app spendly-restored"><div className="dashboard">
      <header className="app-header spendly-restored-header">
        <div><p className="eyebrow">YOUR MONEY, YOUR WAY</p><h1>Spendly<span className="spendly-brand-dot">.</span></h1></div>
      </header>
      <AllocationStudio demo />
    </div></div>
  )
} else if (!clerkKey) {
  document.getElementById('root').textContent = 'Spendly login is not configured. Please contact the site owner.'
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
        <AuthGate />
      </ClerkProvider>
    </StrictMode>,
  )
}
