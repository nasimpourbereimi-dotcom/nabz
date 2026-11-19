import { getDB } from '../db/schema';
import { fa } from '../strings.fa';
import { faDate } from '../lib/jalali';
import { useLive } from '../ui/useLive';

const S = fa.workouts;

export function WorkoutsScreen() {
  const list = useLive(() => getDB().workouts.orderBy('start').reverse().limit(60).toArray());

  return (
    <div class="screen fade-in">
      <h1 class="h1">{S.title}</h1>
      {list && list.length === 0 && <p class="lead">{S.empty}</p>}
      <div class="stack" style="margin-top:18px">
        {list?.map((w) => (
          <div class="list-item" key={w.id}>
            <div class="stack" style="gap:2px">
              <div style="font-weight:700">{S.types[w.type] ?? S.types.other}</div>
              <div class="muted small">{faDate(w.start)}</div>
            </div>
            <div class="stack small" style="gap:2px;text-align:left">
              <span>{S.minutes(w.durationSec / 60)}</span>
              {w.energyKcal !== undefined && <span class="muted">{S.kcal(w.energyKcal)}</span>}
              {w.hrAvg !== undefined && <span class="muted">{S.bpm(w.hrAvg)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
