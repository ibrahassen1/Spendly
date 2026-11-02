import { useEffect, useState } from "react";
import { UserButton } from "@clerk/react";
import "./App.css";

const API = "https://spendly-staging-staging.up.railway.app";
const money = value => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(Number(value)||0);

export default function AuthenticatedDashboard({ getToken }) {
  const [planner, setPlanner] = useState(null);
  const [page, setPage] = useState("dashboard");
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
        if (active) {setPlanner(data);setStatus("");}
      } catch (error) {if(active)setStatus(error.message);}
    })();
    return () => {active=false;};
  }, [getToken]);
  const categories = Array.isArray(planner?.categories) ? planner.categories : [];
  const periods = Array.isArray(planner?.periods) ? planner.periods : [];
  const period = periods.find(p=>p.id===planner?.selected) || periods[periods.length-1];
  const paycheck = Number(period?.paycheck)||0;
  const goals = planner?.goals || {};
  const allocations = categories.map(c=>({...c,amount:paycheck*(Number(c.percent)||0)/100}));
  return <main className="finance-page" style={{maxWidth:1100,margin:"0 auto",padding:"28px 20px"}}>
    <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:20}}>
      <h1>Spendly</h1><UserButton />
    </header>
    <nav className="page-tabs" aria-label="Spendly pages" style={{display:"flex",gap:12,margin:"24px 0"}}>
      {[["dashboard","Dashboard"],["goals","Goals"],["safe","Safe to Spend"]].map(([id,label])=>
        <button key={id} type="button" aria-current={page===id?"page":undefined}
          className={page===id?"active":""} onClick={()=>setPage(id)}>{label}</button>)}
    </nav>
    {status && <p role="status">{status}</p>}
    {planner && <>
      {page==="dashboard" && <>
        <div className="finance-heading"><p className="eyebrow">YOUR FINANCIAL OVERVIEW</p><h2>Dashboard</h2><p>Your personal staging planner, in read-only mode.</p></div>
        <section className="finance-panel">
          <span className="finance-kicker">PAYCHECK</span>
          <h3>{period ? money(paycheck) : "No paycheck yet"}</h3>
          <p>Saved allocations</p>
          {allocations.length ? allocations.map(c=><div key={c.id} className="finance-category">
            <div className="finance-category-top"><span>{c.name}</span><strong>{money(c.amount)}</strong></div>
            <p>{Number(c.percent)||0}%</p>
          </div>) : <p>No allocations saved in this account yet.</p>}
        </section>
      </>}
      {page==="goals" && <>
        <div className="finance-heading"><p className="eyebrow">YOUR PROGRESS</p><h2>Financial Goals</h2></div>
        <section className="finance-panel">
          {["savings","investments","expenses"].map(id=>{
            const goal=goals[id]||{};
            const target=Number(goal.target)||0;
            const saved=(Number(goal.allocatedCents)||0)/100;
            const pct=target>0?Math.min(100,saved/target*100):0;
            return <div key={id} style={{marginBottom:24}}>
              <h3>{id[0].toUpperCase()+id.slice(1)}</h3>
              <p>{money(saved)} allocated of {money(target)} goal</p>
              <progress value={pct} max="100" style={{width:"100%"}} />
            </div>;
          })}
          <p>These amounts are planner records, not verified bank transfers.</p>
        </section>
      </>}
      {page==="safe" && <>
        <div className="finance-heading"><p className="eyebrow">YOUR SPENDING</p><h2>Safe to Spend</h2></div>
        <section className="finance-panel">
          <h3>{money(allocations.find(c=>c.id==="spend")?.amount)}</h3>
          <p>Planned spending allocation only. Your live balance and Gmail transactions are hidden until backend account isolation is verified.</p>
        </section>
      </>}
      <p style={{marginTop:24,opacity:.75}}>Read-only staging preview. Production balances and financial actions are intentionally disabled.</p>
    </>}
  </main>;
}
