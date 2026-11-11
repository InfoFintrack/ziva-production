import React,{useEffect,useState} from 'react';
import {getAllocationCapacity} from '../api';
export default function AllocationCapacity({po,component,module}) {
 const [state,setState]=useState(null);
 useEffect(()=>{let active=true;setState(null);if(po && component)getAllocationCapacity({po_number:po,component:component.toLowerCase(),module_type:module}).then(r=>{if(active)setState(r);}).catch(()=>{if(active)setState({success:false,message:'Could not check cut balance. Refresh before allocating.'});});return()=>{active=false;};},[po,component,module]);
 return <div role="status" style={{padding:12,color:'#e6edf3'}}>1. Record verified garment cuts in Production flow. 2. Allocate within the cut balance. 3. Update returned, accepted, rework and rejected pieces in Live Tracker.
 {state && <p style={{color:!state.success || state.available===0?'#ff7373':'#57d2bb'}}>{state.success ? `${state.cut} cut · ${state.allocated} already allocated to this operation · ${state.available} available` : state.message}</p>}</div>;
}
