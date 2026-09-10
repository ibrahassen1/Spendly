import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import "./App.css";

function App() {
  const [linkToken, setLinkToken] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const createLinkToken = async () => {
      try {
        const response = await fetch(
          "http://localhost:8080/api/plaid/link-token",
          { method: "POST" }
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

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  return (
    <main className="app">
      <div className="card">
        <h1>Spendly</h1>

        <p>
          Your bank tells you your balance.
          <br />
          Spendly tells you what you can actually spend.
        </p>

        <button
          onClick={() => open()}
          disabled={!ready || !linkToken}
        >
          Connect Bank Account
        </button>

        {message && <p className="message">{message}</p>}
      </div>
    </main>
  );
}

export default App;
