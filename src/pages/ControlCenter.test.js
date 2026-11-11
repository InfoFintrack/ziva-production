import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import ControlCenter from './ControlCenter';
import {getControls,controlAction,getPOs,getAllocations,getPaymentEntries,getProductionFlow,getFinancialAudit,getCMTRates} from '../api';
jest.mock('../api',()=>({getControls:jest.fn(),controlAction:jest.fn(),getPOs:jest.fn(),getAllocations:jest.fn(),getPaymentEntries:jest.fn(),getProductionFlow:jest.fn(),getFinancialAudit:jest.fn(),getCMTRates:jest.fn()}));
jest.mock('react-router-dom',()=>({Link:({children,to,...props})=>require('react').createElement('a',{href:to,...props},children)}),{virtual:true});
beforeEach(()=>{
 window.history.replaceState(null,'','/');
 getControls.mockResolvedValue({success:true,requests:[],patchingLinks:[],legacyPatching:[],payroll:[{week_ending:'2026-11-14',status:'Approved',approved_by:'CEO',snapshot:{workers:[{code:'0001',name:'Ada',gross:100,recovery:10,net:90},{code:'0002',name:'Bea',gross:200,recovery:0,net:200}],net:290}}]});
 getPOs.mockResolvedValue({success:true,pos:[{po_number:'PO-94',article_name:'Oxford',shirt_qty:100}]});getAllocations.mockResolvedValue({success:true,allocations:[]});getPaymentEntries.mockResolvedValue({success:true,payments:[]});getProductionFlow.mockResolvedValue({success:true,events:[]});getFinancialAudit.mockResolvedValue({success:true,changes:[]});getCMTRates.mockResolvedValue({success:true,rates:[]});
 controlAction.mockResolvedValue({success:false,message:'Test captured request'});
});
test('payroll reference survives section changes and search cannot turn a whole-run payout into a partial payment',async()=>{
 render(<ControlCenter user={{role:'Accounts',name:'Accounts'}} home="/accounts"/>);
 await screen.findByRole('heading',{name:'PO set balance',exact:true});fireEvent.click(screen.getByRole('tab',{name:'Weekly payroll'}));fireEvent.change(screen.getByLabelText('Week ending Saturday'),{target:{value:'2026-11-14'}});
 fireEvent.change(screen.getByLabelText('Cash voucher / bank reference'),{target:{value:'CASH-94'}});
 fireEvent.click(screen.getByRole('tab',{name:'PO set balances'}));fireEvent.click(screen.getByRole('tab',{name:'Weekly payroll'}));expect(screen.getByLabelText('Cash voucher / bank reference').value).toBe('CASH-94');
 fireEvent.change(screen.getByRole('searchbox',{name:'Search workspace'}),{target:{value:'Ada'}});
 expect(screen.getByRole('cell',{name:'0001 · Ada'})).toBeTruthy();expect(screen.queryByRole('cell',{name:'0002 · Bea'})).toBeNull();expect(screen.getByText('Entire approved run · total cash payable: PKR 290')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Confirm entire approved payroll paid'}));
 await waitFor(()=>expect(controlAction).toHaveBeenCalledWith({action:'pay_payroll',week_ending:'2026-11-14',payout_reference:'CASH-94'}));
});
test('production users only receive navigation to their permitted sections',async()=>{
 render(<ControlCenter user={{role:'PP',name:'Production'}} home="/issue"/>);await screen.findByRole('heading',{name:'PO set balance',exact:true});
 expect(screen.queryByRole('tab',{name:'Weekly payroll'})).toBeNull();expect(screen.queryByRole('tab',{name:'Change history'})).toBeNull();expect(screen.getByRole('tab',{name:'Quantity approvals'})).toBeTruthy();
});
