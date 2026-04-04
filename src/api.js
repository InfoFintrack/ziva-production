const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz-cIUAk93mk-Aswh85-z5Mq3jmR8pXBAIsA_Ju36bzDxxUZiDupsGkN7Y9qod9yGzM/exec';

export const loginUser = async (name, passcode) => {
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'login',
      name,
      passcode: passcode.toString()
    })
  });
  return response.json();
};

export const submitIssuance = async (formData) => {
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'submitIssuance',
      ...formData
    })
  });
  return response.json();
};

export const submitAcceptance = async (formData) => {
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'submitAcceptance',
      ...formData
    })
  });
  return response.json();
};

export const adminOverride = async (recordId, field, newValue, adminName) => {
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'adminOverride',
      recordId,
      field,
      newValue,
      adminName
    })
  });
  return response.json();
};

export const getRecords = async () => {
  const response = await fetch(`${SCRIPT_URL}?action=getRecords`);
  return response.json();
};

export const getDropdowns = async () => {
  const response = await fetch(`${SCRIPT_URL}?action=getDropdowns`);
  return response.json();
};