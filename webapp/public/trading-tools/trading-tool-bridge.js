/* The journal frame has an opaque origin. Its parent supplies only its own
 * journal keys and theme over a dedicated port after the document loads. */
const journalValues = new Map();
let journalPort;
let persistenceErrorShown = false;
const journalStorage = {
  getItem: key => journalValues.get(key) ?? null,
  setItem(key, value) {
    if (journalValues.get(key) === value) return;
    journalValues.set(key, value);
    journalPort.postMessage({ key, value });
  },
};

function showJournalPersistenceError() {
  if (persistenceErrorShown) return;
  persistenceErrorShown = true;
  const warning = document.createElement('p');
  warning.setAttribute('role', 'alert');
  warning.textContent = 'Browser storage is unavailable or full. Export a JSON backup before leaving this page.';
  document.querySelector('main')?.prepend(warning);
}

const tradingToolReady = new Promise(resolve => {
  function initialize(event) {
    if (event.source !== window.parent || event.data?.type !== 'wealth-crescent-trading-tool' || event.ports.length !== 1) return;
    window.removeEventListener('message', initialize);
    journalPort = event.ports[0];
    function updateAppearance({ theme, colors }) {
      document.documentElement.dataset.theme = theme;
      for (const [key, value] of Object.entries(colors)) {
        if (value) document.documentElement.style.setProperty(key, value);
      }
    }
    journalPort.onmessage = ({ data }) => {
      if (data.error) showJournalPersistenceError();
      else if (data.theme) updateAppearance(data);
      else if (Number.isFinite(data.journalInset)) {
        document.documentElement.style.setProperty('--journal-inset', `${data.journalInset}px`);
      }
    };
    updateAppearance(event.data);
    for (const [key, value] of Object.entries(event.data.values)) journalValues.set(key, value);
    if (event.data.error) showJournalPersistenceError();
    if (!event.data.spreadsheetReader) {
      resolve();
      return;
    }
    const reader = document.createElement('script');
    reader.src = event.data.spreadsheetReader;
    reader.onload = resolve;
    reader.onerror = resolve;
    document.head.append(reader);
  }
  window.addEventListener('message', initialize);
});
