import { getStorage, setStorage } from './common.js';

export function qatarDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(value => value.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function dailyActivity(activity = {}, now = Date.now()) {
  const date = qatarDate(now);
  const empty = { date, scrapeCount: 0, scrapeFailures: 0, scrapedRows: 0, testCount: 0, syncAttempts: 0, syncCount: 0, syncFailures: 0, syncedRows: 0 };
  return { ...activity, daily: activity.daily?.date === date ? { ...empty, ...activity.daily } : empty };
}

export function updateActivity(activity, event, now = Date.now()) {
  const next = dailyActivity(activity, now);
  next.trackingStartedAt ||= now;
  const daily = next.daily;
  const count = Math.max(0, Number(event.count) || 0);
  if (event.type === 'scrape') {
    if (event.success) {
      daily.scrapeCount++;
      daily.scrapedRows += count;
      if (event.source === 'test') daily.testCount++;
      next.lastScrapeAt = now;
      next.lastScrapeCount = count;
    } else daily.scrapeFailures++;
  } else if (event.type === 'sync') {
    daily.syncAttempts++;
    if (count > 0) {
      daily.syncCount++;
      daily.syncedRows += count;
      next.lastSyncAt = now;
      next.lastSyncCount = count;
    }
    if (!event.success) daily.syncFailures++;
  }
  return next;
}

export async function getActivity(now = Date.now()) {
  const { activity } = await getStorage('activity');
  return dailyActivity(activity, now);
}

let pending = Promise.resolve();
export function recordActivity(event) {
  const write = pending.then(async () => {
    const next = updateActivity(await getActivity(), event);
    await setStorage({ activity: next });
    return next;
  });
  pending = write.catch(() => {});
  return write;
}
