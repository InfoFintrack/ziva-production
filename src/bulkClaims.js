import {getClaimAvailability} from './api';
export function groupAllocations(rows) {
 const map=new Map();
 rows.forEach(a=>{const component=String(a.component).trim().toLowerCase();const key=[a.po_number,a.stitcher_code,component].join('|');if(!map.has(key))map.set(key,{...a,component,qty_accepted:0});map.get(key).qty_accepted+=Number(a.qty_accepted || 0);});
 return [...map.values()];
}
export async function prepareBulkClaims(rows) {
 return Promise.all(rows.filter(r=>r.department && r.operation).map(async r=>{
  const result=await getClaimAvailability(r);
  if(!result.success)throw new Error(result.message || 'Could not check cut and accepted balances.');
  const claimable=Math.min(...result.operations.map(o=>o.claimable));
  return {...r,claimable,qty_claimed:String(claimable),amount:claimable*Number(r.rate || 0),alreadyLogged:claimable===0};
 }));
}
