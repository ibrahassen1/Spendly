import { SignIn, UserButton, useAuth } from "@clerk/react";
import { useState } from "react";

export default function AuthGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [status, setStatus] = useState("");
  const checkStaging = async () => {
    setStatus("Checking secure staging backend…");
    try {
      const token = await getToken();
      if (!token) throw new Error("Missing session token");
      const response = await fetch("https://spendly-staging-staging.up.railway.app/api/planner", {
        headers: { Authorization: "Bearer " + token }
      });
      setStatus(response.ok ? "Authenticated staging connection successful." : "Staging returned HTTP " + response.status);
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
  return <main style={{minHeight:"100vh",padding:32,maxWidth:760,margin:"auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <h1>Spendly</h1><UserButton />
    </div>
    <section className="finance-panel">
      <span className="finance-kicker">ACCOUNT SECURITY</span>
      <h2>You're signed in</h2>
      <p>Clerk sign-in is active. Your financial dashboard remains locked until the backend validates your identity and isolates your data from other accounts.</p>
      <p>We will not load the existing shared production financial endpoints for signed-in users.</p>
      <button type="button" className="finance-add" onClick={checkStaging}>Test authenticated staging connection</button>
      {status && <p role="status">{status}</p>}
    </section>
  </main>;
}
