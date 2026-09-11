import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL =
  "https://spendly-production-1bdf.up.railway.app";

function App() {
  const [message, setMessage] = useState("");
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [recentUpdates, setRecentUpdates] = useState([]);
  const [totalReduced, setTotalReduced] = useState(0);
  const [updateStatus, setUpdateStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetStartDate, setBudgetStartDate] = useState(
    new Date().toLocaleDateString("en-CA")
  );
  const [savingBudget, setSavingBudget] = useState(false);

  const fetchSafeToSpend = async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/safe-to-spend`
    );

    if (!response.ok) {
      throw new Error("Could not load Safe to Spend.");
    }

    const data = await response.json();
    setSafeToSpend(data);
  };

  const fetchRecentTransactions = async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/gmail/recent`
    );

    if (!response.ok) {
      throw new Error("Could not load recent transactions.");
    }

    const data = await response.json();

    setRecentUpdates(data);

    const recentTotal = data.reduce(
      (sum, transaction) =>
        sum + Number(transaction.amount),
      0
    );

    setTotalReduced(recentTotal);

    if (data.length > 0) {
      setUpdateStatus("Up to date ✓");
    }
  };

  useEffect(() => {
    fetchSafeToSpend().catch(() => {
      // A new user may not have a budget yet.
    });

    fetchRecentTransactions().catch(() => {
      setMessage("Could not load recent transactions.");
    });
  }, []);

  const handleSetBudget = async (event) => {
    event.preventDefault();

    try {
      setSavingBudget(true);
      setMessage("Saving budget...");

      const amount = Number(budgetAmount);

      if (!budgetAmount || Number.isNaN(amount) || amount < 0) {
        throw new Error("Enter a valid budget amount.");
      }

      if (!budgetStartDate) {
        throw new Error("Choose a start date.");
      }

      const response = await fetch(
        `${API_BASE_URL}/api/safe-to-spend/allocation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount,
            startDate: budgetStartDate,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Could not save budget.");
      }

      const data = await response.json();

      setSafeToSpend(data);
      setBudgetAmount("");
      setMessage("Budget saved ✓");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingBudget(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      setMessage("Checking for new purchases...");

      const gmailResponse = await fetch(
        `${API_BASE_URL}/api/gmail/refresh`,
        {
          method: "POST",
        }
      );

      if (!gmailResponse.ok) {
        throw new Error("Could not check Gmail.");
      }

      const refreshData = await gmailResponse.json();

      await fetchSafeToSpend();

      if (refreshData.newTransactionCount > 0) {
        setRecentUpdates(
          refreshData.newTransactions || []
        );

        setTotalReduced(
          Number(refreshData.totalReduced || 0)
        );

        setUpdateStatus("Updated just now");

        setMessage(
          `${refreshData.newTransactionCount} new transaction${
            refreshData.newTransactionCount === 1 ? "" : "s"
          } added.`
        );
      } else {
        setUpdateStatus("Up to date ✓");
        setMessage("No new purchases found.");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app">
      <div className="dashboard">
        <h1>Spendly</h1>

        <p className="tagline">
          Your bank tells you your balance.
          <br />
          Spendly tells you what you can actually spend.
        </p>

        {safeToSpend && (
          <section className="safe-card">
            <p className="label">Safe to Spend</p>

            <h2
              className={
                safeToSpend.safeToSpend < 0
                  ? "amount negative"
                  : "amount"
              }
            >
              ${Number(safeToSpend.safeToSpend).toFixed(2)}
            </h2>

            <div className="details">
              <p>
                Allocation:
                <strong>
                  ${Number(safeToSpend.allocation).toFixed(2)}
                </strong>
              </p>

              <p>
                Counted Spending:
                <strong>
                  ${Number(safeToSpend.countedSpending).toFixed(2)}
                </strong>
              </p>

              <p>
                Since:
                <strong>{safeToSpend.startDate}</strong>
              </p>
            </div>
          </section>
        )}

        <form
          className="budget-form"
          onSubmit={handleSetBudget}
        >
          <h2>
            {safeToSpend ? "Edit Budget" : "Set Budget"}
          </h2>

          <label>
            Spendable amount
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="100.00"
              value={budgetAmount}
              onChange={(event) =>
                setBudgetAmount(event.target.value)
              }
              required
            />
          </label>

          <label>
            Start date
            <input
              type="date"
              value={budgetStartDate}
              onChange={(event) =>
                setBudgetStartDate(event.target.value)
              }
              required
            />
          </label>

          <button
            type="submit"
            disabled={savingBudget}
          >
            {savingBudget
              ? "Saving..."
              : safeToSpend
              ? "Update Budget"
              : "Set Budget"}
          </button>
        </form>

        <div className="buttons">
          <button
            onClick={handleRefresh}
            disabled={loading || !safeToSpend}
          >
            {loading
              ? "Checking..."
              : "Refresh Transactions"}
          </button>
        </div>

        {!safeToSpend && (
          <p className="message">
            Set your budget to get started.
          </p>
        )}

        {message && (
          <p className="message">
            {message}
          </p>
        )}

        {recentUpdates.length > 0 && (
          <section className="recent-updates">
            <div className="recent-header">
              <h2>Recent Updates</h2>

              {updateStatus && (
                <p className="update-status">
                  {updateStatus}
                </p>
              )}
            </div>

            {recentUpdates.map(
              (transaction, index) => (
                <div
                  className="transaction-row"
                  key={`${transaction.merchant}-${transaction.amount}-${index}`}
                >
                  <div>
                    <p className="merchant">
                      {transaction.merchant}
                    </p>

                    <p className="transaction-meta">
                      Card •••• {transaction.cardLast4}
                      {" · "}
                      {transaction.date}
                    </p>
                  </div>

                  <strong className="transaction-amount">
                    -${Number(transaction.amount).toFixed(2)}
                  </strong>
                </div>
              )
            )}

            <div className="refresh-total">
              <span>Recent total</span>

              <strong>
                -${totalReduced.toFixed(2)}
              </strong>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
