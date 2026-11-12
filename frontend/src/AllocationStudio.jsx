import { useEffect, useMemo, useState } from "react";
import "./AllocationStudio.css";
import { sumExpenses, allocationTotal, rebalanceAllocations, paycheckAllocationsInCents } from "./allocationRules.js";

const DEFAULT_CATEGORIES = [
  { id: "investments", name: "Investments", kind: "investments", percent: 10 },
  { id: "emergency", name: "Emergency Fund", kind: "savings", percent: 10 },
  { id: "savings", name: "Savings", kind: "savings", percent: 10 },
  { id: "expenses", name: "Expenses", kind: "expenses", percent: 20 },
  { id: "safe", name: "Safe to Spend", kind: "safe", percent: 50 },
];
const SHADES = ["#7051ff", "#916afa", "#b69bff", "#d2baff", "#ede5ff", "#7262bd", "#ffb6d6"];
const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
const dateToday = () => new Date().toLocaleDateString("en-CA");
const uid = () => crypto.randomUUID();
const getCategories = planner => Array.isArray(planner?.allocationCategories) && planner.allocationCategories.length
  ? planner.allocationCategories : DEFAULT_CATEGORIES;
const validPercent = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const initialDemo = {
  categories: DEFAULT_CATEGORIES.map(c => ({ ...c, percent: ({ investments: 25, emergency: 20, savings: 15, expenses: 30, safe: 10 })[c.id] })),
  items: [{ id: "rent", name: "Rent", amount: 1200 }, { id: "phone", name: "Phone Bill", amount: 85 }, { id: "insurance", name: "Car Insurance", amount: 97 }],
  targets: { investments: 10000, emergency: 3000, savings: 3000, expenses: 1800 },
  paycheck: "4320",
  goalAmounts: { investments: 1080, emergency: 864, savings: 648, expenses: 1296 },
};

export default function AllocationStudio({ demo = false, page = "dashboard", planner, request, refresh, history = [], balance }) {
  const [snapshot, setSnapshot] = useState(() => {
    if (!demo) return null;
    try { return JSON.parse(localStorage.getItem("spendly-allocation-demo-v1")) || initialDemo; }
    catch { return initialDemo; }
  });
  const [categories, setCategories] = useState(() => getCategories(planner).map(c => ({ ...c })));
  const [items, setItems] = useState(() => planner?.expenseItems || []);
  const [targets, setTargets] = useState({});
  const [paycheck, setPaycheck] = useState("");
  const [paycheckDate, setPaycheckDate] = useState(dateToday());
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState("savings");
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [periodId, setPeriodId] = useState(uid);
  const [previewPage, setPreviewPage] = useState("dashboard");
  const [archivedNotice, setArchivedNotice] = useState("");

  useEffect(() => {
    if (!demo) {
      setCategories(getCategories(planner).map(c => ({ ...c })));
      setItems(Array.isArray(planner?.expenseItems) ? planner.expenseItems : []);
      setTargets(Object.fromEntries(getCategories(planner)
        .filter(c => c.kind !== "safe")
        .map(c => [c.id, String(planner?.goals?.[c.id]?.target ?? 0)])));
    }
  }, [planner, demo]);

  useEffect(() => {
    if (demo && snapshot) {
      setCategories(snapshot.categories);
      setItems(snapshot.items);
      setTargets(Object.fromEntries(Object.entries(snapshot.targets || {}).map(([k, v]) => [k, String(v)])));
      setPaycheck(snapshot.paycheck);
    }
  }, [demo]); // only initialize the branch-only preview once

  const displayedPage = demo ? previewPage : page;
  const latestPaycheck = demo ? Number(paycheck) : (Number(history?.[0]?.paycheck) || 0);
  const paycheckForAllocation = Number(paycheck || 0) > 0 ? Number(paycheck) : latestPaycheck;
  const total = allocationTotal(categories);
  const safePercent = categories.find(c => c.kind === "safe")?.percent ?? 0;
  const allocatedGoals = demo ? (snapshot?.goalAmounts || {}) : Object.fromEntries(
    categories.map(c => [c.id, (Number(planner?.goals?.[c.id]?.allocatedCents) || 0) / 100])
  );
  const allocatedExpenses = categories.filter(c => c.kind === "expenses").reduce((sum, c) => sum + (Number(allocatedGoals[c.id]) || 0), 0);
  const plannedBills = sumExpenses(items);
  const draftSafe = paycheckForAllocation * safePercent / 100;

  const persistDemo = patch => {
    if (!demo) return;
    const next = { ...(snapshot || initialDemo), categories, items, targets: Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, Number(v) || 0])), paycheck, ...patch };
    setSnapshot(next);
    localStorage.setItem("spendly-allocation-demo-v1", JSON.stringify(next));
  };

  // Keep the safe-to-spend remainder in sync. When the safe slider itself
  // moves, compensate in other categories without allowing negative shares.
  const moveSlider = (id, nextValue) => {
    setMessage("");
    setCategories(previous => rebalanceAllocations(previous,id,nextValue));
  };

  const addCategory = event => {
    event.preventDefault();
    const name = editName.trim();
    if (!name || name.length > 40 || categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setMessage("Choose a unique category name (40 characters or less)."); return;
    }
    setCategories(prev => [...prev.slice(0, -1), { id: uid(), name, kind: editKind, percent: 0 }, prev[prev.length - 1]]);
    setEditName("");
    setMessage("Category added. Set its percentage, then save your plan.");
  };
  const removeCategory = category => {
    if (category.kind === "safe") return;
    if ((Number(allocatedGoals[category.id]) || 0) > 0) {
      setArchivedNotice(category.name + " was archived. Its previous contributions remain in your history.");
    }
    setCategories(prev => {
      const safe = prev.find(c => c.kind === "safe");
      return prev.filter(c => c.id !== category.id).map(c => c.id === safe.id ? { ...c, percent: c.percent + category.percent } : c);
    });
    setMessage("Category removed from the draft. Save the plan to keep this change.");
  };

  const savePlanner = async (changes = {}) => {
    if (demo) {
      persistDemo(changes);
      setMessage("Preview saved locally in this browser. No live accounts were changed.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const base = (await request("/api/planner")) || { periods: [], categories: [], goals: {} };
      if (categories.filter(c => c.kind === "safe").length !== 1 || total !== 100 ||
          categories.some(c => !c.name.trim()) ||
          new Set(categories.map(c => c.name.trim().toLowerCase())).size !== categories.length)
        throw new Error("Keep one Safe to Spend category and unique names totaling 100%.");
      const nextGoals = { ...(base.goals || {}) };
      const active = new Set(categories.map(c => c.id));
      for (const [id, goal] of Object.entries(nextGoals)) {
        if (goal && !active.has(id) && goal.kind) {
          nextGoals[id] = { ...goal, archived: true };
        }
      }
      for (const c of categories) {
        if (c.kind === "safe") continue;
        const target = c.kind === "expenses" ? sumExpenses(items) : Number(targets[c.id] || 0);
        if (!Number.isFinite(target) || target < 0 || target > 9999999999) throw new Error("Check goal target amounts.");
        nextGoals[c.id] = { ...(nextGoals[c.id] || {}), target, name: c.name.trim(), kind: c.kind, archived: false };
      }
      await request("/api/planner", { method: "PUT", body: JSON.stringify({
        ...base, ...changes, allocationCategories: categories, expenseItems: items,
        goals: nextGoals, periods: base.periods || [], categories: base.categories || [],
      }) });
      await refresh();
      setMessage("Saved. Future paychecks will use these allocations; existing balances aren't changed.");
    } catch (error) { setMessage(error.message || "Unable to save plan."); }
    finally { setBusy(false); }
  };

  const addExpense = event => {
    event.preventDefault();
    const value = Number(expenseAmount);
    if (!expenseName.trim() || !Number.isFinite(value) || value <= 0 || value > 999999999) {
      setMessage("Enter an expense name and a positive amount."); return;
    }
    setItems(prev => [...prev, { id: uid(), name: expenseName.trim().slice(0, 60), amount: Math.round(value * 100) / 100 }]);
    setExpenseName("");
    setExpenseAmount("");
    setMessage("Expense added to the draft. Save your plan to keep it.");
  };

  const savePaycheck = async event => {
    event.preventDefault();
    if (demo) { persistDemo({ paycheck, goalAmounts: Object.fromEntries(categories.filter(c => c.kind !== "safe").map(c => [c.id, Math.round(Number(paycheck || 0) * c.percent) / 100])) }); setMessage("Sample paycheck allocations updated. Safe to Spend balance is unchanged."); return; }
    const amount = Number(paycheck);
    if (total !== 100 || !Number.isFinite(amount) || amount <= 0 || amount > 9999999999 || !/^\d+(\.\d{1,2})?$/.test(paycheck.trim()) || paycheckDate > dateToday()) {
      setMessage("Enter a valid paycheck amount and date."); return;
    }
    setBusy(true); setMessage("");
    try {
      const planned = paycheckAllocationsInCents(amount,categories);
      const safeCents = planned.plannedSafeCents;
      await request("/api/account/safe-to-spend/planned-paychecks", { method: "POST",
        body: JSON.stringify({ periodId, paycheck: amount, safeCredit: 0, paycheckDate }) });
      // A fresh GET avoids overwriting edits made in another tab.
      const base = (await request("/api/planner")) || { periods: [], categories: [], goals: {} };
      if (!(base.goalCreditPeriods || {})[periodId]) {
        const goals = { ...(base.goals || {}) };
        const nonSafe = categories.filter(c => c.kind !== "safe");
        for (let i = 0; i < nonSafe.length; i++) {
          const c = nonSafe[i];
          const cents = planned.goals[c.id];
          goals[c.id] = { ...(goals[c.id] || {}), name: c.name, kind: c.kind,
            target: Number(targets[c.id] || goals[c.id]?.target || 0),
            allocatedCents: (Number(goals[c.id]?.allocatedCents) || 0) + cents };
        }
        await request("/api/planner", { method: "PUT", body: JSON.stringify({
          ...base, periods: base.periods || [], categories: base.categories || [],
          goals, expenseItems: items, allocationCategories: categories,
          goalCreditPeriods: { ...(base.goalCreditPeriods || {}), [periodId]: true },
        }) });
      }
      await refresh();
      setPaycheck(""); setPeriodId(uid());
      setMessage("Paycheck recorded for planning. All goal buckets updated; your actual Safe to Spend balance was not changed.");
    } catch (error) { setMessage((error.message || "Unable to save paycheck.") + " Check paycheck history before retrying; the same payment ID is preserved."); }
    finally { setBusy(false); }
  };

  const conic = useMemo(() => {
    let offset = 0;
    return "conic-gradient(" + categories.map((c, i) => {
      const end = offset + Number(c.percent || 0);
      const section = SHADES[i % SHADES.length] + " " + offset + "% " + end + "%";
      offset = end;
      return section;
    }).join(", ") + ")";
  }, [categories]);

  return <div className="allocation-studio">
    {demo && <div className="allocation-demo-banner"><strong>Feature preview</strong> · Sample data and local edits only. Nothing here touches your live Spendly.
      <div><button onClick={() => setPreviewPage("dashboard")}>Dashboard</button><button onClick={() => setPreviewPage("goals")}>Goals</button><button onClick={() => setPreviewPage("safe")}>Safe to Spend</button></div>
    </div>}
    {message && <p className="allocation-message" role="status">{message}</p>}

    {displayedPage === "safe" && demo ? <SafeToSpendDemo snapshot={snapshot || initialDemo} update={patch => persistDemo(patch)} /> : displayedPage === "dashboard" ? <>
      <div className="allocation-page-title"><span className="finance-kicker">PAYCHECK</span>
        <h2>{money(paycheckForAllocation)}</h2><p>Allocate your paycheck across goals and spending.</p>
      </div>
      <section className="allocation-chart-card">
        <div className="allocation-donut" style={{ background: conic }}><div><strong>{money(paycheckForAllocation)}</strong><small>Paycheck</small></div></div>
        <div className="allocation-legend">{categories.map((c, i) =>
          <div key={c.id}><i style={{ background: SHADES[i % SHADES.length] }} /><span>{c.name}</span><strong>{c.percent}%</strong><b>{money(paycheckForAllocation * c.percent / 100)}</b></div>)}
        </div>
      </section>
      <section className="allocation-card"><div className="allocation-card-head"><h3>Allocate Your Paycheck</h3><span className={total === 100 ? "allocation-valid" : "allocation-error"}>Total: {total}% {total === 100 ? "✓" : "!"}</span></div>
        <p className="allocation-hint">Your percentages always total 100%. Changes to the Safe to Spend slider are planning-only and never change your actual spendable balance.</p>
        {categories.map((c, i) => <div className="allocation-slider-row" key={c.id}>
          <span className="allocation-category-symbol" style={{ color: SHADES[i % SHADES.length] }}>●</span>
          <input className="allocation-category-name" aria-label={"Category name for " + c.name} value={c.name}
            onChange={e => setCategories(prev => prev.map(x => x.id === c.id ? { ...x, name: e.target.value.slice(0, 40) } : x))} />
          <input type="range" aria-label={c.name + " percentage"} min="0" max="100" step="1" value={c.percent} onChange={e => moveSlider(c.id, e.target.value)} />
          <strong>{c.percent}%</strong><b>{money(paycheckForAllocation * c.percent / 100)}</b>
          <button type="button" title={c.kind === "safe" ? "Safe to Spend must stay in the plan" : "Remove category"}
            disabled={c.kind === "safe"} onClick={() => removeCategory(c)}>×</button>
        </div>)}
        <form className="allocation-add-category" onSubmit={addCategory}>
          <input aria-label="New allocation category" placeholder="New category (e.g. Travel)" value={editName} onChange={e => setEditName(e.target.value)} maxLength={40} />
          <select aria-label="Goal group" value={editKind} onChange={e => setEditKind(e.target.value)}>
            <option value="savings">Savings goal</option><option value="investments">Investment goal</option><option value="expenses">Expenses / bills</option><option value="other">Other goal (e.g. retirement)</option>
          </select><button type="submit">+ Category</button>
        </form>
        <button className="allocation-main-button" disabled={busy || total !== 100} onClick={() => savePlanner()}>{busy ? "Saving…" : "Save allocation plan"}</button>
      </section>
      <section className="allocation-card"><div className="allocation-card-head"><div><h3>Expenses Bucket</h3><p>Plan your bills and add their targets to the Goals tab.</p></div><strong>{money(plannedBills)} planned</strong></div>
        <div className="allocation-expenses">{items.map(item => <div key={item.id}>
          <input aria-label={"Name for " + item.name} value={item.name} onChange={e => setItems(prev => prev.map(x => x.id === item.id ? { ...x, name: e.target.value.slice(0, 60) } : x))} />
          <input aria-label={"Amount for " + item.name} type="number" step="0.01" min="0.01" value={item.amount} onChange={e => setItems(prev => prev.map(x => x.id === item.id ? { ...x, amount: e.target.value } : x))} />
          <button type="button" aria-label={"Remove " + item.name} onClick={() => setItems(prev => prev.filter(x => x.id !== item.id))}>×</button></div>)}
          {!items.length && <p>No planned expenses yet. Add your first one below.</p>}
        </div>
        <form className="allocation-add-expense" onSubmit={addExpense}>
          <input placeholder="Expense name" aria-label="Expense name" value={expenseName} onChange={e => setExpenseName(e.target.value)} />
          <input placeholder="Amount ($)" aria-label="Expense amount" type="number" step="0.01" min="0.01" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} />
          <button type="submit">+ Add expense</button>
        </form>
        <button className="allocation-secondary-button" disabled={busy} onClick={() => savePlanner()}>Save expense list</button>
      </section>
      <section className="allocation-card allocation-check-entry"><div><h3>{demo ? "Try a paycheck amount" : "Record a paycheck"}</h3><p>{demo ? "Change this sample value to preview how each bucket responds." : "Uses your saved percentages. Your Safe to Spend balance is always adjusted separately."}</p></div>
        <form onSubmit={savePaycheck}>
          <input type="number" aria-label="Paycheck amount" min="0.01" step="0.01" placeholder="Paycheck amount" value={paycheck} onChange={e => setPaycheck(e.target.value)} />
          {!demo && <input type="date" aria-label="Paycheck date" max={dateToday()} value={paycheckDate} onChange={e => setPaycheckDate(e.target.value)} />}
          <button disabled={busy || total !== 100} type="submit">{demo ? "Update preview" : busy ? "Saving…" : "Update paycheck allocations"}</button>
        </form>
      </section>
    </> : <>
      <div className="allocation-page-title"><span className="finance-kicker">YOUR GOALS</span><h2>Goals</h2><p>Track investments, savings, and expense buckets. Names follow your allocation categories.</p></div>
      {["savings", "investments", "expenses", "other"].map(group => {
        const groupCategories = categories.filter(c => c.kind === group);
        if (!groupCategories.length) return null;
        return <section key={group} className="allocation-card allocation-goal-card">
          <div className="allocation-card-head"><h3>{({ savings: "Savings Goals", investments: "Investment Goals", expenses: "Expense Goals", other: "Other Goals" })[group]}</h3><span>Linked to allocations</span></div>
          {groupCategories.map(c => {
            const funded = Number(allocatedGoals[c.id]) || 0;
            const target = group === "expenses" ? plannedBills : Number(targets[c.id]) || 0;
            const progress = target > 0 ? Math.min(100, funded / target * 100) : 0;
            return <div className="allocation-goal-entry" key={c.id}>
              <div><strong>{c.name}</strong><span>{money(funded)} / {money(target)} · {Math.round(progress)}%</span></div>
              <progress value={progress} max="100" />
              {group === "expenses"
                ? <div className="allocation-linked-total"><span>Expense target · from Dashboard items</span><strong>{money(plannedBills)}</strong></div>
                : <label>Target ($)<input type="number" min="0" step="0.01" value={targets[c.id] ?? "0"} onChange={e => setTargets(prev => ({ ...prev, [c.id]: e.target.value }))} /></label>}
            </div>;
          })}
          <p className="allocation-hint">{group === "expenses" ? "The expense target updates automatically when you add, edit, or remove expenses on Dashboard. Your allocated amount tracks paycheck contributions." : "Goal allocations represent planned contributions, not verified bank transfers."}</p>
        </section>;
      })}
      {archivedNotice && <p className="allocation-message">{archivedNotice}</p>}
      <div className="allocation-goal-actions"><button className="allocation-main-button" disabled={busy} onClick={() => savePlanner()}>{busy ? "Saving…" : "Save goal targets"}</button></div>
    </>}
  </div>;
}


const DEMO_TRANSACTIONS = [
  { id:"demo-coffee", merchant:"Coffee Shop", amount:12.89, occurredOn:"2026-11-11", time:"9:24 AM", last4:"7421" },
  { id:"demo-uber", merchant:"Uber", amount:18.50, occurredOn:"2026-11-10", time:"8:59 PM", last4:"5793" },
  { id:"demo-market", merchant:"Market", amount:16.43, occurredOn:"2026-11-09", time:"4:21 PM", last4:"8841" },
  { id:"demo-food", merchant:"Whole Foods", amount:36.20, occurredOn:"2026-11-08", time:"2:10 PM", last4:"7421" },
  { id:"demo-stream", merchant:"Streaming", amount:15.99, occurredOn:"2026-11-07", time:"11:14 AM", last4:"8841" },
  { id:"demo-fuel", merchant:"Gas Station", amount:42.00, occurredOn:"2026-11-06", time:"5:22 PM", last4:"5793" },
  { id:"demo-phone", merchant:"Phone Bill", amount:85.00, occurredOn:"2026-11-05", time:"7:00 AM", last4:"7421" },
];

function SafeToSpendDemo({ snapshot, update }) {
  const base = snapshot.baseline || { amount:500, date:"2026-11-07" };
  const adjustments = snapshot.adjustments || [];
  const [activePanel,setActivePanel] = useState("");
  const [amount,setAmount] = useState(String(base.amount));
  const [startDate,setStartDate] = useState(base.date);
  const [adjustAmount,setAdjustAmount] = useState("");
  const [note,setNote] = useState("");
  const [occurredOn,setOccurredOn] = useState(dateToday());
  const [notice,setNotice] = useState("");
  const [viewMore,setViewMore] = useState(false);
  const [activityFilter,setActivityFilter] = useState("all");
  const mockTransactions = snapshot.mockTransactions || DEMO_TRANSACTIONS;
  const counted = mockTransactions.filter(t => t.occurredOn >= base.date);
  const spent = counted.reduce((sum,t) => sum + Number(t.amount),0);
  const newerAdjustments = adjustments.slice(snapshot.adjustmentOffset || 0);
  const allocated = Number(base.amount) + newerAdjustments.reduce((sum,a) => sum + Number(a.amount),0);
  const balance = allocated - spent;
  const prettyDate = day => new Date(day + "T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  const open = panel => {
    setActivePanel(panel);
    setNotice("");
    if (panel === "budget") {setAmount(String(base.amount));setStartDate(base.date);}
    if (panel === "money") {setAdjustAmount("");setNote("");setOccurredOn(dateToday());}
  };
  const saveBase = event => {
    event.preventDefault();
    const value=Number(amount);
    if(!/^-?\d+(\.\d{1,2})?$/.test(amount.trim()) || !Number.isFinite(value) ||
      Math.abs(value) > 9999999999.99 || !startDate || startDate>dateToday()){
      setNotice("Enter a valid amount and a tracking date no later than today.");return;
    }
    update({baseline:{amount:value,date:startDate},adjustmentOffset:adjustments.length});
    setActivePanel("");
    setNotice("Starting balance and tracking date updated in this preview. Past activity remains in history.");
  };
  const saveAdjust = event => {
    event.preventDefault();
    const value=Number(adjustAmount);
    if(!/^-?\d+(\.\d{1,2})?$/.test(adjustAmount.trim()) || !Number.isFinite(value) ||
      value === 0 || !note.trim() || note.trim().length>200 || !occurredOn || occurredOn>dateToday()){
      setNotice("Enter a nonzero amount, a note, and a valid date.");return;
    }
    update({adjustments:[...adjustments,{id:uid(),amount:value,note:note.trim(),occurredOn,createdAt:new Date().toISOString()}]});
    setActivePanel("");
    setNotice("Money adjustment saved in the preview.");
  };
  const ledger=[
    ...mockTransactions.map(t=>({id:t.id,title:t.merchant,date:t.occurredOn,time:t.time,last4:t.last4,amount:-Number(t.amount),type:"transaction",counted:t.occurredOn>=base.date})),
    ...adjustments.map(a=>({id:a.id,title:a.note,date:a.occurredOn,time:"Manual entry",amount:Number(a.amount),type:"adjustment",counted:true}))
  ].filter(entry => activityFilter==="all" || (activityFilter==="transactions" && entry.type==="transaction") ||
    (activityFilter==="money" && entry.type==="adjustment"))
    .sort((a,b)=>b.date.localeCompare(a.date) || ((a.type==="adjustment")?-1:1));
  const shown=viewMore?ledger:ledger.slice(0,5);
  return <div className="spendly-preview-safe">
    <section className="spendly-preview-hero">
      <div className="spendly-preview-hero-top"><span>SAFE TO SPEND</span><span>Since {prettyDate(base.date)}</span></div>
      <h2 className={balance<0?"spendly-preview-negative":"spendly-preview-positive"}>{money(balance)}</h2>
      <p>Available without touching the rest of your money.</p>
      <div className="spendly-preview-stats">
        <div><span>Budget</span><strong>{money(allocated)}</strong></div>
        <div><span>Spent</span><strong>{money(spent)}</strong></div>
      </div>
    </section>
    <div className="spendly-preview-actions">
      <button className="spendly-preview-refresh" onClick={()=>setNotice("Preview refreshed. These are sample transactions; no Gmail account was accessed.")}>↻ <span>Refresh Transactions</span></button>
      <button onClick={()=>open("money")}>＋ Add Money</button>
      <button onClick={()=>open("budget")}>Edit Budget</button>
    </div>
    {notice && <p role="status" className="allocation-message">{notice}</p>}
    <section className="spendly-preview-activity">
      <div className="spendly-preview-activity-head"><div><span>CURRENT PERIOD</span><h3>Recent Activity</h3></div><small>Sample ledger</small></div>
      <div className="spendly-preview-filters">
        {[["all","All Activity"],["transactions","Transactions"],["money","Money Added"]].map(([id,label])=>
          <button type="button" key={id} className={activityFilter===id?"active":""} onClick={()=>{setActivityFilter(id);setViewMore(false)}}>{label}</button>)}
      </div>
      <div className="spendly-preview-ledger">
        {shown.map(entry=><div key={entry.id} className="spendly-preview-entry">
          <div className="spendly-preview-entry-icon">{entry.type==="transaction"?"▣":entry.amount>0?"+":"−"}</div>
          <div className="spendly-preview-entry-detail"><strong>{entry.title}</strong><small>{prettyDate(entry.date)} · {entry.time}{entry.last4?" · •••• "+entry.last4:""}</small>
            {!entry.counted && <small className="spendly-preview-excluded">Before tracking start — not counted</small>}</div>
          <strong className={entry.amount>=0?"spendly-preview-positive":"spendly-preview-negative"}>{entry.amount>0?"+":""}{money(entry.amount)}</strong>
        </div>)}
        {!shown.length && <p className="spendly-preview-empty">No activity in this view yet. Try Add Money above.</p>}
      </div>
      {ledger.length>5 && <button type="button" className="spendly-preview-more" onClick={()=>setViewMore(v=>!v)}>{viewMore?"Show Less ↑":"View More →"}</button>}
    </section>
    {activePanel && <div className="spendly-preview-overlay" role="presentation" onClick={()=>setActivePanel("")}>
      <section className="spendly-preview-modal" role="dialog" aria-modal="true" aria-labelledby="spendly-preview-dialog" onClick={e=>e.stopPropagation()}>
        <div className="spendly-preview-modal-head"><h3 id="spendly-preview-dialog">{activePanel==="budget"?"Edit Budget":"Add / Remove Money"}</h3><button type="button" aria-label="Close" onClick={()=>setActivePanel("")}>×</button></div>
        {activePanel==="budget"?<>
          <p>Set your starting balance and the date to begin counting transactions.</p>
          <form onSubmit={saveBase}>
            <label>Starting balance<input type="number" aria-label="Starting balance" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} required /></label>
            <label>Count transactions from<input type="date" aria-label="Count transactions from" value={startDate} max={dateToday()} onChange={e=>setStartDate(e.target.value)} required /></label>
            <p className="spendly-preview-modal-note">Previous entries stay in the ledger. Your spendable total is recalculated from this baseline.</p>
            <div className="spendly-preview-modal-buttons"><button type="button" onClick={()=>setActivePanel("")}>Cancel</button><button type="submit">Save Changes</button></div>
          </form>
        </>:<>
          <p>Add or subtract money manually, with a reason and date.</p>
          <form onSubmit={saveAdjust}>
            <label>Amount (+/−)<input aria-label="Adjustment amount" type="number" step=".01" placeholder="+75 or -40" value={adjustAmount} onChange={e=>setAdjustAmount(e.target.value)} required /></label>
            <label>Reason / note
              <select aria-label="Suggested note" value={["Paycheck","Zelle for food","Refund","Barbering income"].includes(note)?note:"custom"} onChange={e=>setNote(e.target.value==="custom"?"":e.target.value)}>
                <option value="custom">Custom note…</option>
                <option value="Paycheck">Paycheck</option><option value="Zelle for food">Zelle for food</option>
                <option value="Refund">Refund</option><option value="Barbering income">Barbering income</option>
              </select>
              <input aria-label="Reason note" value={note} onChange={e=>setNote(e.target.value)} maxLength={200} placeholder="Why are you changing your balance?" required />
            </label>
            <label>When it happened<input type="date" aria-label="Adjustment date" max={dateToday()} value={occurredOn} onChange={e=>setOccurredOn(e.target.value)} required /></label>
            <div className="spendly-preview-modal-buttons"><button type="button" onClick={()=>setActivePanel("")}>Cancel</button><button type="submit">Save Adjustment</button></div>
          </form>
        </>}
      </section>
    </div>}
  </div>;
}
