import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "spendly.finance-planner.v1";
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

function loadPlanner() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.categories) && Array.isArray(saved.periods)) return saved;
  } catch { /* corrupted storage: start fresh */ }
  return { categories: INITIAL, periods: [{ id: makeId(), name: "Current paycheck", paycheck: "", entries: [] }], selected: null };
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

export default function FinanceDashboard({ safeToSpend }) {
  const [planner, setPlanner] = useState(loadPlanner);
  const [notice, setNotice] = useState("");
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(planner)); }, [planner]);
  const period = planner.periods.find((p) => p.id === planner.selected) || planner.periods[0];
  const paycheck = cleanAmount(period?.paycheck);
  const categories = planner.categories;
  const percentTotal = categories.reduce((sum, c) => sum + (Number(c.percent) || 0), 0);
  const updatePeriod = (patch) => setPlanner((p) => ({ ...p, periods: p.periods.map((v) => v.id === period.id ? { ...v, ...patch } : v) }));
  const updateCategories = (next) => setPlanner((p) => ({ ...p, categories: next }));
  const categoryAmount = (id) => paycheck * (Number(categories.find((c) => c.id === id)?.percent) || 0) / 100;
  const entriesOf = (id) => (period.entries || []).filter((e) => e.categoryId === id);
  const changeEntry = (id, field, value) => updatePeriod({ entries: period.entries.map((e) => e.id === id ? { ...e, [field]: value } : e) });
  const removeEntry = (id) => updatePeriod({ entries: period.entries.filter((e) => e.id !== id) });
  const addEntry = (id) => updatePeriod({ entries: [...period.entries, { id: makeId(), categoryId: id, name: "", planned: "", actual: "" }] });
  const spent = entriesOf("spend").reduce((sum, e) => sum + cleanAmount(e.actual), 0);
  const safeBalance = categoryAmount("spend") - spent;
  const valid = Math.abs(percentTotal - 100) < 0.001;
  const exportData = () => {
    const blob = new Blob([JSON.stringify(planner, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "spendly-budget-backup.json"; link.click();
    URL.revokeObjectURL(url);
  };
  const customCategories = useMemo(() => categories.filter((c) => !["spend", "expenses", "investments", "savings"].includes(c.id)), [categories]);
  return (
    <section className="finance-page">
      <div className="finance-heading">
        <p className="eyebrow">YOUR FINANCIAL OVERVIEW</p>
        <h2>Dashboard</h2>
        <p>Plan your paycheck and see where every dollar is going.</p>
      </div>
      <div className="finance-toolbar">
        <label>Pay period
          <select value={period.id} onChange={(e) => setPlanner((p) => ({ ...p, selected: e.target.value }))}>
            {planner.periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button type="button" className="finance-add" onClick={() => {
          const id = makeId();
          setPlanner((p) => ({ ...p, selected: id, periods: [...p.periods, { id, name: "Paycheck " + (p.periods.length + 1), paycheck: "", entries: [] }] }));
        }}>+ New period</button>
        <button type="button" className="finance-add" onClick={exportData}>Export backup</button>
      </div>
      <div className="finance-toolbar">
        <label>Period name <input value={period.name} onChange={(e) => updatePeriod({ name: e.target.value })} /></label>
        <label>Paycheck amount ($) <input type="number" min="0" step="0.01" placeholder="Enter paycheck" value={period.paycheck} onChange={(e) => updatePeriod({ paycheck: e.target.value })} /></label>
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
          <p className={valid ? "finance-valid" : "finance-warning"}>Allocated: {percentTotal.toFixed(1)}% / 100%</p>
          {categories.map((c, i) => (
            <div className="finance-category" key={c.id}>
              <div className="finance-category-top">
                <span style={{ color: COLORS[i % COLORS.length] }}>{c.name}</span>
                <strong>{dollars(categoryAmount(c.id))}</strong>
              </div>
              <div className="finance-category-controls">
                <input aria-label={c.name + " allocation percentage"} type="range" min="0" max="100" step="1" value={c.percent} onChange={(e) => updateCategories(categories.map((x) => x.id === c.id ? { ...x, percent: Number(e.target.value) } : x))} />
                <input aria-label={c.name + " percentage"} type="number" min="0" max="100" step="1" value={c.percent} onChange={(e) => updateCategories(categories.map((x) => x.id === c.id ? { ...x, percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } : x))} />
                <span>%</span>
                {customCategories.some((x) => x.id === c.id) && <button type="button" className="finance-remove" onClick={() => updateCategories(categories.filter((x) => x.id !== c.id))}>×</button>}
              </div>
            </div>
          ))}
          <button type="button" className="finance-add" onClick={() => updateCategories([...categories, { id: makeId(), name: "Custom " + (customCategories.length + 1), percent: 0 }])}>+ Add category</button>
          {customCategories.map((c) => <label className="finance-custom-name" key={c.id}>Rename {c.name}<input value={c.name} onChange={(e) => updateCategories(categories.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))} /></label>)}
        </article>
      </div>
      <div className="finance-tables">
        {["expenses", "investments", "savings"].map((id) => (
          <FinanceTable key={id} title={categories.find((c) => c.id === id)?.name || id} allocated={categoryAmount(id)} entries={entriesOf(id)} onAdd={() => addEntry(id)} onChange={changeEntry} onRemove={removeEntry} />
        ))}
      </div>
      <article className="finance-panel">
        <span className="finance-kicker">DISCRETIONARY PURCHASES</span>
        <h3>Spending ledger</h3>
        <p>Enter discretionary purchases here for now. Automatic Gmail categorization will be connected later.</p>
        {entriesOf("spend").map((e) => (
          <div className="finance-entry" key={e.id}>
            <input aria-label="Purchase name" placeholder="Purchase" value={e.name} onChange={(event) => changeEntry(e.id, "name", event.target.value)} />
            <span></span>
            <input aria-label="Purchase amount" type="number" min="0" step="0.01" placeholder="Amount" value={e.actual} onChange={(event) => changeEntry(e.id, "actual", event.target.value)} />
            <button type="button" className="finance-remove" onClick={() => removeEntry(e.id)}>×</button>
          </div>
        ))}
        <button type="button" className="finance-add" onClick={() => addEntry("spend")}>+ Add purchase</button>
      </article>
      <article className="finance-final">
        <span className="finance-kicker">PROJECTED SAFE TO SPEND · THIS PAYCHECK</span>
        <strong>{valid ? dollars(safeBalance) : "Allocation incomplete"}</strong>
        <p>{dollars(categoryAmount("spend"))} spending allocation − {dollars(spent)} manually recorded discretionary purchases.</p>
        <p>Existing live Spendly balance: {safeToSpend ? dollars(safeToSpend.safeToSpend) : "Not set"}. These balances are separate until backend integration.</p>
      </article>
      {notice && <p role="status">{notice}</p>}
      <p className="finance-local-note">Planner data is saved in this browser only. Export a backup before clearing browser data. Nothing here changes your live Spendly budget yet.</p>
    </section>
  );
}
