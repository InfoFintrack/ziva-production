import React from 'react';

function StitchingView({ user, onLogout }) {
  return (
    <div className="app-container">
      <nav className="navbar">
        <h2>ZIVA — Stitching Dashboard</h2>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <span className="role-badge">Stitching</span>
          <button className="btn btn-danger btn-small" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="main-content">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🧵</div>
          <h3 style={{ marginBottom: '8px', color: '#0f3460' }}>Stitching Dashboard</h3>
          <p style={{ color: '#888', fontSize: '15px' }}>Coming Soon</p>
        </div>
      </div>
    </div>
  );
}

export default StitchingView;
