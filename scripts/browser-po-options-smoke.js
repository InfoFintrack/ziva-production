// Local browser regression with intercepted APIs; never creates real production orders.
const {chromium}=require(process.env.PLAYWRIGHT_PATH || '/tmp/prodflow-browser/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {validateKidsThreePiece}=require('../src/poRules');
const root=path.resolve(__dirname,'../build'),writes=[],errors=[];let pos=[],browser;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');let file=path.resolve(root,url.pathname.slice(1));if(!file.startsWith(root))return res.end();if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
async function main(){
 await new Promise(r=>server.listen(3007,'127.0.0.1',r));browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1360,height:960}});
 await context.addInitScript(()=>{sessionStorage.setItem('zivaUser',JSON.stringify({name:'Planner',role:'PP'}));sessionStorage.setItem('zivaToken','local-ui-fixture');});
 await context.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),kind=url.searchParams.get('type'),method=req.method();let result;
  if(url.pathname==='/api/records')result={success:true,records:[]};
  else if(url.pathname==='/api/dropdowns')result={success:true,garmentTypes:['Kids','Ladies'],units:['Meters'],receivingVendors:[],accessoryTypes:[]};
  else if(url.pathname==='/api/po-master' && kind==='accessories')result={success:true,accessories:[]};
  else if(url.pathname==='/api/po-master' && kind==='issuance_log')result={success:true,logs:[]};
  else if(url.pathname==='/api/po-master' && method==='GET')result={success:true,pos};
  else if(url.pathname==='/api/po-master' && ['POST','PUT'].includes(method)){
   const body=req.postDataJSON();assert.equal(validateKidsThreePiece(body),'');writes.push({method,...body});
   if(method==='POST'){const po={...body,status:'Active',created_at:new Date().toISOString()};pos.push(po);result={success:true,po};}
   else{pos=pos.map(p=>p.po_number===body.po_number?{...p,...body}:p);result={success:true};}
  }else throw new Error('Unexpected API call '+method+' '+url.pathname+url.search);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3007/issue');
 await page.getByRole('button',{name:'PO Management',exact:true}).click();const create=page.locator('form').first();
 async function header(number,type){for(const [name,value] of Object.entries({batch_number_b:'9',batch_number_po:'1',po_number:number,collection_name:'Winter',article_name:'Kids suit'}))await create.locator(`[name="${name}"]`).fill(value);await create.locator('[name="garment_type"]').selectOption(type);}
 async function garment(name,colour,qty='20'){await create.getByRole('textbox',{name:name+' colour',exact:true}).fill(colour);await create.getByRole('combobox',{name:name+' fabric type',exact:true}).selectOption('Cotton');await create.getByRole('spinbutton',{name:name+' quantity',exact:true}).fill(qty);}
 await header('901','Kids 3 Piece');await garment('shirt',' red ');await garment('trouser','RED');
 assert.equal(await create.getByRole('textbox',{name:'dupatta colour',exact:true}).getAttribute('required'),'');
 await create.getByRole('button',{name:'Create PO',exact:true}).click();assert.equal(writes.length,0,'Incomplete three-piece order must not submit');
 await garment('dupatta','red');await create.getByRole('button',{name:'Create PO',exact:true}).click();await page.getByText('✓ PO PO-901 created successfully.',{exact:true}).waitFor();
 assert.equal(writes[0].garment_type,'Kids 3 Piece');for(const g of ['shirt','trouser','dupatta']){assert.equal(writes[0][g+'_colour'],'Red');assert.equal(writes[0][g+'_qty'],20);}
 const row=page.getByRole('row').filter({has:page.getByRole('cell',{name:'PO-901',exact:true})});await row.getByRole('button',{name:'Edit',exact:true}).click();
 const edit=page.locator('form').filter({has:page.getByRole('button',{name:'Save Changes',exact:true})});
 assert.equal(await edit.locator('[name="garment_type"]').inputValue(),'Kids 3 Piece');assert.equal(await edit.getByRole('textbox',{name:'dupatta colour',exact:true}).inputValue(),'Red');
 await edit.getByRole('textbox',{name:'dupatta colour',exact:true}).fill('tan');await edit.getByRole('spinbutton',{name:'dupatta quantity',exact:true}).fill('21');await edit.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByText('✓ PO PO-901 updated successfully.',{exact:true}).waitFor();
 assert.equal(writes[1].dupatta_colour,'tan');assert.equal(writes[1].dupatta_qty,21);await page.getByRole('heading',{name:'Edit PO — PO-901',exact:true}).waitFor({state:'hidden'});
 // Existing two-piece Kids orders remain possible, with an optional, visible dupatta.
 await header('902','Kids');assert.equal(await create.getByRole('textbox',{name:'dupatta colour',exact:true}).getAttribute('required'),null);await garment('shirt','Red');await garment('trouser','red');await create.getByRole('button',{name:'Create PO',exact:true}).click();await page.getByText('✓ PO PO-902 created successfully.',{exact:true}).waitFor();assert.equal(writes[2].dupatta_qty,undefined);
 await page.getByRole('button',{name:'Issue Fabric',exact:true}).click();await page.locator('select').first().selectOption('PO-901');await page.getByPlaceholder('Qty to issue').nth(2).waitFor();assert.equal(await page.getByPlaceholder('Qty to issue').count(),3,'Dupatta must carry into fabric issuance');
 await page.getByRole('button',{name:'PO Management',exact:true}).click();await create.locator('[name="garment_type"]').selectOption('Kids 3 Piece');await page.setViewportSize({width:390,height:844});await create.getByRole('textbox',{name:'dupatta colour',exact:true}).scrollIntoViewIfNeeded();fs.mkdirSync('/tmp/prodflow-po-options',{recursive:true});await page.screenshot({path:'/tmp/prodflow-po-options/kids-three-piece-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS Kids 3 Piece creation, mandatory dupatta, red/RED/trimmed colours, edit round-trip, existing two-piece Kids, all three fabric-issue components and mobile rendering; only mocked writes');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
