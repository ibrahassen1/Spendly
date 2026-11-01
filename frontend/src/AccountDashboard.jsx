import { useCallback, useEffect, useState } from 'react';
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const money = n => Number(n || 0).toLocaleString('en-US',{style:'currency',currency:'USD'});
export default function AccountDashboard({getToken}) {
  const [balance,setBalance]=useState(null),[transactions,setTransactions]=useState([]);
  const [amount,setAmount]=useState(''),[startDate,setStartDate]=useState(new Date().toISOString().slice(0,10));
  const [trackingDate,setTrackingDate]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[gmailConnected,setGmailConnected]=useState(false);
  const api=useCallback(async (path,options={})=>{
    const token=await getToken();
    if(!token)throw new Error('Sign in again');
    const response=await fetch(API+'/api/account'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
    if(!response.ok)throw new Error(response.status===404?'Set an opening balance to get started':`Request failed (HTTP ${response.status})`);
    return response.json();
  },[getToken]);
  const refresh=useCallback(async ()=>{
    try {
      const b=await api('/balance');setBalance(b);
      const [tx,date]=await Promise.all([api('/transactions'),api('/tracking-date')]);
      setTransactions(tx);setTrackingDate(date.startDate);
      const status=await api('/gmail/connection/status');setGmailConnected(status.connected);
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
  return <main style={{minHeight:'100vh',background:'#07131b',color:'#eefaff',padding:'72px 24px',fontFamily:'system-ui'}}>
    <div style={{maxWidth:680,margin:'auto'}}>
      <h1 style={{fontSize:36,marginBottom:4}}>Spendly</h1><p style={{color:'#9eb4c1'}}>Your safe-to-spend dashboard</p>
      {balance ? <section style={{padding:24,background:'#102431',borderRadius:16,marginTop:30}}>
        <div style={{color:'#a6bfcb'}}>Safe to spend</div>
        <div style={{fontSize:44,fontWeight:750}}>{money(balance.safeToSpend)}</div>
        <p>Allocated: {money(balance.allocation)} · Purchases: {money(balance.countedSpending)}</p>
      </section> : <form onSubmit={setOpening} style={{padding:24,background:'#102431',borderRadius:16}}>
        <h2>Set opening balance</h2><label>Amount <input required type="number" min="0" step=".01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label style={{display:'block',marginTop:16}}>Start date <input required type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <button disabled={busy} style={{marginTop:18}}>Save balance</button>
      </form>}
      {balance && <section style={{marginTop:24,padding:24,background:'#102431',borderRadius:16}}>
        <h2>Gmail purchases</h2>
        {gmailConnected ? <button disabled={busy} onClick={syncPurchases}>Sync Purchases</button> : <button disabled={busy} onClick={connectGmail}>Connect Gmail</button>}
        <p style={{color:'#9eb4c1'}}>{gmailConnected ? "Gmail connected. Purchases import only when you press Sync." : "Connect your Gmail to import Discover and Wells Fargo purchase alerts."}</p>
        <form onSubmit={saveDate}><label>Track purchases starting <input type="date" value={trackingDate} onChange={e=>setTrackingDate(e.target.value)}/></label>
        <button disabled={busy} style={{marginLeft:12}}>Save date</button></form>
      </section>}
      <section style={{marginTop:24}}><h2>Transactions</h2>{transactions.length===0?<p>No purchases imported yet.</p>:transactions.map(tx=><div key={tx.id} style={{display:'flex',justifyContent:'space-between',padding:'14px 0',borderBottom:'1px solid #24414c'}}><span>{tx.merchant}<small style={{display:'block',color:'#9eb4c1'}}>{tx.date}</small></span><strong>-{money(tx.amount)}</strong></div>)}</section>
      {message&&<p role="status">{message}</p>}
    </div>
  </main>;
}
