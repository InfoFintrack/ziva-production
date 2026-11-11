const { getPool } = require('./_lib/db');
const { authenticateToken } = require('./_lib/auth');
const { requireControls, controlTransaction } = require('./_lib/controls');
const { ClaimError } = require('./_lib/claimPolicy');
const FIELDS = ['cutting','shirt','trouser','dupatta','patching','fs_clipping','fs_heming','fs_tussling','fs_pressing','ft_clipping','ft_heming','ft_pressing','ft_patching','fd_heming','fd_tussling','fd_pressing','fd_patching','quality_packing'];
const values = body => FIELDS.map(f => {
  const n=Number(body[f] || 0);
  if (!Number.isFinite(n) || n<0) throw new ClaimError('Rates must be nonnegative numbers.');
  return n;
});
export default async function handler(req,res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  if(req.method==='OPTIONS') return res.status(200).end();
  const user=authenticateToken(req,res); if(!user) return;
  const pool=getPool();
  try {
    await requireControls(pool);
    if(req.method==='GET') {
      const params=[]; const clauses=[];
      if(req.query.po_number) {params.push(req.query.po_number);clauses.push(`t.po_number=$${params.length}`);}
      if(req.query.status) {params.push(req.query.status);clauses.push(`t.status=$${params.length}`);if(req.query.status==='Approved') clauses.push('t.in_app_approved=TRUE');}
      const distinct=req.query.history==='true' ? '' : 'DISTINCT ON(t.po_number)';
      const {rows}=await pool.query(`SELECT ${distinct} t.*, (${FIELDS.map(f=>`COALESCE(t.${f},0)`).join('+')}) AS total,
        (t.in_app_approved AND EXISTS(SELECT 1 FROM users u WHERE u.name=t.approved_by_ceo AND u.role='CEO')) AS ceo_signoff_valid
        FROM cmt_rates t ${clauses.length ? 'WHERE '+clauses.join(' AND ') : ''} ORDER BY t.po_number,t.version DESC`,params);
      return res.json({success:true,rates:rows});
    }
    if(!['POST','PUT'].includes(req.method)) return res.status(405).json({success:false,message:'Method not allowed.'});
    const result=await controlTransaction(pool,user,async client=>{
      const body=req.body; let current;
      if(req.method==='PUT') {
        const found=await client.query('SELECT * FROM cmt_rates WHERE id=$1',[body.id]); current=found.rows[0];
        if(!current) throw new ClaimError('Rate version not found.');
      }
      const po=current?.po_number || body.po_number;
      if(!po) throw new ClaimError('Choose a PO.');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`production:${po}`]);
      const pos=await client.query('SELECT id FROM po_master WHERE po_number=$1 FOR UPDATE',[po]);
      if(!pos.rows.length) throw new ClaimError('PO not found.');
      if(current) current=(await client.query('SELECT * FROM cmt_rates WHERE id=$1 FOR UPDATE',[body.id])).rows[0];
      if(['approve','reject'].includes(body.action)) {
        const expected=user.role==='Accounts' ? 'Pending_Accounts' : user.role==='CEO' ? 'Pending_CEO' : null;
        if(!expected || current.status!==expected) throw new ClaimError('This version is not awaiting your approval. Approved versions are locked.');
        if(body.action==='approve') {
          const next=user.role==='Accounts' ? 'Pending_CEO' : 'Approved';
          const prefix=user.role==='Accounts' ? 'accounts' : 'ceo';
          await client.query(`UPDATE cmt_rates SET status=$1,approved_by_${prefix}=$2,${prefix}_approved_at=NOW() WHERE id=$3`,[next,user.name,current.id]);
        } else await client.query(`UPDATE cmt_rates SET status='Rejected',${user.role==='Accounts'?'accounts':'ceo'}_remarks=$1 WHERE id=$2`,[body.remarks || null,current.id]);
        return {success:true};
      }
      if(!['Cutting','Admin','Accounts','CEO'].includes(user.role)) throw new ClaimError('Access denied.');
      if(req.method==='POST' && !['Cutting','Admin'].includes(user.role)) throw new ClaimError('Cutting or Admin submits new rates.');
      if(req.method==='PUT' && !['resubmit','admin_edit','revise'].includes(body.action)) throw new ClaimError('Unknown rate action.');
      const rateValues=values(body);
      if(!current || current.status==='Approved' || body.action==='revise') {
        const existing=await client.query('SELECT * FROM cmt_rates WHERE po_number=$1 ORDER BY version DESC',[po]);
        if(existing.rows.some(r=>r.status.startsWith('Pending'))) throw new ClaimError('A rate version is already awaiting approval for this PO.');
        if(!current && existing.rows.length) throw new ClaimError('Rates already exist. Open the latest version and choose Create revision.');
        const version=existing.rows.length ? Number(existing.rows[0].version)+1 : 1;
        const columns=['po_number',...FIELDS,'color_design','remarks','version','supersedes','status','submitted_by'];
        const v=[po,...rateValues,body.color_design || null,body.remarks || null,version,current ? String(current.id):null,'Pending_Accounts',user.name];
        const inserted=await client.query(`INSERT INTO cmt_rates(${columns.join(',')},submitted_at,created_at) VALUES(${v.map((_,i)=>`$${i+1}`).join(',')},NOW(),NOW()) RETURNING *`,v);
        return {success:true,rate:inserted.rows[0],message:`Version ${version} submitted for fresh Accounts and CEO approval. The approved version remains unchanged.`};
      }
      const v=[...rateValues,body.color_design || null,body.remarks || null,current.id];
      await client.query(`UPDATE cmt_rates SET ${FIELDS.map((f,i)=>`${f}=$${i+1}`).join(',')},color_design=$19,remarks=$20,status='Pending_Accounts',approved_by_accounts=NULL,accounts_approved_at=NULL,approved_by_ceo=NULL,ceo_approved_at=NULL WHERE id=$21`,v);
      return {success:true,message:'Draft resubmitted for approval.'};
    });
    return res.json(result);
  } catch(error) {
    console.error('Rates:',error.message);
    return res.status(error instanceof ClaimError || error.code==='P0001' || error.code==='23505' ? 400:500).json({success:false,message:error instanceof ClaimError || error.code==='P0001' ? error.message : error.code==='23505' ? 'A rate version already exists; refresh and retry.' : 'Rate service unavailable.'});
  }
}
