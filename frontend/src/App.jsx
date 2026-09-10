import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [recentUpdates, setRecentUpdates] = useState([]);
  const [totalReduced, setTotalReduced] = useState(0);
  const [updateStatus, setUpdateStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchSafeToSpend = async () => {
    const response = await fetch(
      "http://localhost:8080/api/safe-to-spend"
    );

    if (!response.ok) {
      throw new Error("Could not load Safe to Spend.");
    }

    const data = await response.json();
    setSafeToSpend(data);
  };

  const fetchRecentTransactions = async () => {
    const response = await fetch(
      "http://localhost:8080/api/gmail/recent"
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
    Promise.all([
      fetchSafeToSpend(),
      fetchRecentTransactions(),
    ]).catch(() => {
      setMessage("Could not load Spendly data.");
    });
  }, []);

  const handleRefresh = async () => {
    try {
      setLoading(true);
      setMessage("Checking for new purchases...");

      const gmailResponse = await fetch(
        "http://localhost:8080/api/gmail/refresh",
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
              $
              {Number(
                safeToSpend.safeToSpend
              ).toFixed(2)}
            </h2>

            <div className="details">
              <p>
                Allocation:
                <strong>
                  $
                  {Number(
                    safeToSpend.allocation
                  ).toFixed(2)}
                </strong>
              </p>

              <p>
                Counted Spending:
                <strong>
                  $
                  {Number(
                    safeToSpend.countedSpending
                  ).toFixed(2)}
                </strong>
              </p>

              <p>
                Since:
                <strong>
                  {safeToSpend.startDate}
                </strong>
              </p>
            </div>
          </section>
        )}

        <div className="buttons">
          <button
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading
              ? "Checking..."
              : "Refresh Transactions"}
          </button>
        </div>

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
                      Card ••••{" "}
                      {transaction.cardLast4}
                      {" · "}
                      {transaction.date}
                    </p>
                  </div>

                  <strong className="transaction-amount">
                    -$
                    {Number(
                      transaction.amount
                    ).toFixed(2)}
                  </strong>
                </div>
              )
            )}

            <div className="refresh-total">
              <span>
                Recent total
              </span>

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
