import { useState } from "react";

// Guided local MVP: no model calls, API keys, or sensitive account data shared.
const money = (n) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
const questions = [
  { key:"goals", label:"What are your money goals?", hint:"For example: save $15,000 and invest $1,000", type:"text" },
  { key:"paycheck", label:"How much is your usual take-home paycheck?", hint:"Amount after taxes", type:"number" },
  { key:"frequency", label:"How often do you get paid?", type:"select", options:[["weekly","Every week"],["biweekly","Every 2 weeks"],["semimonthly","Twice a month"],["monthly","Every month"]] },
  { key:"expenses", label:"How much of each paycheck goes to essentials?", hint:"Rent, bills, groceries, transportation", type:"number" },
  { key:"months", label:"When would you like to reach your goals?", hint:"Number of months (e.g. 18)", type:"number" },
];
function parseGoals(text) {
  const amounts = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].map(x=>Number(x[1].replaceAll(",","")));
  const savings = /sav|emergency|rainy|fund/i.test(text) ? (amounts[0] || 0) : 0;
  const investments = /invest|stock|etf|portfolio/i.test(text) ? (amounts[amounts.length > 1 ? 1 : 0] || 0) : 0;
  return {savings,investments};
}
function suggest(values) {
  const paycheck = Number(values.paycheck);
  const essentials = Number(values.expenses);
  const months = Number(values.months);
  const yearly = {weekly:52,biweekly:26,semimonthly:24,monthly:12}[values.frequency];
  const checks = months * yearly / 12;
  const goals = parseGoals(values.goals);
  const available = paycheck - essentials;
  const savingPerCheck = goals.savings / checks;
  const investingPerCheck = goals.investments / checks;
  // Reserve at least 10% for discretionary spending when feasible.
  const room = Math.max(0, available - paycheck*.1);
  const desired = savingPerCheck + investingPerCheck;
  const factor = desired > 0 ? Math.min(1,room/desired) : 0;
  const savings = Math.floor(savingPerCheck*factor/paycheck*100);
  const investments = Math.floor(investingPerCheck*factor/paycheck*100);
  const expenses = Math.ceil(essentials/paycheck*100);
  const spend = Math.max(0,100-expenses-savings-investments);
  return {splits:{spend,expenses,investments,savings},goals,desired,available,feasible:desired<=room,checks,perCheck:{savings:savingPerCheck,investments:investingPerCheck}};
}
export default function SpendlyCoach({onApply,disabled=false}) {
 const [open,setOpen] = useState(false);
 const [step,setStep] = useState(0);
 const [values,setValues] = useState({goals:"",paycheck:"",frequency:"biweekly",expenses:"",months:"18"});
 const [error,setError] = useState("");
 const [result,setResult] = useState(null);
 const q=questions[step];
 const next=()=>{
  if(q.key==="goals" && !values.goals.trim()) return setError("Tell me what you're working toward.");
  if(q.key==="paycheck" && !(Number(values.paycheck)>0)) return setError("Enter a paycheck greater than $0.");
  if(q.key==="expenses" && !(Number(values.expenses)>=0 && Number(values.expenses)<Number(values.paycheck)) return setError("Essentials must be less than your paycheck.");
  if(q.key==="months" && !(Number(values.months)>0 && Number(values.months)<=600)) return setError("Enter a realistic timeframe in months.");
  setError("");
  if(step===questions.length-1) {setResult(suggest(values));return;}
  setStep(x=>x+1);
 };
 return <section className="coach-section">
  <button type="button" className="coach-launch" onClick={()=>setOpen(x=>!x)} aria-expanded={open}>
    <span className="coach-sparkle">✦</span><span><strong>Need help splitting your paycheck?</strong><small>Build a plan with Spendly Coach</small></span><span aria-hidden="true">{open?"−":"+"}</span>
  </button>
  {open && <div className="coach-body">
   <div className="coach-header"><span>✦ Spendly Coach</span><small>Guided preview · No AI API yet</small></div>
   {!result ? <>
    <div className="coach-bubble">Hey! I'll help you find a starting budget. {q.label}</div>
    <div className="coach-reply">
     {q.type==="select" ? <select aria-label={q.label} value={values[q.key]} onChange={e=>setValues(v=>({...v,[q.key]:e.target.value}))}>{q.options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select> :
      <input aria-label={q.label} type={q.type} min={q.type==="number"?"0":undefined} step={q.type==="number"?"any":undefined} placeholder={q.hint} value={values[q.key]} onChange={e=>setValues(v=>({...v,[q.key]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();next();}}}/>}
    </div>
    {error && <p className="coach-error" role="alert">{error}</p>}
    <div className="coach-footer"><span>{step+1} of {questions.length}</span><div>{step>0 && <button type="button" className="coach-secondary" onClick={()=>{setStep(x=>x-1);setError("");}}>Back</button>}<button type="button" className="coach-primary" onClick={next}>{step===questions.length-1?"Build my plan":"Continue"}</button></div></div>
   </> : <>
    <div className="coach-bubble">Here's a starting point based on your take-home pay, essentials, and timeline.</div>
    <div className="coach-result">
     {Object.entries(result.splits).map(([key,pct])=><div key={key}><span>{({spend:"Safe to Spend",expenses:"Essentials",investments:"Investments",savings:"Savings"})[key]}</span><strong>{pct}% · {money(Number(values.paycheck)*pct/100)}</strong></div>)}
    </div>
    {!result.feasible && <p className="coach-warning">Your goals would require about {money(result.desired)} per paycheck, leaving too little for spending. This split is a more conservative starting point; consider a longer timeline.</p>}
    <p className="coach-disclaimer">Planning estimate only, not personalized investment advice. This changes your planner percentages, not your bank balance or submitted paycheck history.</p>
    <div className="coach-footer"><button type="button" className="coach-secondary" onClick={()=>{setResult(null);setStep(0);}}>Start over</button><button type="button" className="coach-primary" disabled={disabled} onClick={()=>{onApply(result.splits,result.goals,values.paycheck);setOpen(false);}}>Use this plan</button></div>
    {disabled && <p className="coach-warning">Wait for your planner to finish loading before applying.</p>}
   </>}
  </div>}
 </section>;
}
