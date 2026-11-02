import { useEffect, useState } from "react";
import { UserButton } from "@clerk/react";

const API = "https://spendly-staging-staging.up.railway.app";

export default function AuthenticatedDashboard({ getToken }) {
  const [planner, setPlanner] = useState(null);
  const [status, setStatus] = useState("Loading your account…");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Session expired. Sign in again.");
        const response = await fetch(API + "/api/planner", {headers:{Authorization:"Bearer "+token}});
        if (!response.ok) throw new Error("Unable to load your account ("+response.status+").");
        const data = await response.json();
        if (active) { setPlanner(data); setStatus(""); }
      } catch(error) { if (active) setStatus(error.message); }
    })();
    return () => { active = false; };
  }, [getToken]);
  return <main style={{maxWidth:960,margin:"0 auto",padding:"32px 20px",minHeight:"100vh"}}>
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:32}}>
      <h1>Spendly</h1><UserButton />
    </header>
    <section className="finance-panel">
      <span className="finance-kicker">YOUR ACCOUNT</span>
      <h2>Dashboard</h2>
      {status && <p role="status">{status}</p>}
      {planner && <>
        <p>Your authenticated staging account is connected.</p>
        <p>Account data loaded securely using your Clerk session. Financial actions will be enabled after account-isolation checks are complete.</p>
        <details><summary>View your planner data</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(planner,null,2)}</pre></details>
      </>}
    </section>
  </main>;
}
