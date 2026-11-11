import {groupAllocations,prepareBulkClaims} from './bulkClaims';
import {getClaimAvailability} from './api';
jest.mock('./api',()=>({getClaimAvailability:jest.fn()}));
test('bulk mode groups repeated allocations and offers only unclaimed cut-backed balance',async()=>{
 const rows=groupAllocations([{po_number:'P',stitcher_code:'0001',component:'Shirt',qty_accepted:5},{po_number:'P',stitcher_code:'0001',component:'shirt',qty_accepted:10}]);
 expect(rows).toHaveLength(1);expect(rows[0].qty_accepted).toBe(15);
 getClaimAvailability.mockResolvedValue({success:true,operations:[{claimable:3}]});
 const ready=await prepareBulkClaims([{...rows[0],department:'Stitching',operation:'Shirt',rate:10}]);
 expect(ready[0].qty_claimed).toBe('3');expect(ready[0].amount).toBe(30);expect(ready[0].alreadyLogged).toBe(false);
});
