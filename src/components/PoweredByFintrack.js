import React from 'react';
const PoweredByFintrack = () => (
  <div style={{ textAlign: 'center', padding: '24px 0 12px', marginTop: '40px', borderTop: '1px solid #eee' }}>
    <div style={{ fontSize: '10px', letterSpacing: '1.5px', color: '#9ca3af', marginBottom: '6px' }}>POWERED AND ENGINEERED BY</div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
      <svg height="18" viewBox="0 0 80 24" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="12" r="5" fill="#378add"/>
        <rect x="16" y="4" width="6" height="16" rx="3" fill="#1d9e75"/>
        <rect x="25" y="0" width="6" height="20" rx="2" fill="#888780" opacity="0.5"/>
      </svg>
      <span style={{ fontSize: '13px', fontWeight: '600', color: '#378add' }}>Fintrack</span>
      <span style={{ fontSize: '13px', fontWeight: '300', color: '#1d9e75' }}>Solutions</span>
    </div>
    <div style={{ fontSize: '9px', letterSpacing: '1px', color: '#9ca3af', marginTop: '3px' }}>MANAGEMENT CONSULTANTS</div>
  </div>
);
export default PoweredByFintrack;
