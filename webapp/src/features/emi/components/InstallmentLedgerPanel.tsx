import { useTablePagination } from '../../../hooks/useTablePagination';
import { useAppearanceStore } from '../../../store/appearanceStore';
import { useState } from 'react';
import { useInstallmentReport, saveInstallmentContract, saveInstallmentPayment, saveInstallmentAllocations, setInstallmentPayingAccount } from '../../../services/finance/installmentService';
import type { EMILoan, EMIRepayment } from '../../../types/emiWorkbook';
import { Field, TextInput } from '../../../components/ui/Field';
import { Notice } from '../../../components/Notice';
import { toast } from '../../../components/Toast';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { fmtMoney } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { StandardDropdown } from '../../../components/ui/StandardDropdown';
import { SummaryGroupCard, SummaryValue } from '../../../components/SummaryGroupCard';
import { AppBar, AppLine } from '../../../components/AppCharts';
import { cssVar } from '../../../lib/cssVar';

export function InstallmentLedgerPanel({ loanId }: { loanId: string }) {
  const model = useInstallmentReport(loanId);
  const ensureSignedIn = useEnsureSignedIn();
  const [contract, setContract] = useState<NonNullable<EMILoan['contractSchedule']> | null>(null);
  const [payment, setPayment] = useState<{ date: string; amount: string; description: string; original?: EMIRepayment } | null>(null);
  const [allocation, setAllocation] = useState<{ paymentId: string; rows: { obligationId: string; amount: string }[] } | null>(null);
  useAppearanceStore(state => state.appearance);
  const eventPage = useTablePagination(model?.report?.events ?? []);
  const obligationPage = useTablePagination(model?.report?.rows ?? []);
  const monthPage = useTablePagination(model?.monthly?.rows ?? []);
  const paymentPage = useTablePagination(model?.payments ?? []);
  if (!model) return null;
  const { loan, report, asOf } = model;
  const saveContract = async () => {
    if (!contract) return;
    if (!(await ensureSignedIn('Sign in to save the reviewed contract.'))) return;
    if (!(await confirmDialog('Use these reviewed obligations for recorded balances and automatic oldest-first payment allocation? Existing payment records are preserved; open linked plans refresh to their unpaid amounts. Verify booking, larger installments, dates and the full contractual total before continuing.', 'Save reviewed contract?'))) return;
    try { saveInstallmentContract(loan, contract); setContract(null); toast('Contract saved. Payment history is unchanged.'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Contract could not be saved.'); }
  };
  const savePayment = async () => {
    if (!payment) return;
    if (!(await ensureSignedIn('Sign in to record a payment.'))) return;
    try { saveInstallmentPayment(loan, { id: payment.original?.id, date: payment.date, amount: Number(payment.amount), description: payment.description }, payment.original); setPayment(null); toast('Payment recorded; contract unchanged.'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Payment could not be saved.'); }
  };
  const saveAllocation = async () => {
    if (!allocation || !(await ensureSignedIn('Sign in to allocate payments.'))) return;
    try { saveInstallmentAllocations(loan, allocation.paymentId, allocation.rows.map(row => ({ obligationId: row.obligationId, amount: Number(row.amount) }))); setAllocation(null); toast('Payment allocation updated.'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Allocation could not be saved.'); }
  };
  return <div className="stack-lg">
    <Notice>Contract obligations and actual payments are separate. Payments cover the oldest obligations first, including partial and advance payments. Future-dated records are excluded until their payment date. Fines are separate from debt. Review legacy placeholder and generated records before relying on recorded balances.</Notice>
    <div className="row gap-sm">
      <button className="btn secondary" onClick={() => setContract((loan.contractSchedule ?? model.suggested).map(row => ({ ...row })))}>{report ? 'Edit contract obligations' : 'Review independent contract'}</button>
      {report && <button className="btn" onClick={() => setPayment({ date: asOf, amount: '', description: '' })}>＋ Record payment</button>}
    </div>
    {contract && <div className="stack-lg">
      <Notice tone="warning">This draft comes from the old schedule and may contain payment-derived overrides. Correct it to the agreed contract, including booking and additional major installments. Saving changes balance tracking; it does not correct historical payments.</Notice>
      <div className="table-scroll"><table><thead><tr><th>Description</th><th>Due date</th><th>Amount ({loan.currencyCode})</th><th /></tr></thead><tbody>{contract.map((row, index) => <tr key={row.id}>
        <td><TextInput aria-label={`Obligation ${index + 1} description`} value={row.description} onChange={event => setContract(contract.map(item => item.id === row.id ? { ...item, description: event.target.value } : item))} /></td>
        <td><TextInput aria-label={`Obligation ${index + 1} date`} type="date" value={row.dueDate} onChange={event => setContract(contract.map(item => item.id === row.id ? { ...item, dueDate: event.target.value } : item))} /></td>
        <td><TextInput aria-label={`Obligation ${index + 1} amount`} type="number" min={0} step="0.01" value={row.amount} onChange={event => setContract(contract.map(item => item.id === row.id ? { ...item, amount: Number(event.target.value) } : item))} /></td>
        <td><button className="btn secondary" aria-label={`Remove obligation ${index + 1}`} onClick={() => setContract(contract.filter(item => item.id !== row.id))}>×</button></td>
      </tr>)}</tbody></table></div>
      <div className="row gap-sm"><button className="btn secondary" onClick={() => setContract([...contract, { id: crypto.randomUUID(), dueDate: asOf, amount: 0, description: '' }])}>＋ Add obligation</button><button className="btn" onClick={saveContract}>Save reviewed contract</button><button className="btn secondary" onClick={() => setContract(null)}>Cancel</button></div>
    </div>}
    {report && <><div className="row gap-sm"><StandardDropdown label="Default paying bank" value={loan.linkedBankAccountId ?? ''} isTypeable sections={[{ title: loan.currencyCode + ' bank accounts', items: [{ value: '', label: 'No default bank' }, ...model.fundingOptions] }]} onChange={async accountId => { if (!(await ensureSignedIn('Sign in to change the paying account.'))) return; try { setInstallmentPayingAccount(loan, accountId); toast('Default bank updated; completed history preserved.'); } catch (error) { toast(error instanceof Error ? error.message : 'Paying account could not be updated.'); } }} /><p className="text-muted">Changing the default re-routes open Bank installments. Cash/Card choices and completed records remain.</p></div>
      <SummaryGroupCard title="Contract position"><SummaryValue primary label="Actual remaining" value={fmtMoney(report.actualRemaining, loan.currencyCode)} /><SummaryValue label="Overdue" tone="negative" value={fmtMoney(report.overdue, loan.currencyCode)} /><SummaryValue label="Advance / credit" tone="positive" value={fmtMoney(report.advance, loan.currencyCode)} /></SummaryGroupCard>
      <p className="text-muted">As of {asOf}. Scheduled remaining: {fmtMoney(report.scheduledRemaining, loan.currencyCode)}. Unapplied credit: {fmtMoney(report.unappliedCredit, loan.currencyCode)}.</p>
      {model.monthly && <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}><div style={{ height: 240 }}><AppBar data={{ labels: model.monthly.rows.map(row => row.month), datasets: [{ label: `Contract scheduled (${loan.currencyCode})`, data: model.monthly.rows.map(row => row.scheduled), backgroundColor: cssVar('--accent') }, { label: `Actual paid (${loan.currencyCode})`, data: model.monthly.rows.map(row => row.actual), backgroundColor: cssVar('--profit') }] }} options={{ maintainAspectRatio: false }} /></div><div style={{ height: 240 }}><AppLine data={{ labels: model.monthly.rows.map(row => row.month), datasets: [{ label: `Actual remaining (${loan.currencyCode})`, data: model.monthly.rows.map(row => row.actualRemaining), borderColor: cssVar('--loss') }, { label: `Contract scheduled remaining (${loan.currencyCode})`, data: model.monthly.rows.map(row => row.scheduledRemaining), borderColor: cssVar('--accent'), borderDash: [5, 4] }] }} options={{ maintainAspectRatio: false }} /></div></div>{model.monthly.truncated && <Notice>Charts show the latest 1,200 months. Full contract and payment tables retain all events.</Notice>}<div className="table-scroll"><table><caption>Monthly chart data — actual values stop at the reporting date; future contract amounts are forecasts</caption><thead><tr><th>Month</th><th>Scheduled</th><th>Actual paid</th><th>Actual remaining</th><th>Scheduled remaining</th></tr></thead><tbody>{monthPage.rows.map(row => <tr key={row.month}><td>{row.month}</td><td>{fmtMoney(row.scheduled, loan.currencyCode)}</td><td>{row.actual === null ? '—' : fmtMoney(row.actual, loan.currencyCode)}</td><td>{row.actualRemaining === null ? '—' : fmtMoney(row.actualRemaining, loan.currencyCode)}</td><td>{fmtMoney(row.scheduledRemaining, loan.currencyCode)}</td></tr>)}</tbody></table></div>{monthPage.controls}</>}
      <div className="table-scroll"><table><caption>Full chronological contract and payments — future obligations are forecasts; future payments do not count as paid today. The net column is cumulative scheduled due less payments; allocation-based overdue and advance are shown separately.</caption><thead><tr><th>Date</th><th>Event</th><th>Scheduled amount</th><th>Actual payment</th><th>Cumulative paid</th><th>Actual remaining</th><th>Scheduled remaining</th><th>Net due less paid</th></tr></thead><tbody>{eventPage.rows.map(row => <tr key={`${row.kind}:${row.id}`}><td>{row.date}</td><td>{row.description}{row.future ? ' · Future' : ''}</td><td>{row.kind === 'obligation' ? fmtMoney(row.amount, loan.currencyCode) : '—'}</td><td>{row.kind === 'payment' ? fmtMoney(row.amount, loan.currencyCode) : '—'}</td><td>{fmtMoney(row.cumulativePaid, loan.currencyCode)}</td><td>{fmtMoney(row.actualRemaining, loan.currencyCode)}</td><td>{fmtMoney(row.scheduledRemaining, loan.currencyCode)}</td><td>{fmtMoney(row.pending, loan.currencyCode)}</td></tr>)}</tbody></table></div>{eventPage.controls}
      <div className="table-scroll"><table><caption>Contract obligations and allocated actual payments</caption><thead><tr><th>Due date</th><th>Description</th><th>Scheduled</th><th>Allocated paid</th><th>Remaining</th><th>Status</th></tr></thead><tbody>{obligationPage.rows.map(row => <tr key={row.id}><td>{row.dueDate}</td><td>{row.description}</td><td>{fmtMoney(row.amount, loan.currencyCode)}</td><td>{fmtMoney(row.paid, loan.currencyCode)}</td><td>{fmtMoney(row.remaining, loan.currencyCode)}</td><td>{row.status}</td></tr>)}</tbody></table></div>{obligationPage.controls}
    </>}
    {payment && <div className="stack-lg"><div className="row gap-sm"><Field label="Actual payment date"><TextInput type="date" value={payment.date} onChange={event => setPayment({ ...payment, date: event.target.value })} /></Field><Field label={`Payment amount (${loan.currencyCode})`}><TextInput type="number" min={0} step="0.01" value={payment.amount} onChange={event => setPayment({ ...payment, amount: event.target.value })} /></Field><Field label="Payment description"><TextInput value={payment.description} onChange={event => setPayment({ ...payment, description: event.target.value })} /></Field></div><div className="row gap-sm"><button className="btn" onClick={savePayment}>Save actual payment</button><button className="btn secondary" onClick={() => setPayment(null)}>Cancel</button></div></div>}
    {allocation && <div className="stack-lg"><Notice>Manual splits replace automatic oldest-first allocation for this payment. Any remainder stays unapplied. Clear all splits to restore automatic allocation. Allocation-based overdue and advance can coexist; the chronological net column is not an arrears calculation.</Notice>{allocation.rows.map((row, index) => <div className="row gap-sm" key={index}><StandardDropdown label={`Allocation obligation ${index + 1}`} value={row.obligationId} isTypeable sections={[{ title: 'Contract obligations', items: (loan.contractSchedule ?? []).map(item => ({ value: item.id, label: `${item.dueDate} · ${item.description}` })) }]} onChange={obligationId => setAllocation({ ...allocation, rows: allocation.rows.map((item, at) => at === index ? { ...item, obligationId } : item) })} /><Field label={`Allocation amount ${index + 1}`}><TextInput type="number" min={0} step="0.01" value={row.amount} onChange={event => setAllocation({ ...allocation, rows: allocation.rows.map((item, at) => at === index ? { ...item, amount: event.target.value } : item) })} /></Field><button className="btn secondary" aria-label={`Remove split ${index + 1}`} onClick={() => setAllocation({ ...allocation, rows: allocation.rows.filter((_, at) => at !== index) })}>×</button></div>)}<div className="row gap-sm"><button className="btn secondary" onClick={() => setAllocation({ ...allocation, rows: [...allocation.rows, { obligationId: '', amount: '' }] })}>＋ Add split</button><button className="btn" onClick={saveAllocation}>Save allocation</button><button className="btn secondary" onClick={() => setAllocation(null)}>Cancel</button></div></div>}
    <div className="table-scroll"><table><caption>Independent payment records — each receipt remains separate</caption><thead><tr><th>Actual date</th><th>Description</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{paymentPage.rows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.description || 'Payment'}</td><td>{fmtMoney(row.amount, loan.currencyCode)}</td><td>{row.date > asOf ? 'Future-dated' : 'Recorded'}</td><td>{report && <div className="row gap-sm"><button className="btn secondary" onClick={() => setPayment({ date: row.date, amount: String(row.amount), description: row.description ?? '', original: row })}>Edit payment</button><button className="btn secondary" onClick={() => setAllocation({ paymentId: row.id, rows: (loan.paymentAllocations ?? []).filter(item => item.paymentId === row.id).map(item => ({ obligationId: item.obligationId, amount: String(item.amount) })) })}>Allocate</button></div>}</td></tr>)}</tbody></table></div>{paymentPage.controls}
  </div>;
}
