import React from "react";

export default function FinanceDashboard({ safeToSpend }) {
  return (
    <section className="finance-page">
      <div className="finance-heading">
        <p className="eyebrow">YOUR FINANCIAL OVERVIEW</p>
        <h2>Dashboard</h2>
        <p>Plan each paycheck, track where your money goes, and see what remains available.</p>
      </div>
      <div className="finance-panels">
        <article className="finance-panel">
          <span className="finance-kicker">PAYCHECK ALLOCATION</span>
          <h3>Where your money goes</h3>
          <p>Paycheck entry and labeled allocation chart will go here.</p>
        </article>
        <article className="finance-panel">
          <span className="finance-kicker">BUDGET PLAN</span>
          <h3>Adjust your allocations</h3>
          <p>Set percentages for expenses, investments, savings, and spending.</p>
        </article>
      </div>
      <div className="finance-tables">
        {["Expenses", "Investments", "Savings"].map((name) => (
          <article className="finance-panel" key={name}>
            <span className="finance-kicker">PLANNED VS ACTUAL</span>
            <h3>{name}</h3>
            <div className="finance-table-head"><span>Item</span><span>Planned</span><span>Actual</span></div>
            <p>Items for this pay period will appear here.</p>
          </article>
        ))}
      </div>
      <article className="finance-final">
        <span className="finance-kicker">SAFE TO SPEND · CURRENT LIVE BUDGET</span>
        <strong>{safeToSpend ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(safeToSpend.safeToSpend)) : "Not set"}</strong>
        <p>This displays your existing Safe-to-Spend balance. The paycheck planner will be connected in the next phase.</p>
      </article>
    </section>
  );
}
