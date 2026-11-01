import { useState } from "react";

export default function SpendlyCoach({goals = {}, onSave, disabled = false}) {
 const [open,setOpen] = useState(false);
 const [saving,setSaving] = useState(String(goals.savings?.target || ""));
 const [investing,setInvesting] = useState(String(goals.investments?.target || ""));
 const [months,setMonths] = useState(String(goals.timelineMonths || 18));
 const [error,setError] = useState("");
 const submit = () => {
  if (![saving,investing].every(x => x.trim()==="" || (Number.isFinite(Number(x)) && Number(x)>=0))) return setError("Enter valid goal amounts.");
  if (!Number.isInteger(Number(months)) || Number(months)<1 || Number(months)>600) return setError("Choose a timeline between 1 and 600 months.");
  onSave({savings:saving.trim(),investments:investing.trim(),months:Number(months)});
  setError("");
  setOpen(false);
 };
 return <section className="coach-section">
  <button type="button" className="coach-launch" onClick={()=>{setSaving(String(goals.savings?.target || ""));setInvesting(String(goals.investments?.target || ""));setMonths(String(goals.timelineMonths || 18));setOpen(v=>!v);}} aria-expanded={open}>
   <span className="coach-sparkle">✦</span><span><strong>Your financial goals</strong><small>Tell Spendly what you're working toward · optional</small></span><span>{open?"−":"+"}</span>
  </button>
  {open && <div className="coach-body">
   <div className="coach-header"><span>✦ Spendly Coach</span><small>Just your goals — no budget interview</small></div>
   <div className="coach-bubble">What would you like your money to do for you? Set either goal, both, or neither. We'll suggest a split after you add expenses and enter a paycheck.</div>
   <div className="coach-goal-fields">
    <label>Savings goal ($)<input type="number" min="0" step="0.01" placeholder="Optional — e.g. 15000" value={saving} onChange={e=>setSaving(e.target.value)} /></label>
    <label>Investment contribution goal ($)<input type="number" min="0" step="0.01" placeholder="Optional — e.g. 1000" value={investing} onChange={e=>setInvesting(e.target.value)} /></label>
    <label>Goal timeline (months)<input type="number" min="1" max="600" step="1" value={months} onChange={e=>setMonths(e.target.value)} /></label>
   </div>
   {error && <p className="coach-error" role="alert">{error}</p>}
   <p className="coach-disclaimer">No investment goal is required. Saving goals here does not submit or credit a paycheck.</p>
   <div className="coach-footer"><span>Step 1 · Your priorities</span><button type="button" className="coach-primary" disabled={disabled} onClick={submit}>Save goals</button></div>
  </div>}
 </section>;
}
