import { useCallback, useEffect, useState } from "react";
import { UserButton } from "@clerk/react";
import "./App.css";
import AllocationStudio from "./AllocationStudio.jsx";

const API = import.meta.env.VITE_SPENDLY_API_URL || "http://localhost:8080";
const money = value => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(Number(value)||0);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function AuthenticatedDashboard({ getToken }) {
  const [planner, setPlanner] = useState(null);
  const [gmailConnected, setGmailConnected] = useState(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailMessage, setGmailMessage] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [addAmount, setAddAmount] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [adjustmentDate, setAdjustmentDate] = useState(today());
  const [baselineAmount, setBaselineAmount] = useState("");
  const [baselineDate, setBaselineDate] = useState(today());
  const [baselineEditing, setBaselineEditing] = useState(false);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [adjustmentId, setAdjustmentId] = useState(() => "adj-" + crypto.randomUUID());
  const [adjustmentBusy, setAdjustmentBusy] = useState(false);
  const [adjustmentMessage, setAdjustmentMessage] = useState("");
  const [page, setPage] = useState("dashboard");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalTargets, setGoalTargets] = useState({});
  const [paycheck, setPaycheck] = useState("");
  const [safeCredit, setSafeCredit] = useState("");
  const [useRecommended, setUseRecommended] = useState(true);
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
    const [p,b,h,t,a] = await Promise.all([
      request("/api/planner"),
      request("/api/account/safe-to-spend"),
      request("/api/account/safe-to-spend/paychecks"),
      request("/api/account/gmail/transactions"),
      request("/api/account/safe-to-spend/adjustments")
    ]);
    // New private-test accounts begin with $0 today; no fake paycheck needed.
    // Initialize only if the authenticated account has no ledger yet.
    const currentBalance = b ?? await request("/api/account/safe-to-spend/initialize", { method: "POST" });
    setPlanner(p);
    setBalance(currentBalance);
    if (currentBalance) {
      setBaselineAmount(String(currentBalance.allocation ?? 0));
      setBaselineDate(String(currentBalance.startDate ?? today()).slice(0, 10));
    }
    setHistory(Array.isArray(h) ? h : []);
    setTransactions(Array.isArray(t) ? t : []);
    setAdjustments(Array.isArray(a) ? a : []);
  }, [request]);

  useEffect(() => {
    let active = true;
    (async () => {
      try { await refresh(); if(active) setStatus(""); }
      catch(e) { if(active) setStatus(e.message); }
    })();
    return () => { active = false; };
  }, [refresh]);

  const refreshGmail = useCallback(async () => {
    try {
      const result = await request("/api/account/gmail/status");
      setGmailConnected(Boolean(result?.connected));
      setGmailMessage("");
    } catch (error) {
      setGmailConnected(null);
      setGmailMessage("Unable to check Gmail connection: " + error.message);
    }
  }, [request]);

  useEffect(() => { refreshGmail(); }, [refreshGmail]);

  const connectGmail = async () => {
    setGmailBusy(true); setGmailMessage("");
    try {
      const result = await request("/api/account/gmail/connect", { method: "POST" });
      const url = new URL(result.authorizationUrl);
      if (url.protocol !== "https:" || url.hostname !== "accounts.google.com")
        throw new Error("Unexpected Google authorization URL.");
      window.location.assign(url.toString());
    } catch (error) {
      setGmailMessage("Unable to connect Gmail: " + error.message);
      setGmailBusy(false);
    }
  };

  const disconnectGmail = async () => {
    if (!window.confirm("Disconnect Gmail from this Spendly account?")) return;
    setGmailBusy(true); setGmailMessage("");
    try {
      await request("/api/account/gmail/connection", { method: "DELETE" });
      setGmailConnected(false);
      setGmailMessage("Gmail disconnected.");
    } catch (error) {
      setGmailMessage("Unable to disconnect Gmail: " + error.message);
    } finally { setGmailBusy(false); }
  };

  const syncGmail = async () => {
    setGmailBusy(true); setGmailMessage("");
    try {
      const result = await request("/api/account/gmail/sync", { method:"POST" });
      await refresh();
      setGmailMessage("Sync complete: " + result.newTransactionCount + " new transaction(s).");
    } catch (error) {
      setGmailMessage("Gmail sync failed: " + error.message);
    } finally { setGmailBusy(false); }
  };

  const updateTransaction = async (transaction, restore) => {
    setGmailBusy(true); setGmailMessage("");
    try {
      await request("/api/account/gmail/transactions/" + transaction.id + (restore ? "/restore" : ""), {
        method: restore ? "POST" : "DELETE"
      });
      await refresh();
      setGmailMessage(restore ? "Transaction restored." : "Transaction excluded from spending.");
    } catch (error) {
      setGmailMessage("Unable to update transaction: " + error.message);
    } finally { setGmailBusy(false); }
  };

  const submitPaycheck = async e => {
    e.preventDefault();
    const amount = Number(paycheck);
    const credit = useRecommended ? Math.round(amount * 70) / 100 : Number(safeCredit);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(credit) || credit < 0 || credit > amount ||
        !/^\d+(\.\d{1,2})?$/.test(paycheck.trim()) || (!useRecommended && !/^\d+(\.\d{1,2})?$/.test(safeCredit.trim())) ||
        !paycheckDate || paycheckDate > today()) {
      setStatus("Check the paycheck amount, allocation, and date (cannot be in the future)."); return;
    }
    setBusy(true); setStatus("");
    try {
      await request("/api/account/safe-to-spend/paychecks", {
        method:"POST",
        body:JSON.stringify({periodId, paycheck:amount, safeCredit:credit, paycheckDate})
      });
      // The paycheck credit is idempotent in the backend. Planner goal updates
      // are tracked separately so a retry cannot double-count this paycheck.
      const base = await request("/api/planner") || { periods: [], categories: [], goals: {} };
      const recorded = base.goalCreditPeriods || {};
      if (!recorded[periodId]) {
        const savingsCents = useRecommended ? Math.round(amount * 20) : 0;
        const investmentsCents = useRecommended ? Math.round(amount * 100) - Math.round(credit * 100) - savingsCents : 0;
        const updated = {
          ...base,
          goalCreditPeriods: { ...recorded, [periodId]: true },
          goals: {
            ...(base.goals || {}),
            savings: { ...(base.goals?.savings || {}), allocatedCents: (Number(base.goals?.savings?.allocatedCents) || 0) + savingsCents },
            investments: { ...(base.goals?.investments || {}), allocatedCents: (Number(base.goals?.investments?.allocatedCents) || 0) + investmentsCents }
          }
        };
        await request("/api/planner", { method:"PUT", body:JSON.stringify(updated) });
      }
      await refresh();
      setPaycheck(""); setSafeCredit("");
      setPeriodId("pay-" + crypto.randomUUID());
      setStatus("Paycheck saved. Goal progress updated.");
    } catch(e) { setStatus(e.message + " If the paycheck was credited, retry with the same form to finish recording goal progress."); }
    finally { setBusy(false); }
  };

  const submitBaseline = async event => {
    event.preventDefault();
    const amount = Number(baselineAmount);
    if (!/^-?\d+(\.\d{1,2})?$/.test(baselineAmount.trim()) ||
        !Number.isFinite(amount) || Math.abs(amount) > 9999999999.99 ||
        !baselineDate || baselineDate > today()) {
      setAdjustmentMessage("Enter a valid baseline amount and a date that isn't in the future."); return;
    }
    if (!window.confirm("Set a new starting balance and tracking date? Your prior transactions and adjustments will be retained, but your available amount will be recalculated.")) return;
    setBaselineBusy(true); setAdjustmentMessage("");
    try {
      await request("/api/account/safe-to-spend/baseline", {
        method:"PUT", body:JSON.stringify({amount, startDate:baselineDate})
      });
      await refresh();
      setBaselineEditing(false);
      setAdjustmentMessage("Starting balance and transaction tracking date updated.");
    } catch (e) { setAdjustmentMessage("Unable to update baseline: " + e.message); }
    finally { setBaselineBusy(false); }
  };

  const submitAdjustment = async event => {
    event.preventDefault();
    if (!balance) { setAdjustmentMessage("Your account balance is still loading."); return; }
    const normalized = addAmount.trim();
    const amount = Number(normalized);
    if (!/^-?\d+(\.\d{1,2})?$/.test(normalized) || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 9999999999.99 || !adjustmentNote.trim() || adjustmentNote.trim().length > 200 || !adjustmentDate || adjustmentDate > today()) {
      setAdjustmentMessage("Enter a nonzero amount, a short note, and a valid date."); return;
    }
    setAdjustmentBusy(true); setAdjustmentMessage("");
    try {
      await request("/api/account/safe-to-spend/adjustments", {
        method:"POST", body:JSON.stringify({requestId:adjustmentId, amount, note:adjustmentNote.trim(), occurredOn:adjustmentDate})
      });
      await refresh();
      setAdjustmentMessage((amount > 0 ? "+" : "−") + money(Math.abs(amount)) + " adjustment saved.");
      setAddAmount("");
      setAdjustmentNote("");
      setAdjustmentDate(today());
      setAdjustmentId("adj-" + crypto.randomUUID());
      setShowAddMoney(false);
    } catch (error) {
      setAdjustmentMessage(error.message + " If the request succeeded, retry without changing the amount to avoid duplicating it.");
    } finally { setAdjustmentBusy(false); }
  };

  const saveGoal = async id => {
    const raw = goalTargets[id];
    const target = Number(raw);
    if (raw === undefined || raw === "" || !/^\d+(\.\d{1,2})?$/.test(String(raw)) || !Number.isFinite(target) || target > 9999999999) {
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

  const balanceValue = balance?.safeToSpend;
  const visibleTransactions = transactions.filter(t => t.status !== "DELETED");
  const dateLabel = value => {
    if (!value) return "Unknown date";
    const iso = String(value).slice(0,10);
    const parts = iso.split("-");
    return parts.length === 3 ? new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2])).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : String(value);
  };

  return <main className="app spendly-restored">
    <div className="dashboard">
      <header className="app-header spendly-restored-header">
        <div><p className="eyebrow">YOUR MONEY, YOUR WAY</p><h1>Spendly<span className="spendly-brand-dot">.</span></h1></div>
        <UserButton />
      </header>
      {status && <p role="status" className="gmail-toast">{status}</p>}

      {(page==="dashboard" || page==="goals") && <AllocationStudio
        page={page} planner={planner} request={request} refresh={refresh}
        history={history} balance={balance}
      />}

      {page==="safe" && <>
        <div className="finance-heading"><p className="eyebrow">YOUR SPENDING</p><h2>Safe to Spend</h2><p>Know what you can spend today.</p></div>
        <section className="finance-panel spendly-baseline">
          <div className="finance-category-top"><div><span className="finance-kicker">MANUAL BALANCE</span><h3>Starting balance & tracking date</h3></div>
            <button type="button" className="finance-add" onClick={() => setBaselineEditing(v => !v)}>{baselineEditing ? "Cancel" : "Edit"}</button>
          </div>
          <p>{balance ? money(balance.allocation) : "—"} starting allocation · Only Gmail purchases on or after {balance ? dateLabel(balance.startDate) : "your selected date"} count.</p>
          {baselineEditing && <form className="spendly-baseline-form" onSubmit={submitBaseline}>
            <label>Starting balance ($)<input type="number" step="0.01" value={baselineAmount} onChange={e => setBaselineAmount(e.target.value)} required /></label>
            <label>Transaction tracking starts<input type="date" max={today()} value={baselineDate} onChange={e => setBaselineDate(e.target.value)} required /></label>
            <p className="date-explanation">Saving creates a new baseline, not an adjustment. Past history is kept, and counted transactions are recalculated.</p>
            <button className="save-button" type="submit" disabled={baselineBusy}>{baselineBusy ? "Saving…" : "Save balance & date"}</button>
          </form>}
        </section>
        <div className="safe-top-zone">
          <section className="safe-fintech-hero">
            <p className="label">AVAILABLE TO SPEND</p>
            <h2 className={"amount" + (balance ? (Number(balanceValue) > 0 ? " balance-positive" : Number(balanceValue) < 0 ? " balance-negative" : "") : "")}>{balance ? money(balanceValue) : "—"}</h2>
            <p className="safe-subtitle">{balance ? money(balance.allocation)+" allocated − "+money(balance.countedSpending)+" spent" : "Preparing your balance…"}</p>
            {balance && <p className="safe-subtitle">Tracking since {dateLabel(balance.startDate)}</p>}
          </section>
          {balance && <div className="safe-quick-actions">
            <button type="button" disabled={adjustmentBusy} onClick={()=>{setShowAddMoney(v=>!v);setAdjustmentMessage("");}}>+ Add Money</button>
          </div>}
          {showAddMoney && balance && <form className="budget-card" onSubmit={submitAdjustment}>
            <div className="section-heading"><div><p className="eyebrow">ADJUST MONEY</p><h2>Adjust your spendable budget</h2></div></div>
            <label>Amount to adjust
              <div className="money-input"><span>$</span>
                <input type="number" step="0.01" placeholder="100.00 or -100.00" value={addAmount} onChange={e=>setAddAmount(e.target.value)} required />
              </div>
            </label>
            <label>Note / reason
              <select aria-label="Common reason" value={["Paycheck","Zelle for food","Refund","Barbering income"].includes(adjustmentNote) ? adjustmentNote : "custom"}
                onChange={e => { if (e.target.value !== "custom") setAdjustmentNote(e.target.value); else setAdjustmentNote(""); }}>
                <option value="custom">Custom note…</option>
                <option value="Paycheck">Paycheck</option>
                <option value="Zelle for food">Zelle for food</option>
                <option value="Refund">Refund</option>
                <option value="Barbering income">Barbering income</option>
              </select>
              <input type="text" maxLength="200" placeholder="Why are you adding or removing money?" value={adjustmentNote} onChange={e=>setAdjustmentNote(e.target.value)} required />
            </label>
            <label>When it happened<input type="date" max={today()} value={adjustmentDate} onChange={e=>setAdjustmentDate(e.target.value)} required /></label>
            <p className="date-explanation">Use a positive amount to add money or a negative amount to remove it.</p>
            <p className="date-explanation">Current allocation: {money(balance.allocation)}. Your tracking start date stays the same.</p>
            <button className="save-button" type="submit" disabled={adjustmentBusy}>{adjustmentBusy?"Saving…":"Save adjustment"}</button>
            <button className="edit-button" type="button" disabled={adjustmentBusy} onClick={()=>{setShowAddMoney(false);setAdjustmentMessage("");}}>Cancel</button>
          </form>}
        </div>
        {adjustmentMessage && <p role="status" className="spendly-sync-message">{adjustmentMessage}</p>}
        <section className="gmail-compact spendly-gmail-connection">
          <div className="gmail-compact-info"><span className="gmail-status-dot" /><span>{gmailConnected === true ? "Gmail connected" : gmailConnected === false ? "Connect Gmail to sync purchases" : "Checking Gmail connection…"}</span></div>
          <div className="spendly-gmail-actions">
            {gmailConnected === false && <button type="button" className="coach-primary" disabled={gmailBusy} onClick={connectGmail}>{gmailBusy?"Connecting…":"Connect Gmail"}</button>}
            {gmailConnected === true && <button type="button" className="coach-primary" disabled={gmailBusy || !balance} onClick={syncGmail}>{gmailBusy?"Syncing…":"Sync Gmail"}</button>}
            <details className="gmail-settings"><summary>Settings</summary>
              <div className="gmail-settings-panel">
                <p>Gmail is used only to read recognized bank purchase alerts.</p>
                <button type="button" className="finance-add" disabled={gmailBusy} onClick={refreshGmail}>Refresh status</button>
                {gmailConnected === true && <button type="button" className="finance-add" disabled={gmailBusy} onClick={disconnectGmail}>Disconnect Gmail</button>}
              </div>
            </details>
          </div>
        </section>
        {gmailMessage && <p role="status" className="spendly-sync-message">{gmailMessage}</p>}
        <section className="finance-panel spendly-activity">
          <div className="spendly-activity-heading"><div><span className="finance-kicker">RECENT ACTIVITY</span><h3>Transactions</h3></div><span>{visibleTransactions.length} counted</span></div>
          {transactions.length ? transactions.map(t=><div className="spendly-transaction" key={t.id}>
            <span className="spendly-transaction-icon">↗</span>
            <div className="spendly-transaction-detail"><strong>{t.merchant || "Bank purchase"}</strong><small>{dateLabel(t.date)} · {String(t.sourceBank||"").replace("_"," ")} {t.cardLast4 ? "· •••• "+t.cardLast4 : ""}</small></div>
            <div className="spendly-transaction-right"><strong>{money(t.amount)}</strong><button type="button" disabled={gmailBusy} onClick={()=>updateTransaction(t,t.status === "DELETED")}>{t.status==="DELETED"?"Restore":"Exclude"}</button></div>
          </div>) : <p>No transactions synced yet. Connect Gmail and sync to import recognized alerts.</p>}
        </section>
        {adjustments.length > 0 && <section className="finance-panel spendly-adjustment-history">
          <span className="finance-kicker">MONEY ADJUSTMENTS</span>
          <h3>Adjustment history</h3>
          {adjustments.map(a=><div className="finance-category" key={a.id}>
            <div className="finance-category-top">
              <span>{a.note || "Manual adjustment"} · {dateLabel(a.occurredOn || a.createdAt)} <small>Recorded {dateLabel(a.createdAt)}</small></span>
              <strong className={Number(a.amount)>=0?"positive-adjustment":"negative-adjustment"}>{Number(a.amount)>0?"+":""}{money(a.amount)}</strong>
            </div>
          </div>)}
        </section>}
        {allocations.length>0 && <section className="finance-panel spendly-planned-allocations">
          <span className="finance-kicker">PLANNED ALLOCATIONS</span>
          {allocations.map(c=><div className="finance-category" key={c.id}><div className="finance-category-top"><span>{c.name}</span><strong>{money(c.amount)}</strong></div></div>)}
        </section>}
      </>}

      <nav className="spendly-bottom-nav" aria-label="Spendly pages">
        {[["dashboard","Dashboard"],["goals","Goals"],["safe","Safe to Spend"]].map(([id,label])=>
          <button key={id} className={"bottom-nav-item"+(page===id?" selected":"")} type="button" aria-current={page===id?"page":undefined} onClick={()=>{setPage(id);setStatus("");}}>
            {id==="dashboard"?<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>:id==="goals"?<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/></svg>}
            <span>{label}</span>
          </button>)}
      </nav>
    </div>
  </main>;
}
