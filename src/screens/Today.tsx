import { getDB } from '../db/schema';
import { fa } from '../strings.fa';
import { faNumber } from '../lib/digits';
import { faDayLabel, faDate } from '../lib/jalali';
import { useLive } from '../ui/useLive';
import { IconData } from '../ui/icons';

const S = fa.today;

export function TodayScreen({ onOpenData }: { onOpenData: () => void }) {
  const stats = useLive(async () => {
    const db = getDB();
    const [workouts, days, lastLog, lastExport] = await Promise.all([
      db.workouts.count(),
      db.dailyMetrics.count(),
      db.syncLog.orderBy('at').last(),
      db.syncLog.where('kind').equals('export').last(),
    ]);
    // HR count from the last full export (an export contains the whole history).
    return { workouts, days, hr: lastExport?.counts.hrRecords, lastLog };
  });

  return (
    <div class="screen fade-in">
      <header class="row" style="justify-content:space-between;align-items:flex-start">
        <div class="stack" style="gap:2px">
          <div class="muted" style="font-size:13px">{faDayLabel(Date.now())}</div>
          <h1 class="h1">{S.title}</h1>
        </div>
        <button class="icon-btn" aria-label={fa.settings.title} onClick={onOpenData}><IconData size={20} /></button>
      </header>

      {stats && stats.workouts + stats.days === 0 ? (
        <div class="card suggest" style="margin-top:18px;line-height:1.8;font-size:14px">{S.noData}</div>
      ) : (
        <>
          <div class="card" style="margin-top:18px">
            <div style="font-size:17px;font-weight:700;line-height:1.5">{S.learning}</div>
            <p class="lead" style="margin-top:6px">{S.learningLead}</p>
            <div class="stats" style="margin-top:14px">
              <Stat v={stats?.workouts} l={S.statWorkouts} />
              <Stat v={stats?.days} l={S.statDays} />
              <Stat v={stats?.hr} l={S.statHr} />
            </div>
          </div>
          {stats?.lastLog && (
            <div class="row muted small" style="margin-top:12px;padding:0 4px;gap:8px">
              <span style="width:7px;height:7px;border-radius:50%;background:var(--info);display:inline-block" />
              {S.lastImport(faDate(stats.lastLog.at))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ v, l }: { v?: number; l: string }) {
  return (
    <div class="stack" style="gap:2px">
      <div class="stat-value">{v === undefined ? '—' : faNumber(v)}</div>
      <div class="stat-label">{l}</div>
    </div>
  );
}
