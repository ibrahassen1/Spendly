import { SignIn, UserButton, useAuth } from "@clerk/react";
import { useState } from "react";
import AuthenticatedDashboard from "./AuthenticatedDashboard.jsx";

const API = import.meta.env.VITE_SPENDLY_API_URL || "http://localhost:8080";
const missingProductionApi = import.meta.env.PROD && !import.meta.env.VITE_SPENDLY_API_URL;

export default function AuthGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [status, setStatus] = useState("");
  const [backendReady, setBackendReady] = useState(false);
  const checkStaging = async () => {
    if (missingProductionApi) { setStatus("Spendly API URL is not configured for this deployment."); return; }
    setStatus("Checking secure backend…");
    try {
      const token = await getToken();
      if (!token) throw new Error("Missing session token");
      const response = await fetch(API.replace(/\/$/, "") + "/api/planner", {
        headers: { Authorization: "Bearer " + token }
      });
      if (response.ok) { setBackendReady(true); setStatus(""); }
      else setStatus("Backend returned HTTP " + response.status);
    } catch (error) {
      setStatus("Connection failed: " + error.message);
    }
  };
  if (!isLoaded) return <main className="finance-page"><h2>Loading Spendly…</h2></main>;
  if (!isSignedIn) return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}>
    <section style={{display:"grid",gap:20,justifyItems:"center"}}>
      <h1>Spendly</h1><p>Sign in to your account.</p>
      <SignIn routing="hash" fallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" />
    </section>
  </main>;
  if (backendReady) return <AuthenticatedDashboard getToken={getToken} />;
  return <main style={{minHeight:"100vh",padding:32,maxWidth:760,margin:"auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <h1>Spendly</h1><UserButton />
    </div>
    <section className="finance-panel">
      <span className="finance-kicker">ACCOUNT SECURITY</span>
      <h2>You're signed in</h2>
      <p>Clerk sign-in is active. Your financial dashboard remains locked until the backend validates your identity.</p>
      <p>Only your account's financial information can be accessed with your authenticated session.</p>
      <button type="button" className="finance-add" onClick={checkStaging}>Connect securely</button>
      {status && <p role="status">{status}</p>}
    </section>
  </main>;
}
