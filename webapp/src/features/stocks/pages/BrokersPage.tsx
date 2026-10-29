import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BackButton } from '../../../components/BackButton';
import { Card } from '../../../components/Card';
import { PageHeading } from '../../../components/PageHeading';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { toast } from '../../../components/Toast';
import { Field, TextInput } from '../../../components/ui/Field';
import type { BrokerPortfolioData, BrokerProfile, QSESettings } from '../../../types/workbook';
import type { PSXSettings } from '../../../types/psxWorkbook';
import { useWorkbookStore } from '../../../store/workbookStore';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';

const emptyPortfolio = (): BrokerPortfolioData => ({
  transactions: [],
  transfers: [],
  adjustments: [],
  dividends: [],
  tradePlans: [],
});

type BrokerDraft = { name: string; accountLabel: string };

export function BrokersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPSX = location.pathname.startsWith('/psx');
  const qse = useWorkbookStore((s) => s.workbook);
  const psx = usePSXWorkbookStore((s) => s.workbook);
  const setQseWorkbook = useWorkbookStore((s) => s.setWorkbook);
  const setPsxWorkbook = usePSXWorkbookStore((s) => s.setWorkbook);
  const setQseActiveBroker = useWorkbookStore((s) => s.setActiveBroker);
  const setPsxActiveBroker = usePSXWorkbookStore((s) => s.setActiveBroker);
  const workbook = isPSX ? psx : qse;
  const profiles = workbook.brokerProfiles ?? [];
  const activeId = workbook.activeBrokerId ?? '';
  const [newName, setNewName] = useState('');
  const [newAccountLabel, setNewAccountLabel] = useState('');
  const [drafts, setDrafts] = useState<Record<string, BrokerDraft>>({});

  const rowCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const profile of profiles) {
      const rawData = profile.id === activeId
        ? { transactions: workbook.transactions, transfers: workbook.transfers, adjustments: workbook.adjustments, dividends: workbook.dividends, tradePlans: workbook.tradePlans }
        : profile.data ?? {};
      const data = {
        transactions: rawData.transactions ?? [],
        transfers: rawData.transfers ?? [],
        adjustments: rawData.adjustments ?? [],
        dividends: rawData.dividends ?? [],
        tradePlans: rawData.tradePlans ?? [],
      };
      result[profile.id] = data.transactions.length + data.transfers.length + data.adjustments.length + data.dividends.length + data.tradePlans.length;
    }
    return result;
  }, [profiles, activeId, workbook]);

  const saveProfileList = (nextProfiles: Array<BrokerProfile<QSESettings> | BrokerProfile<PSXSettings>>) => {
    if (isPSX) setPsxWorkbook({ ...psx, brokerProfiles: nextProfiles as BrokerProfile<PSXSettings>[] });
    else setQseWorkbook({ ...qse, brokerProfiles: nextProfiles as BrokerProfile<QSESettings>[] });
  };

  const addProfile = () => {
    const name = newName.trim();
    if (!name) {
      toast('Enter a broker or account profile name.');
      return;
    }
    if (profiles.some((p) => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      toast('A profile with that name already exists for this exchange.');
      return;
    }
    const id = `${isPSX ? 'psx' : 'qse'}-${crypto.randomUUID()}`;
    if (isPSX) {
      const profile: BrokerProfile<PSXSettings> = {
        id, name, accountLabel: newAccountLabel.trim() || undefined,
        settings: { ...psx.settings }, data: emptyPortfolio(),
      };
      setPsxWorkbook({ ...psx, brokerProfiles: [...psx.brokerProfiles, profile] });
    } else {
      const profile: BrokerProfile<QSESettings> = {
        id, name, accountLabel: newAccountLabel.trim() || undefined,
        settings: { ...qse.settings }, data: emptyPortfolio(),
      };
      setQseWorkbook({ ...qse, brokerProfiles: [...qse.brokerProfiles, profile] });
    }
    setNewName('');
    setNewAccountLabel('');
    toast(`${name} profile created. Select it to begin a separate portfolio.`);
  };

  const saveDraft = (profileId: string) => {
    const draft = drafts[profileId];
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast('Profile name cannot be empty.');
      return;
    }
    if (profiles.some((p) => p.id !== profileId && p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      toast('Another profile already uses that name.');
      return;
    }
    saveProfileList(profiles.map((p) => p.id === profileId
      ? { ...p, name, accountLabel: draft.accountLabel.trim() || undefined }
      : p));
    setDrafts((current) => { const next = { ...current }; delete next[profileId]; return next; });
    toast('Broker profile updated.');
  };

  const switchProfile = (profileId: string) => {
    if (isPSX) setPsxActiveBroker(profileId);
    else setQseActiveBroker(profileId);
    toast('Active broker profile switched. Its portfolio and fee settings are now active.');
    navigate(isPSX ? '/psx' : '/qse');
  };

  const archiveOrDelete = async (profile: (typeof profiles)[number]) => {
    if (profile.id === activeId) {
      toast('Switch to another broker before archiving the active profile.');
      return;
    }
    const count = rowCounts[profile.id] ?? 0;
    if (count > 0) {
      const ok = await confirmDialog(
        'This profile contains historical records. Archiving hides it from the active broker switcher but preserves its portfolio and history.',
        `Archive ${profile.name}?`,
      );
      if (!ok) return;
      saveProfileList(profiles.map((p) => p.id === profile.id ? { ...p, archived: true } : p));
      toast('Profile archived; its data is preserved.');
      return;
    }
    const ok = await confirmDialog(
      'This profile has no recorded transactions, transfers, adjustments, dividends, or plans. This action cannot be undone.',
      `Delete empty profile ${profile.name}?`,
    );
    if (!ok) return;
    saveProfileList(profiles.filter((p) => p.id !== profile.id));
    toast('Empty broker profile deleted.');
  };

  const restoreProfile = (profileId: string) => {
    saveProfileList(profiles.map((p) => p.id === profileId ? { ...p, archived: false } : p));
    toast('Profile restored.');
  };

  return (
    <div className="page-stack">
      <PageHeading back={<BackButton to={isPSX ? '/psx' : '/qse'}>← {isPSX ? 'PSX' : 'QSE'}</BackButton>}>
        <h1 className="pagetitle">Broker profiles</h1>
        <p className="text-muted" style={{ marginTop: 4 }}>
          {isPSX
            ? 'Manage separate PSX accounts, commission schedules, and portfolio histories.'
            : 'Manage separate QSE broker/account profiles and their portfolio histories.'}
        </p>
      </PageHeading>

      <Card>
        <h3 className="mt-0">Add broker profile</h3>
        <p className="text-muted">Each profile has its own transactions, cash movements, dividends, trade plans, cost basis, and fee settings. Market prices remain shared for the exchange.</p>
        <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <Field label="Broker / profile name" width={260}>
            <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={isPSX ? 'e.g. Another PSX broker' : 'e.g. The Group'} />
          </Field>
          <Field label="Account label (optional)" width={220}>
            <TextInput value={newAccountLabel} onChange={(e) => setNewAccountLabel(e.target.value)} placeholder="e.g. Cash account · 1234" />
          </Field>
          <button type="button" className="btn primary" onClick={addProfile}>Add profile</button>
        </div>
      </Card>

      <div className="page-stack">
        {profiles.map((profile) => {
          const draft = drafts[profile.id] ?? { name: profile.name, accountLabel: profile.accountLabel ?? '' };
          const active = profile.id === activeId;
          const count = rowCounts[profile.id] ?? 0;
          return (
            <Card key={profile.id}>
              <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3 className="mt-0 mb-xs">{profile.name}</h3>
                  <p className="text-muted" style={{ margin: 0 }}>
                    {active ? 'Active profile' : profile.archived ? 'Archived' : 'Inactive'} · {count} saved record(s)
                  </p>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {active && <span className="pill pill-success">Active</span>}
                  {!active && !profile.archived && <button type="button" className="btn primary" onClick={() => switchProfile(profile.id)}>Switch to profile</button>}
                  {profile.archived && <button type="button" className="btn secondary" onClick={() => restoreProfile(profile.id)}>Restore</button>}
                </div>
              </div>
              <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap', marginTop: 14 }}>
                <Field label="Profile name" width={260}>
                  <TextInput value={draft.name} onChange={(e) => setDrafts((prev) => ({ ...prev, [profile.id]: { ...draft, name: e.target.value } }))} />
                </Field>
                <Field label="Account label" width={220}>
                  <TextInput value={draft.accountLabel} onChange={(e) => setDrafts((prev) => ({ ...prev, [profile.id]: { ...draft, accountLabel: e.target.value } }))} placeholder="Optional" />
                </Field>
                <button type="button" className="btn secondary" onClick={() => saveDraft(profile.id)}>Save details</button>
                {!active && <button type="button" className="btn danger" onClick={() => void archiveOrDelete(profile)}>{count > 0 ? 'Archive profile' : 'Delete profile'}</button>}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="text-muted">Fee schedule:</span>
                <strong>{isPSX
                  ? `${profile.settings.feePct}% above PKR ${(profile.settings as PSXSettings).lowPriceThreshold}; PKR ${(profile.settings as PSXSettings).lowPriceFee}/share at or below threshold`
                  : `${profile.settings.feePct}% commission`}</strong>
                {active && <button type="button" className="btn secondary" onClick={() => navigate(isPSX ? '/psx/settings' : '/settings')}>Configure fees</button>}
              </div>
            </Card>
          );
        })}
      </div>
      {isPSX && (
        <Card>
          <h3 className="mt-0">PSX commission sources</h3>
          <p className="text-muted">JS Zindagi's published stock page states PKR 0.05/share for shares priced up to PKR 25, or 0.20% of traded value above PKR 25, with only the higher-value side charged for same-day buy/sell pairs. AL Habib Capital Markets' published account-opening tariff lists PKR 0.03/share up to PKR 20 and 0.15% above PKR 20.01. Other levies are configurable and should be reconciled with your own contract notes.</p>
          <p><a href="https://zindigi.pk/features/stocks/" target="_blank" rel="noreferrer">JS Zindagi stock charges</a> · <a href="https://ahcml.com/assets/uploads/Normal_AOF.pdf" target="_blank" rel="noreferrer">AL Habib Capital Markets account-opening tariff (PDF)</a></p>
        </Card>
      )}
    </div>
  );
}
