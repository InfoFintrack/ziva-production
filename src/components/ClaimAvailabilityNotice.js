import React from 'react';

export default function ClaimAvailabilityNotice({ status, department, quantity, onRetry }) {
  if (status.loading) return <p role="status" style={{ color: '#8b949e' }}>Checking accepted pieces…</p>;
  if (status.error) return <p role="alert" style={{ color: '#f85149' }}>{status.error} <button type="button" onClick={onRetry}>Retry check</button></p>;
  if (!status.rows.length) return null;
  const source = department === 'Cutting' ? 'cut output' : 'accepted';
  return <div role="status" style={{ color: '#e6edf3', fontSize: '13px' }}>
    {status.rows.map(row => <div key={row.operation}>{row.operation}: {row.ordered} cut, {row.accepted} {source}, {row.claimed} already claimed, <strong>{row.claimable} claimable</strong></div>)}
    {status.limit > 0 && Number(quantity) > status.limit && <p role="alert" style={{ color: '#f85149', margin: '6px 0 0' }}>Quantity exceeds the available balance. Enter at most {status.limit} pieces.</p>}
    {status.limit === 0 && <p style={{ color: '#f85149', margin: '6px 0 0' }}>{status.rows.some(r=>r.ordered===0) ? 'Record verified garment cuts in Production flow first.' : status.rows.some(r=>r.claimed>=r.accepted && r.accepted>0) ? 'These accepted pieces have already been claimed. Check existing entries before recording more work.' : status.rows.some(r=>r.poClaimed>=r.ordered) ? 'The actual cut limit for this operation is already fully claimed across workers. Review the PO set balance.' : department === 'Cutting'
      ? 'Record cut output in Production flow before claiming.'
      : department.startsWith('Finishing')
        ? 'Record returned and accepted pieces in Finishing → Allocate → Live Tracker first.'
        : 'Ask a Supervisor to record returned and accepted pieces in Live Tracker first.'}</p>}
  </div>;
}
