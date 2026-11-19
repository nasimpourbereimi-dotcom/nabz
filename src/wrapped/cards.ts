// One data model for each story card, rendered both as DOM (screen) and on canvas (shareable image),
// so the shared picture always matches what the owner saw.
import { fa, faDuration } from '../strings.fa';
import { faNumber } from '../lib/digits';
import type { MonthStats } from '../analytics/wrapped';
import type { GoldenHour, RecordKind } from '../analytics/records';
import { RECORD_VALUE } from '../analytics/records';

export interface Stat { value: string; label: string; sub?: string }
export interface StoryCard {
  bg: string;
  title: string; // may contain "\n"
  lead?: string;
  hero?: Stat;
  stats: Stat[];
  box?: { title: string; value?: string; text: string };
}

const W = fa.wrapped;
export const CARD_COLORS = ['#FF7A1A', '#FF7A1A', '#4CC3FF', '#C6F432', '#B9A6FF'];
export const INK = '#140A03';

const recordValue = (k: RecordKind, v: number) =>
  k === 'longest' ? W.minutes(v / 60) : k === 'mostKcal' ? W.kcalValue(v) : k === 'bestRecovery' ? W.bpmDrop(v) : W.loadValue(v);

export function buildCards(opts: { month: string; prevMonth: string; s: MonthStats; golden?: GoldenHour }): StoryCard[] {
  const { month, prevMonth, s, golden } = opts;
  const hours = faDuration(s.totalMin);
  const cards: StoryCard[] = [];

  cards.push({
    bg: CARD_COLORS[0],
    title: W.title(month),
    lead: s.sessions ? W.coverLead(s.sessions, hours) : W.coverEmpty,
    stats: [],
  });
  if (!s.sessions) return cards;

  const more = s.sessions - s.prevSessions;
  cards.push({
    bg: CARD_COLORS[1],
    title: W.title(month),
    hero: { value: faNumber(s.sessions), label: W.sessions, sub: more > 0 ? W.moreThan(more, prevMonth) : undefined },
    stats: [
      { value: hours, label: W.hoursMoving },
      { value: faNumber(s.kcal), label: W.kcal },
    ],
    box: golden
      ? { title: W.golden, value: W.goldenValue(golden.from, golden.to), text: W.goldenText }
      : s.topType
        ? { title: W.topType, value: fa.workouts.types[s.topType] ?? fa.workouts.types.other, text: W.topTypeText }
        : undefined,
  });

  const kinds = (['longest', 'mostKcal', 'bestRecovery', 'highestLoad'] as RecordKind[]).filter((k) => s.best[k]);
  cards.push({
    bg: CARD_COLORS[2],
    title: W.recordsTitle,
    stats: kinds.slice(0, 3).map((k) => ({
      value: recordValue(k, RECORD_VALUE[k](s.best[k]!)!),
      label: W.record[k],
      sub: s.allTime.includes(k) ? W.allTime : undefined,
    })),
    box: s.allTime.length
      ? { title: W.newRecords(s.allTime.length), text: W.newRecordsText }
      : { title: W.monthBest, text: W.monthBestText },
  });

  cards.push({
    bg: CARD_COLORS[3],
    title: W.consistencyTitle,
    hero: { value: W.activeDays(s.activeDays, s.daysInMonth), label: W.activeDaysLabel },
    stats: [
      { value: W.days(s.bestStreak), label: W.bestStreak },
      { value: faNumber(s.perWeek, 1), label: W.perWeek },
    ],
    box: { title: W.consistencyBox, text: W.consistencyText(s.perWeek) },
  });

  const body: Stat[] = [];
  if (s.restingHR) {
    const d = s.restingHR.prev !== undefined ? s.restingHR.prev - s.restingHR.value : 0;
    body.push({ value: faNumber(s.restingHR.value), label: W.rhr, sub: d > 0 ? W.lowerThan(d) : undefined });
  }
  if (s.hrv) {
    const d = s.hrv.prev !== undefined ? s.hrv.value - s.hrv.prev : 0;
    body.push({ value: `${faNumber(s.hrv.value)} ms`, label: W.hrv, sub: d > 0 ? W.higherThan(d) : undefined });
  }
  if (s.sleepMin) body.push({ value: faDuration(s.sleepMin), label: W.sleep });
  if (body.length) {
    cards.push({
      bg: CARD_COLORS[4],
      title: W.bodyTitle,
      stats: body,
      box: {
        title: W.nextMonth,
        text: s.sleepMin !== undefined && s.sleepMin < 420 ? W.nextSleep : s.perWeek >= 3 || more > 0 ? W.nextGrow : W.nextStart,
      },
    });
  }
  return cards;
}
