import React from 'react';

// One mark for the full wordmark and the compact workspace sidebar.
export const ProdFlowMark = ({size=36}) => <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <rect x="1" y="1" width="46" height="46" rx="13" fill="#102442" stroke="#35547B"/>
  <path d="M14 35V13H25C31 13 34 16 34 21C34 26 31 29 25 29H20V35H14ZM20 19V23H25C27 23 28 22.3 28 21C28 19.7 27 19 25 19H20Z" fill="#E5EEFF"/>
  <path d="M27 35H36M32 31L36 35L32 39" stroke="#58D6C3" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
</svg>;

const ProdFlowLogo = ({height=36}) => <svg height={height} viewBox="0 0 270 58" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ProdFlow — Production management">
  <g transform="translate(1 5)"><ProdFlowMark size={48}/></g>
  <text x="62" y="32" fontFamily="Arial,sans-serif" fontSize="27" fontWeight="700" letterSpacing="-0.8" fill="#E5EEFF">Prod<tspan fill="#72A7F5">Flow</tspan></text>
  <text x="63" y="47" fontFamily="Arial,sans-serif" fontSize="7" fontWeight="600" letterSpacing="1.7" fill="#91A6C4">PRODUCTION MANAGEMENT</text>
</svg>;
export default ProdFlowLogo;
