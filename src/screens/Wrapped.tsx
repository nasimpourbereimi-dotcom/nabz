import { useMemo, useState } from 'preact/hooks';
import { getDB } from '../db/schema';
import { defaultWrappedMonth, loadWrapped } from '../db/queries';
import { fa } from '../strings.fa';
import { useLive } from '../ui/useLive';
import { EmptyState } from '../ui/EmptyState';
import { addJMonths, type JMonth } from '../lib/jalaliMonth';
import { buildCards, INK, type StoryCard } from '../wrapped/cards';
import { shareCard } from '../wrapped/canvas';
import { IconBack } from '../ui/icons';

const W = fa.wrapped;

export function WrappedScreen({ onImport }: { onImport: () => void }) {
  const [month, setMonth] = useState<JMonth>(() => defaultWrappedMonth());
  const [i, setI] = useState(0);
  const [sharing, setSharing] = useState(false);
  const m = useLive(() => loadWrapped(getDB(), month), [month.y, month.m]);
  const cards = useMemo(() => (m ? buildCards({ month: m.name, prevMonth: m.prevName, s: m.stats, golden: m.golden }) : []), [m]);

  if (m && !m.hasData) {
    return (
      <div class="screen fade-in">
        <h1 class="h1">{fa.tabs.wrapped}</h1>
        <EmptyState text={W.noData} action={fa.today.noDataAction} onAction={onImport} />
      </div>
    );
  }
  if (!m || !cards.length) return <div class="screen" />;

  const idx = Math.min(i, cards.length - 1);
  const card = cards[idx];
  const go = (j: number) => setI(((j % cards.length) + cards.length) % cards.length);
  const switchMonth = (n: number) => { setMonth(addJMonths(month, n)); setI(0); };

  return (
    <div class="story" style={{ background: card.bg, color: INK }} aria-label={W.cardAria(idx + 1, cards.length)}>
      <div class="story-inner">
        <div style="display:flex;gap:4px" aria-hidden="true">
          {cards.map((_, j) => (
            <button key={j} class="story-bar" style={{ background: j <= idx ? INK : 'rgba(20,10,3,0.25)' }} onClick={() => go(j)} tabIndex={-1} />
          ))}
        </div>

        <div class="row" style="margin-top:20px;justify-content:space-between">
          <div style="font-size:14px;font-weight:700;opacity:0.8">{W.brand}</div>
          {idx === 0 && (
            <div class="row" style="gap:6px">
              <button class="story-icon" aria-label={W.prevMonth} disabled={!m.hasPrev} onClick={() => switchMonth(-1)}><IconBack size={18} /></button>
              <button class="story-icon" aria-label={W.nextMonthBtn} disabled={!m.hasNext} onClick={() => switchMonth(1)}><IconBack size={18} style="transform:scaleX(-1)" /></button>
            </div>
          )}
        </div>

        <CardBody card={card} key={`${month.y}-${month.m}-${idx}`} />

        <div class="row" style="margin-top:auto;padding-top:20px;gap:10px">
          <button class="story-next" onClick={() => go(idx + 1)}>{idx === cards.length - 1 ? W.again : W.next}</button>
          <button class="story-share" aria-label={W.share} disabled={sharing}
            onClick={async () => { setSharing(true); try { await shareCard(card, `nabz-${m.month.y}-${m.month.m}-${idx + 1}.png`); } finally { setSharing(false); } }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function CardBody({ card }: { card: StoryCard }) {
  return (
    <div class="fade-in">
      <div style="margin-top:28px;font-size:60px;font-weight:900;line-height:1.05;letter-spacing:-2px;white-space:pre-line">{card.title}</div>
      {card.lead && <div style="margin-top:24px;font-size:17px;line-height:1.8">{card.lead}</div>}
      {card.hero && (
        <div class="row" style="margin-top:32px;align-items:baseline;gap:12px;border-bottom:2px solid rgba(20,10,3,0.18);padding-bottom:16px">
          <div style="font-size:64px;font-weight:900;line-height:1">{card.hero.value}</div>
          <div style="font-size:18px;font-weight:700;line-height:1.4">
            {card.hero.label}
            {card.hero.sub && <><br /><span style="font-weight:400;font-size:14px">{card.hero.sub}</span></>}
          </div>
        </div>
      )}
      {card.stats.length > 0 && (
        <div style="margin-top:22px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">
          {card.stats.map((s) => (
            <div key={s.label} class="stack" style="gap:2px">
              <div style="font-size:30px;font-weight:900;line-height:1.3">{s.value}</div>
              <div style="font-size:13px">{s.label}</div>
              {s.sub && <div style="font-size:12px;font-weight:700">{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
      {card.box && (
        <div class="stack" style="margin-top:26px;background:#140A03;color:#FFE7D4;border-radius:24px;padding:20px;gap:6px">
          <div style="font-size:13px;color:#FFB27A">{card.box.title}</div>
          {card.box.value && <div style="font-size:30px;font-weight:900">{card.box.value}</div>}
          <div style="font-size:13px;line-height:1.7">{card.box.text}</div>
        </div>
      )}
    </div>
  );
}
