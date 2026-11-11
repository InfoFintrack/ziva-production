// UI-only smoke test. Local static server and mocked API fixtures; no database or real credentials.
const {chromium}=require(process.env.PLAYWRIGHT_PATH || '/tmp/prodflow-browser/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../build');
const pos=Array.from({length:150},(_,i)=>({po_number:`PO-${String(i+1).padStart(3,'0')}`,article_name:`Oxford ${i+1}`,collection_name:'Winter',status:'Active',shirt_qty:100,trouser_qty:100,dupatta_qty:0,shirt_meters_issued:150}));
const audit=Array.from({length:300},(_,i)=>({id:i+1,entity:'cmt_payments',record_id:`payment-${i+1}`,field:'amount',old_value:100,new_value:110,actor:i===249?'Audit Needle':'Accounts',changed_at:'2026-11-11T12:00:00Z'}));
const workers=Array.from({length:200},(_,i)=>({code:String(i+1).padStart(4,'0'),name:i===0?'Ada':'Worker '+i,gross:100,recovery:0,net:100,advance:0}));
const payroll={week_ending:'2026-11-14',status:'Approved',submitted_by:'Accounts',approved_by:'CEO',snapshot:{workers,entries:[],net:20000}};
const rates=pos.map((p,i)=>({id:`rate-${i+1}`,po_number:p.po_number,status:i===0?'Pending_CEO':'Approved',version:1,shirt:375,total:375,submitted_by:'Zain',approved_by_ceo:'CEO',in_app_approved:i!==0}));
let flowFixtures=false;
const flowAllocations=Array.from({length:120},(_,i)=>({id:'a'+i,po_number:'PO-001',stitcher_code:String(i),stitcher_name:'Worker '+i,component:'shirt',module_type:'Stitching',allocation_date:'2026-09-01',qty_allocated:10,qty_returned:i?10:3,qty_accepted:8,qty_rejected:1,qty_rework:1}));
const flowEvents=Array.from({length:120},(_,i)=>({id:'e'+i,event_type:'Cut',po_number:'PO-001',component:'shirt',quantity:1,worker_code:'master'+i,fabric_meters:1.5}));
const fixtures=url=>{
 const kind=url.searchParams.get('type');
 if(url.pathname==='/api/records' && kind==='controls')return {success:true,requests:[],payroll:[payroll],patchingLinks:[],legacyPatching:[]};
 if(url.pathname==='/api/records' && kind==='financial_audit')return {success:true,changes:audit};
 if(url.pathname==='/api/records' && kind==='production_flow')return {success:true,events:flowFixtures?flowEvents:[],standards:[]};
 if(url.pathname==='/api/stitchers')return {success:true,stitchers:[]};
 if(url.pathname==='/api/po-master')return {success:true,pos};
 if(url.pathname==='/api/allocations')return {success:true,allocations:flowFixtures?flowAllocations:[]};
 if(url.pathname==='/api/cmt-payments' && kind==='advance_ledger')return {success:true,activated_at:'2026-11-01',advances:[],recoveries:[],opening:[]};
 if(url.pathname==='/api/cmt-payments')return {success:true,payments:[]};
 if(url.pathname==='/api/cmt-rates')return {success:true,rates:url.searchParams.has('status')?rates.filter(r=>r.status===url.searchParams.get('status')):rates};
 throw new Error('Unexpected API request '+url.pathname+url.search);
};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');let filename=path.resolve(root,url.pathname.slice(1));if(!filename.startsWith(root))return res.end();if(!fs.existsSync(filename)||!fs.statSync(filename).isFile())filename=path.join(root,'index.html');res.setHeader('Content-Type',filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(filename));});
let browser;const errors=[];
async function open(role,route,viewport={width:1440,height:900}){
 const context=await browser.newContext({viewport});await context.addInitScript(role=>{sessionStorage.setItem('zivaUser',JSON.stringify({name:role,role}));sessionStorage.setItem('zivaToken','local-ui-fixture');},role);
 await context.route('**/api/**',async route=>{assert.equal(route.request().method(),'GET','UI navigation must not perform financial writes');await route.fulfill({contentType:'application/json',body:JSON.stringify(fixtures(new URL(route.request().url())))});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:3006${route}`);return page;
}
async function bodyFits(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),'Whole page should stay within viewport');}
async function main(){
 await new Promise(resolve=>server.listen(3006,'127.0.0.1',resolve));browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});fs.mkdirSync('/tmp/prodflow-workspace',{recursive:true});
 const ceo=await open('CEO','/ceo');await ceo.getByText('FABRIC ISSUED',{exact:true}).waitFor();await bodyFits(ceo);
 await ceo.getByRole('tab',{name:'Purchase orders'}).click();const table=ceo.locator('.executive-table-wrap');assert.ok(await table.evaluate(el=>el.scrollHeight>el.clientHeight),'Long order table should scroll inside its panel');await table.evaluate(el=>el.scrollTop=1500);await bodyFits(ceo);
 await ceo.getByRole('button',{name:'Collapse sidebar'}).click();assert.ok((await ceo.locator('.workspace-sidebar').boundingBox()).width<80);await ceo.getByRole('button',{name:'Expand sidebar'}).click();
 await ceo.keyboard.press('Control+k');const ceoSearch=ceo.getByRole('searchbox',{name:'Search workspace'});await ceoSearch.fill('PO-149');await ceo.getByRole('button',{name:'PO-149 Oxford 149',exact:true}).click();assert.equal(await ceo.locator('tbody tr').count(),1);await ceo.getByRole('button',{name:'Clear workspace search'}).click();assert.equal(await ceo.locator('tbody tr').count(),150);
 await ceo.getByRole('tab',{name:'Rate approvals'}).click();await ceo.getByRole('heading',{name:'Pending CEO Approval'}).waitFor();await ceo.getByRole('tab',{name:'Rate history'}).click();await ceo.getByRole('heading',{name:'All CMT Rates'}).waitFor();await ceo.screenshot({path:'/tmp/prodflow-workspace/ceo-desktop.png',fullPage:true});
 const admin=await open('Admin','/controls#payroll');await admin.getByLabel('Week ending Saturday').fill('2026-11-14');await admin.getByRole('cell',{name:'0001 · Ada'}).waitFor();await bodyFits(admin);const payrollTable=admin.locator('.executive-table-wrap');assert.ok(await payrollTable.evaluate(el=>el.scrollHeight>el.clientHeight));
 await admin.getByLabel('Cash voucher / bank reference').fill('DRAFT-REFERENCE');await admin.getByRole('tab',{name:'PO set balances'}).click();await admin.getByRole('tab',{name:'Weekly payroll'}).click();assert.equal(await admin.getByLabel('Cash voucher / bank reference').inputValue(),'DRAFT-REFERENCE');await admin.getByRole('searchbox',{name:'Search workspace'}).fill('Ada');assert.equal(await admin.locator('tbody tr').count(),1);await admin.getByText('Entire approved run · total cash payable: PKR 20,000',{exact:true}).waitFor();await admin.getByRole('button',{name:'Clear workspace search'}).click();await admin.screenshot({path:'/tmp/prodflow-workspace/payroll-desktop.png',fullPage:true});
 await admin.getByRole('tab',{name:'Change history'}).click();await admin.getByRole('heading',{name:'Change history',level:2}).waitFor();assert.equal(await admin.locator('tbody tr').count(),300);await admin.getByRole('searchbox',{name:'Search workspace'}).fill('Audit Needle');assert.equal(await admin.locator('tbody tr').count(),1);
 await admin.getByRole('button',{name:'Clear workspace search'}).click();await admin.setViewportSize({width:1100,height:480});await admin.getByRole('tab',{name:'Change history'}).click();assert.ok(await admin.locator('.workspace-sidebar-scroll').evaluate(el=>el.scrollHeight>el.clientHeight));await bodyFits(admin);
 const mobile=await open('Admin','/controls#history',{width:390,height:844});await mobile.getByRole('heading',{name:'Change history',level:2}).waitFor();await mobile.getByRole('button',{name:'Open navigation',exact:true}).click();await mobile.getByRole('tab',{name:'Weekly payroll'}).click();await mobile.getByLabel('Week ending Saturday').fill('2026-11-14');await mobile.getByRole('searchbox',{name:'Search workspace'}).fill('Ada');const box=await mobile.locator('.workspace-search-results').boundingBox();assert.ok(box.x>=0 && box.x+box.width<=390);await mobile.keyboard.press('Escape');const clearMobile=mobile.getByRole('button',{name:'Clear workspace search'});if(await clearMobile.count()) await clearMobile.click();await bodyFits(mobile);await mobile.screenshot({path:'/tmp/prodflow-workspace/payroll-mobile.png',fullPage:true});
 const pp=await open('PP','/controls');await pp.getByRole('heading',{name:'PO set balance',exact:true}).waitFor();assert.equal(await pp.getByRole('tab',{name:'Weekly payroll'}).count(),0);assert.equal(await pp.getByRole('tab',{name:'Change history'}).count(),0);
 await admin.setViewportSize({width:1440,height:900});await admin.getByRole('tab',{name:'Exceptions',exact:true}).click();const issuePanel=admin.getByRole('region',{name:'Control exceptions'});assert.ok(await issuePanel.evaluate(el=>el.scrollHeight>el.clientHeight && el.clientHeight<=400));
 flowFixtures=true;const flow=await open('CEO','/flow',{width:1440,height:1000});await flow.getByRole('heading',{name:'Metres per cut piece'}).waitFor();const yieldTable=flow.getByRole('region',{name:'Fabric yield'});await yieldTable.scrollIntoViewIfNeeded();
 assert.ok(await yieldTable.evaluate(el=>el.scrollHeight>el.clientHeight && el.clientHeight<=400),'Fabric yield must scroll inside a bounded card');await yieldTable.evaluate(el=>el.scrollTop=1000);const header=await yieldTable.locator('th').first().boundingBox(),wrap=await yieldTable.boundingBox();assert.ok(Math.abs(header.y-wrap.y)<3,'Table heading stays visible while scrolling');
 const aging=flow.getByRole('region',{name:'Open allocations'});assert.ok((await aging.locator('..').boundingBox()).height<400,'Short aging card must not stretch to match yield');
 await flow.screenshot({path:'/tmp/prodflow-workspace/flow-panels-desktop.png',fullPage:false});
 for(const region of await flow.locator('.executive-table-wrap').all())assert.ok((await region.boundingBox()).height<=402,'Every flow table has a height cap');
 await flow.setViewportSize({width:390,height:844});await yieldTable.scrollIntoViewIfNeeded();assert.ok(await yieldTable.evaluate(el=>el.clientHeight<=360 && el.scrollWidth>el.clientWidth),'Mobile tables scroll vertically and horizontally');await flow.screenshot({path:'/tmp/prodflow-workspace/flow-panels-mobile.png',fullPage:false});
 assert.deepEqual(errors,[]);console.log('PASS workspace navigation, keyboard search, 150-row PO and 300-row history filters, independent table/sidebar scrolling, preserved payroll fields and full-run totals, role visibility, desktop and mobile layout, bounded flow panels, pinned table headings and compact short cards; no financial writes');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
