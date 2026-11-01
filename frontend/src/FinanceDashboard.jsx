import { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "@clerk/react";
import SpendlyCoach from "./SpendlyCoach.jsx";

const STORAGE_KEY = "spendly.finance-planner.v1";
const GOAL_IDS = ["expenses", "investments", "savings"];
const DEFAULT_GOALS = Object.fromEntries(GOAL_IDS.map((id) => [id, { target: "", allocatedCents: 0 }]));
const COLORS = ["#00E5C0", "#FFCC55", "#6C8CFF", "#E78AFF", "#FF809F", "#47DDF5", "#B8F36A"];
const INITIAL = [
  { id: "spend", name: "Safe to Spend", percent: 70 },
  { id: "expenses", name: "Expenses", percent: 30 },
];
const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dollars = (n) => MONEY.format(Number(n) || 0);
const makeId = () => Math.random().toString(36).slice(2, 10);
const cleanAmount = (value) => Math.max(0, Number(value) || 0);

function rebalance(categories, changedId, requested) {
  const next = categories.map((c) => ({ ...c, percent: Math.max(0, Math.min(100, Number(c.percent) || 0)) }));
  const changed = next.find((c) => c.id === changedId);
  if (!changed) return next;
  changed.percent = Math.max(0, Math.min(100, Number(requested) || 0));
  const otherIds = changedId === "spend"
    ? next.filter((c) => c.id !== changedId).map((c) => c.id)
    : ["spend", ...next.filter((c) => c.id !== changedId && c.id !== "spend").map((c) => c.id)];
  let excess = next.reduce((sum, c) => sum + c.percent, 0) - 100;
  if (excess > 0) {
    for (const id of otherIds) {
      const target = next.find((c) => c.id === id);
      const reduction = Math.min(excess, target.percent);
      target.percent -= reduction;
      excess -= reduction;
      if (excess <= 0) break;
    }
  } else if (excess < 0) {
    const recipient = next.find((c) => c.id === (changedId === "spend" ? "expenses" : "spend")) || next.find((c) => c.id !== changedId);
    if (recipient) recipient.percent += -excess;
  }
  return next;
}

function loadPlanner() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.categories) && saved.categories.some((c) => c.id === "spend") && Array.isArray(saved.periods) && saved.periods.length) return { monthlyRecurring: 0, ...saved, goals: { ...DEFAULT_GOALS, ...saved.goals }, categories: rebalance(saved.categories, "spend", saved.categories.find((c) => c.id === "spend").percent) };
  } catch { /* corrupted storage: start fresh */ }
  return { monthlyRecurring: 0, goals: DEFAULT_GOALS, categories: INITIAL, periods: [{ id: makeId(), name: "Current paycheck", paycheck: "", entries: [] }], selected: null };
}

function AllocationChart({ categories, paycheck }) {
  const active = categories.filter((c) => Number(c.percent) > 0);
  const total = active.reduce((sum, c) => sum + Number(c.percent), 0);
  let offset = 0;
  const slices = active.map((c) => {
    const start = offset;
    offset += (Number(c.percent) / (total || 100)) * 360;
    return { ...c, start, end: offset };
  });
  const point = (angle, radius) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: 220 + Math.cos(rad) * radius, y: 175 + Math.sin(rad) * radius };
  };
  const pathFor = (s) => {
    const start = point(s.start, 91);
    const end = point(s.end, 91);
    const large = s.end - s.start > 180 ? 1 : 0;
    return "M " + start.x + " " + start.y + " A 91 91 0 " + large + " 1 " + end.x + " " + end.y;
  };
  return (
    <svg className="allocation-svg" viewBox="0 0 440 350" role="img" aria-label="Paycheck allocation doughnut chart with labeled category amounts">
      <circle cx="220" cy="175" r="91" fill="none" stroke="#28243f" strokeWidth="43" />
      {slices.map((s, i) => (
        s.end - s.start >= 359.99
          ? <circle key={s.id} cx="220" cy="175" r="91" fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="43" />
          : <path key={s.id} d={pathFor(s)} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="43" />
      ))}
      <text x="220" y="165" textAnchor="middle" fill="#95a7b2" fontSize="12">PAYCHECK</text>
      <text x="220" y="190" textAnchor="middle" fill="#ffffff" fontSize="23" fontWeight="500">{dollars(paycheck)}</text>
      {slices.map((s, i) => {
        const mid = (s.start + s.end) / 2;
        const a = point(mid, 110);
        const b = point(mid, 130);
        const right = b.x >= 220;
        const targetX = right ? 420 : 20;
        const labelX = right ? 415 : 25;
        const labelY = Math.max(27, Math.min(322, b.y));
        return (
          <g key={s.id}>
            <polyline points={a.x + "," + a.y + " " + b.x + "," + labelY + " " + targetX + "," + labelY} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="1.3" />
            <text x={labelX} y={labelY - 5} textAnchor={right ? "end" : "start"} fill="#d9e6ea" fontSize="11" fontWeight="600">{s.name}</text>
            <text x={labelX} y={labelY + 11} textAnchor={right ? "end" : "start"} fill="#93a7b2" fontSize="11">{dollars(paycheck * Number(s.percent) / 100)} · {s.percent}%</text>
          </g>
        );
      })}
    </svg>
  );
}

function FinanceTable({ title, entries, allocated, onAdd, onChange, onRemove }) {
  const total = entries.reduce((sum, e) => sum + cleanAmount(e.planned), 0);
  const recurring = title === "Recurring Monthly Expenses";
  return (
    <article className="finance-panel finance-table-card">
      <span className="finance-kicker">{recurring ? "MONTHLY BILLS" : "YOUR ALLOCATIONS"}</span>
      <h3>{title}</h3>
      <p>{recurring ? "Add the bills you pay every month. Spendly uses these amounts to recommend your paycheck split." : <>Allocated from paycheck: <strong>{dollars(allocated)}</strong></>}</p>
      <div className="finance-grid-header" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 120px 36px",gap:10}}><span>Item</span><span>Amount ($)</span><span></span></div>
      {entries.map((entry) => (
        <div className="finance-entry" key={entry.id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 120px 36px",gap:10}}>
          <input aria-label={title + " item"} value={entry.name} placeholder={recurring ? "Rent, phone, utilities…" : "Item"} onChange={(e) => onChange(entry.id, "name", e.target.value)} />
          <input aria-label={entry.name + " amount"} type="number" min="0" step="0.01" value={entry.planned} placeholder="0.00" onChange={(e) => onChange(entry.id, "planned", e.target.value)} />
          <button type="button" className="finance-remove" onClick={() => onRemove(entry.id)} aria-label={"Remove " + entry.name}>×</button>
        </div>
      ))}
      <button type="button" className="finance-add" onClick={onAdd}>+ Add item</button>
      <div className="finance-table-totals"><strong>{recurring ? "Monthly total" : "Total"}: {dollars(total)}</strong></div>
    </article>
  );
}

export default function FinanceDashboard({ safeToSpend, onBudgetSaved, view = "dashboard" }) {
  const { getToken, userId } = useAuth();
  const [planner, setPlanner] = useState(loadPlanner);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudHasData, setCloudHasData] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("Loading your account planner…");
  const skipInitialSave = useRef(true);
  const stagingApi = "https://spendly-staging-staging.up.railway.app";
  useEffect(() => {
    let cancelled = false;
    skipInitialSave.current = true;
    setCloudReady(false);
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("No session token");
        const response = await fetch(stagingApi + "/api/planner", { headers: { Authorization: "Bearer " + token } });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const remote = response.status === 204 ? null : await response.json();
        if (cancelled) return;
        if (remote && (!Array.isArray(remote.periods) || !Array.isArray(remote.categories) || !remote.goals)) throw new Error("Invalid planner data");
        setCloudHasData(Boolean(remote));
        setPlanner(remote || { monthlyRecurring: 0, goals: DEFAULT_GOALS, categories: INITIAL, periods: [{ id: makeId(), name: "Current paycheck", paycheck: "", entries: [] }], selected: null });
        setCloudStatus(remote ? "Planner loaded from your account." : "No cloud planner yet. Import your browser history below if needed.");
        skipInitialSave.current = true;
        setCloudReady(true);
      } catch (error) {
        if (!cancelled) setCloudStatus("Unable to load account planner: " + error.message);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, userId]);
  useEffect(() => {
    if (!cloudReady) return;
    if (skipInitialSave.current) { skipInitialSave.current = false; return; }
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Session expired");
        const response = await fetch(stagingApi + "/api/planner", {
          method: "PUT",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify(planner)
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        setCloudHasData(true);
        setCloudStatus("Planner saved to your staging account.");
      } catch (error) { setCloudStatus("SAVE FAILED: " + error.message + ". Keep this tab open."); }
    }, 800);
    return () => clearTimeout(timer);
  }, [planner, cloudReady, getToken]);
  const importBrowserHistory = () => {
    if (cloudHasData || !window.confirm("Import your browser history to this account? This will not credit Safe to Spend or resubmit paychecks.")) return;
    setPlanner(loadPlanner());
  };
  const [savingLive, setSavingLive] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [goalLedgerView, setGoalLedgerView] = useState(null);
  const [periodStart, setPeriodStart] = useState(() => new Date().toLocaleDateString("en-CA"));
  const period = planner.periods.find((p) => p.id === planner.selected) || planner.periods[0];
  const paycheck = cleanAmount(period?.paycheck);
  const categories = planner.categories;
  const percentTotal = categories.reduce((sum, c) => sum + (Number(c.percent) || 0), 0);
  const updatePeriod = (patch) => setPlanner((p) => ({ ...p, periods: p.periods.map((v) => v.id === period.id ? { ...v, ...patch } : v) }));
  const updateCategories = (next) => setPlanner((p) => ({ ...p, categories: next }));
  const changeAllocation = (id, value) => updateCategories(rebalance(categories, id, value));
  const categoryAmount = (id) => paycheck * (Number(categories.find((c) => c.id === id)?.percent) || 0) / 100;
  const entriesOf = (id) => (period.entries || []).filter((e) => e.categoryId === id);
  const changeEntry = (id, field, value) => updatePeriod({ entries: period.entries.map((e) => e.id === id ? { ...e, [field]: value } : e) });
  const removeEntry = (id) => updatePeriod({ entries: period.entries.filter((e) => e.id !== id) });
  const addEntry = (id) => updatePeriod({ entries: [...period.entries, { id: makeId(), categoryId: id, name: "", planned: "", actual: "" }] });
  const safeBalance = categoryAmount("spend");
  const valid = Math.abs(percentTotal - 100) < 0.001;
  const saveLiveBudget = async () => {
    setSyncMessage("Submission paused pending account-safe credits.");
    return;
    if (period.submitted) { setSyncMessage("This paycheck was already submitted. Create a new period for another paycheck."); return; }
    if (!valid || !period.paycheck || paycheck <= 0 || !periodStart) {
      setSyncMessage("Enter a positive paycheck, valid date, and allocations totaling 100%.");
      return;
    }
    const allocation = Math.round(categoryAmount("spend") * 100) / 100;
    const goalAllocations = Object.fromEntries(GOAL_IDS.map((id) => [id, Math.round(categoryAmount(id) * 100)]));
    const confirmed = window.confirm(
      "Submit " + dollars(paycheck) + " paycheck? This adds " + dollars(allocation) + " to the existing live Safe to Spend allocation and credits your goal progress. The current live budget start date is preserved."
    );
    if (!confirmed) return;
    setSavingLive(true);
    setSyncMessage("");
    try {
      const response = await fetch("https://spendly-production-1bdf.up.railway.app/api/safe-to-spend/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: allocation }),
      });
      if (!response.ok) throw new Error("Could not credit Safe to Spend. Make sure a live budget already exists.");
      const updated = await response.json();
      setPlanner((previous) => ({ ...previous,
        periods: previous.periods.map((item) => item.id === period.id ? { ...item, submitted: true, submittedAt: new Date().toISOString(), submittedAllocations: { ...goalAllocations, spend: Math.round(allocation * 100), ...Object.fromEntries(categories.filter((c) => !["spend", ...GOAL_IDS].includes(c.id)).map((c) => [c.id, Math.round(categoryAmount(c.id) * 100)])) }, submittedPaycheckCents: Math.round(paycheck * 100), submittedCategoryNames: Object.fromEntries(categories.map((c) => [c.id, c.name])) } : item),
        goals: Object.fromEntries(GOAL_IDS.map((id) => [id, { ...(previous.goals?.[id] || DEFAULT_GOALS[id]), allocatedCents: (previous.goals?.[id]?.allocatedCents || 0) + goalAllocations[id] }]))
      }));
      if (onBudgetSaved) await onBudgetSaved(updated);
      setSyncMessage("Paycheck submitted. Safe to Spend credited and goal progress updated in this browser.");
    } catch (error) {
      setSyncMessage(error.message || "Unable to update live budget.");
    } finally {
      setSavingLive(false);
    }
  };
  const [showRecommendation,setShowRecommendation] = useState(false);
  const recurringMonthly = entriesOf("expenses").reduce((sum,e)=>sum+cleanAmount(e.planned),0);
  const goalMonths = Math.max(1,Number(planner.goalTimelineMonths)||18);
  const checksPerYear = {weekly:52,biweekly:26,semimonthly:24,monthly:12}[planner.payFrequency || "biweekly"];
  const expensePerCheck = recurringMonthly*12/checksPerYear;
  const savingsTarget = cleanAmount(planner.goals?.savings?.target);
  const investmentsTarget = cleanAmount(planner.goals?.investments?.target);
  const desiredSavings = savingsTarget/(goalMonths*checksPerYear/12);
  const desiredInvestments = investmentsTarget/(goalMonths*checksPerYear/12);
  const recommendation = (() => {
    if(paycheck<=0 || expensePerCheck>paycheck) return null;
    const expenses=Math.ceil(expensePerCheck/paycheck*100);
    const availableForGoals=Math.max(0,paycheck*(100-expenses)/100-paycheck*.10);
    const desired=desiredSavings+desiredInvestments;
    const factor=desired>0?Math.min(1,availableForGoals/desired):0;
    const savings=Math.floor(desiredSavings*factor/paycheck*100);
    const investments=Math.floor(desiredInvestments*factor/paycheck*100);
    return {expenses,savings,investments,spend:100-expenses-savings-investments,feasible:desired<=availableForGoals,desired};
  })();
  const applyRecommendation=()=>{
    if(!recommendation || period.submitted) return;
    setPlanner(p=>{
      const custom=p.categories.filter(c=>!["spend","expenses","investments","savings"].includes(c.id));
      const next=[{id:"expenses",name:"Recurring Expenses",percent:recommendation.expenses},
        ...(recommendation.savings>0?[{id:"savings",name:"Savings",percent:recommendation.savings}]:[]),
        ...(recommendation.investments>0?[{id:"investments",name:"Investments",percent:recommendation.investments}]:[]),
        ...custom.map(c=>({...c,percent:0}))];
      return {...p,categories:[{id:"spend",name:"Safe to Spend",percent:100-next.reduce((sum,c)=>sum+c.percent,0)},...next]};
    });
    setShowRecommendation(false);
  };
  const customCategories = useMemo(() => categories.filter((c) => !["spend", "expenses", "investments", "savings"].includes(c.id)), [categories]);
  return (
    <section className="finance-page">
      <p role="status" className="finance-local-note">{cloudStatus}</p>
      {cloudReady && !cloudHasData && <button type="button" className="finance-add" onClick={importBrowserHistory}>Import existing browser paycheck history</button>}
      <fieldset disabled={!cloudReady} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="finance-heading">
        <p className="eyebrow">{view === "goals" ? "YOUR PROGRESS" : "YOUR FINANCIAL OVERVIEW"}</p>
        <h2>{view === "goals" ? "Financial Goals" : "Dashboard"}</h2>
        <p>{view === "goals" ? "Keep your savings, investment, and expense targets in one place." : "Plan your paycheck and see where every dollar is going."}</p>
      </div>
      {view === "dashboard" && <SpendlyCoach goals={{...planner.goals,timelineMonths:planner.goalTimelineMonths}} disabled={!cloudReady} onSave={({savings,investments,months}) => setPlanner(p=>({...p,goalTimelineMonths:months,goals:{...p.goals,savings:{...(p.goals?.savings || DEFAULT_GOALS.savings),target:savings},investments:{...(p.goals?.investments || DEFAULT_GOALS.investments),target:investments}}}))} />}
      {view === "dashboard" && <div className="finance-toolbar">
        <label>Pay schedule <select value={planner.payFrequency || "biweekly"} onChange={(e)=>setPlanner(p=>({...p,payFrequency:e.target.value}))}><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="semimonthly">Twice a month</option><option value="monthly">Monthly</option></select></label>
        <label>Paycheck date <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label>
        <label>Paycheck amount ($) <input type="number" min="0" step="0.01" placeholder="Enter take-home pay" value={period.paycheck} disabled={Boolean(period.submitted)} onChange={(e) => updatePeriod({ paycheck: e.target.value })} /></label>
        {period.submitted && <button type="button" className="finance-add" onClick={() => {
          const id = makeId();
          setPlanner((p) => ({ ...p, selected: id, periods: [...p.periods, { id, name: "Paycheck " + (p.periods.length + 1), paycheck: "", entries: [] }] }));
          setPeriodStart(new Date().toLocaleDateString("en-CA"));
          setSyncMessage("");
        }}>+ Next paycheck</button>}
      </div>}
      {view === "dashboard" && paycheck>0 && <section className="finance-panel" style={{marginBottom:20,padding:"22px 26px"}}>
        <span className="finance-kicker">RECOMMENDED DISTRIBUTION</span>
        <h3>Suggested paycheck split</h3>
        {period.submitted ? <p>This paycheck is already saved. Recommendations apply only to a new, unsubmitted paycheck.</p> :
         !recommendation ? <p>Your recurring monthly expenses exceed this paycheck. Review your expenses before applying a split.</p> : <>
          <p>Based on {dollars(recurringMonthly)} in recurring monthly bills, {dollars(paycheck)} take-home pay, and your optional goals.</p>
          <button type="button" className="finance-add" onClick={()=>setShowRecommendation(v=>!v)}>{showRecommendation?"Hide suggestion":"View recommended split"}</button>
          {showRecommendation && <div className="coach-result" style={{marginTop:16}}>
            {Object.entries(recommendation).filter(([key])=>["spend","expenses","savings","investments"].includes(key)).map(([key,value])=><div key={key}><span>{({spend:"Safe to Spend",expenses:"Recurring Expenses",savings:"Savings",investments:"Investments"})[key]}</span><strong>{value}% · {dollars(paycheck*value/100)}</strong></div>)}
            {!recommendation.feasible && <p className="coach-warning">Your goal timeline may be too aggressive. This split reserves room for spending and may require more time to reach your goals.</p>}
            <button type="button" className="coach-primary" onClick={applyRecommendation}>Apply to pie chart</button>
          </div>}
          <p className="finance-submit-note">Preview only. Applying adjusts your planner, not your bank balance. Paycheck crediting remains paused in staging.</p>
         </>}
      </section>}
      {view === "dashboard" && <>
      <div className="finance-paycheck-status" role="status">
        <span className="finance-paycheck-status-label">PAYCHECK</span>
        <span className="finance-paycheck-status-value">
          {period.submitted ? "✓ Saved to planner" : "Not yet submitted"}
        </span>
        {!period.submitted && <span className="finance-submit-note">Paycheck crediting is temporarily paused.</span>}
        {syncMessage && <span className="finance-submit-note">{syncMessage}</span>}
      </div>
      </>}
      {view === "dashboard" && (
        <>
      <div className="finance-panels">
        <article className="finance-panel">
          <span className="finance-kicker">PAYCHECK ALLOCATION</span>
          <h3>Where your money goes</h3>
          <AllocationChart categories={categories} paycheck={paycheck} />
          {!valid && <p className="finance-warning">Percentages must total 100% before the budget is balanced.</p>}
        </article>
        <article className="finance-panel">
          <span className="finance-kicker">BUDGET PLAN</span>
          <h3>Adjust your allocations</h3>
          <p>Changing another category automatically adjusts Safe to Spend. Increasing Safe to Spend reduces other allocations.</p>
          <p className={valid ? "finance-valid" : "finance-warning"}>Allocated: {percentTotal.toFixed(1)}% / 100%</p>
          {categories.map((c, i) => (
            <div className="finance-category" key={c.id}>
              <div className="finance-category-top">
                {c.id === "spend" ? <span style={{ color: COLORS[i % COLORS.length] }}>{c.name}</span> : <input className="finance-category-name-inline" aria-label={"Edit category name: " + c.name} title="Click to rename category" value={c.name} onChange={(e) => updateCategories(categories.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))} style={{color:COLORS[i % COLORS.length],background:"transparent",border:"1px solid transparent",borderRadius:8,padding:"4px 6px",font:"inherit",fontSize:"inherit",width:"min(75%, 330px)",minWidth:0}} onFocus={(e)=>e.target.select()} />}
                <strong>{dollars(categoryAmount(c.id))}</strong>
              </div>
              <div className="finance-category-controls">
                <input aria-label={c.name + " allocation percentage"} type="range" min="0" max="100" step="1" value={c.percent} onChange={(e) => changeAllocation(c.id, e.target.value)} />
                <input aria-label={c.name + " percentage"} type="number" min="0" max="100" step="1" value={c.percent} onChange={(e) => changeAllocation(c.id, e.target.value)} />
                <span>%</span>
                {c.id !== "spend" && <button type="button" className="finance-remove" aria-label={"Remove " + c.name} title={"Remove " + c.name} onClick={() => updateCategories(categories.filter((x) => x.id !== c.id).map(x=>x.id==="spend" ? {...x,percent:x.percent+c.percent} : x))}>×</button>}
              </div>
            </div>
          ))}
          <button type="button" className="finance-add" onClick={() => updateCategories([...categories, { id: makeId(), name: "New category", percent: 0 }])}>+ Add your own category</button>
          
        </article>
      </div>
        </>
      )}
      {view === "goals" && (
      <article className="finance-panel" style={{ marginBottom: 20 }}>
        <span className="finance-kicker">FINANCIAL GOALS</span>
        <h3>{goalLedgerView ? "Allocation history" : "Track your progress"}</h3>
        <div className="finance-toolbar" style={{ margin: "12px 0" }}>
          <button type="button" className="finance-add" onClick={() => setGoalLedgerView(null)} aria-pressed={goalLedgerView === null}>Progress</button>
          {GOAL_IDS.map((id) => <button key={id} type="button" className="finance-add" onClick={() => setGoalLedgerView(id)} aria-pressed={goalLedgerView === id}>{categories.find((c) => c.id === id)?.name || id} ledger</button>)}
        </div>
        {goalLedgerView ? <>
          <p>Submitted paycheck allocations for {categories.find((c) => c.id === goalLedgerView)?.name || goalLedgerView}. Switch back to Progress at any time. Resetting a goal does not erase this history.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead><tr><th style={{ padding: 10 }}>Paycheck</th><th style={{ padding: 10 }}>Submitted</th><th style={{ padding: 10, textAlign: "right" }}>Allocated</th></tr></thead>
              <tbody>
                {[...planner.periods].filter((p) => p.submitted).reverse().map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid #273541" }}>
                    <td style={{ padding: 10 }}>{p.name}</td>
                    <td style={{ padding: 10 }}>{p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : "Submitted"}</td>
                    <td style={{ padding: 10, textAlign: "right" }}>{p.submittedAllocations?.[goalLedgerView] == null ? "Not recorded" : dollars(p.submittedAllocations[goalLedgerView] / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!planner.periods.some((p) => p.submitted) && <p>No submitted paychecks yet.</p>}
          <p><strong>Recorded total: {dollars(planner.periods.filter((p) => p.submitted).reduce((sum, p) => sum + (p.submittedAllocations?.[goalLedgerView] || 0), 0) / 100)}</strong></p>
          <p style={{ opacity: .7, fontSize: 12 }}>Older submissions may have missing allocation snapshots. History is stored in this browser only.</p>
        </> : <>
        <p>Set your own targets. Each goal keeps accumulating until you reset it. Progress represents paycheck allocations, not confirmed transfers or payments.</p>
        {GOAL_IDS.map((id) => {
          const goal = planner.goals?.[id] || DEFAULT_GOALS[id];
          const target = cleanAmount(goal.target);
          const allocated = (goal.allocatedCents || 0) / 100;
          const progress = target > 0 ? Math.min(100, allocated / target * 100) : 0;
          const label = categories.find((c) => c.id === id)?.name || id;
          return <div key={id} style={{ marginTop: 22 }}>
            <div className="finance-category-top"><strong>{label}</strong><span>{target > 0 ? progress.toFixed(0) + "%" : "Set a goal"}</span></div>
            <div role="progressbar" aria-label={label + " goal progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} style={{ height: 12, background: "#273541", borderRadius: 12, overflow: "hidden", margin: "10px 0" }}>
              <div style={{ height: "100%", width: progress + "%", background: id === "expenses" ? "#d5b46d" : id === "investments" ? "#699cf0" : "#3ad5aa", transition: "width .2s" }} />
            </div>
            <p>{dollars(allocated)} allocated of {target > 0 ? dollars(target) : "no target yet"}</p>
            <div className="finance-toolbar">
              <label>{label} goal ($) <input type="number" min="0" step="0.01" value={goal.target} placeholder="Enter goal" onChange={(e) => setPlanner((p) => ({ ...p, goals: { ...p.goals, [id]: { ...(p.goals?.[id] || DEFAULT_GOALS[id]), target: e.target.value } } }))} /></label>
              <button type="button" className="finance-add" onClick={() => {
                if (!window.confirm("Reset " + label + " progress? This will not delete transactions or change balances.")) return;
                setPlanner((p) => ({ ...p, goals: { ...p.goals, [id]: { ...(p.goals?.[id] || DEFAULT_GOALS[id]), allocatedCents: 0 } } }));
              }}>Reset progress</button>
            </div>
          </div>;
        })}
        </>}
      </article>
      )}
      {view === "dashboard" && (
        <>
      <div className="finance-tables">
        {categories.filter((category) => category.id !== "spend").map((category) => (
          <FinanceTable key={category.id} title={category.id === "expenses" ? "Recurring Monthly Expenses" : category.name} allocated={categoryAmount(category.id)} entries={entriesOf(category.id)} onAdd={() => addEntry(category.id)} onChange={changeEntry} onRemove={removeEntry} />
        ))}
      </div>
      <article className="finance-final">
        <span className="finance-kicker">PROJECTED SAFE TO SPEND · THIS PAYCHECK</span>
        <strong>{valid ? dollars(safeBalance) : "Allocation incomplete"}</strong>
        <p>{dollars(categoryAmount("spend"))} spending allocation for this paycheck.</p>
        <p>Staging Safe to Spend: {safeToSpend ? dollars(safeToSpend.safeToSpend) : "Not initialized"}. Secure paycheck credits and Gmail syncing are not yet enabled.</p>
      </article>
      <p className="finance-local-note">Planner history syncs to your staging account. Paycheck crediting and Gmail syncing are paused while account isolation is finalized.</p>
        </>
      )}
      </fieldset>
    </section>
  );
}
