import { useEffect, useRef, useState } from "react";
import "./App.css";
import FinanceDashboard from "./FinanceDashboard.jsx";
import { useAuth } from "@clerk/react";

const API_BASE_URL = "https://spendly-staging-staging.up.railway.app";

function SwipeableTransaction({
  transaction,
  formatMoney,
  formatDate,
  formatTime,
  onDelete,
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragged = useRef(false);

  const DELETE_WIDTH = 82;

  const handlePointerDown = (event) => {
    startX.current = event.clientX;
    startOffset.current = offset;
    dragged.current = false;
    setDragging(true);

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  const handlePointerMove = (event) => {
    if (!dragging) {
      return;
    }

    const difference =
      event.clientX - startX.current;

    if (Math.abs(difference) > 5) {
      dragged.current = true;
    }

    const nextOffset =
      startOffset.current + difference;

    setOffset(
      Math.max(
        -DELETE_WIDTH,
        Math.min(0, nextOffset)
      )
    );
  };

  const handlePointerUp = (event) => {
    if (!dragging) {
      return;
    }

    setDragging(false);

    try {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    } catch {
      // Pointer capture may already be released.
    }

    if (offset < -DELETE_WIDTH / 2) {
      setOffset(-DELETE_WIDTH);
    } else {
      setOffset(0);
    }
  };

  const handlePointerCancel = () => {
    setDragging(false);

    if (offset < -DELETE_WIDTH / 2) {
      setOffset(-DELETE_WIDTH);
    } else {
      setOffset(0);
    }
  };

  const isOpen = offset <= -DELETE_WIDTH / 2;

  const handleRowClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }

    if (offset !== 0) {
      setOffset(0);
    }
  };

  const handleDeleteClick = (event) => {
    event.stopPropagation();

    if (!isOpen) {
      return;
    }

    onDelete(transaction);
  };

  return (
    <div className="swipe-container">
      <button
        className={`delete-reveal ${
          isOpen ? "delete-active" : ""
        }`}
        type="button"
        onClick={handleDeleteClick}
        aria-label={`Delete ${transaction.merchant}`}
        tabIndex={isOpen ? 0 : -1}
      >
        <span className="trash-icon" />
      </button>

      <div
        className="transaction-row swipe-row"
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: dragging
            ? "none"
            : "transform 0.2s ease",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleRowClick}
      >
        <div className="transaction-icon">$</div>

        <div className="transaction-info">
          <p className="merchant">
            {transaction.merchant}
          </p>

          <p className="transaction-meta">
            {formatDate(transaction.date)}

            {transaction.transactionTime &&
              ` · ${formatTime(
                transaction.transactionTime
              )}`}

            {transaction.cardLast4 &&
              ` · •••• ${transaction.cardLast4}`}
          </p>
        </div>

        <strong className="transaction-amount">
          -${formatMoney(transaction.amount)}
        </strong>
      </div>
    </div>
  );
}

function App() {
  const { getToken, userId, isLoaded, isSignedIn } = useAuth();
  const accountFetch = async (path, options = {}) => {
    const token = await getToken();
    if (!token) throw new Error("Sign in to access your account.");
    return fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  };
  const [gmailPreview, setGmailPreview] = useState(null);
  const [gmailSyncBusy, setGmailSyncBusy] = useState(false);
  const previewGmail = async () => {
    setGmailSyncBusy(true);
    try {
      const res=await accountFetch("/api/gmail/transactions/preview",{method:"POST"});
      if(!res.ok)throw new Error("Unable to preview Gmail purchases.");
      setGmailPreview(await res.json());
    }catch(e){notifyGmail(e.message);}finally{setGmailSyncBusy(false);}
  };
  const applyGmail = async () => {
    if(!window.confirm("Deduct the previewed Wells Fargo purchases from your Safe to Spend balance? Check amounts carefully first."))return;
    setGmailSyncBusy(true);
    try {
      const res=await accountFetch("/api/gmail/transactions/apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:true})});
      if(!res.ok)throw new Error("Unable to import Gmail purchases.");
      const result=await res.json();
      setGmailPreview(null);
      await fetchSafeToSpend();
      await fetchTransactions();
      notifyGmail("Imported "+result.imported+" purchases · $"+result.deducted+" deducted");
    }catch(e){notifyGmail(e.message);}finally{setGmailSyncBusy(false);}
  };
  const [gmailConnection, setGmailConnection] = useState(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailMessage, setGmailMessage] = useState("");
  const gmailToastTimer = useRef(null);
  const notifyGmail = (message) => {
    setGmailMessage(message);
    if (gmailToastTimer.current) clearTimeout(gmailToastTimer.current);
    gmailToastTimer.current = setTimeout(() => setGmailMessage(""), 4000);
  };
  useEffect(() => () => { if (gmailToastTimer.current) clearTimeout(gmailToastTimer.current); }, []);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("gmail");
    if (result === "connected") notifyGmail("Gmail connected successfully ✓");
    if (result === "cancelled") notifyGmail("Gmail connection cancelled.");
    if (result === "connected" || result === "cancelled") {
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, []);
  const loadGmailConnection = async () => {
    try {
      const res = await accountFetch("/api/gmail/connection/status");
      if (res.ok) setGmailConnection(await res.json());
      else notifyGmail("Gmail connection is not available yet.");
    } catch { notifyGmail("Unable to check Gmail connection."); }
  };
  const connectGmail = async () => {
    setGmailBusy(true);
    try {
      const res=await accountFetch("/api/gmail/connection/start",{method:"POST"});
      if(!res.ok) throw new Error("Gmail connection is not configured on staging yet.");
      const data=await res.json();
      if(!data.authorizationUrl?.startsWith("https://accounts.google.com/")) throw new Error("Unexpected authorization URL.");
      window.location.assign(data.authorizationUrl);
    }catch(e){notifyGmail(e.message);setGmailBusy(false);}
  };
  const disconnectGmail = async () => {
    if(!window.confirm("Disconnect Gmail from Spendly?"))return;
    setGmailBusy(true);
    try {
      const res=await accountFetch("/api/gmail/connection",{method:"DELETE"});
      if(!res.ok)throw new Error("Unable to disconnect Gmail.");
      await loadGmailConnection();
      notifyGmail("Gmail disconnected.");
    }catch(e){notifyGmail(e.message);}finally{setGmailBusy(false);}
  };
  useEffect(()=>{
    if(isLoaded && isSignedIn && userId)loadGmailConnection();
    else setGmailConnection(null);
  },[isLoaded,isSignedIn,userId]);
  const [activePage, setActivePage] = useState("dashboard");
  // Always reload the authoritative server balance when returning to Safe to Spend.
  useEffect(() => {
    if (activePage !== "safe" || !isLoaded || !isSignedIn || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await accountFetch("/api/safe-to-spend");
        if (!response.ok) return;
        const updated = await response.json();
        if (!cancelled) {
          setSafeToSpend(updated);
          setBudgetStartDate(updated.startDate);
        }
      } catch { /* Keep last displayed value until connectivity returns. */ }
    })();
    return () => { cancelled = true; };
  }, [activePage, isLoaded, isSignedIn, userId]);

  const [message, setMessage] = useState("");

  const [safeToSpend, setSafeToSpend] =
    useState(null);

  const [transactions, setTransactions] =
    useState([]);

  const [
    moneyAdjustments,
    setMoneyAdjustments,
  ] = useState([]);

  const [activityTab, setActivityTab] =
    useState("transactions");

  const [updateStatus, setUpdateStatus] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [budgetAmount, setBudgetAmount] =
    useState("");

  const [
    budgetStartDate,
    setBudgetStartDate,
  ] = useState(
    new Date().toLocaleDateString("en-CA")
  );

  const [savingBudget, setSavingBudget] =
    useState(false);

  const [budgetMode, setBudgetMode] =
    useState(null);

  const [addAmount, setAddAmount] =
    useState("");

  const [addingMoney, setAddingMoney] =
    useState(false);

  const [
    transactionToDelete,
    setTransactionToDelete,
  ] = useState(null);

  const [
    deletingTransaction,
    setDeletingTransaction,
  ] = useState(false);

  const [
    undoTransaction,
    setUndoTransaction,
  ] = useState(null);

  const undoTimerRef = useRef(null);

  const formatMoney = (amount) =>
    Number(amount || 0).toFixed(2);

  const formatDate = (date) => {
    if (!date) {
      return "";
    }

    const [year, month, day] =
      date.split("-");

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
    if (!transactionTime) {
      return "";
    }

    return new Date(
      transactionTime
    ).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const fetchSafeToSpend = async () => {
    const response = await accountFetch(`/api/safe-to-spend`
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
    const response = await accountFetch("/api/gmail/transactions");
    if (!response.ok) {
      setTransactions([]);
      return [];
    }
    const data = await response.json();
    setTransactions(data);
    return data;
  };

  const fetchMoneyAdjustments = async () => {
    const response = await accountFetch(`/api/safe-to-spend/adjustments`
    );

    if (!response.ok) {
      throw new Error(
        "Could not load money adjustments."
      );
    }

    const data = await response.json();

    setMoneyAdjustments(data);

    return data;
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    setSafeToSpend(null);
    setMoneyAdjustments([]);
    setTransactions([]);
    const loadDashboard = async () => {
      try {
        await Promise.all([
          fetchSafeToSpend(),
          fetchTransactions(),
          fetchMoneyAdjustments(),
        ]);

        setUpdateStatus("Up to date");
      } catch {
        // Budget may not exist yet.
      }
    };

    loadDashboard();

    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, [isLoaded, isSignedIn, userId]);

  const openEditBudget = () => {
    if (safeToSpend) {
      setBudgetAmount(
        Number(
          safeToSpend.allocation
        ).toFixed(2)
      );

      setBudgetStartDate(
        safeToSpend.startDate
      );
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
        throw new Error(
          "Choose a start date."
        );
      }

      const response = await accountFetch(`/api/safe-to-spend/allocation`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            amount,
            startDate: budgetStartDate,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          "Could not save budget."
        );
      }

      const data = await response.json();

      setSafeToSpend(data);

      await fetchTransactions();
      await fetchMoneyAdjustments();

      setBudgetAmount("");
      setBudgetMode(null);

      setMessage("Budget updated ✓");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingBudget(false);
    }
  };

  const restoreOpeningBalance = async () => {
    const raw = window.prompt("One-time migration only: enter your verified remaining balance from the old Spendly app (not your paycheck amount).");
    if (raw === null) return;
    const amount = Number(raw);
    if (!raw.trim() || !Number.isFinite(amount) || amount < 0 || !/^\\d+(\\.\\d{1,2})?$/.test(raw.trim())) {
      setMessage("Enter a valid balance with at most two decimal places.");
      return;
    }
    if (!window.confirm("Restore $" + amount.toFixed(2) + " as your one-time opening balance? Do not resubmit your paycheck. This cannot be repeated.")) return;
    try {
      const response = await accountFetch("/api/safe-to-spend/opening-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, startDate: new Date().toLocaleDateString("en-CA") })
      });
      if (!response.ok) throw new Error(response.status === 409 ? "Opening balance already exists. Refresh the page." : "Unable to restore balance. Check staging backend deployment.");
      setSafeToSpend(await response.json());
      await fetchMoneyAdjustments();
      setMessage("Opening balance restored to your account.");
    } catch (error) { setMessage(error.message); }
  };

  const handleAddMoney = async (event) => {
    event.preventDefault();

    try {
      setAddingMoney(true);
      setMessage("Adding money...");

      const amountToAdd =
        Number(addAmount);

      if (
        addAmount === "" ||
        Number.isNaN(amountToAdd) ||
        amountToAdd === 0
      ) {
        throw new Error(
          "Enter a positive or negative amount."
        );
      }

      if (!safeToSpend) {
        throw new Error("Restore an opening balance or submit a paycheck first.");
      }

      const response = await accountFetch(`/api/safe-to-spend/adjustments`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            amount: amountToAdd,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          "Could not add money."
        );
      }

      const data = await response.json();

      setSafeToSpend(data);

      await fetchMoneyAdjustments();

      setAddAmount("");
      setBudgetMode(null);

      setMessage(
        `${
          amountToAdd > 0 ? "+" : "-"
        }$${formatMoney(
          Math.abs(amountToAdd)
        )} adjustment saved ✓`
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAddingMoney(false);
    }
  };

  const handleRefresh = async () => {
    try {
      throw new Error("Gmail syncing is disabled until each account has its own secure connection.");
      setLoading(true);

      setMessage(
        "Checking for new purchases..."
      );

      const response = await accountFetch(`/api/gmail/refresh`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(
          "Could not check Gmail."
        );
      }

      const refreshData =
        await response.json();

      await Promise.all([
        fetchSafeToSpend(),
        fetchTransactions(),
      ]);

      setUpdateStatus(
        "Updated just now"
      );

      if (
        refreshData.newTransactionCount > 0
      ) {
        setMessage(
          `${
            refreshData.newTransactionCount
          } new transaction${
            refreshData.newTransactionCount ===
            1
              ? ""
              : "s"
          } added.`
        );
      } else {
        setMessage(
          "No new purchases found."
        );
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteConfirmation = (
    transaction
  ) => {
    setTransactionToDelete(transaction);
  };

  const closeDeleteConfirmation = () => {
    if (deletingTransaction) {
      return;
    }

    setTransactionToDelete(null);
  };

  const handleDeleteTransaction =
    async () => {
      if (!transactionToDelete) {
        return;
      }

      try {
        throw new Error("Gmail transaction editing is disabled until account isolation is complete.");
        setDeletingTransaction(true);

        const deletedTransaction =
          transactionToDelete;

        const response = await accountFetch(`/api/gmail/transactions/${deletedTransaction.id}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          throw new Error(
            "Could not delete transaction."
          );
        }

        setTransactions(
          (currentTransactions) =>
            currentTransactions.filter(
              (transaction) =>
                transaction.id !==
                deletedTransaction.id
            )
        );

        setTransactionToDelete(null);

        await fetchSafeToSpend();

        if (undoTimerRef.current) {
          clearTimeout(
            undoTimerRef.current
          );
        }

        setUndoTransaction(
          deletedTransaction
        );

        undoTimerRef.current =
          setTimeout(() => {
            setUndoTransaction(null);
            undoTimerRef.current = null;
          }, 5000);
      } catch (error) {
        setMessage(error.message);
      } finally {
        setDeletingTransaction(false);
      }
    };

  const handleUndoDelete = async () => {
    if (!undoTransaction) {
      return;
    }

    try {
      throw new Error("Gmail transaction editing is disabled until account isolation is complete.");
      const transaction =
        undoTransaction;

      if (undoTimerRef.current) {
        clearTimeout(
          undoTimerRef.current
        );

        undoTimerRef.current = null;
      }

      const response = await accountFetch(`/api/gmail/transactions/${transaction.id}/restore`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(
          "Could not restore transaction."
        );
      }

      setUndoTransaction(null);

      await fetchTransactions();
      await fetchSafeToSpend();

      setMessage(
        "Transaction restored ✓"
      );
    } catch (error) {
      setMessage(error.message);
    }
  };

  const netMoneyAdded =
    moneyAdjustments.reduce(
      (total, adjustment) =>
        total + Number(adjustment.amount),
      0
    );

  return (
    <main className="app">
      <div className="dashboard">
        <header className="app-header">
          <div>
            <p className="eyebrow">
              SPENDLY
            </p>

            <h1>
              Your money, actually usable.
            </h1>
          </div>

          <div className="status-dot" />
        </header>



        {activePage === "dashboard" && <FinanceDashboard view="dashboard" safeToSpend={safeToSpend} onBudgetSaved={async (updated) => { setSafeToSpend(updated); await Promise.all([fetchSafeToSpend(), fetchTransactions(), fetchMoneyAdjustments()]); }} />}
        {activePage === "goals" && <FinanceDashboard view="goals" safeToSpend={safeToSpend} />}
        {activePage === "safe" && (
          <>
        <div className="safe-top-zone">
        {safeToSpend ? (
          <>
            <section className="safe-card safe-fintech-hero">
              <div className="safe-top">
                <p className="label">
                  YOUR SPENDABLE BALANCE
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
                  ) > 0
                    ? "amount positive"
                    : Number(
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

              <p className="safe-subtitle">Spend freely. Your other allocations stay separate.</p>

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

          </>
        ) : (
          <section className="empty-hero safe-fintech-hero">
            <p className="label">
              YOUR SPENDABLE BALANCE
            </p>

            <h2>$0.00</h2>

            <p>Your balance appears here when your paycheck is credited.</p>
            <p className="safe-restore-note">Already used Spendly? Restore your previous balance once.</p>
            <button type="button" onClick={restoreOpeningBalance}>Restore existing balance (one time)</button>
          </section>
        )}

        <section className="gmail-compact" aria-label="Gmail connection">
          <div className="gmail-compact-info">
            <span className="gmail-status-dot" aria-hidden="true" />
            <span>Gmail · {gmailConnection?.connected ? "Connected" : "Not connected"}</span>
          </div>
          <details className="gmail-settings">
            <summary>Manage</summary>
            <div className="gmail-settings-panel">
              <p>{gmailConnection?.connected
                ? "Gmail is connected. Automatic transaction syncing is not enabled yet."
                : "Connect your Google account to prepare for transaction syncing."}</p>
              {gmailConnection?.connected
                ? <button type="button" className="edit-button" disabled={gmailBusy} onClick={disconnectGmail}>Disconnect Gmail</button>
                : <button type="button" className="edit-button" disabled={gmailBusy} onClick={connectGmail}>{gmailBusy?"Connecting…":"Connect Gmail"}</button>}
            </div>
          </details>
        </section>

        <section className="actions safe-quick-actions">
          <button type="button" className="refresh-button" disabled={!gmailConnection?.connected || gmailSyncBusy} onClick={previewGmail}>
            {gmailSyncBusy ? "Checking Gmail…" : "↻ Preview Gmail Purchases"}
          </button>
          {safeToSpend && (
            <button type="button" className="edit-button" onClick={openAddMoney}>
              + Add Money
            </button>
          )}
        </section>

        {gmailPreview && (
          <section className="budget-card" style={{margin:"16px 0",padding:20}}>
            <h3>Review purchases before importing</h3>
            <p style={{opacity:.7}}>Only recent Wells Fargo alerts detected from Gmail. No deductions until you confirm. Check each amount against your bank.</p>
            {gmailPreview.candidates?.map(item => (
              <div key={item.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"10px 0",borderBottom:"1px solid #39304f"}}>
                <span>{item.merchant} · {item.date}</span><strong>${Number(item.amount).toFixed(2)}</strong>
              </div>
            ))}
            <p style={{marginTop:12}}>{gmailPreview.count || 0} candidate purchases</p>
            <button type="button" className="save-button" disabled={gmailSyncBusy || !gmailPreview.count} onClick={applyGmail}>Confirm & Deduct</button>
            <button type="button" className="edit-button" onClick={()=>setGmailPreview(null)}>Cancel</button>
          </section>
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
                    ADJUST MONEY
                  </p>

                  <h2>
                    Adjust your spendable budget
                  </h2>
                </div>
              </div>

              <label>
                Amount to adjust

                <div className="money-input">
                  <span>$</span>

                  <input
                    type="number"
                    step="0.01"
                    placeholder="100.00 or -100.00"
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
                  ? "Adjusting..."
                  : "Adjust Money"}
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

        </div>

        {(
          <section className="activity safe-activity">
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

            <div className="activity-tabs">
              <button
                type="button"
                className={
                  activityTab ===
                  "transactions"
                    ? "activity-tab active"
                    : "activity-tab"
                }
                onClick={() =>
                  setActivityTab(
                    "transactions"
                  )
                }
              >
                Transactions
              </button>

              <button
                type="button"
                className={
                  activityTab === "money"
                    ? "activity-tab active"
                    : "activity-tab"
                }
                onClick={() =>
                  setActivityTab("money")
                }
              >
                Money Added
              </button>
            </div>

            {activityTab ===
            "transactions" ? (
              transactions.length > 0 ? (
                <div className="transaction-list">
                  {transactions.map(
                    (transaction) => (
                      <div className="transaction-row" key={transaction.id}>
                        <div className="transaction-icon">$</div>
                        <div className="transaction-info">
                          <p className="merchant">{transaction.merchant}</p>
                          <p className="transaction-meta">{formatDate(transaction.date)}</p>
                        </div>
                        <strong className="transaction-amount">-${formatMoney(transaction.amount)}</strong>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="no-transactions">
                  <p>No imported purchases yet.</p>

                  <span>
                    Preview Gmail purchases above to review and import eligible alerts.
                  </span>
                </div>
              )
            ) : (
              <>
                <div className="adjustment-summary">
                  <span>Net Added</span>

                  <strong
                    className={
                      netMoneyAdded >= 0
                        ? "positive-adjustment"
                        : "negative-adjustment"
                    }
                  >
                    {netMoneyAdded >= 0
                      ? "+"
                      : "-"}
                    $
                    {formatMoney(
                      Math.abs(netMoneyAdded)
                    )}
                  </strong>
                </div>

                {moneyAdjustments.length >
                0 ? (
                  <div className="transaction-list">
                    {moneyAdjustments.map(
                      (adjustment) => (
                        <div
                          className="transaction-row"
                          key={adjustment.id}
                        >
                          <div
                            className={`transaction-icon ${
                              Number(
                                adjustment.amount
                              ) >= 0
                                ? "adjustment-icon"
                                : "removal-icon"
                            }`}
                          >
                            {Number(
                              adjustment.amount
                            ) >= 0
                              ? "+"
                              : "−"}
                          </div>

                          <div className="transaction-info">
                            <p className="merchant">
                              {Number(
                                adjustment.amount
                              ) >= 0
                                ? "Money Added"
                                : "Money Removed"}
                            </p>

                            <p className="transaction-meta">
                              {formatDate(
                                adjustment.date
                              )}

                              {adjustment.createdAt &&
                                ` · ${formatTime(
                                  adjustment.createdAt
                                )}`}
                            </p>
                          </div>

                          <strong
                            className={`transaction-amount ${
                              Number(
                                adjustment.amount
                              ) >= 0
                                ? "positive-adjustment"
                                : "negative-adjustment"
                            }`}
                          >
                            {Number(
                              adjustment.amount
                            ) >= 0
                              ? "+"
                              : "-"}
                            $
                            {formatMoney(
                              Math.abs(
                                Number(
                                  adjustment.amount
                                )
                              )
                            )}
                          </strong>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="no-transactions">
                    <p>
                      No money added yet.
                    </p>

                    <span>
                      Adjustments made during this
                      period will appear here.
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <footer>
          <span className="footer-dot" />
          Gmail transaction syncing paused for account security
        </footer>
          </>
        )}
      </div>

      {transactionToDelete && (
        <div
          className="modal-backdrop"
          onClick={closeDeleteConfirmation}
        >
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="delete-modal-icon">
              !
            </div>

            <h2 id="delete-title">
              Delete this transaction?
            </h2>

            <p className="delete-merchant">
              {transactionToDelete.merchant}
            </p>

            <p className="delete-description">
              This will add{" "}
              <strong>
                $
                {formatMoney(
                  transactionToDelete.amount
                )}
              </strong>{" "}
              back to your Safe-to-Spend balance.
            </p>

            <div className="modal-actions">
              <button
                className="modal-cancel"
                type="button"
                onClick={
                  closeDeleteConfirmation
                }
                disabled={deletingTransaction}
              >
                Cancel
              </button>

              <button
                className="modal-delete"
                type="button"
                onClick={
                  handleDeleteTransaction
                }
                disabled={deletingTransaction}
              >
                {deletingTransaction
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {undoTransaction && (
        <div className="undo-toast">
          <div className="undo-toast-text">
            <strong>
              Transaction deleted
            </strong>

            <span>
              $
              {formatMoney(
                undoTransaction.amount
              )}{" "}
              restored
            </span>
          </div>

          <button
            type="button"
            className="undo-button"
            onClick={handleUndoDelete}
          >
            UNDO
          </button>
        </div>
      )}
      <nav className="spendly-bottom-nav" aria-label="Spendly pages">
        <button type="button" aria-current={activePage === "dashboard" ? "page" : undefined} className={activePage === "dashboard" ? "bottom-nav-item selected" : "bottom-nav-item"} onClick={() => setActivePage("dashboard")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>
          <span>Dashboard</span>
        </button>
        <button type="button" aria-current={activePage === "safe" ? "page" : undefined} className={activePage === "safe" ? "bottom-nav-item selected" : "bottom-nav-item"} onClick={() => setActivePage("safe")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 10h18M7 3h10"/><circle cx="16.5" cy="15.5" r="1"/></svg>
          <span>Safe to Spend</span>
        </button>
        <button type="button" aria-current={activePage === "goals" ? "page" : undefined} className={activePage === "goals" ? "bottom-nav-item selected" : "bottom-nav-item"} onClick={() => setActivePage("goals")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>
          <span>Goals</span>
        </button>
      </nav>
      {gmailMessage && <div className="gmail-toast" role="status">{gmailMessage}</div>}
    </main>
  );
}

export default App;