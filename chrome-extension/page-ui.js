const titles = { activityStats: 'Activity', account: 'Account', scrapingControls: 'Scraping controls', filterCard: 'Filters', favouriteCharts: 'Saved ticker charts', auditCard: 'Records', outliersCard: 'Detected outliers', chartCard: 'Price history', testCard: 'Test scrape', configCard: 'Configurations' };
const { collapsedSections = {} } = await chrome.storage.local.get('collapsedSections');
for (const [id, title] of Object.entries(titles)) {
  const card = document.getElementById(id);
  if (!card) continue;
  const details = document.createElement('details'); details.className = 'collapsible-section'; details.id = 'section-' + id; details.open = Object.hasOwn(collapsedSections, id) ? !collapsedSections[id] : ['activityStats','scrapingControls','filterCard','auditCard'].includes(id);
  const summary = document.createElement('summary'); summary.textContent = title;
  card.before(details); details.append(summary, card);
  details.addEventListener('toggle', () => { collapsedSections[id] = !details.open; chrome.storage.local.set({ collapsedSections }); if (details.open) document.dispatchEvent(new document.defaultView.CustomEvent('extension-section-open', { detail: { id } })); });
}
for (const link of document.querySelectorAll('a[href^="#section-"]')) link.addEventListener('click', () => {
  const section = document.querySelector(link.getAttribute('href')); if (section) section.open = true;
});

// Move the existing shared controls into a modal; their IDs and handlers stay intact.
const filterPanel = document.getElementById('filterCard');
const filterSection = document.getElementById('section-filterCard');
const filterDialog = document.createElement('dialog');
filterDialog.id = 'filterDialog'; filterDialog.className = 'filter-dialog';
filterDialog.setAttribute('aria-labelledby', 'filterDialogTitle');
const filterHeader = document.createElement('header'); filterHeader.className = 'filter-dialog-header';
const filterTitle = document.createElement('h2'); filterTitle.id = 'filterDialogTitle'; filterTitle.textContent = 'Page filters';
const closeFilters = document.createElement('button'); closeFilters.textContent = 'Done'; closeFilters.title = 'Close filters; changes already apply to records and charts';
closeFilters.onclick = () => filterDialog.close(); filterHeader.append(filterTitle, closeFilters);
filterDialog.append(filterHeader, filterPanel); filterSection.hidden = true; document.body.append(filterDialog);
const filtersButton = document.createElement('button'); filtersButton.id = 'openFilters'; filtersButton.className = 'secondary';
filtersButton.textContent = 'Filters'; filtersButton.title = 'Filter records and charts, and manage favourite tickers';
filtersButton.setAttribute('aria-haspopup', 'dialog'); filtersButton.setAttribute('aria-controls', 'filterDialog');
const openFilters = () => { filterDialog.showModal(); document.dispatchEvent(new document.defaultView.CustomEvent('extension-filters-open')); };
filtersButton.onclick = openFilters;
const filtersLink = document.querySelector('.extension-nav a[href="#section-filterCard"]');
if (filtersLink) filtersLink.replaceWith(filtersButton); else document.querySelector('.extension-nav').append(filtersButton);
filterDialog.addEventListener('click', event => { if (event.target === filterDialog) { const rect = filterDialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) filterDialog.close(); } });
for (const link of document.querySelectorAll('a[href="#section-filterCard"]')) link.addEventListener('click', event => { event.preventDefault(); openFilters(); });
