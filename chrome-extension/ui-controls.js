// Shared component classes and plain-language help for both extension surfaces.
const help = {
  fromDate: 'Include prices recorded on or after this date, using Qatar time (UTC+3). Applies to all records and charts.',
  toDate: 'Include prices recorded on or before this date, using Qatar time (UTC+3). Applies to all records and charts.',
  tickerFilter: 'Choose a ticker for all records, charts and outlier previews. Choose All tickers to show every ticker.',
  dataView: 'Choose combined local and Firebase data, Firebase data only, or local audit data only.',
  outlierFilter: 'Show all records or only detected outliers. Applies to charts and the deletion preview too.',
  sourceFilter: 'Filter local records by automatic collection, manual collection or test collection.',
  strategyFilter: 'Filter local records by the detection method used to read prices.',
  acceptedFilter: 'Show valid parsed prices or rejected source values in local and combined data.',
  pageSize: 'Set the number of records per table page. Chart filters still cover all matching pages.',
  chartTicker: 'Focus the main price-history chart on one ticker. The shared date and data filters still apply.',
  loadFavouriteCharts: 'Render charts for your saved tickers using the current shared filters. No individual timeframe overrides are used.',
  unloadFavouriteCharts: 'Remove the rendered saved charts from this page. Your saved tickers are retained.',
  refreshData: 'Reload records, charts and the outlier preview using the current shared filters.',
  reviewOutliers: 'Set the shared dates to All time and open the outlier preview. Other filters remain unchanged.',
  selectPreviewOutliers: 'Select every currently previewed outlier, up to 100, for deletion.',
  clearPreviewOutliers: 'Deselect all previewed outliers. No records are deleted.',
  deleteOutliers: 'Delete only the selected preview records after confirmation. Local and Firebase records are updated in their respective stores.',
  deleteSelected: 'Delete the selected table records after confirmation. This can include normal records.',
  editSelected: 'Replace each selected record price with the positive corrected price entered here, after confirmation.',
  batchPrice: 'Enter the corrected positive price to apply to the selected table records.',
  showAllColumns: 'Show or hide the day range, source column and collection method columns. All data remains available in record details.',
  autoSelectOutliers: 'Automatically select detected outliers for table actions. Deletion still requires confirmation.',
  selectAll: 'Select or deselect every record on the current table page for editing or deletion.',
  prevPage: 'Show the previous page of filtered records.', nextPage: 'Show the next page of filtered records.',
  testBtn: 'Read the configured market tab and save a local test result. Works outside the automatic schedule and preserves your filters.',
  scrapeNowBtn: 'Collect prices from the market tab and save them locally. Works while signed out and outside the automatic schedule.',
  pushNowBtn: 'Collect prices and attempt to sync them to Firebase now. Sign-in is required. Works outside the automatic schedule.',
  signInBtn: 'Sign in with the entered account details, then automatically attempt a price sync.',
  signOutBtn: 'Sign out of Firebase. Local scraping remains available.',
  email: 'Enter the email address for your WealthCrescent Firebase account.', password: 'Enter your account password to sign in.',
  createNew: 'Create a new Firebase account instead of signing in to an existing account.',
  minPushIntervalMinutes: 'Minimum automatic sync interval in minutes. Zero syncs after each eligible collection. Push now bypasses this delay.',
  pushTimingMode: 'Choose a fixed automatic push interval or a randomized interval between one and two times the configured minimum.',
  scrapeIntervalSeconds: 'Periodic collection interval in seconds. Zero disables periodic collection; price-change collection can still run.',
  scrapeOnPriceChange: 'Collect when rendered ticker prices change. Keep the market tab open.',
  respectTimeWindows: 'Limit automatic collection to the configured Qatar-time windows. Manual Scrape now, Push now and Test always bypass them.',
  targetUrl: 'Market-page URL used to locate the tab from which prices are collected.',
};
const buttonHelp = {
  'Start scraping': 'Enable automatic scraping and collect one sample immediately, even outside the saved schedule. Future automatic collections follow the configured schedule.',
  'Stop scraping': 'Stop automatic scraping and wait for in-flight work. Manual actions remain available.',
  'Scrape now': help.scrapeNowBtn, 'Push now': help.pushNowBtn,
  'Save configurations': 'Save the collection, sync and market-page settings. Automatic collection uses these settings.',
  'Add time pair': 'Add an automatic collection start/end window in Qatar time (UTC+3).',
  'Remove': 'Remove this automatic collection time window from the settings form.',
  'Full screen': 'Open this chart in fullscreen. Exit fullscreen to return to the page.',
  'Show more ticker charts': 'Render the next six matching ticker charts.',
  'Dismiss': 'Dismiss this notification. The current state remains visible in Activity.',
};
const periods = { '1d':'Today', '7d':'Past 7 days', '1M':'Past month', '3M':'Past 3 months', '6M':'Past 6 months', '1Y':'Past year', 'all':'All time' };
function enhance(root) {
  const selector = 'button,input,select,summary,a[href],th,label,.card,.stats-card,.config-section,.chart-grid section,.advanced-controls';
  const nodes = [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
  for (const element of nodes) {
    if (element.matches('button')) {
      element.classList.add('wc-button');
      if (element.dataset.period) { element.classList.add('wc-chip'); element.classList.toggle('is-selected', element.getAttribute('aria-pressed') === 'true'); element.textContent = periods[element.dataset.period] || element.dataset.period; }
      const danger = element.matches('#deleteOutliers,#deleteSelected,.stop-control');
      const secondary = element.matches('.secondary,.scrape-control,.chart-fullscreen,.chart-favourite,.wc-toast-dismiss,#prevPage,#nextPage,#refreshData,#testBtn,#scrapeNowBtn,#unloadFavouriteCharts,#clearPreviewOutliers,#selectPreviewOutliers');
      element.classList.toggle('wc-button--danger', danger); element.classList.toggle('wc-button--secondary', !danger && secondary); element.classList.toggle('wc-button--primary', !danger && !secondary);
    }
    if (element.matches('.card,.stats-card,.config-section,.chart-grid section')) element.classList.add('wc-card');
    if (element.matches('.advanced-controls')) element.classList.add('wc-info-wrap');
    if (element.hasAttribute('title')) continue;
    const key = element.id || element.name;
    const text = element.textContent.trim().replace(/\s+/g, ' ');
    let description = help[key];
    if (element.matches('input[type=time]')) description = element.classList.contains('start') ? 'Start automatic collection at this Qatar time (UTC+3).' : 'End automatic collection at this Qatar time (UTC+3). The end time is exclusive; overnight windows are supported.';
    if (element.dataset.period) description = 'Apply ' + periods[element.dataset.period] + ' to the shared date filter for all records, charts and outlier previews.';
    if (!description && element.matches('button')) description = buttonHelp[text] || (element.classList.contains('chart-favourite') ? 'Save or unsave this ticker for the Saved ticker charts section.' : element.getAttribute('aria-label') || text);
    if (!description && element.matches('#outlierPreviewRows input[type=checkbox]')) description = 'Include this flagged record in the deletion preview selection. It is deleted only after you confirm Delete preview selection.';
    if (!description && element.matches('input[type=checkbox]')) description = element.getAttribute('aria-label') || 'Enable or disable ' + (element.closest('label')?.textContent.trim() || 'this option') + '.';
    if (!description && element.matches('summary')) description = 'Expand or collapse ' + text + '. This does not change collection settings or delete data.';
    if (!description && element.matches('a[href^="#section-"]')) description = 'Open the ' + text + ' section.';
    if (!description && element.matches('th')) description = 'Record field: ' + text + '.';
    if (!description && element.matches('label')) description = help[element.querySelector('input,select')?.id || element.querySelector('input,select')?.name] || text;
    if (!description && element.matches('input,select')) description = 'Set ' + (element.closest('label')?.textContent.split('\n')[0].trim() || element.name || key || 'this value') + '.';
    if (!description && element.matches('a')) description = text || 'Open this link.';
    if (description) element.title = description;
  }
}
enhance(document);
new MutationObserver(records => { for (const record of records) {
  if (record.type === 'attributes') enhance(record.target);
  else for (const node of record.addedNodes) if (node.nodeType === 1) enhance(node);
} }).observe(document.body, { subtree:true, childList:true, attributes:true, attributeFilter:['aria-pressed'] });
