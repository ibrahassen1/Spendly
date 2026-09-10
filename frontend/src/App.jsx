import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import "./App.css";

function App() {
  const [linkToken, setLinkToken] = useState(null);
  const [message, setMessage] = useState("");
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchSafeToSpend = async () => {
    try {
      const response = await fetch(
        "http://localhost:8080/api/safe-to-spend"
      );

      if (!response.ok) {
        setSafeToSpend(null);
        return;
      }

      const data = await response.json();
      setSafeToSpend(data);
    } catch (error) {
      setMessage("Could not load Safe to Spend.");
    }
  };

  useEffect(() => {
    const createLinkToken = async () => {
      try {
        const response = await fetch(
          "http://localhost:8080/api/plaid/link-token",
          {
            method: "POST",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to create link token");
        }

        setLinkToken(data.link_token);
      } catch (error) {
        setMessage(error.message);
      }
    };

    createLinkToken();
    fetchSafeToSpend();
  }, []);

  const onSuccess = useCallback(async (publicToken) => {
    try {
      setMessage("Connecting account...");

      const response = await fetch(
        "http://localhost:8080/api/plaid/exchange-token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            public_token: publicToken,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to connect account");
      }

      setMessage("Bank account connected successfully.");
    } catch (error) {
      setMessage(error.message);
    }
  }, []);

  const handleRefresh = async () => {
    try {
      setLoading(true);
      setMessage("Refreshing transactions...");

      await fetch(
        "http://localhost:8080/api/plaid/refresh",
        {
          method: "POST",
        }
      );

      const syncResponse = await fetch(
        "http://localhost:8080/api/plaid/sync",
        {
          method: "POST",
        }
      );

      if (!syncResponse.ok) {
        throw new Error("Transaction sync failed");
      }

      await fetchSafeToSpend();

      setMessage("Transactions refreshed.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

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

        <div className="buttons">
          <button
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading
              ? "Refreshing..."
              : "Refresh Transactions"}
          </button>

          <button
            className="secondary"
            onClick={() => open()}
            disabled={!ready || !linkToken}
          >
            Connect Bank Account
          </button>
        </div>

        {message && (
          <p className="message">{message}</p>
        )}
      </div>
    </main>
  );
}

export default App;
