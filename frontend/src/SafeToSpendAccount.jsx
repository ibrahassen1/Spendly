import { useMemo, useState } from "react";
import "./AllocationStudio.css";

const money = value => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(Number(value)||0);
const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
};
const iso = value => value ? String(value).slice(0, 10) : "";
const prettyDate = value => {
  const day = iso(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Unknown date";
  return new Date(day+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
};
const validMoney = text => /^-?\d+(\.\d{1,2})?$/.test(text.trim()) &&
  Number.isFinite(Number(text)) && Math.abs(Number(text))<=9999999999.99;
const NOTES = ["Paycheck", "Zelle for food", "Refund", "Barbering income"];

export default function SafeToSpendAccount({
  balance, transactions = [], adjustments = [], request, refresh,
  gmailConnected, gmailBusy, syncGmail, connectGmail, disconnectGmail,
  refreshGmail, gmailMessage, updateTransaction,
}) {
  const [panel,setPanel] = useState("");
  const [amount,setAmount] = useState("");
  const [startDate,setStartDate] = useState(today());
  const [adjustAmount,setAdjustAmount] = useState("");
  const [note,setNote] = useState("");
  const [occurredOn,setOccurredOn] = useState(today());
  const [adjustId,setAdjustId] = useState(()=>"adj-"+crypto.randomUUID());
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [viewMore,setViewMore] = useState(false);
  const [filter,setFilter] = useState("all");

  const open = mode => {
    setNotice("");
    if (mode==="budget") {
      setAmount(String(balance?.allocation ?? "0"));
      setStartDate(iso(balance?.startDate) || today());
    } else {
      setAdjustAmount("");
      setNote("");
      setOccurredOn(today());
    }
    setPanel(mode);
  };

  const saveBaseline = async event => {
    event.preventDefault();
    if (!validMoney(amount) || !startDate || startDate>today()) {
      setNotice("Enter a valid starting balance and a tracking date no later than today.");return;
    }
    if (!window.confirm("Set a new starting balance and tracking date? Existing activity history will be retained, but counted purchases will be recalculated.")) return;
    setBusy(true);setNotice("");
    try {
      await request("/api/account/safe-to-spend/baseline",{
        method:"PUT",body:JSON.stringify({amount:Number(amount),startDate})
      });
      await refresh();
      setPanel("");
      setNotice("Starting balance and date updated. Earlier history was retained.");
    } catch(error) {setNotice("Unable to update your budget: "+error.message);}
    finally {setBusy(false);}
  };

  const saveAdjustment = async event => {
    event.preventDefault();
    if (!validMoney(adjustAmount) || Number(adjustAmount)===0 || !note.trim() ||
      note.trim().length>200 || !occurredOn || occurredOn>today()) {
      setNotice("Enter a nonzero amount, a note, and a valid date.");return;
    }
    setBusy(true);setNotice("");
    try {
      await request("/api/account/safe-to-spend/adjustments",{
        method:"POST",body:JSON.stringify({requestId:adjustId,amount:Number(adjustAmount),note:note.trim(),occurredOn})
      });
      await refresh();
      setPanel("");
      setAdjustId("adj-"+crypto.randomUUID());
      setNotice("Money adjustment saved.");
    } catch(error) {
      setNotice("Unable to save adjustment: "+error.message+". Retry without changing the amount to prevent duplicates.");
    } finally {setBusy(false);}
  };

  const rows=useMemo(()=>{
    const tx=transactions.map(t=>{
      const day=iso(t.date);
      const counted=day>=iso(balance?.startDate) && String(t.status).toUpperCase()==="TEMPORARY";
      return {id:"transaction-"+t.id,title:t.merchant||"Bank purchase",
        date:day,time:t.transactionTime, last4:t.cardLast4,amount:-Number(t.amount||0),
        type:"transaction",counted,status:t.status,source:t};
    });
    const adj=adjustments.map(a=>({id:"adjustment-"+a.id,
      title:a.note||"Manual adjustment",date:iso(a.occurredOn||a.createdAt),
      time:a.createdAt,amount:Number(a.amount||0),type:"money",counted:true}));
    return [...tx,...adj].filter(x=>filter==="all" || x.type===filter)
      .sort((a,b)=>b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  },[transactions,adjustments,balance?.startDate,filter]);
  const shown=viewMore?rows:rows.slice(0,5);
  const allowedSync=gmailConnected===true && !gmailBusy;

  return <div className="spendly-preview-safe spendly-account-safe">
    <section className="spendly-preview-hero">
      <div className="spendly-preview-hero-top"><span>SAFE TO SPEND</span><span>Since {prettyDate(balance?.startDate)}</span></div>
      <h2 className={Number(balance?.safeToSpend)<0?"spendly-preview-negative":"spendly-preview-positive"}>
        {balance?money(balance.safeToSpend):"—"}
      </h2>
      <p>Available without touching the rest of your money.</p>
      <div className="spendly-preview-stats">
        <div><span>Budget</span><strong>{balance?money(balance.allocation):"—"}</strong></div>
        <div><span>Spent</span><strong>{balance?money(balance.countedSpending):"—"}</strong></div>
      </div>
    </section>
    <div className="spendly-preview-actions">
      {gmailConnected===false
        ? <button className="spendly-preview-refresh" type="button" disabled={gmailBusy} onClick={connectGmail}>Connect Gmail to Sync</button>
        : <button className="spendly-preview-refresh" type="button" disabled={!allowedSync} onClick={syncGmail}>{gmailBusy?"Syncing…":"↻ Refresh Transactions"}</button>}
      <button type="button" onClick={()=>open("money")} disabled={!balance}>＋ Add Money</button>
      <button type="button" onClick={()=>open("budget")}>Edit Budget</button>
    </div>
    <details className="spendly-account-connection"><summary>Gmail connection settings</summary>
      <p>{gmailConnected===true?"Gmail connected":gmailConnected===false?"Gmail not connected":"Connection status unavailable"}</p>
      <button type="button" onClick={refreshGmail} disabled={gmailBusy}>Check connection</button>
      {gmailConnected===true && <button type="button" onClick={disconnectGmail} disabled={gmailBusy}>Disconnect Gmail</button>}
    </details>
    {(notice || gmailMessage) && <p role="status" className="allocation-message">{notice || gmailMessage}</p>}

    <section className="spendly-preview-activity">
      <div className="spendly-preview-activity-head"><div><span>CURRENT PERIOD</span><h3>Recent Activity</h3></div><small>{rows.length} entries</small></div>
      <div className="spendly-preview-filters">
        {[["all","All Activity"],["transaction","Transactions"],["money","Money Added"]].map(([id,label])=>
          <button key={id} type="button" className={filter===id?"active":""} onClick={()=>{setFilter(id);setViewMore(false);}}>{label}</button>)}
      </div>
      <div className="spendly-preview-ledger">
        {shown.map(entry=><div className="spendly-preview-entry" key={entry.id}>
          <div className="spendly-preview-entry-icon">{entry.type==="transaction"?"▣":entry.amount>=0?"+":"−"}</div>
          <div className="spendly-preview-entry-detail"><strong>{entry.title}</strong>
            <small>{prettyDate(entry.date)}{entry.last4?" · •••• "+entry.last4:""}</small>
            {entry.type==="transaction" && !entry.counted && <small className="spendly-preview-excluded">Not counted in balance</small>}
            {entry.type==="transaction" && <button className="spendly-account-transaction-toggle" type="button" disabled={gmailBusy}
              onClick={()=>updateTransaction(entry.source,String(entry.status).toUpperCase()==="DELETED")}>
              {String(entry.status).toUpperCase()==="DELETED"?"Restore transaction":"Exclude transaction"}
            </button>}
          </div>
          <strong className={entry.amount>=0?"spendly-preview-positive":"spendly-preview-negative"}>
            {entry.amount>0?"+":""}{money(entry.amount)}
          </strong>
        </div>)}
        {!shown.length && <p className="spendly-preview-empty">No activity yet.</p>}
      </div>
      {rows.length>5 && <button type="button" className="spendly-preview-more" onClick={()=>setViewMore(v=>!v)}>{viewMore?"Show Less ↑":"View More →"}</button>}
    </section>

    {panel && <div className="spendly-preview-overlay" role="presentation" onClick={()=>!busy&&setPanel("")}>
      <section className="spendly-preview-modal" role="dialog" aria-modal="true" aria-labelledby="spendly-safe-modal-title" onClick={event=>event.stopPropagation()}>
        <div className="spendly-preview-modal-head"><h3 id="spendly-safe-modal-title">{panel==="budget"?"Edit Budget":"Add / Remove Money"}</h3>
          <button type="button" aria-label="Close" disabled={busy} onClick={()=>setPanel("")}>×</button></div>
        {notice && <p role="alert" className="allocation-message">{notice}</p>}
        {panel==="budget"?<>
          <p>Set a starting balance and the date to begin counting Gmail transactions.</p>
          <form onSubmit={saveBaseline}>
            <label>Starting balance<input type="number" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} required /></label>
            <label>Count transactions from<input type="date" max={today()} value={startDate} onChange={e=>setStartDate(e.target.value)} required /></label>
            <p className="spendly-preview-modal-note">Previous history remains visible. Changing the baseline recalculates your available money.</p>
            <div className="spendly-preview-modal-buttons"><button type="button" disabled={busy} onClick={()=>setPanel("")}>Cancel</button><button type="submit" disabled={busy}>{busy?"Saving…":"Save Changes"}</button></div>
          </form>
        </>:<>
          <p>Manually add or remove money with a note and date.</p>
          <form onSubmit={saveAdjustment}>
            <label>Amount (+/−)<input type="number" step=".01" placeholder="+75 or -40" value={adjustAmount} onChange={e=>setAdjustAmount(e.target.value)} required /></label>
            <label>Reason / note
              <select value={NOTES.includes(note)?note:"custom"} onChange={e=>setNote(e.target.value==="custom"?"":e.target.value)}>
                <option value="custom">Custom note…</option>{NOTES.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
              <input maxLength={200} placeholder="Why are you changing your balance?" value={note} onChange={e=>setNote(e.target.value)} required />
            </label>
            <label>When it happened<input type="date" max={today()} value={occurredOn} onChange={e=>setOccurredOn(e.target.value)} required /></label>
            <div className="spendly-preview-modal-buttons"><button type="button" disabled={busy} onClick={()=>setPanel("")}>Cancel</button><button type="submit" disabled={busy}>{busy?"Saving…":"Save Adjustment"}</button></div>
          </form>
        </>}
      </section>
    </div>}
  </div>;
}
