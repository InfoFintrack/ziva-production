// Isolated local database only. Never reads DATABASE_URL or .env.
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {claimAvailability}=require('../api/_lib/claimPolicy');
const {controlTransaction:tx,handleControls}=require('../api/_lib/controls');
const pool=new Pool({host:'127.0.0.1',port:55432,user:'postgres',password:'localtest',database:'postgres',ssl:false});
const admin={role:'Admin',name:'Admin'},ceo={role:'CEO',name:'CEO'},accounts={role:'Accounts',name:'Accounts'};
let passed=0;
async function check(name,fn){await fn();passed++;process.stdout.write(`PASS ${name}\n`);}
async function fails(fn,pattern){await assert.rejects(fn,pattern);}
const sql=(text,args=[],user=admin)=>tx(pool,user,c=>c.query(text,args));
const action=(user,body)=>handleControls(pool,user,{method:'POST',body});
const week='2026-11-14';
let rate,claim;
async function main(){
 await sql("INSERT INTO users(name,role) VALUES('CEO','CEO'),('Admin','Admin'),('Accounts','Accounts')");
 await sql("INSERT INTO stitchers(stitcher_code,name) VALUES('0001','Worker One'),('0002','Worker Two')");
 await sql("INSERT INTO po_master(po_number,shirt_qty,trouser_qty,dupatta_qty,shirt_meters_issued) VALUES('TEST-PO',200,100,100,200),('NO-CUT',200,0,0,0),('RACE',200,0,0,200)");
 await check('allocation is blocked before cuts',()=>fails(()=>sql("INSERT INTO stitcher_allocations(po_number,component,stitcher_code,qty_allocated) VALUES('NO-CUT','shirt','0001',1)"),/cut/i));
 await sql("INSERT INTO production_stage_events(po_number,component,event_type,quantity,unit,worker_code,recorded_by) VALUES('TEST-PO','shirt','Cut',100,'Pieces','0001','Admin'),('TEST-PO','trouser','Cut',50,'Pieces','0001','Admin'),('TEST-PO','dupatta','Cut',30,'Pieces','0001','Admin'),('RACE','shirt','Cut',100,'Pieces','0001','Admin')");
 await check('shirt allocation is capped by cuts, not larger PO quantity',()=>fails(()=>sql("INSERT INTO stitcher_allocations(po_number,component,stitcher_code,qty_allocated) VALUES('TEST-PO','shirt','0001',101)"),/100.*cut/i));
 await check('trouser and dupatta have separate cut ceilings',async()=>{for(const [g,q] of [['trouser',51],['dupatta',31]])await fails(()=>sql('INSERT INTO stitcher_allocations(po_number,component,stitcher_code,qty_allocated) VALUES($1,$2,$3,$4)',['TEST-PO',g,'0001',q]),/cut/i);});
 await sql("INSERT INTO stitcher_allocations(po_number,component,stitcher_code,qty_allocated,qty_returned,qty_accepted,qty_rejected) VALUES('TEST-PO','shirt','0001',100,100,90,10)");
 await check('negative returns cannot fabricate accepted pieces',()=>fails(()=>sql("UPDATE stitcher_allocations SET qty_accepted=101,qty_rejected=-1 WHERE po_number='TEST-PO' AND component='shirt'"),/cumulative|whole/i));
 rate=(await sql("INSERT INTO cmt_rates(po_number,status,shirt,patching,cutting,fs_clipping,fs_pressing) VALUES('TEST-PO','Pending_Accounts',375,10,20,10,10) RETURNING id")).rows[0].id;
 await sql("UPDATE cmt_rates SET status='Pending_CEO' WHERE id=$1",[rate]);
 await check('Accounts cannot approve a CEO rate',()=>fails(()=>sql("UPDATE cmt_rates SET status='Approved' WHERE id=$1",[rate],accounts),/CEO/i));
 await sql("UPDATE cmt_rates SET status='Approved',approved_by_ceo='CEO',ceo_approved_at=NOW() WHERE id=$1",[rate],ceo);
 await check('finishing and packing use the bottleneck of required accepted operations',async()=>{
  await sql("INSERT INTO stitcher_allocations(po_number,component,module_type,stitcher_code,qty_allocated,qty_returned,qty_accepted) VALUES('TEST-PO','shirt clipping','Finishing','0001',90,90,90),('TEST-PO','shirt pressing','Finishing','0001',80,80,80)");
  assert.equal(Number((await pool.query("SELECT finished_pieces('TEST-PO','shirt') q")).rows[0].q),80);
  const event=q=>sql("INSERT INTO production_stage_events(po_number,component,event_type,quantity,unit,recorded_by) VALUES('TEST-PO','shirt','QC_Packed',$1,'Pieces','Admin')",[q]);
  await fails(()=>event(81),/upstream/);await event(80);
  await fails(()=>sql("INSERT INTO production_stage_events(po_number,component,event_type,quantity,unit,recorded_by) VALUES('TEST-PO','shirt','Dispatched',81,'Pieces','Admin')"),/upstream/);
 });
 await check('approved rate cannot be overwritten or deleted',async()=>{await fails(()=>sql('UPDATE cmt_rates SET shirt=1 WHERE id=$1',[rate]),/immutable/i);await fails(()=>sql('DELETE FROM cmt_rates WHERE id=$1',[rate]),/delete/i);});
 await check('approved versions can coexist with a new review version',async()=>{await sql("INSERT INTO cmt_rates(po_number,status,shirt,version,supersedes) VALUES('TEST-PO','Pending_Accounts',400,2,$1)",[rate]);assert.equal((await pool.query("SELECT COUNT(*) FROM cmt_rates WHERE po_number='TEST-PO'")).rows[0].count,'2');});
 const insertClaim=q=>sql("INSERT INTO cmt_payments(po_number,component,department,operation,stitcher_code,stitcher_name,qty_claimed,rate,amount,week_ending,rate_version_id) VALUES('TEST-PO','shirt','Stitching','Shirt','0001','Worker One',$1,375,$2,$3,$4) RETURNING *",[q,q*375,week,rate]);
 await check('claim excludes rejected output',()=>fails(()=>insertClaim(91),/accepted/i));
 claim=(await insertClaim(5)).rows[0];
 await check('earlier claims reduce remaining accepted balance',()=>fails(()=>insertClaim(86),/accepted/i));
 await check('patching without a garment is blocked',()=>fails(()=>sql("INSERT INTO stitcher_allocations(po_number,component,stitcher_code,qty_allocated) VALUES('TEST-PO','patching','0001',5)"),/garment/i));
 await sql("INSERT INTO stitcher_allocations(po_number,component,module_type,stitcher_code,qty_allocated,qty_returned,qty_accepted) VALUES('TEST-PO','shirt patching','Stitching','0001',5,5,5)");
 await check('PO quantities lock after first cut',()=>fails(()=>sql("UPDATE po_master SET shirt_qty=210 WHERE po_number='TEST-PO'"),/CEO approval/i));
 await action(admin,{action:'request_quantities',po_number:'TEST-PO',shirt_qty:210,trouser_qty:100,dupatta_qty:100,reason:'Customer approved extra pieces'});
 const request=(await pool.query("SELECT id FROM po_quantity_requests WHERE po_number='TEST-PO'")).rows[0].id;
 await check('only CEO applies requested quantity change',async()=>{await fails(()=>action(accounts,{action:'approve_quantities',id:request}),/CEO/);await action(ceo,{action:'approve_quantities',id:request});assert.equal((await pool.query("SELECT shirt_qty FROM po_master WHERE po_number='TEST-PO'")).rows[0].shirt_qty,210);});
 await check('payroll cannot be submitted with pending claims',()=>fails(()=>action(accounts,{action:'submit_payroll',week_ending:week}),/Verify/));
 await sql("UPDATE cmt_payments SET payment_status='Verified',verified_by='Accounts',verified_at=NOW() WHERE id=$1",[claim.id]);
 await sql("INSERT INTO advances(stitcher_code,amount,week_ending) VALUES('0001',50,$1)",[week]);
 await action(accounts,{action:'submit_payroll',week_ending:week});
 await check('submitted payroll freezes claims and advance balances',async()=>{await fails(()=>insertClaim(1),/frozen/i);await fails(()=>sql("UPDATE cmt_payments SET qty_claimed=4,amount=1500 WHERE id=$1",[claim.id]),/frozen/i);await fails(()=>sql("INSERT INTO advances(stitcher_code,amount,week_ending) VALUES('0001',20,'2026-11-21')"),/reserved/i);});
 await check('CEO rejection allows verified correction and resubmission',async()=>{await action(ceo,{action:'reject_payroll',week_ending:week,note:'Review'});await sql("UPDATE cmt_payments SET remarks='Reviewed' WHERE id=$1",[claim.id]);await action(accounts,{action:'submit_payroll',week_ending:week});});
 await check('CEO approval freezes snapshot with advance recovery',async()=>{await action(ceo,{action:'approve_payroll',week_ending:week});const run=(await pool.query('SELECT * FROM payroll_runs WHERE week_ending=$1',[week])).rows[0];assert.equal(run.snapshot.net,1825);assert.equal(run.snapshot.workers[0].recovery,50);await fails(()=>sql("UPDATE payroll_runs SET snapshot='{}' WHERE week_ending=$1",[week]),/immutable|locked/i);});
 await check('individual paid bypass fails before central payout',()=>fails(()=>sql("UPDATE cmt_payments SET payment_status='Paid' WHERE id=$1",[claim.id]),/frozen|payroll/i));
 await check('central payout pays exact approved claims once and recovers advances',async()=>{await action(accounts,{action:'pay_payroll',week_ending:week,payout_reference:'CASH-001'});assert.equal((await pool.query('SELECT payment_status FROM cmt_payments WHERE id=$1',[claim.id])).rows[0].payment_status,'Paid');assert.equal(Number((await pool.query('SELECT SUM(amount) amount FROM advance_recoveries')).rows[0].amount),50);await fails(()=>action(accounts,{action:'pay_payroll',week_ending:week,payout_reference:'CASH-001'}),/approved/i);await fails(()=>insertClaim(1),/frozen/i);});
 await check('concurrent allocations cannot collectively exceed cuts',async()=>{const results=await Promise.allSettled(['0001','0002'].map(code=>sql("INSERT INTO stitcher_allocations(po_number,component,stitcher_code,qty_allocated) VALUES('RACE','shirt',$1,60)",[code])));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);});
 await check('concurrent acceptance and claims remain within the actual worker balance',async()=>{
  const winner=(await pool.query("SELECT * FROM stitcher_allocations WHERE po_number='RACE'")).rows[0];
  const returns=await Promise.allSettled([1,2].map(()=>sql('UPDATE stitcher_allocations SET qty_returned=qty_returned+40,qty_accepted=qty_accepted+40 WHERE id=$1',[winner.id])));
  assert.equal(returns.filter(r=>r.status==='fulfilled').length,1);
  const r=(await sql("INSERT INTO cmt_rates(po_number,status,shirt) VALUES('RACE','Pending_Accounts',10) RETURNING id")).rows[0].id;
  await sql("UPDATE cmt_rates SET status='Pending_CEO' WHERE id=$1",[r]);await sql("UPDATE cmt_rates SET status='Approved',approved_by_ceo='CEO',ceo_approved_at=NOW() WHERE id=$1",[r],ceo);
  const claims=await Promise.allSettled([1,2].map(()=>sql("INSERT INTO cmt_payments(po_number,component,department,operation,stitcher_code,qty_claimed,rate,amount,week_ending,rate_version_id) VALUES('RACE','shirt','Stitching','Shirt',$1,30,10,300,'2026-12-05',$2)",[winner.stitcher_code,r])));
  assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
 });
 await check('historical patching requires an audited garment link and counts against new claims',async()=>{
  const request={po_number:'LEGACY-PATCH',stitcher_code:'0001',department:'Stitching',operation:'Shirt Patching',component:'shirt patching'};
  await fails(()=>claimAvailability(pool,request),/historical patching/i);
  const old=(await pool.query("SELECT * FROM cmt_payments WHERE po_number='LEGACY-PATCH'")).rows;
  for(const p of old) await action(admin,{action:'link_patching',id:p.id,garment:'shirt',reason:'Verified original job sheet'});
  assert.equal((await pool.query('SELECT component FROM cmt_payments WHERE id=$1',[old[0].id])).rows[0].component,'patching');
  await sql("INSERT INTO production_stage_events(po_number,component,event_type,quantity,unit,worker_code,recorded_by) VALUES('LEGACY-PATCH','shirt','Cut',20,'Pieces','0001','Admin')");
  await sql("INSERT INTO stitcher_allocations(po_number,component,stitcher_code,qty_allocated,qty_returned,qty_accepted) VALUES('LEGACY-PATCH','shirt patching','0001',20,20,20)");
  const balance=await claimAvailability(pool,request);assert.equal(balance[0].claimable,5);
  const r=(await sql("INSERT INTO cmt_rates(po_number,status,patching) VALUES('LEGACY-PATCH','Pending_Accounts',10) RETURNING id")).rows[0].id;
  await sql("UPDATE cmt_rates SET status='Pending_CEO' WHERE id=$1",[r]);await sql("UPDATE cmt_rates SET status='Approved',approved_by_ceo='CEO',ceo_approved_at=NOW() WHERE id=$1",[r],ceo);
  await fails(()=>sql("INSERT INTO cmt_payments(po_number,component,department,operation,stitcher_code,qty_claimed,rate,amount,week_ending,rate_version_id) VALUES('LEGACY-PATCH','shirt patching','Stitching','Shirt Patching','0001',6,10,60,'2026-11-28',$1)",[r]),/accepted|cut/);
  await fails(()=>sql('DELETE FROM patching_links'),/immutable/);
 });
 await check('repaired pieces can become accepted without allocating or counting a second return',async()=>{
  const r=(await sql("INSERT INTO stitcher_allocations(po_number,component,stitcher_code,qty_allocated,qty_returned,qty_accepted,qty_rework) VALUES('TEST-PO','trouser','0001',50,50,45,5) RETURNING id")).rows[0];
  await fails(()=>sql('UPDATE stitcher_allocations SET qty_accepted=48,qty_rework=2 WHERE id=$1',[r.id]),/cumulative/);
  await tx(pool,admin,async client=>{await client.query("SELECT set_config('app.accept_rework',$1,true)",[r.id]);await client.query('UPDATE stitcher_allocations SET qty_accepted=48,qty_rework=2 WHERE id=$1',[r.id]);await client.query("INSERT INTO allocation_rework_events(allocation_id,quantity,reason,accepted_by) VALUES($1,3,'Verified repaired pieces','Admin')",[r.id]);});
  const row=(await pool.query('SELECT * FROM stitcher_allocations WHERE id=$1',[r.id])).rows[0];assert.equal(Number(row.qty_allocated),50);assert.equal(Number(row.qty_returned),50);assert.equal(Number(row.qty_accepted),48);
 });
 await check('article standards and cutting-master metres are audited and bounded by issued fabric',async()=>{
  await sql("INSERT INTO article_yield_standards(article_name,component,meters_per_piece,updated_by) VALUES('Oxford','shirt',1.2,'Admin')");
  await sql("UPDATE article_yield_standards SET meters_per_piece=1.3 WHERE article_name='Oxford'");
  const history=(await pool.query("SELECT * FROM financial_audit WHERE entity='article_yield_standards' AND field='meters_per_piece'")).rows[0];assert.equal(Number(history.old_value),1.2);assert.equal(Number(history.new_value),1.3);
  await fails(()=>sql("INSERT INTO production_stage_events(po_number,component,event_type,quantity,unit,worker_code,recorded_by,fabric_meters) VALUES('RACE','shirt','Cut',1,'Pieces','0001','Admin',201)"),/issued metres/);
 });
 await check('audit retains actors, old and new PO/rate/payment values',async()=>{const log=await pool.query("SELECT * FROM financial_audit WHERE entity='po_master' AND field='shirt_qty'");assert.equal(Number(log.rows[0].old_value),200);assert.equal(Number(log.rows[0].new_value),210);assert.equal(log.rows[0].actor,'CEO');await fails(()=>pool.query('DELETE FROM financial_audit'),/append-only/);});
 console.log(`${passed} PostgreSQL integration checks passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
