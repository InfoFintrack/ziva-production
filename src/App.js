import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import PPView from './pages/PPView';
import CuttingView from './pages/CuttingView';
import AdminView from './pages/AdminView';

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const savedUser = sessionStorage.getItem('zivaUser');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleLogin = (userData) => {
    sessionStorage.setItem('zivaUser', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('zivaUser');
    setUser(null);
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <Router>
      <Routes>
        <Route path="/" element={
          user.role === 'PP' ? <Navigate to="/issue" /> :
          user.role === 'Cutting' ? <Navigate to="/accept" /> :
          <Navigate to="/admin" />
        } />
        <Route path="/issue" element={
          user.role === 'PP'
            ? <PPView user={user} onLogout={handleLogout} />
            : <Navigate to="/" />
        } />
        <Route path="/accept" element={
          user.role === 'Cutting'
            ? <CuttingView user={user} onLogout={handleLogout} />
            : <Navigate to="/" />
        } />
        <Route path="/admin" element={
          user.role === 'Admin'
            ? <AdminView user={user} onLogout={handleLogout} />
            : <Navigate to="/" />
        } />
      </Routes>
    </Router>
  );
}

export default App;