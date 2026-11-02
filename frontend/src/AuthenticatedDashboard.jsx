import { useCallback, useEffect, useState } from "react";
import { UserButton } from "@clerk/react";
import "./App.css";

const API = import.meta.env.VITE_SPENDLY_API_URL || "http://localhost:8080";
const money = value => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(Number(value)||0);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function AuthenticatedDashboard({ getToken }) {
  const [planner, setPlanner] = useState(null);
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState("dashboard");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalTargets, setGoalTargets] = useState({});
  const [paycheck, setPaycheck] = useState("");
  const [safeCredit, setSafeCredit] = useState("");
  const [paycheckDate, setPaycheckDate] = useState(today());
  const [periodId, setPeriodId] = useState(() => "pay-" + crypto.randomUUID());

  const request = useCallback(async (path, options = {}) => {
    const token = await getToken();
    if (!token) throw new Error("Session expired. Please sign in again.");
    const response = await fetch(API + path, {
      ...options,
      headers: {Authorization:"Bearer " + token, ...(options.body ? {"Content-Type":"application/json"} : {}), ...options.headers}
    });
    if (response.status === 204) return null;
    if (response.status === 404 && path === "/api/account/safe-to-spend") return null;
    if (!response.ok) throw new Error("Request failed (" + response.status + ").");
    return response.json();
  }, [getToken]);

  const refresh = useCallback(async () => {
    const [p,b,h] = await Promise.all([
      request("/api/planner"),
      request("/api/account/safe-to-spend"),
      request("/api/account/safe-to-spend/paychecks")
    ]);
    setPlanner(p);
    setBalance(b);
    setHistory(Array.isArray(h) ? h : []);
  }, [request]);

  useEffect(() => {
    let active = true;
    (async () => {
      try { await refresh(); if(active) setStatus(""); }
      catch(e) { if(active) setStatus(e.message); }
    })();
    return () => { active = false; };
  }, [refresh]);

  const submitPaycheck = async e => {
    e.preventDefault();
    const amount = Number(paycheck), credit = Number(safeCredit);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(credit) || credit < 0 || credit > amount ||
        !/^\d+(\.\d{1,2})?$/.test(paycheck.trim()) || !/^\d+(\.\d{1,2})?$/.test(safeCredit.trim()) ||
        !paycheckDate || paycheckDate > today()) {
      setStatus("Check the paycheck amount, allocation, and date (cannot be in the future)."); return;
    }
    setBusy(true); setStatus("");
    try {
      await request("/api/account/safe-to-spend/paychecks", {
        method:"POST",
        body:JSON.stringify({periodId, paycheck:amount, safeCredit:credit, paycheckDate})
      });
      await refresh();
      setPaycheck(""); setSafeCredit("");
      setPeriodId("pay-" + crypto.randomUUID());
      setStatus("Paycheck saved to your account.");
    } catch(e) { setStatus(e.message + " Please retry without changing the paycheck ID."); }
    finally { setBusy(false); }
  };

  const saveGoal = async id => {
    const raw = goalTargets[id];
    const target = Number(raw);
    if (raw === undefined || raw === "" || !/^\\d+(\\.\\d{1,2})?$/.test(String(raw)) || !Number.isFinite(target) || target > 9999999999) {
      setStatus("Enter a valid goal target (0 or greater).");
      return;
    }
    setGoalSaving(true);
    setStatus("");
    try {
      const base = planner && typeof planner === "object" ? planner : { periods: [], categories: [], goals: {} };
      const updated = {
        ...base,
        goals: {
          ...(base.goals || {}),
          [id]: { ...(base.goals?.[id] || {}), target }
        }
      };
      await request("/api/planner", { method: "PUT", body: JSON.stringify(updated) });
      setPlanner(updated);
      setGoalTargets(previous => { const next = {...previous}; delete next[id]; return next; });
      setStatus("Goal target saved.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setGoalSaving(false);
    }
  };

  const categories = Array.isArray(planner?.categories) ? planner.categories : [];
  const periods = Array.isArray(planner?.periods) ? planner.periods : [];
  const period = periods.find(p=>p.id===planner?.selected) || periods[periods.length-1];
  const goals = planner?.goals || {};
  const allocations = categories.map(c=>({...c,amount:(Number(period?.paycheck)||0)*(Number(c.percent)||0)/100}));

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
    {page==="dashboard" && <>
      <div className="finance-heading"><p className="eyebrow">YOUR FINANCIAL OVERVIEW</p><h2>Dashboard</h2><p>Your authenticated account on the local development backend.</p></div>
      <section className="finance-panel">
        <span className="finance-kicker">SAFE TO SPEND BALANCE</span>
        <h3>{balance ? money(balance.allocation) : "No paycheck recorded"}</h3>
        <p>{history.length} recorded paycheck{history.length===1?"":"s"}</p>
      </section>
      <section className="finance-panel" style={{marginTop:20}}>
        <span className="finance-kicker">ADD PAYCHECK</span>
        <form noValidate onSubmit={submitPaycheck} style={{display:"grid",gap:14,maxWidth:420,marginTop:12}}>
          <label>Paycheck amount
            <input required type="number" min="0.01" step="0.01" value={paycheck} onChange={e=>setPaycheck(e.target.value)} placeholder="100.00" style={{display:"block",width:"100%",padding:12,marginTop:6}} />
          </label>
          <label>Safe-to-Spend portion
            <input required type="number" min="0" step="0.01" value={safeCredit} onChange={e=>setSafeCredit(e.target.value)} placeholder="70.00" style={{display:"block",width:"100%",padding:12,marginTop:6}} />
          </label>
          <label>Paycheck date
            <input required type="date" max={today()} value={paycheckDate} onChange={e=>setPaycheckDate(e.target.value)} style={{display:"block",width:"100%",padding:12,marginTop:6}} />
          </label>
          <button type="submit" className="finance-add" disabled={busy} onClick={() => setStatus("Save button clicked. Validating paycheck…")}>{busy?"Saving…":"Save paycheck"}</button>
          {status && <p role="status" style={{margin:0}}>{status}</p>}
        </form>
      </section>
      <section className="finance-panel" style={{marginTop:20}}>
        <span className="finance-kicker">PAYCHECK HISTORY</span>
        {history.length ? history.map(p=><div key={p.periodId} className="finance-category">
          <div className="finance-category-top"><span>{p.paycheckDate}</span><strong>{money(p.paycheck)}</strong></div>
          <p>{money(p.safeCredit)} credited to Safe to Spend</p>
        </div>) : <p>No paychecks recorded yet.</p>}
      </section>
    </>}
    {page==="goals" && <>
      <div className="finance-heading"><p className="eyebrow">YOUR PROGRESS</p><h2>Financial Goals</h2></div>
      <section className="finance-panel">
        {["savings","investments","expenses"].map(id=>{
          const goal=goals[id]||{}, target=Number(goal.target)||0, saved=(Number(goal.allocatedCents)||0)/100;
          return <div key={id} style={{marginBottom:24}}>
            <h3>{id[0].toUpperCase()+id.slice(1)}</h3>
            <p>{money(saved)} allocated of {money(target)} goal</p>
            <div style={{display:"flex",gap:10,alignItems:"end",flexWrap:"wrap",margin:"12px 0"}}>
              <label>Target amount
                <input type="number" min="0" step="0.01" value={goalTargets[id] ?? String(target)} onChange={e=>setGoalTargets(prev=>({...prev,[id]:e.target.value}))} style={{display:"block",padding:10,marginTop:6,maxWidth:180}} />
              </label>
              <button type="button" className="finance-add" disabled={goalSaving} onClick={()=>saveGoal(id)}>{goalSaving?"Saving…":"Save target"}</button>
            </div>
            <progress value={target>0?Math.min(100,saved/target*100):0} max="100" style={{width:"100%"}} />
          </div>;
        })}
        <p>Goal targets are saved to your account. Allocated progress is still read-only; no bank transfers are performed.</p>
      </section>
    </>}
    {page==="safe" && <>
      <div className="finance-heading"><p className="eyebrow">YOUR SPENDING</p><h2>Safe to Spend</h2></div>
      <section className="finance-panel">
        <h3>{balance ? money(balance.allocation) : "No balance yet"}</h3>
        <p>Account-specific paycheck credits. Gmail transactions and spending deductions are not yet connected.</p>
        {balance && <p>Tracking since {balance.startDate}</p>}
      </section>
      {allocations.length>0 && <section className="finance-panel" style={{marginTop:20}}>
        <span className="finance-kicker">PLANNED ALLOCATIONS</span>
        {allocations.map(c=><div key={c.id} className="finance-category">
          <div className="finance-category-top"><span>{c.name}</span><strong>{money(c.amount)}</strong></div>
        </div>)}
      </section>}
    </>}
    <p style={{marginTop:24,opacity:.75}}>Local development only. Production is unchanged. Gmail spending is not included in this balance.</p>
  </main>;
}
