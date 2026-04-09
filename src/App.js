import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import PPView from './pages/PPView';
import CuttingView from './pages/CuttingView';
import AdminView from './pages/AdminView';
import AdminSettings from './pages/AdminSettings';
import StitchingView from './pages/StitchingView';
import SupervisorView from './pages/SupervisorView';
import AccountsView from './pages/AccountsView';
import CEOView from './pages/CEOView';

const ROLE_HOME = {
  PP:         '/issue',
  Cutting:    '/accept',
  Stitching:  '/stitching',
  Supervisor: '/supervisor',
  Accounts:   '/accounts',
  CEO:        '/ceo',
  Admin:      '/admin',
};

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const savedUser = sessionStorage.getItem('zivaUser');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleLogin = ({ token, ...userData }) => {
    sessionStorage.setItem('zivaToken', token);
    sessionStorage.setItem('zivaUser', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('zivaToken');
    sessionStorage.removeItem('zivaUser');
    setUser(null);
  };

  if (!user) return <Login onLogin={handleLogin} />;

  const home = ROLE_HOME[user.role] || '/admin';

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to={home} />} />

        <Route path="/issue" element={
          user.role === 'PP'
            ? <PPView user={user} onLogout={handleLogout} />
            : <Navigate to={home} />
        } />

        <Route path="/accept" element={
          user.role === 'Cutting'
            ? <CuttingView user={user} onLogout={handleLogout} />
            : <Navigate to={home} />
        } />

        <Route path="/stitching" element={
          user.role === 'Stitching'
            ? <StitchingView user={user} onLogout={handleLogout} />
            : <Navigate to={home} />
        } />

        <Route path="/supervisor" element={
          user.role === 'Supervisor'
            ? <SupervisorView user={user} onLogout={handleLogout} />
            : <Navigate to={home} />
        } />

        <Route path="/accounts" element={
          user.role === 'Accounts'
            ? <AccountsView user={user} onLogout={handleLogout} />
            : <Navigate to={home} />
        } />

        <Route path="/ceo" element={
          user.role === 'CEO'
            ? <CEOView user={user} onLogout={handleLogout} />
            : <Navigate to={home} />
        } />

        <Route path="/admin" element={
          user.role === 'Admin'
            ? <AdminView user={user} onLogout={handleLogout} />
            : <Navigate to={home} />
        } />

        <Route path="/admin/settings" element={
          user.role === 'Admin'
            ? <AdminSettings user={user} onLogout={handleLogout} />
            : <Navigate to={home} />
        } />
      </Routes>
    </Router>
  );
}

export default App;
