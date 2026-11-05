import { useEffect, useState } from 'react';
import { getClaimAvailability } from './api';

export default function useClaimAvailability(poNumber, workerCode, department, operations, refreshKey = 0) {
  const operationsKey = operations.join('|');
  const key = [poNumber, workerCode, department, operationsKey, refreshKey].join('\u0001');
  const [state, setState] = useState({ key: '', loading: false, rows: [], error: '' });

  useEffect(() => {
    const selected = operationsKey ? operationsKey.split('|') : [];
    if (!poNumber || !workerCode || !department || !selected.length) {
      setState({ key, loading: false, rows: [], error: '' });
      return;
    }
    let active = true;
    setState({ key, loading: true, rows: [], error: '' });
    Promise.all(selected.map(operation => getClaimAvailability({
      po_number: poNumber, stitcher_code: workerCode, department, operation,
    }))).then(responses => {
      if (!active) return;
      const failure = responses.find(response => !response?.success || !response.operations?.length);
      if (failure) throw new Error(failure?.message || 'Could not check accepted pieces.');
      setState({ key, loading: false, rows: responses.map((response, index) => ({ ...response.operations[0], operation: selected[index] })), error: '' });
    }).catch(error => {
      if (active) setState({ key, loading: false, rows: [], error: error.message || 'Could not check accepted pieces.' });
    });
    return () => { active = false; };
  }, [key, poNumber, workerCode, department, operationsKey]);

  const current = state.key === key ? state : { key, loading: Boolean(poNumber && workerCode && department && operationsKey), rows: [], error: '' };
  return { ...current, limit: current.rows.length ? Math.min(...current.rows.map(row => row.claimable)) : 0 };
}
