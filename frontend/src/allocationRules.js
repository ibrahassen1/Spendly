/** Side-effect-free allocation calculations used by the authenticated dashboard. */
export function sumExpenses(items=[]) {
  const cents=items.reduce((sum, item)=>sum+Math.round(Number(item.amount||0)*100),0);
  return cents/100;
}

export function allocationTotal(categories=[]) {
  return categories.reduce((sum,c)=>sum+(Number(c.percent)||0),0);
}

/**
 * Adjust an allocation and use Safe to Spend as the primary remainder.
 * Always maintain a 100% total for a valid starting plan, including when
 * the safe slider itself changes.
 */
export function rebalanceAllocations(previous,id,value) {
  const next=previous.map(c=>({...c}));
  const active=next.find(c=>c.id===id);
  const safe=next.find(c=>c.kind==="safe");
  if (!active || !safe) return next;
  const target=Math.max(0,Math.min(100,Math.round(Number(value)||0)));
  if (active.id!==safe.id) {
    const change=Math.max(-active.percent,Math.min(target-active.percent,safe.percent));
    active.percent+=change;
    safe.percent-=change;
  } else {
    const others=next.filter(c=>c.kind!=="safe").sort((a,b)=>b.percent-a.percent);
    let change=target-safe.percent;
    if (change>0) {
      for(const other of others){
        const taken=Math.min(change,other.percent);
        other.percent-=taken;
        change-=taken;
        if (!change) break;
      }
      safe.percent=target-change;
    } else if(others.length) {
      others[0].percent+=-change;
      safe.percent=target;
    }
  }
  return next;
}

export function paycheckAllocationsInCents(amount,categories=[]) {
  const cents=Math.round(Number(amount)*100);
  if (!Number.isFinite(cents)||cents<=0 || allocationTotal(categories)!==100 ||
      categories.filter(c=>c.kind==="safe").length!==1)
    throw new Error("Paycheck needs one Safe to Spend category and 100% allocations.");
  const safe=categories.find(c=>c.kind==="safe");
  const safeCents=Math.round(cents*safe.percent/100);
  const goalCategories=categories.filter(c=>c.kind!=="safe");
  const goals={};
  let remainder=cents-safeCents;
  goalCategories.forEach((category,index)=>{
    const share=index===goalCategories.length-1
      ? remainder : Math.min(remainder,Math.round(cents*category.percent/100));
    goals[category.id]=share;
    remainder-=share;
  });
  return {paycheckCents:cents,plannedSafeCents:safeCents,goals};
}
