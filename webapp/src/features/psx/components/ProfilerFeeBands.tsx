import { useId, useState } from 'react';
import { StandardCard } from '../../../components/StandardCard';

const bandEnds = [5_000, ...Array.from({ length: 15 }, (_, index) => (index + 1) * 10_000)];
const priceText = (paisa: number) => (paisa / 100).toFixed(2);

function feeMoves(price: number, legs: number, minimum: number, maximum: number) {
  // Work in paisa and basis points so exact one-paisa thresholds round consistently.
  const commission = Math.max(3 * 10_000, price * 15) * legs;
  return [minimum, maximum].map(rate => Math.ceil((commission + price * rate) / 10_000));
}

function rangeText([low, high]: number[]) {
  return low === high ? priceText(low) : `${priceText(low)}–${priceText(high)}`;
}

function intradayBreakpoints(start: number, end: number) {
  const points: number[] = [];
  let [previousLow, previousHigh] = feeMoves(start - 1, 1, 3, 4);
  for (let price = start; price <= end; price++) {
    const [low, high] = feeMoves(price, 1, 3, 4);
    if (price === 1 || low !== previousLow || high !== previousHigh) points.push(price);
    previousLow = low;
    previousHigh = high;
  }
  return points;
}

const bands = bandEnds.map((end, index) => {
  const start = (bandEnds[index - 1] ?? 0) + 1;
  return { start, end, points: intradayBreakpoints(start, end) };
});

function FeeBand({ start, end, points }: typeof bands[number]) {
  const listId = useId();
  const [price, setPrice] = useState(start);
  const [entry, setEntry] = useState(priceText(start));
  const label = `PKR ${priceText(start)}–${priceText(end)}`;
  const intraday = feeMoves(price, 1, 3, 4);
  const multiDay = feeMoves(price, 2, 6, 10);

  function choose(next: number) {
    setPrice(next);
    setEntry(priceText(next));
  }

  return <section className="stack-sm" aria-label={label}>
    <h3>{label}</h3>
    <label>Entry price (PKR) <input type="number" min={start / 100} max={end / 100} step="0.01" value={entry}
      onChange={event => {
        setEntry(event.target.value);
        if (event.target.validity.valid && Number.isFinite(event.target.valueAsNumber)) {
          setPrice(Math.round(event.target.valueAsNumber * 100));
        }
      }}
      onBlur={event => {
        const value = event.target.valueAsNumber;
        choose(Number.isFinite(value) ? Math.min(end, Math.max(start, Math.round(value * 100))) : price);
      }} /></label>
    <input type="range" aria-label={`Entry price, ${label}`} aria-valuetext={`PKR ${priceText(price)}`}
      min={start} max={end} value={price} list={listId} onChange={event => choose(event.target.valueAsNumber)} />
    <datalist id={listId}>{points.map(point => <option key={point} value={point} />)}</datalist>
    <output>
      <div>Intraday break-even sell price · PKR {rangeText(intraday.map(move => price + move))} (+{rangeText(intraday)})</div>
      <div>Multi-day break-even sell price · PKR {rangeText(multiDay.map(move => price + move))} (+{rangeText(multiDay)})</div>
    </output>
    <details>
      <summary>Intraday breakpoints ({points.length})</summary>
      <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
        {points.map(point => <button key={point} type="button" className="btn secondary small" onClick={() => choose(point)}>
          PKR {priceText(point)} (+{rangeText(feeMoves(point, 1, 3, 4))})
        </button>)}
      </div>
    </details>
  </section>;
}

export function ProfilerFeeBands() {
  return <StandardCard title="Al Habib fee scenarios" defaultOpen={false}>
    <p>Estimates use one intraday commission leg and two multi-day legs, plus the original Profiler’s ancillary fee ranges.</p>
    <div className="stack-lg">{bands.map(band => <FeeBand key={band.start} {...band} />)}</div>
  </StandardCard>;
}
