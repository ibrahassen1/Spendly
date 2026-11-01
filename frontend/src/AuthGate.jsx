import { SignIn, UserButton, useAuth } from '@clerk/react';
import App from './App.jsx';

export default function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <main style={{ minHeight: '100vh', background: '#050b0f', color: '#eaf8fb', display: 'grid', placeItems: 'center' }}>Loading Spendly…</main>;
  }

  if (isSignedIn) {
    return (
      <>
        <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 1000 }}>
          <UserButton />
        </div>
        <App />
      </>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#050b0f', color: '#eaf8fb', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '440px', display: 'grid', gap: '20px', justifyItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#08c9e8', letterSpacing: '0.2em', fontWeight: 800 }}>SPENDLY</div>
          <h1>Welcome back</h1>
          <p>Sign in to your personal money dashboard.</p>
        </div>
        <SignIn routing="hash" fallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" />
      </div>
    </main>
  );
}
