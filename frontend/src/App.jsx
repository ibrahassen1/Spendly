import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE_URL =
  "https://spendly-production-1bdf.up.railway.app";

function SwipeableTransaction({
  transaction,
  formatMoney,
  formatDate,
  formatTime,
  onDelete,
}) {
  const DELETE_WIDTH = 82;

  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startX = useRef(null);
  const startOffset = useRef(0);
  const dragged = useRef(false);

  const isOpen = offset <= -DELETE_WIDTH;

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
    if (startX.current === null) {
      return;
    }

    const movement =
      event.clientX - startX.current;

    if (Math.abs(movement) > 6) {
      dragged.current = true;
    }

    let nextOffset =
      startOffset.current + movement;

    nextOffset = Math.max(
      -DELETE_WIDTH,
      Math.min(0, nextOffset)
    );

    setOffset(nextOffset);
  };

  const handlePointerUp = () => {
    if (startX.current === null) {
      return;
    }

    if (offset < -40) {
      setOffset(-DELETE_WIDTH);
    } else {
      setOffset(0);
    }

    startX.current = null;
    setDragging(false);
  };

  const handlePointerCancel = () => {
    startX.current = null;
    setDragging(false);

    setOffset((currentOffset) =>
      currentOffset < -40
        ? -DELETE_WIDTH
        : 0
    );
  };

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
        <div className="transaction-icon">
          $
        </div>

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
  const [message, setMessage] = useState("");
  const [safeToSpend, setSafeToSpend] =
    useState(null);

  const [transactions, setTransactions] =
    useState([]);

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
      throw new Error(
        "Could not load transactions."
      );
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
        // Budget may not exist yet.
      }
    };

    loadDashboard();

    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

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

      const response = await fetch(
        `${API_BASE_URL}/api/safe-to-spend/allocation`,
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

      const newBudget =
        Number(
          safeToSpend.allocation
        ) + amountToAdd;

      const response = await fetch(
        `${API_BASE_URL}/api/safe-to-spend/allocation`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            amount: newBudget,
            startDate:
              safeToSpend.startDate,
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

      setAddAmount("");
      setBudgetMode(null);

      setMessage(
        `$${formatMoney(
          amountToAdd
        )} added to your budget ✓`
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

      setMessage(
        "Checking for new purchases..."
      );

      const response = await fetch(
        `${API_BASE_URL}/api/gmail/refresh`,
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

      await fetchSafeToSpend();
      await fetchTransactions();

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
        setDeletingTransaction(true);

        const deletedTransaction =
          transactionToDelete;

        const response = await fetch(
          `${API_BASE_URL}/api/gmail/transactions/${deletedTransaction.id}`,
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
      const transaction =
        undoTransaction;

      if (undoTimerRef.current) {
        clearTimeout(
          undoTimerRef.current
        );

        undoTimerRef.current = null;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/gmail/transactions/${transaction.id}/restore`,
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
              Purchases on or after this date count
              toward Safe to Spend.
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