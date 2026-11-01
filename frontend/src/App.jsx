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
  const [activePage, setActivePage] = useState("dashboard");
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
    // Gmail is disabled until account-scoped OAuth and transactions are implemented.
    setTransactions([]);
    return [];
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
        throw new Error(
          "Set a budget before adding money."
        );
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

        <nav className="page-tabs" aria-label="Spendly pages">
          <button type="button" className={activePage === "dashboard" ? "page-tab selected" : "page-tab"} onClick={() => setActivePage("dashboard")}>Dashboard</button>
          <button type="button" className={activePage === "safe" ? "page-tab selected" : "page-tab"} onClick={() => setActivePage("safe")}>Safe to Spend</button>
        </nav>

        {activePage === "dashboard" && <FinanceDashboard safeToSpend={safeToSpend} onBudgetSaved={async (updated) => { setSafeToSpend(updated); await Promise.all([fetchTransactions(), fetchMoneyAdjustments()]); }} />}
        {activePage === "safe" && (
          <>
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

          </>
        ) : (
          <section className="empty-hero">
            <p className="label">
              SAFE TO SPEND
            </p>

            <h2>$0.00</h2>

            <p>
              Your balance will appear here once your account is initialized from your paycheck history.
            </p>

          </section>
        )}

        <section className="actions">
          <button type="button" className="refresh-button" disabled title="Gmail transaction syncing is not yet enabled for individual accounts">
            ↻ Refresh Transactions (coming soon)
          </button>
          {safeToSpend && (
            <button type="button" className="edit-button" onClick={openAddMoney}>
              + Add Money
            </button>
          )}
        </section>

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

        {(
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
                      <SwipeableTransaction
                        key={transaction.id}
                        transaction={transaction}
                        formatMoney={formatMoney}
                        formatDate={formatDate}
                        formatTime={formatTime}
                        onDelete={
                          openDeleteConfirmation
                        }
                      />
                    )
                  )}
                </div>
              ) : (
                <div className="no-transactions">
                  <p>Transaction syncing is paused.</p>

                  <span>
                    Account-specific Gmail syncing is being built.
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
    </main>
  );
}

export default App;