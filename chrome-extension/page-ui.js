const titles = { activityStats: 'Activity', account: 'Account', scrapingControls: 'Scraping controls', favouriteCharts: 'Favourite charts', auditCard: 'Scraped data and audit history', chartCard: 'Price history', testCard: 'Test scrape', configCard: 'Configurations' };
const { collapsedSections = {} } = await chrome.storage.local.get('collapsedSections');
for (const [id, title] of Object.entries(titles)) {
  const card = document.getElementById(id);
  if (!card) continue;
  const details = document.createElement('details'); details.className = 'collapsible-section'; details.id = 'section-' + id; details.open = !collapsedSections[id];
  const summary = document.createElement('summary'); summary.textContent = title;
  card.before(details); details.append(summary, card);
  details.addEventListener('toggle', () => { collapsedSections[id] = !details.open; chrome.storage.local.set({ collapsedSections }); });
}
for (const link of document.querySelectorAll('.extension-nav a')) link.addEventListener('click', () => {
  const section = document.querySelector(link.getAttribute('href')); if (section) section.open = true;
});
