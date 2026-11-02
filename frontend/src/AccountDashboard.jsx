import { useCallback, useEffect, useState } from 'react';
import FinanceDashboard from './FinanceDashboard.jsx';
import './App.css';
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const money = n => Number(n || 0).toLocaleString('en-US',{style:'currency',currency:'USD'});
export default function AccountDashboard({getToken}) {
  const [balance,setBalance]=useState(null),[transactions,setTransactions]=useState([]);
  const [activePage,setActivePage]=useState('dashboard');
  const [amount,setAmount]=useState(''),[startDate,setStartDate]=useState(new Date().toISOString().slice(0,10));
  const [trackingDate,setTrackingDate]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[gmailConnected,setGmailConnected]=useState(false);
  const api=useCallback(async (path,options={})=>{
    const token=await getToken();
    if(!token)throw new Error('Sign in again');
    const response=await fetch(API+'/api/account'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
    if(!response.ok){const detail=await response.text();throw new Error(response.status===404?'Set an opening balance to get started':`Request failed (HTTP ${response.status}): ${detail.slice(0,160)}`);}
    return response.json();
  },[getToken]);
  const refresh=useCallback(async ()=>{
    try {
      let b=null;
      try { b=await api('/balance'); } catch(e) { if(!e.message.includes('opening balance')) throw e; }
      setBalance(b);
      if(b){
        const [tx,date,status]=await Promise.all([api('/transactions'),api('/tracking-date'),api('/gmail/connection/status')]);
        setTransactions(tx);setTrackingDate(date.startDate);setGmailConnected(status.connected);
      }
    } catch(e){setMessage(e.message);}
  },[api]);
  useEffect(()=>{refresh();},[refresh]);
  const connectGmail=async()=>{
    setBusy(true);setMessage('');
    try{
      const result=await api('/gmail/connection/start',{method:'POST'});
      window.location.assign(result.authorizationUrl);
    }catch(e){setMessage(e.message);setBusy(false);}
  };
  const syncPurchases=async()=>{
    setBusy(true);setMessage('Checking Gmail for purchases…');
    try{
      const result=await api('/gmail/sync',{method:'POST'});
      await refresh();
      setMessage(result.message+' ('+result.imported+' new, '+result.found+' matched)');
    }catch(e){setMessage(e.message);}finally{setBusy(false);}
  };
  const setOpening=async e=>{
    e.preventDefault();setBusy(true);setMessage('');
    try {await api('/balance',{method:'POST',body:JSON.stringify({amount:Number(amount),startDate})});await refresh();setMessage('Opening balance saved');}
    catch(e){setMessage(e.message);}finally{setBusy(false);}
  };
  const saveDate=async e=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{await api('/tracking-date',{method:'PATCH',body:JSON.stringify({startDate:trackingDate})});setMessage('Tracking date saved');}
    catch(e){setMessage(e.message);}finally{setBusy(false);}
  };
  return <main className="app" style={{minHeight:'100vh',paddingBottom:110}}>
    <div className="dashboard" style={{maxWidth:880,width:'100%'}}>
      <header className="app-header"><div><p className="eyebrow">SPENDLY</p><h1>Your money, in focus.</h1></div><span className="status-dot"/></header>
      {activePage==='dashboard' && <FinanceDashboard view="dashboard" safeToSpend={balance} onBudgetSaved={refresh}/>}
      {activePage==='goals' && <FinanceDashboard view="goals" safeToSpend={balance}/>}
      {activePage==='spend' && <>
        {balance ? <section className="safe-card">
          <div className="safe-top"><p className="label">SAFE TO SPEND</p><span className="period">Since {balance.startDate}</span></div>
          <div className="amount">{money(balance.safeToSpend)}</div>
          <p>Allocated: {money(balance.allocation)} · Purchases: {money(balance.countedSpending)}</p>
        </section> : <form onSubmit={setOpening} className="safe-card">
          <h2>Set opening Safe-to-Spend balance</h2>
          <label>Amount <input required type="number" min="0" step=".01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
          <label style={{display:'block',marginTop:16}}>Start date <input required type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
          <button disabled={busy} style={{marginTop:18}}>Save balance</button>
        </form>}
        {balance && <section className="finance-panel" style={{marginTop:24}}>
          <h2>Gmail purchases</h2>
          {gmailConnected ? <button disabled={busy} onClick={syncPurchases}>Sync Purchases</button> : <button disabled={busy} onClick={connectGmail}>Connect Gmail</button>}
          <p>{gmailConnected ? "Gmail connected. Purchases import only when you press Sync." : "Connect Gmail to import Discover and Wells Fargo alerts."}</p>
          <form onSubmit={saveDate}><label>Track purchases starting <input type="date" value={trackingDate} onChange={e=>setTrackingDate(e.target.value)}/></label>
          <button disabled={busy}>Save date</button></form>
        </section>}
        <section className="finance-panel" style={{marginTop:24}}><h2>Transactions</h2>
          {transactions.length===0?<p>No purchases imported yet.</p>:transactions.map(tx=><div key={tx.id} style={{display:'flex',justifyContent:'space-between',padding:'14px 0',borderBottom:'1px solid #303030'}}><span>{tx.merchant}<small style={{display:'block'}}>{tx.date}</small></span><strong>-{money(tx.amount)}</strong></div>)}
        </section>
      </>}
      {message&&<p role="status">{message}</p>}
      <nav style={{position:'fixed',bottom:0,left:0,right:0,display:'flex',justifyContent:'center',gap:12,padding:'16px 12px',background:'#0b0b0bf5',borderTop:'1px solid #333',zIndex:20}}>
        {[['dashboard','Dashboard'],['spend','Safe to Spend'],['goals','Goals']].map(([id,label])=><button key={id} type="button" onClick={()=>setActivePage(id)} style={{background:activePage===id?'#b8ff26':'#222',color:activePage===id?'#080808':'#eee',border:0,borderRadius:14,padding:'12px 20px',fontWeight:700}}>{label}</button>)}
      </nav>
    </div>
  </main>;
}
