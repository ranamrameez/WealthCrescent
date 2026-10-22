// Administrator bootstrap using Application Default Credentials (never user workbooks).
const { initializeApp, applicationDefault, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { refreshPsxMarketData } = require('./psxMarketData');
const app = initializeApp({ credential: applicationDefault(), databaseURL: 'https://qse-app-default-rtdb.asia-southeast1.firebasedatabase.app', projectId: 'qse-app' });
refreshPsxMarketData(getDatabase()).then(() => console.log('PSX sync completed. Check PSX/syncStatus for per-dataset results.')).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => deleteApp(app));
