import { SignIn, UserButton, useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import AuthenticatedDashboard from "./AuthenticatedDashboard.jsx";

// QA ONLY: do not use Vercel API variables or the production endpoint.
const API = "https://spendly-v11-qa-staging.up.railway.app";
const missingProductionApi = false; // Dedicated QA backend URL is pinned above.

export default function AuthGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [backendReady, setBackendReady] = useState(false);
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);

  // Restore the session automatically. A successful Clerk sign-in should not
  // require a page refresh or an additional "Connect securely" button click.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    let active = true;
    setBackendReady(false);
    setStatus("");

    async function verifySession() {
      if (missingProductionApi) {
        if (active) setStatus("Spendly API URL is not configured.");
        return;
      }
      try {
        const token = await getToken();
        if (!token) throw new Error("Your session isn't ready. Please retry.");
        const response = await fetch(API.replace(/\/$/, "") + "/api/planner", {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Secure connection failed (HTTP " + response.status + ").");
        if (active) setBackendReady(true);
      } catch (error) {
        if (active) setStatus(error.message || "Unable to connect. Please retry.");
      }
    }

    verifySession();
    return () => { active = false; };
  }, [isLoaded, isSignedIn, getToken, retry]);

  const retryConnection = useCallback(() => setRetry(value => value + 1), []);

  if (!isLoaded) return <main className="finance-page"><h2>Loading Spendly…</h2></main>;

  if (!isSignedIn) {
    return <main style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 15% 10%, #34215d 0%, #130d24 45%, #090713 100%)", color: "#fff", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "100%", maxWidth: 440, display: "grid", gap: 20, justifyItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.06em", margin: 0 }}>Spendly<span style={{ color: "#b89cff" }}>.</span></h1>
          <p style={{ color: "#cbbfe7", marginTop: 8 }}>Your money, your way.</p>
        </div>
        <SignIn
          routing="hash"
          forceRedirectUrl="/"
          signUpForceRedirectUrl="/"
          appearance={{ variables: { colorPrimary: "#7955e8", borderRadius: "12px" } }}
        />
        <p style={{ color: "#a79dbf", fontSize: 12, textAlign: "center" }}>Your finances stay private to your account.</p>
      </section>
    </main>;
  }

  if (backendReady) return <AuthenticatedDashboard getToken={getToken} />;

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#120d20", color: "white" }}>
    <section className="finance-panel" style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
      <h1 style={{ marginBottom: 12 }}>Spendly<span style={{ color: "#b89cff" }}>.</span></h1>
      <UserButton />
      {status ? <>
        <h2>We couldn't connect your account.</h2>
        <p role="alert">{status}</p>
        <button type="button" className="finance-add" onClick={retryConnection}>Try again</button>
      </> : <>
        <h2>Welcome back</h2>
        <p role="status">Connecting to your private dashboard…</p>
      </>}
    </section>
  </main>;
}
