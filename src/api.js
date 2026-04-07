const BASE_URL = '';

const getToken = () => sessionStorage.getItem('zivaToken');

const authFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.href = '/';
    return { success: false, message: 'Session expired. Please log in again.' };
  }
  return res.json();
};

const post = (path, body) =>
  authFetch(`${BASE_URL}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const loginUser = (name, passcode) =>
  fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, passcode: passcode.toString() }),
  }).then((r) => r.json());

export const submitIssuance = (formData) =>
  post('/api/issuance', formData);

export const submitAcceptance = (formData) =>
  post('/api/acceptance', formData);

export const adminOverride = (recordId, field, newValue, adminName) =>
  post('/api/override', { recordId, field, newValue, adminName });

export const getRecords = () =>
  authFetch(`${BASE_URL}/api/records`);

export const getDropdowns = () =>
  authFetch(`${BASE_URL}/api/dropdowns`);

export const getUsers = () =>
  authFetch(`${BASE_URL}/api/users`);

export const addUser = (userData) =>
  post('/api/users', userData);

export const editUser = ({ userId, name, passcode, role }) =>
  authFetch(`/api/users?id=${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ name, passcode, role }),
  });

export const deactivateUser = (userId, currentStatus) =>
  authFetch(`/api/users?id=${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ currentStatus }),
  });

export const addDropdownValue = (field, value) =>
  post('/api/dropdowns', { field: field.toLowerCase(), value });

export const removeDropdownValue = (field, value) =>
  authFetch(`/api/dropdowns?field=${field.toLowerCase()}&value=${encodeURIComponent(value)}`, {
    method: 'DELETE',
  });
