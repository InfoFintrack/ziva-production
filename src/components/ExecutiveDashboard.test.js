import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExecutiveDashboard from './ExecutiveDashboard';
import { getPOs, getAllocations, getPaymentEntries, getCMTRates, getAdvanceLedger, getFinancialAudit, getProductionFlow } from '../api';

jest.mock('../api', () => ({
  getPOs: jest.fn(), getAllocations: jest.fn(), getPaymentEntries: jest.fn(),
  getCMTRates: jest.fn(), getAdvanceLedger: jest.fn(), getFinancialAudit: jest.fn(), getProductionFlow: jest.fn(),
}));

beforeEach(() => {
  window.history.replaceState(null,'','/');
  getProductionFlow.mockResolvedValue({success:true,events:[]});
  getPOs.mockResolvedValue({ success: true, pos: [{ po_number: 'PO-7', article_name: 'Oxford', status: 'Active', shirt_qty: 20, shirt_meters_issued: 40 }] });
  getAllocations.mockResolvedValue({ success: true, allocations: [{ po_number: 'PO-7', module_type: 'Finishing', component: 'shirt pressing', qty_accepted: 12, qty_allocated: 12 }] });
  getPaymentEntries.mockResolvedValue({ success: true, payments: [] });
  getCMTRates.mockResolvedValue({ success: true, rates: [] });
  getAdvanceLedger.mockResolvedValue({ success: true, activated_at: '2026-01-01T00:00:00Z', opening: [], recoveries: [], advances: [] });
  getFinancialAudit.mockResolvedValue({ success: true, changes: [] });
});

test('CEO dashboard renders recorded metres and terminal accepted pieces', async () => {
  render(<ExecutiveDashboard />);
  expect(await screen.findByText('Production pulse')).toBeTruthy();
  expect((await screen.findByText('FABRIC ISSUED')).parentElement.textContent).toContain('40 m');
  fireEvent.click(screen.getByRole('tab',{name:'Purchase orders'}));
  expect((await screen.findAllByText('PO-7')).length).toBeGreaterThan(0);
  expect(getAdvanceLedger).not.toHaveBeenCalled();
});

test('finance dashboard loads the payroll and audit sections', async () => {
  render(<ExecutiveDashboard finance />);
  fireEvent.click(screen.getByRole('tab',{name:'Weekly reconciliation'}));
  expect(await screen.findByRole('heading',{name:'Weekly reconciliation',exact:true,level:2})).toBeTruthy();
  fireEvent.click(screen.getByRole('tab',{name:'Change history'}));
  expect(await screen.findByText('Rate & payment changes')).toBeTruthy();
  expect(getAdvanceLedger).toHaveBeenCalledTimes(1);
});
