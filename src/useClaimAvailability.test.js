import { renderHook, waitFor } from '@testing-library/react';
import useClaimAvailability from './useClaimAvailability';
import { getClaimAvailability } from './api';

jest.mock('./api', () => ({ getClaimAvailability: jest.fn() }));

test('multi-operation form uses the smallest claimable balance', async () => {
  getClaimAvailability.mockImplementation(async ({ operation }) => ({
    success: true, operations: [{ accepted: 28, claimed: operation === 'Heming' ? 8 : 0,
      claimable: operation === 'Heming' ? 20 : 28 }],
  }));
  const { result } = renderHook(() => useClaimAvailability('PO-1', '0001', 'Finishing Shirt', ['Clipping', 'Heming', 'Tussling']));
  await waitFor(() => expect(result.current.rows).toHaveLength(3));
  expect(result.current.limit).toBe(20);
  expect(getClaimAvailability).toHaveBeenCalledTimes(3);
});

test('form reports zero availability when no accepted output exists', async () => {
  getClaimAvailability.mockResolvedValue({ success: true, operations: [{ accepted: 0, claimed: 0, claimable: 0 }] });
  const { result } = renderHook(() => useClaimAvailability('PO-1', '0001', 'Stitching', ['Shirt']));
  await waitFor(() => expect(result.current.rows).toHaveLength(1));
  expect(result.current.limit).toBe(0);
});
