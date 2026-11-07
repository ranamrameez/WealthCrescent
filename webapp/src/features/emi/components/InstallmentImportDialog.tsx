import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Field, TextInput } from '../../../components/ui/Field';
import { StandardDropdown } from '../../../components/ui/StandardDropdown';
import { Notice } from '../../../components/Notice';
import { SummaryGroupCard, SummaryValue } from '../../../components/SummaryGroupCard';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { toast } from '../../../components/Toast';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { fmtMoney } from '../../../lib/format';
import { readInstallmentImportFile, previewInstallmentWorkbook, applyInstallmentImport } from '../../../services/finance/installmentImportService';
import type { EMILoan } from '../../../types/emiWorkbook';

export function InstallmentImportDialog({ loan, onClose }: { loan: EMILoan; onClose: () => void }) {
  const ensureSignedIn = useEnsureSignedIn();
  const [workbook, setWorkbook] = useState<Awaited<ReturnType<typeof readInstallmentImportFile>> | null>(null);
  const [fileLabel, setFileLabel] = useState(''), [sheet, setSheet] = useState('0');
  const [preview, setPreview] = useState<ReturnType<typeof previewInstallmentWorkbook> | null>(null);
  const [confirmation, setConfirmation] = useState(''), [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const receipts = useTablePagination(preview?.payments ?? []);
  const obligations = useTablePagination(preview?.obligations ?? []);
  const read = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(''); setPreview(null); setWorkbook(null); setConfirmation(''); setReviewed(false);
    try { setWorkbook(await readInstallmentImportFile(file)); setFileLabel(file.name); setSheet('0'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'File could not be read.'); }
    finally { setBusy(false); }
  };
  const generate = () => {
    if (!workbook) return;
    setError(''); setPreview(null); setConfirmation(''); setReviewed(false);
    try { setPreview(previewInstallmentWorkbook(loan, workbook, Number(sheet), fileLabel)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Preview could not be generated.'); }
  };
  const apply = async () => {
    if (!preview || busy || !reviewed || !(await ensureSignedIn('Sign in to apply the reviewed reconciliation.'))) return;
    if (!(await confirmDialog('Replace only this loan’s unlinked receipt ledger and contractual obligations with the reviewed worksheet? Original loan and receipt snapshots will be retained in reconciliation history. Open linked plans will refresh; no real money moves.', 'Apply reviewed reconciliation?'))) return;
    setBusy(true); setError('');
    try { const result = applyInstallmentImport(preview, confirmation); toast(result.changed ? 'Reconciliation applied. Original records retained in history.' : 'This ledger already matches the selected worksheet.'); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Reconciliation could not be applied.'); }
    finally { setBusy(false); }
  };
  return <Modal title={`Reconcile ${loan.name}`} onClose={onClose}>
    <div className="stack-lg">
      <Notice>Files are read locally. Choose one worksheet as the source; sheets are never silently combined. Obligations and actual receipts remain separate. Cached summary totals are checked against row totals. This preview does not change app data.</Notice>
      <Field label="Installment workbook or CSV"><TextInput type="file" accept=".xlsx,.csv" disabled={busy} onChange={event => void read(event.target.files?.[0])} /></Field>
      {workbook && <div className="row gap-sm"><StandardDropdown label="Source worksheet" value={sheet} isTypeable sections={[{ title: 'Worksheets', items: workbook.sheets.map((item, index) => ({ value: String(index), label: item.name })) }]} onChange={value => { setSheet(value); setPreview(null); setReviewed(false); }} /><button className="btn secondary" disabled={busy} onClick={generate}>Generate reconciliation preview</button></div>}
      {error && <Notice tone="danger">{error}</Notice>}
      {preview && <>
        <SummaryGroupCard title={`Preview · ${loan.currencyCode}`}><SummaryValue primary label="Imported actual remaining" value={fmtMoney(preview.report.actualRemaining, loan.currencyCode)} detail={`As of ${preview.report.asOf}`} /><SummaryValue label="Current app remaining" value={fmtMoney(preview.currentRemaining, loan.currencyCode)} /><SummaryValue label="Imported actual paid" value={fmtMoney(preview.report.actualPaid, loan.currencyCode)} /><SummaryValue label="Contractual total" value={fmtMoney(preview.report.contractualTotal, loan.currencyCode)} /></SummaryGroupCard>
        <p>{preview.sourceLabel}. Existing receipts: {preview.existingPayments.length}. Imported receipts: {preview.payments.length}. Future-dated imported receipts: {preview.report.futurePaymentCount}. Existing manual allocations reset; original loan terms and receipts are archived. Imported obligations govern the new fixed-total balance.</p>
        {!!preview.differences.length && <Notice tone="warning"><ul>{preview.differences.map((issue, index) => <li key={index}>{issue}</li>)}</ul></Notice>}
        {!!preview.blocked.length && <Notice tone="danger"><ul>{preview.blocked.map((issue, index) => <li key={index}>{issue}</li>)}</ul></Notice>}
        <div className="table-scroll"><table><caption>Imported contract obligations</caption><thead><tr><th>Due date</th><th>Description</th><th>Amount</th></tr></thead><tbody>{obligations.rows.map(row => <tr key={row.id}><td>{row.dueDate}</td><td>{row.description}</td><td>{fmtMoney(row.amount, loan.currencyCode)}</td></tr>)}</tbody></table></div>{obligations.controls}
        <div className="table-scroll"><table><caption>Imported actual receipts — no unpaid placeholder entries</caption><thead><tr><th>Actual date</th><th>Description</th><th>Amount</th></tr></thead><tbody>{receipts.rows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.description}</td><td>{fmtMoney(row.amount, loan.currencyCode)}</td></tr>)}</tbody></table></div>{receipts.controls}
        <label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> I reviewed the selected worksheet, actual dates, amounts and differences.</label>
        <Field label={`Type ${loan.name} to confirm replacement`}><TextInput value={confirmation} onChange={event => setConfirmation(event.target.value)} /></Field>
        <button className="btn" disabled={busy || !reviewed || preview.blocked.length > 0 || confirmation.trim() !== loan.name} onClick={() => void apply()}>Apply reviewed reconciliation</button>
      </>}
      <button className="btn secondary" disabled={busy} onClick={onClose}>Cancel</button>
    </div>
  </Modal>;
}
