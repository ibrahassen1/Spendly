import { useState } from "react";

export default function SpendlyCoach({goals = {}, onSave, disabled = false}) {
 const [open,setOpen] = useState(false);
 const [saving,setSaving] = useState(String(goals.savings?.target || ""));
 const [investing,setInvesting] = useState(String(goals.investments?.target || ""));
 const [months,setMonths] = useState(String(goals.timelineMonths || 18));
 const [error,setError] = useState("");
 const submit = () => {
  if (![saving,investing].every(x => x.trim()==="" || (Number.isFinite(Number(x)) && Number(x)>=0))) return setError("Enter valid amounts.");
  if (!Number.isInteger(Number(months)) || Number(months)<1 || Number(months)>600) return setError("Enter a valid timeline.");
  onSave({savings:saving.trim(),investments:investing.trim(),months:Number(months)});
  setError("");
  setOpen(false);
 };
 return <section className="coach-section">
  <button type="button" className="coach-launch" onClick={()=>{setSaving(String(goals.savings?.target || ""));setInvesting(String(goals.investments?.target || ""));setMonths(String(goals.timelineMonths || 18));setOpen(v=>!v);}} aria-expanded={open}>
   <span className="coach-sparkle">✦</span><span><strong>Your goals</strong><small>Plan what matters to you</small></span><span>{open?"−":"+"}</span>
  </button>
  {open && <div className="coach-body">
   <div className="coach-header"><span>✦ Your goals</span></div>
   <div className="coach-goal-fields" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 220px), 1fr))",gap:"20px",alignItems:"end"}}>
    <label style={{display:"flex",flexDirection:"column",gap:9}}>Save ($)<input style={{width:"100%",boxSizing:"border-box"}} type="number" min="0" step="0.01" placeholder="Optional" value={saving} onChange={e=>setSaving(e.target.value)} /></label>
    <label style={{display:"flex",flexDirection:"column",gap:9}}>Invest ($)<input style={{width:"100%",boxSizing:"border-box"}} type="number" min="0" step="0.01" placeholder="Optional" value={investing} onChange={e=>setInvesting(e.target.value)} /></label>
    <label style={{display:"flex",flexDirection:"column",gap:9}}>Timeline (months)<input style={{width:"100%",boxSizing:"border-box"}} type="number" min="1" max="600" step="1" value={months} onChange={e=>setMonths(e.target.value)} /></label>
   </div>
   {error && <p className="coach-error" role="alert">{error}</p>}
   <div className="coach-footer" style={{marginTop:24,display:"flex",justifyContent:"flex-end"}}><button type="button" className="coach-primary" disabled={disabled} onClick={submit}>Save goals</button></div>
  </div>}
 </section>;
}
