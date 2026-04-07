import React, { useState } from 'react';
import { loginUser } from '../api';

function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !passcode.trim()) {
      setError('Please enter both name and passcode.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await loginUser(name.trim(), passcode.trim());
      if (result.success) {
        onLogin(result);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo">
          <h1>ZIVA</h1>
          <p>Production Management System</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Your Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Passcode</label>
            <input
              type="password"
              placeholder="Enter your passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p style={{
          textAlign: 'center',
          marginTop: '24px',
          fontSize: '12px',
          color: '#aaa'
        }}>
          Phase 1 — Fabric Issuance & Acceptance
        </p>
      </div>
    </div>
  );
}

export default Login;