import React from 'react';
const ProdFlowLogo = ({ height = 36 }) => (
  <svg height={height} viewBox="0 0 320 80" xmlns="http://www.w3.org/2000/svg">
    <circle cx="28" cy="34" r="12" fill="#1d9e75"/>
    <rect x="46" y="14" width="14" height="40" rx="7" fill="#378add"/>
    <rect x="65" y="6" width="14" height="48" rx="3" fill="#888780" opacity="0.5"/>
    <text x="90" y="44" fontFamily="Arial,sans-serif" fontSize="28" fontWeight="700" letterSpacing="-1" fill="#1a1a2e">Prod</text>
    <text x="156" y="44" fontFamily="Arial,sans-serif" fontSize="28" fontWeight="300" letterSpacing="-1" fill="#378add">Flow</text>
    <text x="90" y="60" fontFamily="Arial,sans-serif" fontSize="8" letterSpacing="2" fill="#6b7280">PRODUCTION MANAGEMENT</text>
  </svg>
);
export default ProdFlowLogo;
