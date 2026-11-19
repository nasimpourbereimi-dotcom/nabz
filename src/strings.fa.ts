// All UI copy lives here. Tone rules: CLAUDE.md §7 — calm, positive, actionable, never alarming.
import { faDigits, faNumber } from './lib/digits';

export const fa = {
  appName: 'نبض',
  tabs: { today: 'امروز', workouts: 'تمرین‌ها', trends: 'روندها', wrapped: 'Wrapped' },

  import: {
    step: 'قدم ۱ از ۲',
    title: 'بیا تاریخچه‌ت رو بیاریم',
    lead: 'یه بار کل داده‌های Health رو می‌خونیم. بعدش هر وقت خواستی، با یه دکمه داده‌های جدید اضافه میشه.',
    steps: [
      ['اپ Health ← عکس پروفایل ← ', 'Export All Health Data'],
      ['«Save to Files» رو بزن تا export.zip ذخیره بشه', ''],
      ['برگرد اینجا و فایل رو انتخاب کن', ''],
    ] as const,
    reading: 'در حال خواندن export.zip',
    phase: { scan: 'دنبال تمرین‌ها می‌گردیم…', parse: 'ضربان و خواب و قدم‌ها رو می‌خونیم…', save: 'داریم مرتبش می‌کنیم…' },
    statWorkouts: 'تمرین',
    statYears: 'سال تاریخچه',
    statHr: 'ثبت ضربان',
    privacy: 'همه‌چیز فقط روی همین گوشی می‌مونه. هیچ داده‌ای جایی فرستاده نمیشه.',
    pick: 'انتخاب فایل export.zip',
    skip: 'فعلاً رد شو',
    keepOpen: 'تا تموم نشده اپ رو باز نگه دار؛ صفحه خاموش نمیشه.',
    discoveriesTitle: 'تا اینجا پیدا کردیم',
    disc: {
      workouts: (n: number) => `${faNumber(n)} جلسه تمرین`,
      since: (year: string) => `اولین تمرینت: ${year}`,
      hours: (h: number) => `${faNumber(Math.round(h))} ساعت در حرکت`,
      longest: (m: number) => `طولانی‌ترین جلسه: ${faNumber(Math.round(m))} دقیقه`,
    },
    doneTitle: 'تاریخچه‌ت رسید',
    doneLead: (w: number, days: number) => `${faNumber(w)} تمرین و ${faNumber(days)} روز داده خونده شد. از این به بعد هر چی بیشتر بمونی، دقیق‌تر یادت می‌گیریم.`,
    go: 'بریم',
    errors: {
      'not-zip': 'این فایل zip نیست. همون export.zip که Health ساخته رو انتخاب کن.',
      'no-export-xml': 'توی این zip فایل export.xml پیدا نشد. مطمئنی خروجی Health ـه؟',
      'read-failed': 'خوندن فایل وسط کار قطع شد. یه بار دیگه امتحان کن؛ چیزی خراب نشده.',
      quota: 'فضای گوشی برای ذخیره کم اومد. کمی فضا خالی کن و دوباره امتحان کن.',
      unknown: 'یه جای کار گیر کرد. دوباره امتحان کن؛ داده‌های قبلی سالم‌ان.',
    } as Record<string, string>,
    retry: 'دوباره امتحان کن',
  },

  today: {
    title: 'امروز',
    learning: 'هنوز داریم یادت می‌گیریم',
    learningLead: 'داشبورد کامل (آمادگی، بار اخیر، فرم) توی قدم بعدی ساخته میشه. فعلاً اینا رو از تاریخچه‌ت داریم:',
    statWorkouts: 'تمرین',
    statDays: 'روز داده',
    statHr: 'ثبت ضربان',
    lastImport: (when: string) => `آخرین خواندن: ${when}`,
    noData: 'هنوز داده‌ای نیاوردی. هر وقت آماده بودی، از تنظیمات export.zip رو انتخاب کن.',
  },

  workouts: {
    title: 'تمرین‌ها',
    empty: 'هنوز تمرینی نیست. بعد از اولین import اینجا پر میشه.',
    minutes: (m: number) => `${faNumber(Math.round(m))} دقیقه`,
    kcal: (k: number) => `${faNumber(Math.round(k))} کیلوکالری`,
    bpm: (b: number) => `${faNumber(Math.round(b))} ضربان متوسط`,
    types: {
      strength: 'تمرین قدرتی', hiit: 'تمرین اینتروال', walk: 'پیاده‌روی', run: 'دویدن', cycle: 'دوچرخه',
      core: 'تمرین میان‌تنه', mobility: 'انعطاف و تحرک', other: 'تمرین',
    } as Record<string, string>,
  },

  soon: { title: 'به‌زودی', lead: 'این بخش توی قدم‌های بعدی ساخته میشه.' },

  settings: {
    title: 'داده‌ها',
    storage: 'ذخیره‌سازی',
    persisted: 'ماندگار — iOS این داده‌ها رو خودش پاک نمی‌کنه',
    notPersisted: 'موقت — بهتره اپ رو به Home Screen اضافه کنی و گاهی بک‌آپ بگیری',
    used: (mb: number) => `${faNumber(mb, 1)} مگابایت استفاده شده`,
    backup: 'گرفتن بک‌آپ',
    backupLead: 'یه فایل فشرده از همه‌ی داده‌ها؛ توی Files نگهش دار.',
    restore: 'بازگردانی از بک‌آپ',
    restoreConfirm: 'بازگردانی، داده‌های فعلی این گوشی رو با محتوای بک‌آپ جایگزین می‌کنه. ادامه بدیم؟',
    restoreDone: (n: number) => `${faNumber(n)} ردیف برگردونده شد.`,
    restoring: (n: number) => `در حال بازگردانی… ${faNumber(n)} ردیف`,
    reimport: 'خواندن export.zip تازه',
    reimportLead: 'داده‌های تکراری دوبار حساب نمیشن؛ فقط چیزهای جدید اضافه میشه.',
    backupErrors: {
      'not-backup': 'این فایل بک‌آپ نبض نیست.',
      'newer-version': 'این بک‌آپ با نسخه‌ی جدیدتر نبض ساخته شده. اول اپ رو به‌روز کن.',
      corrupt: 'بخشی از فایل بک‌آپ خراب بود. اگه نسخه‌ی دیگه‌ای داری، اون رو امتحان کن.',
    } as Record<string, string>,
    working: 'یه لحظه…',
    version: (v: string) => `نسخه ${faDigits(v)}`,
  },

  update: { ready: 'نسخه‌ی تازه‌ی نبض آماده‌ست', reload: 'به‌روزرسانی' },
  back: 'برگشت',
};
