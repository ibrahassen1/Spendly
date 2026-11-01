import { SignIn, UserButton, useAuth } from '@clerk/react';
import { useState } from 'react';
import App from './App.jsx';

export default function AuthGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [stagingStatus, setStagingStatus] = useState("");
  const testStaging = async () => {
    setStagingStatus("Checking authenticated staging connection…");
    try {
      const token = await getToken();
      if (!token) throw new Error("No Clerk session token available");
      const response = await fetch("https://spendly-staging-staging.up.railway.app/api/planner", { headers: { Authorization: `Bearer ${token}` } });
      setStagingStatus(response.status === 200 || response.status === 204 ? "Staging authentication verified." : `Staging returned HTTP ${response.status}.`);
    } catch (error) { setStagingStatus(`Staging connection failed: ${error.message}`); }
  };

  if (!isLoaded) {
    return <main style={{ minHeight: '100vh', background: '#050b0f', color: '#eaf8fb', display: 'grid', placeItems: 'center' }}>Loading Spendly…</main>;
  }

  if (isSignedIn) {
    return (
      <>
        <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 1000 }}>
          <UserButton />
        </div>
        {import.meta.env.DEV && <div style={{ position: "fixed", top: 12, left: 12, zIndex: 1000, background: "#11222b", color: "#eaf8fb", padding: 8, borderRadius: 8, maxWidth: 330 }}><button type="button" onClick={testStaging}>Test Clerk → staging</button>{stagingStatus && <div role="status">{stagingStatus}</div>}</div>}
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
