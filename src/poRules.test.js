import {garmentTypesWithKids,normalizeColour,isValidColour,validateKidsThreePiece} from './poRules';
import dropdownsHandler from '../api/dropdowns';
import poHandler from '../api/po-master';
import {getPool} from '../api/_lib/db';
import {auditedQuery} from '../api/_lib/auditedQuery';
import {authenticateToken} from '../api/_lib/auth';

jest.mock('../api/_lib/db',()=>({getPool:jest.fn()}));
jest.mock('../api/_lib/auth',()=>({authenticateToken:jest.fn()}));
jest.mock('../api/_lib/auditedQuery',()=>({auditedQuery:jest.fn()}));
jest.mock('../api/_lib/controls',()=>({requireControls:jest.fn().mockResolvedValue()}));
const response=()=>({code:200,setHeader:jest.fn(),status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
const fullOrder={po_number:'PO-901',collection_name:'Winter',article_name:'Kids suit',garment_type:'Kids 3 Piece',shirt_colour:'red',shirt_fabric:'Cotton',shirt_qty:20,trouser_colour:'RED',trouser_fabric:'Cotton',trouser_qty:20,dupatta_colour:' Red ',dupatta_fabric:'Chiffon',dupatta_qty:20};
let query;
beforeEach(()=>{jest.clearAllMocks();query=jest.fn().mockResolvedValue({rows:[]});getPool.mockReturnValue({query});authenticateToken.mockReturnValue({name:'Planner',role:'PP'});auditedQuery.mockResolvedValue({rows:[fullOrder],rowCount:1});});

test('short colour names are case-insensitive and trimmed; incomplete or blank names fail',()=>{
 for(const name of ['Red','red','RED',' red ','Tan','Ash','Navy Blue'])expect(isValidColour(name)).toBe(true);
 for(const name of ['', '   ','Rd','1234'])expect(isValidColour(name)).toBe(false);
 expect(normalizeColour('  navy   blue ')).toBe('Navy Blue');
 expect(normalizeColour(' red ')).toBe('Red');
});
test('category appears once without changing the existing categories or needing a database row',async()=>{
 expect(garmentTypesWithKids(['Kids','Ladies','kids 3 piece'])).toEqual(['Kids','Ladies','Kids 3 Piece']);
 query.mockResolvedValue({rows:[{category:'garment_type',value:'Kids'}]});
 const res=response();await dropdownsHandler({method:'GET'},res);
 expect(res.body.garmentTypes).toEqual(['Kids','Kids 3 Piece']);expect(query).toHaveBeenCalledTimes(1);
});
test.each(['POST','PUT'])('%s refuses incomplete Kids 3 Piece orders before writing anything',async(method)=>{
 const res=response();await poHandler({method,query:{},body:{...fullOrder,action:'update_details',dupatta_qty:0}},res);
 expect(res.code).toBe(400);expect(res.body.message).toMatch(/Dupatta Quantity/);expect(auditedQuery).not.toHaveBeenCalled();
});
test.each(['POST','PUT'])('%s saves all three garments and still uses the audited write',async(method)=>{
 const res=response();await poHandler({method,query:{},body:{...fullOrder,action:'update_details'}},res);
 expect(res.body.success).toBe(true);expect(auditedQuery).toHaveBeenCalledTimes(1);
 expect(auditedQuery.mock.calls[0][2]).toMatch(/dupatta_qty/);expect(auditedQuery.mock.calls[0][3]).toContain(20);
});
test('legacy two-piece Kids orders do not acquire a mandatory dupatta',()=>{
 expect(validateKidsThreePiece({...fullOrder,garment_type:'Kids',dupatta_qty:null,dupatta_colour:null,dupatta_fabric:null})).toBe('');
 expect(validateKidsThreePiece({...fullOrder,dupatta_qty:1.5})).toMatch(/positive whole number/);
});
