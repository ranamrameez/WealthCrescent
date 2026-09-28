import type { KeyboardEvent, ReactNode } from 'react';
import type { CreditCard } from '../types/creditCard';
import { fmtMoney } from '../lib/format';
import { UsageBar } from './ui/UsageBar';

interface CreditCardVisualProps {
  card: CreditCard;
  balance: number;
  onClick?: () => void;
  badge?: ReactNode;
}

/** One issuer-style card surface used everywhere a credit card is shown.
 * It intentionally displays only the stored BIN (never invents or stores a
 * full card number) while keeping the most important credit fact—the limit
 * and how much remains—visible without opening the detail page. */
export function CreditCardVisual({ card, balance, onClick, badge }: CreditCardVisualProps) {
  const used = Math.max(0, balance);
  const limit = Math.max(0, card.creditLimit ?? 0);
  const available = Math.max(0, limit - used);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onClick();
  };
  return (
    <div
      className={`credit-card-visual${onClick ? ' clickable' : ''}`}
      style={{ '--credit-card-hue': card.color ?? 'var(--accent)' } as React.CSSProperties}
      onClick={onClick}
      onKeyDown={keyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Open ${card.name}` : undefined}
    >
      <div className="credit-card-visual-top">
        <div>
          <div className="credit-card-visual-bank">{card.cardNetwork || 'Credit card'}</div>
          <div className="credit-card-visual-name">{card.name}</div>
        </div>
        {badge ?? (card.isActive === false ? <span className="pill-warn fs-10">Closed</span> : null)}
      </div>
      <div className="credit-card-visual-number" aria-label={card.cardBin ? `BIN ${card.cardBin}` : 'Card number hidden'}>
        {card.cardBin ? `${card.cardBin}  ••••  ••••` : '••••  ••••  ••••  ••••'}
      </div>
      <div className="credit-card-visual-balance">
        <span>Outstanding</span><strong>{fmtMoney(used, card.currencyCode)}</strong>
      </div>
      {limit > 0 ? (
        <UsageBar
          used={used}
          total={limit}
          leftLabel={`Used ${fmtMoney(used, card.currencyCode)}`}
          rightLabel={`Available ${fmtMoney(available, card.currencyCode)}`}
        />
      ) : <div className="credit-card-visual-limit">Credit limit not set</div>}
      {limit > 0 && <div className="credit-card-visual-limit">Limit {fmtMoney(limit, card.currencyCode)}</div>}
    </div>
  );
}
