// Native browser validation regression. All API calls are intercepted; no production writes.
const {chromium}=require(process.env.PLAYWRIGHT_PATH || '/tmp/prodflow-browser/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../build'),writes=[],errors=[],events=[];let browser;
const po={po_number:'PO-226',article_name:'Astrid',shirt_qty:500,shirt_meters_issued:2000,status:'Active'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,new URL(req.url,'http://localhost').pathname.slice(1));if(!file.startsWith(root))return res.end();if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
async function main(){
 await new Promise(r=>server.listen(3008,'127.0.0.1',r));browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(()=>{sessionStorage.setItem('zivaUser',JSON.stringify({name:'Admin',role:'Admin'}));sessionStorage.setItem('zivaToken','local-ui-fixture');});
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),kind=url.searchParams.get('type');let result;
  if(url.pathname==='/api/records' && kind==='production_flow'){
   if(request.method()==='POST'){const body=request.postDataJSON();writes.push(body);events.push({...body,id:'event-'+writes.length,event_type:body.type,occurred_at:'2026-10-30',vendor_name:body.vendor_name});}
   result={success:true,events,standards:[]};
  }else if(url.pathname==='/api/po-master')result={success:true,pos:[po]};
  else if(url.pathname==='/api/allocations')result={success:true,allocations:[]};
  else if(url.pathname==='/api/cmt-rates')result={success:true,rates:[]};
  else if(url.pathname==='/api/stitchers')result={success:true,stitchers:[{stitcher_code:'0077',name:'Faisal Cutting'}]};
  else if(url.pathname==='/api/cmt-payments')result={success:true,payments:[],activated_at:'2026-11-01',advances:[],recoveries:[],opening:[]};
  else throw new Error('Unexpected API request '+url.pathname+url.search);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:3008/flow');await page.getByRole('heading',{name:'New stage event',exact:true}).waitFor();
 const form=page.locator('form').first(),event=form.getByLabel(/^Event/);await form.getByLabel(/^PO/).selectOption('PO-226');await form.getByLabel(/^Cutting master/).selectOption('0077');await form.getByLabel('Metres used by this master (optional)').fill('1048.25');await form.getByLabel('Actual work date (optional)').fill('2026-10-30');
 for(const type of ['Cut','QC_Packed','Dispatched']){
  await event.selectOption(type);const quantity=form.getByLabel('Quantity (pieces)',{exact:true});
  for(const value of ['1','112','500']){await quantity.fill(value);assert.ok(await quantity.evaluate(el=>el.checkValidity()),type+' must accept '+value);}
  for(const value of ['0','-1','112.01','112.5']){await quantity.fill(value);assert.equal(await quantity.evaluate(el=>el.checkValidity()),false,type+' must reject '+value);}
  const before=writes.length;await quantity.fill('112.01');await form.getByRole('button',{name:'Record event'}).click();assert.equal(writes.length,before,'Native validation must block fractional pieces before submission');
  await quantity.fill('112');await form.getByRole('button',{name:'Record event'}).click();await quantity.waitFor();await page.waitForFunction(()=>document.querySelector('form input[type=number]')?.value==='');assert.equal(writes.at(-1).quantity,112);assert.equal(writes.at(-1).type,type);
 }
 assert.equal(writes[0].worker_code,'0077');assert.equal(writes[0].fabric_meters,'1048.25');assert.equal(writes[0].occurred_at,'2026-10-30');
 await event.selectOption('Vendor_Issue');await form.getByLabel('Vendor',{exact:true}).fill('Yaseen');const metres=form.getByLabel('Quantity (metres)',{exact:true});await metres.fill('112.01');assert.ok(await metres.evaluate(el=>el.checkValidity()));await form.getByRole('button',{name:'Record event'}).click();await page.waitForFunction(()=>document.querySelector('form input[type=number]')?.value==='');assert.equal(writes.at(-1).quantity,112.01);
 await event.selectOption('Vendor_Return');await form.getByLabel(/^Original issue/).selectOption('event-4');await metres.fill('0.25');assert.ok(await metres.evaluate(el=>el.checkValidity()));await form.getByRole('button',{name:'Record event'}).click();await page.waitForFunction(()=>document.querySelector('form input[type=number]')?.value==='');assert.equal(writes.at(-1).quantity,0.25);
 assert.equal(writes.length,5);assert.deepEqual(errors,[]);console.log('PASS native whole-piece validation for cutting, QC/packing and dispatch; 112 submits, fractional pieces stay blocked, vendor decimals and cutting-master metres remain valid; only mocked writes');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
