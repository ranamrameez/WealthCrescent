import { getAuth, sendWorkerMessage } from './common.js';

const $ = (id) => document.getElementById(id);

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function renderAuthState() {
  const auth = await getAuth();
  $('signedOutView').hidden = !!auth;
  $('signedInView').hidden = !auth;
  if (auth) {
    $('emailLabel').textContent = auth.email || auth.uid;
  }
}

$('createNew').addEventListener('change', (e) => {
  $('createNewHint').hidden = !e.target.checked;
  $('signInBtn').textContent = e.target.checked ? 'Create account' : 'Sign in';
});

$('signInBtn').addEventListener('click', async () => {
  $('signInError').textContent = '';
  $('signInBtn').disabled = true;
  const email = $('email').value.trim();
  const password = $('password').value;
  const type = $('createNew').checked ? 'SIGN_UP' : 'SIGN_IN';
  const res = await sendMessage({ type, email, password });
  $('signInBtn').disabled = false;
  if (!res?.ok) {
    $('signInError').textContent = res?.error || 'Sign-in failed.';
    return;
  }
  $('password').value = '';
  await renderAuthState();
});

$('signOutBtn').addEventListener('click', async () => {
  await sendMessage({ type: 'SIGN_OUT' });
  await renderAuthState();
});



chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.auth) renderAuthState(); });
renderAuthState();
