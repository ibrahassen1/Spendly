import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL =
  "https://spendly-production-1bdf.up.railway.app";

function App() {
  const [message, setMessage] = useState("");
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [updateStatus, setUpdateStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetStartDate, setBudgetStartDate] = useState(
    new Date().toLocaleDateString("en-CA")
  );
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetMode, setBudgetMode] = useState(null);

  const [addAmount, setAddAmount] = useState("");
  const [addingMoney, setAddingMoney] = useState(false);

  const formatMoney = (amount) =>
    Number(amount || 0).toFixed(2);

  const formatDate = (date) => {
    if (!date) return "";

    const [year, month, day] = date.split("-");

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    ).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (transactionTime) => {
    if (!transactionTime) return "";

    return new Date(transactionTime).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const fetchSafeToSpend = async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/safe-to-spend`
    );

    if (!response.ok) {
      throw new Error("No budget set.");
    }

    const data = await response.json();

    setSafeToSpend(data);
    setBudgetStartDate(data.startDate);

    return data;
  };

  const fetchTransactions = async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/gmail/recent`
    );

    if (!response.ok) {
      throw new Error("Could not load transactions.");
    }

    const data = await response.json();

    setTransactions(data);

    return data;
  };

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        await fetchSafeToSpend();
        await fetchTransactions();
        setUpdateStatus("Up to date");
      } catch {
        // New users may not have a budget yet.
      }
    };

    loadDashboard();
  }, []);

  const openEditBudget = () => {
    if (safeToSpend) {
      setBudgetAmount(
        Number(safeToSpend.allocation).toFixed(2)
      );
      setBudgetStartDate(safeToSpend.startDate);
    }

    setBudgetMode("edit");
    setMessage("");
  };

  const openAddMoney = () => {
    setAddAmount("");
    setBudgetMode("add");
    setMessage("");
  };

  const closeBudgetPanel = () => {
    setBudgetMode(null);
    setBudgetAmount("");
    setAddAmount("");
  };

  const handleSetBudget = async (event) => {
    event.preventDefault();

    try {
      setSavingBudget(true);
      setMessage("Saving budget...");

      const amount = Number(budgetAmount);

      if (
        budgetAmount === "" ||
        Number.isNaN(amount)
      ) {
        throw new Error(
          "Enter a valid budget amount."
        );
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
      await fetchTransactions();

      setBudgetAmount("");
      setBudgetMode(null);
      setMessage("Budget updated ✓");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingBudget(false);
    }
  };

  const handleAddMoney = async (event) => {
    event.preventDefault();

    try {
      setAddingMoney(true);
      setMessage("Adding money...");

      const amountToAdd = Number(addAmount);

      if (
        addAmount === "" ||
        Number.isNaN(amountToAdd) ||
        amountToAdd <= 0
      ) {
        throw new Error(
          "Enter an amount greater than $0."
        );
      }

      if (!safeToSpend) {
        throw new Error(
          "Set a budget before adding money."
        );
      }

      const newBudget =
        Number(safeToSpend.allocation) +
        amountToAdd;

      const response = await fetch(
        `${API_BASE_URL}/api/safe-to-spend/allocation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: newBudget,
            startDate: safeToSpend.startDate,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Could not add money.");
      }

      const data = await response.json();

      setSafeToSpend(data);
      setAddAmount("");
      setBudgetMode(null);

      setMessage(
        `$${formatMoney(amountToAdd)} added to your budget ✓`
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAddingMoney(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      setMessage("Checking for new purchases...");

      const response = await fetch(
        `${API_BASE_URL}/api/gmail/refresh`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error("Could not check Gmail.");
      }

      const refreshData = await response.json();

      await fetchSafeToSpend();
      await fetchTransactions();

      setUpdateStatus("Updated just now");

      if (refreshData.newTransactionCount > 0) {
        setMessage(
          `${refreshData.newTransactionCount} new transaction${
            refreshData.newTransactionCount === 1
              ? ""
              : "s"
          } added.`
        );
      } else {
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
        <header className="app-header">
          <div>
            <p className="eyebrow">SPENDLY</p>
            <h1>Your money, actually usable.</h1>
          </div>

          <div className="status-dot" />
        </header>

        {safeToSpend ? (
          <>
            <section className="safe-card">
              <div className="safe-top">
                <p className="label">
                  SAFE TO SPEND
                </p>

                <span className="period">
                  Since{" "}
                  {formatDate(
                    safeToSpend.startDate
                  )}
                </span>
              </div>

              <h2
                className={
                  Number(
                    safeToSpend.safeToSpend
                  ) < 0
                    ? "amount negative"
                    : "amount"
                }
              >
                $
                {formatMoney(
                  safeToSpend.safeToSpend
                )}
              </h2>

              <p className="safe-subtitle">
                Available without touching the rest of
                your money.
              </p>

              <div className="stats">
                <div className="stat">
                  <span>Budget</span>

                  <strong>
                    $
                    {formatMoney(
                      safeToSpend.allocation
                    )}
                  </strong>
                </div>

                <div className="stat">
                  <span>Spent</span>

                  <strong>
                    $
                    {formatMoney(
                      safeToSpend.countedSpending
                    )}
                  </strong>
                </div>
              </div>
            </section>

            <section className="actions">
              <button
                className="refresh-button"
                onClick={handleRefresh}
                disabled={loading}
              >
                <span
                  className={
                    loading ? "spin" : ""
                  }
                >
                  ↻
                </span>

                {loading
                  ? "Checking purchases..."
                  : "Refresh Transactions"}
              </button>

              <button
                className="edit-button"
                onClick={openAddMoney}
              >
                + Add Money
              </button>

              <button
                className="edit-button"
                onClick={openEditBudget}
              >
                Edit Budget
              </button>
            </section>
          </>
        ) : (
          <section className="empty-hero">
            <p className="label">
              SAFE TO SPEND
            </p>

            <h2>$0.00</h2>

            <p>
              Set how much you can spend and when
              this budget started.
            </p>

            <button
              onClick={() =>
                setBudgetMode("edit")
              }
            >
              Set Budget
            </button>
          </section>
        )}

        {(budgetMode === "edit" ||
          !safeToSpend) && (
          <form
            className="budget-card"
            onSubmit={handleSetBudget}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  BUDGET & DATA
                </p>

                <h2>
                  {safeToSpend
                    ? "Set budget"
                    : "Set your budget"}
                </h2>
              </div>
            </div>

            <label>
              Spendable amount

              <div className="money-input">
                <span>$</span>

                <input
                  type="number"
                  step="0.01"
                  placeholder="100.00"
                  value={budgetAmount}
                  onChange={(event) =>
                    setBudgetAmount(
                      event.target.value
                    )
                  }
                  required
                />
              </div>
            </label>

            <label>
              Start date

              <input
                type="date"
                value={budgetStartDate}
                onChange={(event) =>
                  setBudgetStartDate(
                    event.target.value
                  )
                }
                required
              />
            </label>

            <p className="date-explanation">
              Purchases on or after this date
              count toward Safe to Spend.
            </p>

            <button
              className="save-button"
              type="submit"
              disabled={savingBudget}
            >
              {savingBudget
                ? "Saving..."
                : safeToSpend
                ? "Set Budget"
                : "Create Budget"}
            </button>

            {safeToSpend && (
              <button
                className="edit-button"
                type="button"
                onClick={closeBudgetPanel}
                style={{
                  width: "100%",
                  marginTop: "10px",
                }}
              >
                Cancel
              </button>
            )}
          </form>
        )}

        {budgetMode === "add" &&
          safeToSpend && (
            <form
              className="budget-card"
              onSubmit={handleAddMoney}
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    ADD MONEY
                  </p>

                  <h2>
                    Increase your spendable budget
                  </h2>
                </div>
              </div>

              <label>
                Amount to add

                <div className="money-input">
                  <span>$</span>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="300.00"
                    value={addAmount}
                    onChange={(event) =>
                      setAddAmount(
                        event.target.value
                      )
                    }
                    required
                  />
                </div>
              </label>

              <p className="date-explanation">
                Current budget: $
                {formatMoney(
                  safeToSpend.allocation
                )}
                . Your start date stays the same.
              </p>

              <button
                className="save-button"
                type="submit"
                disabled={addingMoney}
              >
                {addingMoney
                  ? "Adding..."
                  : "Add Money"}
              </button>

              <button
                className="edit-button"
                type="button"
                onClick={closeBudgetPanel}
                style={{
                  width: "100%",
                  marginTop: "10px",
                }}
              >
                Cancel
              </button>
            </form>
          )}

        {message && (
          <p className="message">
            {message}
          </p>
        )}

        {safeToSpend && (
          <section className="activity">
            <div className="activity-header">
              <div>
                <p className="eyebrow">
                  CURRENT PERIOD
                </p>

                <h2>Recent Activity</h2>
              </div>

              {updateStatus && (
                <span className="update-status">
                  {updateStatus}
                </span>
              )}
            </div>

            {transactions.length > 0 ? (
              <div className="transaction-list">
                {transactions.map(
                  (transaction, index) => (
                    <div
                      className="transaction-row"
                      key={`${transaction.merchant}-${transaction.transactionTime}-${index}`}
                    >
                      <div className="transaction-icon">
                        $
                      </div>

                      <div className="transaction-info">
                        <p className="merchant">
                          {transaction.merchant}
                        </p>

                        <p className="transaction-meta">
                          {formatDate(
                            transaction.date
                          )}

                          {transaction.transactionTime &&
                            ` · ${formatTime(
                              transaction.transactionTime
                            )}`}

                          {transaction.cardLast4 &&
                            ` · •••• ${transaction.cardLast4}`}
                        </p>
                      </div>

                      <strong className="transaction-amount">
                        -$
                        {formatMoney(
                          transaction.amount
                        )}
                      </strong>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="no-transactions">
                <p>No purchases yet.</p>

                <span>
                  Refresh after your next card
                  purchase.
                </span>
              </div>
            )}
          </section>
        )}

        <footer>
          <span className="footer-dot" />
          Gmail transaction alerts connected
        </footer>
      </div>
    </main>
  );
}

export default App;
