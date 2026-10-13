// One current, typed outcome. Gating states take precedence over old errors.
export function resolveActionFeedback(status, { active = false, command = '', batch = false } = {}) {
  if (active) {
    const message = command === 'STOP_SCRAPING' ? 'Stopping automatic scraping...' : batch ? 'Updating selected records...' : ['SIGN_IN','SIGN_UP'].includes(command) ? 'Signing in...' : command === 'SAVE_CONFIGS' ? 'Saving settings...' : command === 'TEST_SCRAPE' ? 'Testing the market page...' : status.syncState === 'Syncing' ? 'Syncing prices...' : 'Collecting prices...';
    return { type:'progress', message };
  }
  if (status.lastActionType && status.actionCompletedAt && (status.lastActionScrapeState || status.lastActionSyncState)) status = { ...status, scrapeState:status.lastActionScrapeState ?? status.scrapeState, syncState:status.lastActionSyncState ?? status.syncState };
  if (status.actionError) return { type:'error', message:'Action failed: ' + status.actionError };
  if (status.lastActionType === 'SAVE_CONFIGS') return { type:'success', message:'Settings saved.' };
  if (status.lastActionType === 'SCRAPE_NOW_MANUAL' && status.scrapeState === 'Watching prices') return { type:'success', message:'Prices collected and saved locally.' };
  if (status.lastActionType === 'TEST_SCRAPE' && status.scrapeState === 'Test complete') return { type:'success', message:'Test complete. See the test results.' };
  if (status.lastActionType === 'PUSH_NOW' && status.syncState === 'Synced') return { type:'success', message:'Prices collected and synced.' };
  if (status.scrapeState === 'Outside time window' || status.syncState === 'Outside time window') return { type:'warning', message:'Automatic scraping is paused outside the saved Qatar-time schedule. Scrape now and Push now still work.' };
  if (status.scrapeState === 'Stopped' || status.syncState === 'Stopped') return { type:'stopped', message:'Automatic scraping is stopped. Manual scraping and syncing are still available.' };
  if (status.scrapeState === 'Scrape failed' || status.scrapeState === 'Failed' || status.scrapeState === 'Test failed') return { type:'error', message:status.lastError || 'Prices could not be collected. Retry the action.' };
  if (status.scrapeState === 'Waiting for market tab') return { type:'warning', message:'Open the configured market page, then retry.' };
  if (status.syncState === 'Retrying') return { type:'warning', message:'Sync could not finish. A retry is scheduled.' + (status.lastSyncError ? ' ' + status.lastSyncError : '') };
  if (status.syncState === 'Waiting for sign-in') return { type:'warning', message:'Prices were collected locally. Sign in to sync them.' };
  if (status.lastActionType === 'SAVE_CONFIGS') return { type:'success', message:'Settings saved.' };
  if (status.lastActionType === 'TEST_SCRAPE') return { type:'success', message:'Test complete. See the test results.' };
  if (status.lastActionType === 'SCRAPE_NOW_MANUAL') return { type:'success', message:'Prices collected and saved locally.' };
  if (status.syncState === 'Synced') return { type:'success', message:'Prices collected and synced.' };
  return { type:'info', message:'Action complete. See Activity for the latest collection and sync status.' };
}
