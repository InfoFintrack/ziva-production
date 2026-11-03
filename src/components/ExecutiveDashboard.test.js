import React from 'react';
import { render, screen } from '@testing-library/react';
import ExecutiveDashboard from './ExecutiveDashboard';
import { getPOs, getAllocations, getPaymentEntries, getCMTRates, getAdvances, getFinancialAudit } from '../api';

jest.mock('../api', () => ({
  getPOs: jest.fn(), getAllocations: jest.fn(), getPaymentEntries: jest.fn(),
  getCMTRates: jest.fn(), getAdvances: jest.fn(), getFinancialAudit: jest.fn(),
}));

beforeEach(() => {
  getPOs.mockResolvedValue({ success: true, pos: [{ po_number: 'PO-7', article_name: 'Oxford', status: 'Active', shirt_qty: 20, shirt_meters_issued: 40 }] });
  getAllocations.mockResolvedValue({ success: true, allocations: [{ po_number: 'PO-7', module_type: 'Finishing', component: 'shirt pressing', qty_accepted: 12, qty_allocated: 12 }] });
  getPaymentEntries.mockResolvedValue({ success: true, payments: [] });
  getCMTRates.mockResolvedValue({ success: true, rates: [] });
  getAdvances.mockResolvedValue({ success: true, advances: [] });
  getFinancialAudit.mockResolvedValue({ success: true, changes: [] });
});

test('CEO dashboard renders recorded metres and terminal accepted pieces', async () => {
  render(<ExecutiveDashboard />);
  expect(await screen.findByText('Production pulse')).toBeTruthy();
  expect((await screen.findAllByText('PO-7')).length).toBeGreaterThan(0);
  expect(screen.getByText('FABRIC ISSUED').parentElement.textContent).toContain('40 m');
  expect(getAdvances).not.toHaveBeenCalled();
});

test('finance dashboard loads the payroll and audit sections', async () => {
  render(<ExecutiveDashboard finance />);
  expect(await screen.findByText('Cash payout pack')).toBeTruthy();
  expect(await screen.findByText('Rate & payment changes')).toBeTruthy();
  expect(getAdvances).toHaveBeenCalledTimes(1);
});
