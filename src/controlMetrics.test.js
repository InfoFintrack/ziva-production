import {setBalance,payrollHtml} from './controlMetrics';
test('set balance keeps repeated labour operations separate and flags paid pieces above cuts',()=>{
 const po={po_number:'P',shirt_qty:200,trouser_qty:100,dupatta_qty:0};
 const events=[{po_number:'P',component:'shirt',event_type:'Cut',quantity:160}];
 const pay=operation=>({po_number:'P',component:'shirt',department:'Stitching',operation,payment_status:'Paid',qty_claimed:160});
 expect(setBalance(po,events,[],[pay('Shirt'),pay('Shirt Patching')])[0].paid).toBe(160);
 const mismatch=setBalance(po,events,[],[{...pay('Shirt'),qty_claimed:162}])[0];
 expect(mismatch.paid).toBe(162);expect(mismatch.issues).toContain('Output or claims exceed cuts');
});
test('payout download requires CEO approval and escapes worker names',()=>{
 const run={status:'Pending_CEO',snapshot:{workers:[{code:'0001',name:'<script>',gross:100,recovery:20,net:80}],net:80}};
 expect(()=>payrollHtml(run)).toThrow('CEO-approved');
 const html=payrollHtml({...run,status:'Approved'});expect(html).toContain('&lt;script&gt;');expect(html).toContain('80.00');
});
