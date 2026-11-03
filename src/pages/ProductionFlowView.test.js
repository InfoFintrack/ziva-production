import React from 'react';
import { render, screen } from '@testing-library/react';
import ProductionFlowView from './ProductionFlowView';
import { getPOs, getAllocations, getPaymentEntries, getProductionFlow, getStitchers } from '../api';

jest.mock('../api', () => ({
  getPOs: jest.fn(), getAllocations: jest.fn(), getPaymentEntries: jest.fn(),
  getProductionFlow: jest.fn(), getStitchers: jest.fn(),
  getAdvanceLedger: jest.fn(), setAdvanceOpening: jest.fn(), recordProductionFlow: jest.fn(),
}));
jest.mock('react-router-dom', () => ({ Link: ({ children, to, ...props }) => require('react').createElement('a', { href: to, ...props }, children) }));

test('CEO can see a stage board with recorded cut and QC balances', async () => {
  getPOs.mockResolvedValue({ success: true, pos: [{ po_number: 'PO-1', article_name: 'Oxford', status: 'Active', shirt_qty: 20, shirt_meters_issued: 40 }] });
  getAllocations.mockResolvedValue({ success: true, allocations: [] });
  getPaymentEntries.mockResolvedValue({ success: true, payments: [] });
  getProductionFlow.mockResolvedValue({ success: true, events: [{ id: 'cut-1', po_number: 'PO-1', component: 'shirt', event_type: 'Cut', quantity: 15 }], standards: [] });
  getStitchers.mockResolvedValue({ success: true, stitchers: [] });
  render(<ProductionFlowView user={{ role: 'CEO', name: 'Haseeb' }} onLogout={() => {}} home="/ceo" />);
  expect(await screen.findByText('Stage balances by PO')).toBeTruthy();
  expect(screen.getAllByText('15').length).toBeGreaterThan(0);
  expect(screen.getByText('QC packed')).toBeTruthy();
});
