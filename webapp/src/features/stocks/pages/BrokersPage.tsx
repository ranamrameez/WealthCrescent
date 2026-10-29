import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BackButton } from '../../../components/BackButton';
import { PageHeading } from '../../../components/PageHeading';
import { StandardPageSections, type StandardPageSection } from '../../../components/StandardPageSections';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { toast } from '../../../components/Toast';
import { Field, TextInput, Select } from '../../../components/ui/Field';
import type { BrokerPortfolioData, BrokerProfile, QSESettings } from '../../../types/workbook';
import type { PSXSettings } from '../../../types/psxWorkbook';
import { useWorkbookStore } from '../../../store/workbookStore';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import { createDefaultPSXBrokerSettings } from '../../../store/defaultPsxWorkbook';
import { DEFAULT_SETTINGS } from '../../../store/defaultWorkbook';
import { APP_DEFAULTS_VERSION } from '../../../store/appDefaults';

const emptyPortfolio = (): BrokerPortfolioData => ({
  transactions: [], transfers: [], adjustments: [], dividends: [], tradePlans: [],
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
      const raw: Partial<BrokerPortfolioData> = profile.id === activeId
        ? { transactions: workbook.transactions, transfers: workbook.transfers, adjustments: workbook.adjustments, dividends: workbook.dividends, tradePlans: workbook.tradePlans }
        : profile.data ?? {};
      result[profile.id] = (raw.transactions?.length ?? 0) + (raw.transfers?.length ?? 0)
        + (raw.adjustments?.length ?? 0) + (raw.dividends?.length ?? 0) + (raw.tradePlans?.length ?? 0);
    }
    return result;
  }, [profiles, activeId, workbook]);

  const saveProfileList = (nextProfiles: Array<BrokerProfile<QSESettings> | BrokerProfile<PSXSettings>>) => {
    if (isPSX) setPsxWorkbook({ ...psx, brokerProfiles: nextProfiles as BrokerProfile<PSXSettings>[] });
    else setQseWorkbook({ ...qse, brokerProfiles: nextProfiles as BrokerProfile<QSESettings>[] });
  };

  const updateProfileSettings = (profileId: string, patch: Partial<QSESettings> | Partial<PSXSettings>) => {
    if (isPSX) {
      const profile = psx.brokerProfiles.find((p) => p.id === profileId);
      if (!profile) return;
      const settings = { ...profile.settings, ...patch } as PSXSettings;
      setPsxWorkbook({
        ...psx,
        settings: profileId === activeId ? settings : psx.settings,
        brokerProfiles: psx.brokerProfiles.map((p) => p.id === profileId ? { ...p, settings } : p),
      });
    } else {
      const profile = qse.brokerProfiles.find((p) => p.id === profileId);
      if (!profile) return;
      const settings = { ...profile.settings, ...patch } as QSESettings;
      setQseWorkbook({
        ...qse,
        settings: profileId === activeId ? settings : qse.settings,
        brokerProfiles: qse.brokerProfiles.map((p) => p.id === profileId ? { ...p, settings } : p),
      });
    }
  };

  const updateStatus = (profileId: string, status: 'active' | 'archived' | 'deactivated') => {
    saveProfileList(profiles.map((p) => p.id === profileId
      ? { ...p, archived: status === 'archived', deactivated: status === 'deactivated' }
      : p));
  };

  const addProfile = () => {
    const name = newName.trim();
    if (!name) return toast('Enter a broker or account profile name.');
    if (profiles.some((p) => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return toast('A profile with that name already exists for this exchange.');
    }
    const id = `${isPSX ? 'psx' : 'qse'}-${crypto.randomUUID()}`;
    if (isPSX) {
      const profile: BrokerProfile<PSXSettings> = {
        id, name, accountLabel: newAccountLabel.trim() || undefined,
        settings: createDefaultPSXBrokerSettings(name), settingsDefaultsVersion: APP_DEFAULTS_VERSION, data: emptyPortfolio(),
      };
      setPsxWorkbook({ ...psx, brokerProfiles: [...psx.brokerProfiles, profile] });
    } else {
      const profile: BrokerProfile<QSESettings> = {
        id, name, accountLabel: newAccountLabel.trim() || undefined,
        settings: { ...DEFAULT_SETTINGS }, settingsDefaultsVersion: APP_DEFAULTS_VERSION, data: emptyPortfolio(),
      };
      setQseWorkbook({ ...qse, brokerProfiles: [...qse.brokerProfiles, profile] });
    }
    setNewName('');
    setNewAccountLabel('');
    toast(`${name} profile created.`);
  };

  const saveDraft = (profileId: string) => {
    const draft = drafts[profileId];
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return toast('Profile name cannot be empty.');
    if (profiles.some((p) => p.id !== profileId && p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return toast('Another profile already uses that name.');
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
    toast('Active broker profile switched. Exchange market data remains shared.');
    navigate(isPSX ? '/psx' : '/qse');
  };

  const archiveOrDelete = async (profile: (typeof profiles)[number]) => {
    if (profile.id === activeId) return toast('Switch to another broker before changing the active profile status.');
    const count = rowCounts[profile.id] ?? 0;
    if (count > 0) {
      const ok = await confirmDialog(
        'Archived profiles are preserved for history and are view-only. They are excluded from new-activity pickers.',
        `Archive ${profile.name}?`,
      );
      if (!ok) return;
      updateStatus(profile.id, 'archived');
      toast('Profile archived; its portfolio and history are preserved.');
      return;
    }
    const ok = await confirmDialog(
      'This profile has no transactions, transfers, adjustments, dividends, or plans. This action cannot be undone.',
      `Delete empty profile ${profile.name}?`,
    );
    if (!ok) return;
    saveProfileList(profiles.filter((p) => p.id !== profile.id));
    toast('Empty broker profile deleted.');
  };

  const defaultsForProfile = (name: string): QSESettings | PSXSettings =>
    isPSX ? createDefaultPSXBrokerSettings(name) : { ...DEFAULT_SETTINGS };

  const needsDefaultsReview = (profile: (typeof profiles)[number]) => {
    if ((profile.settingsDefaultsVersion ?? 0) >= APP_DEFAULTS_VERSION) return false;
    const defaults = defaultsForProfile(profile.name) as unknown as Record<string, unknown>;
    const current = profile.settings as unknown as Record<string, unknown>;
    return Object.entries(defaults).some(([key, value]) => current[key] !== value);
  };

  const acknowledgeDefaults = (profileId: string, adoptDefaults: boolean) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    const settings = adoptDefaults ? defaultsForProfile(profile.name) : profile.settings;
    if (isPSX) {
      setPsxWorkbook({
        ...psx,
        brokerProfiles: psx.brokerProfiles.map((p) => p.id === profileId
          ? { ...p, settings: settings as PSXSettings, settingsDefaultsVersion: APP_DEFAULTS_VERSION }
          : p),
        ...(profileId === activeId ? { settings: settings as PSXSettings } : {}),
      });
    } else {
      setQseWorkbook({
        ...qse,
        brokerProfiles: qse.brokerProfiles.map((p) => p.id === profileId
          ? { ...p, settings: settings as QSESettings, settingsDefaultsVersion: APP_DEFAULTS_VERSION }
          : p),
        ...(profileId === activeId ? { settings: settings as QSESettings } : {}),
      });
    }
    toast(adoptDefaults ? 'Current application defaults applied to this broker profile.' : 'Your current settings have been kept.');
  };

  const renderProfile = (profile: (typeof profiles)[number], status: 'active' | 'archived' | 'deactivated') => {
    const draft = drafts[profile.id] ?? { name: profile.name, accountLabel: profile.accountLabel ?? '' };
    const active = profile.id === activeId;
    const count = rowCounts[profile.id] ?? 0;
    const reviewDefaults = needsDefaultsReview(profile);
    const ps = profile.settings as PSXSettings;
    const qs = profile.settings as QSESettings;
    const settingField = (label: string, key: keyof PSXSettings, value: number, step = '0.01') => (
      <Field label={label} width={150} key={String(key)}>
        <TextInput type="number" step={step} value={value} disabled={status !== 'active' || profile.archived} onChange={(e) => updateProfileSettings(profile.id, { [key]: Number(e.target.value) } as Partial<PSXSettings>)} />
      </Field>
    );
    return (
      <div key={profile.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
        {reviewDefaults && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <strong>Application defaults have changed</strong>
            <p className="text-muted" style={{ margin: '6px 0 10px' }}>Choose whether to apply the latest app defaults or keep this profile's custom settings.</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" type="button" onClick={() => void (async () => {
                const ok = await confirmDialog('Replace this profile settings with current application defaults? Portfolio history will be preserved.', 'Apply application defaults?');
                if (ok) acknowledgeDefaults(profile.id, true);
              })()}>Use app defaults</button>
              <button className="btn secondary" type="button" onClick={() => acknowledgeDefaults(profile.id, false)}>Keep my settings</button>
            </div>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 className="mt-0 mb-xs">{profile.name}</h3>
            <p className="text-muted" style={{ margin: 0 }}>{active ? 'Active profile' : status === 'archived' ? 'Archived · view only' : status === 'deactivated' ? 'Deactivated · hidden from normal lists' : 'Available'} · {count} saved record(s)</p>
            {profile.accountLabel && <small className="text-muted">{profile.accountLabel}</small>}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {active && <span className="pill pill-positive">Active</span>}
            {!active && status === 'active' && <button className="btn primary" type="button" onClick={() => switchProfile(profile.id)}>Switch to profile</button>}
            {status === 'archived' && <button className="btn secondary" type="button" onClick={() => updateStatus(profile.id, 'active')}>Restore as active</button>}
            {status === 'deactivated' && <button className="btn secondary" type="button" onClick={() => updateStatus(profile.id, 'active')}>Reactivate</button>}
          </div>
        </div>

        <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap', marginTop: 14 }}>
          <Field label="Profile name" width={240}>
            <TextInput value={draft.name} disabled={status !== 'active'} onChange={(e) => setDrafts((prev) => ({ ...prev, [profile.id]: { ...draft, name: e.target.value } }))} />
          </Field>
          <Field label="Account label" width={220}>
            <TextInput value={draft.accountLabel} disabled={status !== 'active'} onChange={(e) => setDrafts((prev) => ({ ...prev, [profile.id]: { ...draft, accountLabel: e.target.value } }))} placeholder="Optional" />
          </Field>
          {status === 'active' && <button type="button" className="btn secondary" onClick={() => saveDraft(profile.id)}>Save details</button>}
          {!active && status === 'active' && <button type="button" className="btn secondary" onClick={() => void (async () => {
            const ok = await confirmDialog('This profile remains available in the profile list but is hidden from normal activity pickers. You can reactivate it later.', `Deactivate ${profile.name}?`);
            if (ok) { updateStatus(profile.id, 'deactivated'); toast('Profile deactivated.'); }
          })()}>Deactivate</button>}
          {!active && status === 'active' && <button type="button" className="btn danger" onClick={() => void archiveOrDelete(profile)}>{count ? 'Archive profile' : 'Delete empty profile'}</button>}
        </div>

        <details style={{ marginTop: 14 }} open={active}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Profile settings</summary>
          <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap', paddingTop: 12 }}>
            {isPSX ? <>
              <Field label="Fee mode" width={190}><Select value={ps.feeMode ?? 'itemized'} disabled={status !== 'active' || profile.archived} onChange={(e) => updateProfileSettings(profile.id, { feeMode: e.target.value as PSXSettings['feeMode'] })}><option value="itemized">Itemized</option><option value="simple">Simple all-in</option></Select></Field>
              {settingField('Commission %', 'feePct', ps.feePct, '0.001')}
              {settingField('Low-price threshold', 'lowPriceThreshold', ps.lowPriceThreshold)}
              {settingField('Low-price fee / share', 'lowPriceFee', ps.lowPriceFee)}
              {settingField('SST %', 'sstPct', ps.sstPct)}
              {settingField('PSX fee %', 'psxFeePct', ps.psxFeePct, '0.0001')}
              {settingField('NCCPL fee %', 'nccplFeePct', ps.nccplFeePct, '0.0001')}
              {settingField('SECP levy %', 'secpLevyPct', ps.secpLevyPct, '0.0001')}
              {settingField('CDC / share', 'cdcPerShare', ps.cdcPerShare, '0.0001')}
              {settingField('CVT %', 'cvtPct', ps.cvtPct, '0.0001')}
              {settingField('Min fee', 'minFee', ps.minFee)}
              {settingField('Deposit fee', 'depositFee', ps.depositFee)}
              {settingField('All-in fee %', 'allInFeePct', ps.allInFeePct ?? 0, '0.001')}
              <Field label="Same-day rule" width={200}><Select value={ps.sameDayNettingRule ?? 'none'} disabled={status !== 'active' || profile.archived} onChange={(e) => updateProfileSettings(profile.id, { sameDayNettingRule: e.target.value as PSXSettings['sameDayNettingRule'] })}><option value="none">Charge separately</option><option value="higherValueSide">Higher-value side only</option></Select></Field>
              <Field label="Cost basis" width={190}><Select value={ps.costBasisMethod} disabled={status !== 'active' || profile.archived} onChange={(e) => updateProfileSettings(profile.id, { costBasisMethod: e.target.value as PSXSettings['costBasisMethod'] })}><option value="average">Average</option><option value="fifo">FIFO</option><option value="lowestCostFirst">Lowest cost first</option></Select></Field>
              <Field label="Filer status" width={140}><Select value={ps.filerStatus} disabled={status !== 'active' || profile.archived} onChange={(e) => updateProfileSettings(profile.id, { filerStatus: e.target.value as PSXSettings['filerStatus'] })}><option value="filer">Filer</option><option value="nonfiler">Non-filer</option></Select></Field>
              {settingField('Filer CGT %', 'cgtFilerPct', ps.cgtFilerPct, '0.1')}
              {settingField('Non-filer CGT %', 'cgtNonFilerPct', ps.cgtNonFilerPct, '0.1')}
              {settingField('Tick size', 'tick', ps.tick)}
            </> : <>
              <p className="text-muted" style={{ width: '100%', margin: 0 }}>All settings below belong only to this QSE broker profile.</p>
              <Field label="Commission %" width={150}><TextInput type="number" step="0.001" value={qs.feePct} disabled={status !== 'active'} onChange={(e) => updateProfileSettings(profile.id, { feePct: Number(e.target.value) })} /></Field>
              <Field label="Minimum fee" width={150}><TextInput type="number" step="0.01" value={qs.minFee} disabled={status !== 'active'} onChange={(e) => updateProfileSettings(profile.id, { minFee: Number(e.target.value) })} /></Field>
              <Field label="Tick size" width={150}><TextInput type="number" step="0.01" value={qs.tick} disabled={status !== 'active'} onChange={(e) => updateProfileSettings(profile.id, { tick: Number(e.target.value) })} /></Field>
              <Field label="Currency" width={120}><TextInput value={qs.currency} disabled={status !== 'active'} onChange={(e) => updateProfileSettings(profile.id, { currency: e.target.value })} /></Field>
              <Field label="Deposit fee" width={150}><TextInput type="number" step="0.01" value={qs.depositFee} disabled={status !== 'active'} onChange={(e) => updateProfileSettings(profile.id, { depositFee: Number(e.target.value) })} /></Field>
              <Field label="Cost basis" width={190}><Select value={qs.costBasisMethod ?? 'average'} disabled={status !== 'active'} onChange={(e) => updateProfileSettings(profile.id, { costBasisMethod: e.target.value as QSESettings['costBasisMethod'] })}><option value="average">Average</option><option value="fifo">FIFO</option><option value="lowestCostFirst">Lowest cost first</option></Select></Field>
            </>}
          </div>
        </details>
      </div>
    );
  };

  const activeProfiles = profiles.filter((p) => !p.archived && !p.deactivated);
  const archivedProfiles = profiles.filter((p) => p.archived);
  const deactivatedProfiles = profiles.filter((p) => p.deactivated);
  const sections: StandardPageSection[] = [
    {
      key: 'add-profile', label: 'Add broker profile', defaultOpen: true,
      content: <div>
        <p className="text-muted mt-0">Each profile owns its trades, transfers, rewards/dividends, adjustments, plans, calculations, accounting indexes and fee settings. Market prices and price history remain shared at exchange level.</p>
        <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <Field label="Broker / profile name" width={260}><TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={isPSX ? 'e.g. Another PSX broker' : 'e.g. The Group'} /></Field>
          <Field label="Account label (optional)" width={220}><TextInput value={newAccountLabel} onChange={(e) => setNewAccountLabel(e.target.value)} placeholder="e.g. Cash account · 1234" /></Field>
          <button type="button" className="btn primary" onClick={addProfile}>Add profile</button>
        </div>
      </div>,
    },
    { key: 'active-profiles', label: 'Active profiles', summary: <span>{activeProfiles.length} profile(s) · available for normal activity</span>, content: <>{activeProfiles.map((p) => renderProfile(p, 'active'))}</> },
    { key: 'archived-profiles', label: 'Archived profiles', summary: <span>{archivedProfiles.length} profile(s) · view only</span>, content: archivedProfiles.length ? <>{archivedProfiles.map((p) => renderProfile(p, 'archived'))}</> : <p className="text-muted">No archived profiles.</p> },
    { key: 'deactivated-profiles', label: 'Deactivated profiles', summary: <span>{deactivatedProfiles.length} profile(s) · hidden from normal lists</span>, content: deactivatedProfiles.length ? <>{deactivatedProfiles.map((p) => renderProfile(p, 'deactivated'))}</> : <p className="text-muted">No deactivated profiles.</p> },
  ];

  return (
    <div className="standard-page">
      <PageHeading back={<BackButton to={isPSX ? '/psx' : '/qse'}>← {isPSX ? 'PSX' : 'QSE'}</BackButton>}>
        <h1 className="pagetitle">Broker profiles</h1>
        <p className="text-muted" style={{ marginTop: 4 }}>{isPSX ? 'Manage separate PSX accounts and broker-specific portfolio histories.' : 'Manage separate QSE broker/account profiles and portfolio histories.'}</p>
      </PageHeading>
      <StandardPageSections sections={sections} defaultKey="active-profiles" preserveOrder />
      {isPSX && <p className="text-muted">Market prices, price history and exchange-wide information are shared across all PSX broker profiles. Historical trades already in the legacy PSX workbook are assigned to JS Zindagi without changing their trade fields.</p>}
    </div>
  );
}
