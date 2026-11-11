import React,{useState} from 'react';
import {updateAllocation} from '../api';
export default function ReworkAcceptance({allocation,onSaved}) {
 const [open,setOpen]=useState(false),[quantity,setQuantity]=useState(''),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const save=async e=>{e.preventDefault();setBusy(true);try{const r=await updateAllocation({action:'accept_rework',id:allocation.id,quantity:Number(quantity),reason});if(!r.success)throw new Error(r.message);setOpen(false);await onSaved();}catch(error){setMessage(error.message);}setBusy(false);};
 return <><button className="btn btn-small" type="button" onClick={()=>setOpen(!open)}>Accept rework</button>{open && <form onSubmit={save}><p>Verify repaired pieces before accepting. This does not add another allocation or return.</p><label>Rework now accepted<input required type="number" min="1" max={allocation.qty_rework} step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>Verification note<input required value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy}>Record acceptance</button>{message && <p role="alert">{message}</p>}</form>}</>;
}
