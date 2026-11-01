import { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "@clerk/react";

const STORAGE_KEY = "spendly.finance-planner.v1";
const GOAL_IDS = ["expenses", "investments", "savings"];
const DEFAULT_GOALS = Object.fromEntries(GOAL_IDS.map((id) => [id, { target: "", allocatedCents: 0 }]));
const COLORS = ["#3ad5aa", "#d5b46d", "#699cf0", "#c68ee8", "#e68f7c", "#6fd0d9", "#b7bd73"];
const INITIAL = [
  { id: "spend", name: "Safe to Spend", percent: 40 },
  { id: "expenses", name: "Expenses", percent: 30 },
  { id: "investments", name: "Investments", percent: 30 },
  { id: "savings", name: "Savings", percent: 0 },
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
    if (saved && Array.isArray(saved.categories) && saved.categories.some((c) => c.id === "spend") && Array.isArray(saved.periods) && saved.periods.length) return { ...saved, goals: { ...DEFAULT_GOALS, ...saved.goals }, categories: rebalance(saved.categories, "spend", saved.categories.find((c) => c.id === "spend").percent) };
  } catch { /* corrupted storage: start fresh */ }
  return { goals: DEFAULT_GOALS, categories: INITIAL, periods: [{ id: makeId(), name: "Current paycheck", paycheck: "", entries: [] }], selected: null };
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
      <circle cx="220" cy="175" r="91" fill="none" stroke="#273541" strokeWidth="32" />
      {slices.map((s, i) => (
        s.end - s.start >= 359.99
          ? <circle key={s.id} cx="220" cy="175" r="91" fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="32" />
          : <path key={s.id} d={pathFor(s)} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="32" />
      ))}
      <text x="220" y="165" textAnchor="middle" fill="#95a7b2" fontSize="12">PAYCHECK</text>
      <text x="220" y="190" textAnchor="middle" fill="#f4fbff" fontSize="23" fontWeight="700">{dollars(paycheck)}</text>
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
  const actual = entries.reduce((sum, e) => sum + cleanAmount(e.actual), 0);
  const planned = entries.reduce((sum, e) => sum + cleanAmount(e.planned), 0);
  return (
    <article className="finance-panel finance-table-card">
      <span className="finance-kicker">PLANNED VS ACTUAL</span>
      <h3>{title}</h3>
      <p>Allocated: <strong>{dollars(allocated)}</strong></p>
      <div className="finance-grid-header"><span>Item</span><span>Planned</span><span>Actual</span><span></span></div>
      {entries.map((entry) => (
        <div className="finance-entry" key={entry.id}>
          <input aria-label={title + " item"} value={entry.name} placeholder="Item" onChange={(e) => onChange(entry.id, "name", e.target.value)} />
          <input aria-label="Planned amount" type="number" min="0" step="0.01" value={entry.planned} placeholder="0" onChange={(e) => onChange(entry.id, "planned", e.target.value)} />
          <input aria-label="Actual amount" type="number" min="0" step="0.01" value={entry.actual} placeholder="0" onChange={(e) => onChange(entry.id, "actual", e.target.value)} />
          <button type="button" className="finance-remove" onClick={() => onRemove(entry.id)} aria-label={"Remove " + entry.name}>×</button>
        </div>
      ))}
      <button type="button" className="finance-add" onClick={onAdd}>+ Add item</button>
      <div className="finance-table-totals"><span>Planned {dollars(planned)}</span><span>Actual {dollars(actual)}</span><span>Difference {dollars(planned - actual)}</span></div>
    </article>
  );
}

export default function FinanceDashboard({ safeToSpend, onBudgetSaved }) {
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
        setPlanner(remote || { goals: DEFAULT_GOALS, categories: INITIAL, periods: [{ id: makeId(), name: "Current paycheck", paycheck: "", entries: [] }], selected: null });
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
  const customCategories = useMemo(() => categories.filter((c) => !["spend", "expenses", "investments", "savings"].includes(c.id)), [categories]);
  return (
    <section className="finance-page">
      <p role="status" className="finance-local-note">{cloudStatus}</p>
      {cloudReady && !cloudHasData && <button type="button" className="finance-add" onClick={importBrowserHistory}>Import existing browser paycheck history</button>}
      <fieldset disabled={!cloudReady} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="finance-heading">
        <p className="eyebrow">YOUR FINANCIAL OVERVIEW</p>
        <h2>Dashboard</h2>
        <p>Plan your paycheck and see where every dollar is going.</p>
      </div>
      <div className="finance-toolbar">
        <label>Paycheck date <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label>
        <label>Paycheck amount ($) <input type="number" min="0" step="0.01" placeholder="Enter take-home pay" value={period.paycheck} disabled={Boolean(period.submitted)} onChange={(e) => updatePeriod({ paycheck: e.target.value })} /></label>
        {period.submitted && <button type="button" className="finance-add" onClick={() => {
          const id = makeId();
          setPlanner((p) => ({ ...p, selected: id, periods: [...p.periods, { id, name: "Paycheck " + (p.periods.length + 1), paycheck: "", entries: [] }] }));
          setPeriodStart(new Date().toLocaleDateString("en-CA"));
          setSyncMessage("");
        }}>+ Next paycheck</button>}
      </div>
      <div className="finance-live-sync">
        <div>
          <span className="finance-kicker">SHARED LIVE BUDGET</span>
          <h3>Submit paycheck</h3>
          <p>One submission updates your goal progress and adds {dollars(categoryAmount("spend"))} to your live Safe to Spend allocation. An existing live budget is required. Goal progress is currently stored in this browser until secure multi-user database support is ready.</p>
        </div>
        <button type="button" className="finance-add" disabled={savingLive || period.submitted || !valid || paycheck <= 0} onClick={saveLiveBudget}>{savingLive ? "Submitting…" : period.submitted ? "Paycheck submitted ✓" : "Submit Paycheck"}</button>
        {syncMessage && <p role="status">{syncMessage}</p>}
      </div>
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
                <span style={{ color: COLORS[i % COLORS.length] }}>{c.name}</span>
                <strong>{dollars(categoryAmount(c.id))}</strong>
              </div>
              <div className="finance-category-controls">
                <input aria-label={c.name + " allocation percentage"} type="range" min="0" max="100" step="1" value={c.percent} onChange={(e) => changeAllocation(c.id, e.target.value)} />
                <input aria-label={c.name + " percentage"} type="number" min="0" max="100" step="1" value={c.percent} onChange={(e) => changeAllocation(c.id, e.target.value)} />
                <span>%</span>
                {customCategories.some((x) => x.id === c.id) && <button type="button" className="finance-remove" onClick={() => updateCategories(rebalance(categories.filter((x) => x.id !== c.id), "spend", categories.find((x) => x.id === "spend")?.percent))}>×</button>}
              </div>
            </div>
          ))}
          <button type="button" className="finance-add" onClick={() => updateCategories([...categories, { id: makeId(), name: "Custom " + (customCategories.length + 1), percent: 0 }])}>+ Add category</button>
          {customCategories.map((c) => <label className="finance-custom-name" key={c.id}>Rename {c.name}<input value={c.name} onChange={(e) => updateCategories(categories.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))} /></label>)}
        </article>
      </div>
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
      <div className="finance-tables">
        {["expenses", "investments", "savings"].map((id) => (
          <FinanceTable key={id} title={categories.find((c) => c.id === id)?.name || id} allocated={categoryAmount(id)} entries={entriesOf(id)} onAdd={() => addEntry(id)} onChange={changeEntry} onRemove={removeEntry} />
        ))}
      </div>
      <article className="finance-final">
        <span className="finance-kicker">PROJECTED SAFE TO SPEND · THIS PAYCHECK</span>
        <strong>{valid ? dollars(safeBalance) : "Allocation incomplete"}</strong>
        <p>{dollars(categoryAmount("spend"))} spending allocation for this paycheck.</p>
        <p>Live Safe to Spend (including Gmail transactions): {safeToSpend ? dollars(safeToSpend.safeToSpend) : "Not loaded"}. Use “Submit Paycheck” above to sync your allocation.</p>
      </article>
      <p className="finance-local-note">Planner history is synced to staging PostgreSQL when the save status confirms success. Live Safe to Spend and Gmail transactions still use the shared production backend; do not invite other users yet.</p>
      </fieldset>
    </section>
  );
}
