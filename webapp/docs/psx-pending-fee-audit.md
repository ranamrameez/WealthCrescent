# PSX pending order fee audit

Synthetic fixtures checked on 2026-11-23 using the app’s Al Habib profile settings. A completed PKR 1,000 buy and PKR 1,200 sell incurred PKR 0.12 and PKR 3.59 respectively even with a larger pending buy. A past completed buy paired only with a pending sell retained its full PKR 3.57 fee. Expected values were calculated independently from the configured commission, tax and levy fields.

All 45 focused PSX fee tests passed. No fee calculation changes were needed. This covers configured behavior and does not validate current broker tariffs.
