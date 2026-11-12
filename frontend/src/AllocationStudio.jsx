import { useEffect, useMemo, useState } from "react";
import "./AllocationStudio.css";

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
  const total = categories.reduce((sum, c) => sum + (Number(c.percent) || 0), 0);
  const safePercent = categories.find(c => c.kind === "safe")?.percent ?? 0;
  const allocatedGoals = demo ? (snapshot?.goalAmounts || {}) : Object.fromEntries(
    categories.map(c => [c.id, (Number(planner?.goals?.[c.id]?.allocatedCents) || 0) / 100])
  );
  const allocatedExpenses = categories.filter(c => c.kind === "expenses").reduce((sum, c) => sum + (Number(allocatedGoals[c.id]) || 0), 0);
  const plannedBills = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
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
    setCategories(previous => {
      const next = previous.map(c => ({ ...c }));
      const active = next.find(c => c.id === id);
      const safe = next.find(c => c.kind === "safe");
      if (!active || !safe) return previous;
      const target = validPercent(nextValue);
      if (active.id !== safe.id) {
        const change = Math.max(-active.percent, Math.min(target - active.percent, safe.percent));
        active.percent += change;
        safe.percent -= change;
      } else {
        const others = next.filter(c => c.kind !== "safe").sort((a, b) => b.percent - a.percent);
        let change = target - safe.percent;
        if (change > 0) {
          for (const other of others) {
            const taken = Math.min(change, other.percent);
            other.percent -= taken;
            change -= taken;
            if (!change) break;
          }
          safe.percent = target - change;
        } else if (others.length) {
          others[0].percent += -change;
          safe.percent = target;
        }
      }
      return next;
    });
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
        const target = Number(targets[c.id] || 0);
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
      const safeCents = Math.round(amount * safePercent);
      await request("/api/account/safe-to-spend/planned-paychecks", { method: "POST",
        body: JSON.stringify({ periodId, paycheck: amount, safeCredit: 0, paycheckDate }) });
      // A fresh GET avoids overwriting edits made in another tab.
      const base = (await request("/api/planner")) || { periods: [], categories: [], goals: {} };
      if (!(base.goalCreditPeriods || {})[periodId]) {
        const goals = { ...(base.goals || {}) };
        const payoutCents = Math.round(amount * 100);
        let remaining = payoutCents - safeCents;
        const nonSafe = categories.filter(c => c.kind !== "safe");
        for (let i = 0; i < nonSafe.length; i++) {
          const c = nonSafe[i];
          const cents = i === nonSafe.length - 1 ? remaining : Math.min(remaining, Math.round(payoutCents * c.percent / 100));
          remaining -= cents;
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
            const target = Number(targets[c.id]) || (group === "expenses" ? plannedBills : 0);
            const progress = target > 0 ? Math.min(100, funded / target * 100) : 0;
            return <div className="allocation-goal-entry" key={c.id}>
              <div><strong>{c.name}</strong><span>{money(funded)} / {money(target)} · {Math.round(progress)}%</span></div>
              <progress value={progress} max="100" />
              <label>Target ($)<input type="number" min="0" step="0.01" value={targets[c.id] ?? (group === "expenses" ? String(plannedBills) : "0")} onChange={e => setTargets(prev => ({ ...prev, [c.id]: e.target.value }))} /></label>
            </div>;
          })}
          <p className="allocation-hint">Goal allocations represent planned contributions, not verified bank transfers.</p>
        </section>;
      })}
      {archivedNotice && <p className="allocation-message">{archivedNotice}</p>}
      <div className="allocation-goal-actions"><button className="allocation-main-button" disabled={busy} onClick={() => savePlanner()}>{busy ? "Saving…" : "Save goal targets"}</button></div>
    </>}
  </div>;
}


function SafeToSpendDemo({ snapshot, update }) {
  const base = snapshot.baseline || { amount: 500, date: dateToday() };
  const adjustments = snapshot.adjustments || [];
  const [amount, setAmount] = useState(String(base.amount));
  const [startDate, setStartDate] = useState(base.date);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [note, setNote] = useState("");
  const [occurredOn, setOccurredOn] = useState(dateToday());
  const [notice, setNotice] = useState("");
  const balance = Number(base.amount) + adjustments.slice(snapshot.adjustmentOffset || 0).reduce((sum, a) => sum + Number(a.amount), 0);
  const saveBase = e => {
    e.preventDefault();
    if (startDate > dateToday() || !Number.isFinite(Number(amount))) { setNotice("Choose a valid amount and date."); return; }
    update({ baseline: { amount: Number(amount), date: startDate }, adjustmentOffset: adjustments.length });
    setNotice("Demo baseline updated. Earlier adjustments remain in history and are not reapplied.");
  };
  const saveAdjust = e => {
    e.preventDefault();
    const value = Number(adjustAmount);
    if (!value || !Number.isFinite(value) || !note.trim() || occurredOn > dateToday()) {
      setNotice("Enter a nonzero amount, note, and valid date."); return;
    }
    update({ adjustments: [...adjustments, { id: uid(), amount: value, note: note.trim(), occurredOn }] });
    setAdjustAmount(""); setNote("");
    setNotice("Demo adjustment saved locally.");
  };
  return <>
    <div className="allocation-page-title"><span className="finance-kicker">SPENDING · MANUALLY MANAGED</span>
      <h2>Safe to Spend</h2><p>Set your actual balance yourself. Paycheck sliders only plan what you intend to spend.</p></div>
    <section className="allocation-card allocation-demo-safe-total"><span className="finance-kicker">CURRENT AVAILABLE BALANCE</span>
      <h2>{money(balance)}</h2><p>Tracking from {base.date} · Sample Gmail deductions: {money(0)}</p>
    </section>
    {notice && <p role="status" className="allocation-message">{notice}</p>}
    <section className="allocation-card"><div className="allocation-card-head"><h3>Set starting balance & date</h3></div>
      <form className="allocation-add-expense" onSubmit={saveBase}>
        <label>Starting balance ($)<input aria-label="Starting balance" type="number" step=".01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Count transactions from<input aria-label="Transaction start date" type="date" max={dateToday()} value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
        <button type="submit">Set baseline</button>
      </form>
      <p className="allocation-hint">On the live app, old adjustments and Gmail history are preserved when a new baseline is set; the preview keeps them in history without applying them twice.</p>
    </section>
    <section className="allocation-card"><div className="allocation-card-head"><h3>Add / Remove money</h3></div>
      <form className="allocation-add-expense" onSubmit={saveAdjust}>
        <label>Amount (+/−)<input aria-label="Adjustment amount" type="number" step=".01" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="+75 or -40" required /></label>
        <label>Note<input aria-label="Adjustment note" value={note} onChange={e => setNote(e.target.value)} placeholder="Paycheck, Zelle for food…" maxLength={200} required /></label>
        <label>When it happened<input aria-label="Adjustment date" type="date" max={dateToday()} value={occurredOn} onChange={e => setOccurredOn(e.target.value)} required /></label>
        <button type="submit">Save adjustment</button>
      </form>
    </section>
    <section className="allocation-card"><div className="allocation-card-head"><h3>Money history</h3></div>
      {adjustments.length ? adjustments.slice().reverse().map(a => <div className="allocation-demo-history" key={a.id}>
        <div><strong>{a.note}</strong><small>{a.occurredOn}</small></div>
        <strong style={{ color: Number(a.amount) < 0 ? "#ffb3bc" : "#8be6bd" }}>{Number(a.amount) > 0 ? "+" : ""}{money(a.amount)}</strong>
      </div>) : <p>No manual adjustments yet.</p>}
    </section>
  </>;
}
