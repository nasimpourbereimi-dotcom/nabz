# راهنمای ساخت Shortcutهای نبض

این راهنما رو قدم‌به‌قدم با هم روی گوشی اجرا می‌کنیم.
نمی‌تونم یه Shortcut آماده برات بفرستم، چون iOS فقط Shortcutهایی رو باز می‌کنه که با حساب Apple امضا شده باشن؛ برای همین دستی می‌سازیمشون.

اسم اکشن‌ها انگلیسیه. توی Shortcuts، پایین صفحه‌ی ویرایش، اسم اکشن رو جست‌وجو کن.

## سه قاعده که همه‌جا رعایت میشن

1. **تاریخ‌ها:** هر جا گفتیم **Format Date**، این دو تنظیم رو بزن:
   **Date Format: ISO 8601** و **Include ISO 8601 Time: روشن**.
   بدون گزینه‌ی دوم فقط روز ثبت میشه و ساعت از دست میره.
2. **لیست‌ها توی Dictionary:** هر جا یه لیست (مثلاً همه‌ی ضربان‌ها) باید توی یه کلید بره،
   از اکشن **Set Dictionary Value** استفاده کن، نه از تایپ مستقیم توی اکشن Dictionary.
   این‌طوری لیست به‌صورت لیست می‌مونه. (اگه یه جا به‌صورت متن چندخطی هم رفت، نبض باز می‌خونه‌ش.)
3. **اسم متغیرها:** بعد از هر اکشنی که گفتیم «← متغیر: X»، یه **Set Variable** با همون اسم بذار.

---

## ۰. پوشه

اپ **Files** ← **iCloud Drive** ← پوشه‌ی **Shortcuts** ← یه پوشه‌ی جدید به اسم `nabz` بساز.
فایل‌های داخلش رو خود Shortcutها می‌سازن؛ لازم نیست چیزی توش بذاری.

---

## ۱. Automation «نبض-تمرین»

کارش: موقع **شروع** هر تمرین، زمان شروع رو یادداشت می‌کنه؛ موقع **پایان**، ضربان و کالری همون بازه رو
برمی‌داره و توی یه صف نگه می‌داره تا دفعه‌ی بعد که سینک کردی، به نبض برسه.

**Shortcuts ← Automation ← + ← Apple Watch Workout**
- نوع تمرین: **Any Workout**
- هر دو گزینه‌ی **Starts** و **Ends** تیک بخوره
- **Run Immediately** انتخاب بشه و **Notify When Run** خاموش باشه

### الف) خواندن وضعیت
1. **Get File** — مسیر: `Shortcuts/nabz/state.json` — **Error If Not Found: خاموش**
2. **Get Dictionary from Input** (ورودی: نتیجه‌ی مرحله‌ی ۱)
3. **Get Dictionary Value** — Key: `open` ← متغیر: `Open`
4. **Get Dictionary Value** — Key: `start` (از همون دیکشنری مرحله‌ی ۲) ← **Get Dates from Input** ← متغیر: `StartDate`
5. **Get Time Between Dates** — از `StartDate` تا **Current Date**، واحد: **Hours** ← متغیر: `Hours`

بار اول که هنوز فایلی نیست، این مقدارها خالی می‌مونن و Automation خودش میره سراغ «شروع». مشکلی نیست.

### ب) شروع یا پایان؟
6. **If** با دو شرط و حالت **All** (هر دو باید درست باشن):
   - `Open` **is** `1`
   - `Hours` **is less than** `4`

   یعنی: یه تمرین باز داریم که کمتر از ۴ ساعت ازش گذشته، پس این اجرا **پایان** همون تمرینه.
   (اگه تمرین بازی بیشتر از ۴ ساعته مونده، یعنی پایانش ثبت نشده؛ اون رو ول می‌کنیم و از نو شروع می‌کنیم.)

#### داخل If — پایان تمرین
1. **Find Health Samples** — Type: **Heart Rate**، شرط: **Start Date is after** `StartDate`، Sort by: **Start Date**، Order: **Oldest First**، **Limit: خاموش** ← متغیر: `HR`
2. **Get Details of Health Samples** — Detail: **Start Date** (ورودی: `HR`) ← **Format Date** (قاعده‌ی ۱) ← متغیر: `HRT`
3. **Get Details of Health Samples** — Detail: **Value** (ورودی: `HR`) ← متغیر: `HRV`

   این دو اکشن روی کل لیست یه‌جا کار می‌کنن؛ حلقه‌ی Repeat لازم نیست و برای همین سریعه.
4. **Find Health Samples** — Type: **Active Energy**، شرط: **Start Date is after** `StartDate` ← **Get Details of Health Samples: Value** ← **Calculate Statistics: Sum** ← متغیر: `Kcal`
5. **Format Date** روی `StartDate` ← متغیر: `S`
6. **Format Date** روی **Current Date** ← متغیر: `E`
7. یه **Dictionary** خالی ← متغیر: `HRDict`، بعد:
   **Set Dictionary Value** — Key: `t`، Value: `HRT` ← دوباره **Set Dictionary Value** — Key: `v`، Value: `HRV` ← متغیر: `HRDict`
8. یه **Dictionary** با کلیدهای `start` = `S`، `end` = `E`، `activeKcal` = `Kcal` (نوع: Number)،
   بعد **Set Dictionary Value** — Key: `hr`، Value: `HRDict` ← متغیر: `Workout`
9. **Get File** — `Shortcuts/nabz/queue.json` (**Error If Not Found: خاموش**) ← **Get Dictionary from Input** ← **Get Dictionary Value** Key: `items` ← متغیر: `Items`
10. **Add to Variable** — `Workout` به `Items`
11. یه **Dictionary** خالی ← **Set Dictionary Value** Key: `items`، Value: `Items` ← **Save File** به `Shortcuts/nabz/queue.json`، **Overwrite: روشن**
12. **Dictionary** با `open` = `0` ← **Save File** به `Shortcuts/nabz/state.json`، **Overwrite: روشن**

#### Otherwise — شروع تمرین
13. **Format Date** روی **Current Date**
14. **Dictionary** با `open` = `1` و `start` = نتیجه‌ی مرحله‌ی ۱۳ ← **Save File** به `Shortcuts/nabz/state.json`، **Overwrite: روشن**

> با هم چک می‌کنیم: Automation موقع شروع و پایان هر دو اجرا میشه یا نه؛ و «Get Details of Health Samples»
> روی چند هزار نمونه‌ی ضربان سریع جواب میده یا نه.

---

## ۲. Shortcut «نبض-سینک»

کارش: هر چی از آخرین سینک به بعد جمع شده رو یه‌جا کپی می‌کنه تا توی نبض Paste کنی.

اسمش دقیقاً باید **`نبض-سینک`** باشه (با خط تیره)؛ نبض با همین اسم صداش می‌زنه.
لازم نیست توی Share Sheet نشون داده بشه.

### الف) از کی؟
1. **If** — Shortcut Input **has any value**
   - داخل If: **Get Dates from Input** (ورودی: Shortcut Input) ← متغیر: `Since`
   - Otherwise: **Adjust Date** — Current Date، **Subtract 14 Days** ← متغیر: `Since`

   نبض موقع اجرای Shortcut تاریخ آخرین سینک رو بهش میده؛ حالت Otherwise فقط برای وقتیه که خودت دستی اجراش کنی.

### ب) جمع‌کردن داده‌ها
2. برای هر ردیف این جدول، یه **Find Health Samples** بذار با شرط **Start Date is after** `Since`، Sort: **Start Date**، **Limit: خاموش**.
   بعد برای هر ستونِ «جزئیات»، یه **Get Details of Health Samples** (تاریخ‌ها با Format Date، قاعده‌ی ۱)،
   و همه رو با **Set Dictionary Value** توی یه Dictionary مخصوص همون ردیف بذار.

| Type در Health | اسم Dictionary | جزئیات ← کلید |
|---|---|---|
| Heart Rate | `heartRate` | Start Date ← `t`، Value ← `v` |
| Resting Heart Rate | `restingHR` | Start Date ← `t`، Value ← `v` |
| Heart Rate Variability | `hrvSDNN` | Start Date ← `t`، Value ← `v` |
| Sleep | `sleep` | Start Date ← `start`، End Date ← `end`، Value ← `v`، Source ← `source` |
| Active Energy | `activeEnergy` | Start Date ← `start`، End Date ← `end`، Value ← `v`، Source ← `source` |
| Exercise Minutes | `exerciseMinutes` | Start Date ← `start`، End Date ← `end`، Value ← `v`، Source ← `source` |
| Steps | `steps` | Start Date ← `start`، End Date ← `end`، Value ← `v`، Source ← `source` |

3. یه **Dictionary** خالی ← متغیر: `Samples`؛ بعد هفت بار **Set Dictionary Value** روی `Samples`:
   Key اسم ردیف (`heartRate`، `restingHR`، …) و Value همون Dictionary ردیف.

### ج) تمرین‌های صف
4. **Get File** — `Shortcuts/nabz/queue.json` (**Error If Not Found: خاموش**) ← **Get Dictionary from Input** ← **Get Dictionary Value** Key: `items` ← متغیر: `Items`
5. **Repeat with Each** روی `Items`:
   - **Get Dictionary Value** Key: `end` (از Repeat Item) ← **Get Dates from Input**
   - **If** اون تاریخ **is after** `Since` ← **Add to Variable**: Repeat Item به `Recent`
6. یه **Dictionary** خالی ← **Set Dictionary Value** Key: `items`، Value: `Recent` ← متغیر: `Queue`
7. همین `Queue` رو با **Save File** روی `Shortcuts/nabz/queue.json` ذخیره کن (**Overwrite: روشن**).

   این‌طوری فقط تمرین‌هایی که قبلاً به نبض رسیدن از صف پاک میشن. اگه یه بار Paste رو فراموش کنی،
   چیزی گم نمیشه؛ دفعه‌ی بعد دوباره فرستاده میشن و نبض تکراری‌ها رو دوبار حساب نمی‌کنه.

### د) ساختن خروجی
8. یه **Dictionary** خالی ← متغیر: `Out`، و روی اون **Set Dictionary Value** برای این کلیدها:
   - `v` = `1` (نوع: Number)
   - `generatedAt` = **Current Date** با Format Date
   - `since` = `Since` با Format Date
   - `workouts` = `Queue`
   - `samples` = `Samples`
9. **Copy to Clipboard** — ورودی: `Out`
10. (اختیاری) **Show Notification** — «برگرد به نبض و Paste رو بزن»

### نمونه‌ی خروجی، برای مقایسه
```json
{
  "v": 1,
  "generatedAt": "2026-11-19T11:00:00+03:30",
  "since": "2026-11-18T22:30:00+03:30",
  "workouts": { "items": [ { "start": "…", "end": "…", "activeKcal": 312.4, "hr": { "t": ["…"], "v": [98] } } ] },
  "samples": {
    "heartRate": { "t": ["…"], "v": [72] },
    "steps": { "start": ["…"], "end": ["…"], "v": [230], "source": ["Apple Watch"] }
  }
}
```

---

## ۳. استفاده‌ی روزانه

1. توی نبض، بالای صفحه‌ی «امروز» دکمه‌ی **سینک** رو بزن.
2. Shortcuts باز میشه و «نبض-سینک» خودش اجرا میشه.
3. برگرد به نبض ← **چسباندن داده‌ها** ← توی پیام iOS، **Paste** رو تأیید کن.
4. اگه iOS اجازه‌ی Paste نداد: **دستی بچسبون** ← متن رو Paste کن ← **خواندن متن**.

اگه بیشتر از ۳ هفته از آخرین سینک گذشته باشه، داده‌ها برای کلیپ‌بورد زیادن؛ نبض پیشنهاد می‌کنه به‌جاش یه export.zip تازه از Health بدی.

## اولین تست واقعی

بعد از ساختن «نبض-سینک»، یه بار دستی اجراش کن و متن کلیپ‌بورد رو (مثلاً توی Notes) با نمونه‌ی بالا مقایسه کن.
اگه شکلش فرق داشت (فرمت تاریخ، ارقام، اسم کلیدها)، متن رو بفرست تا نبض رو باهاش تطبیق بدیم.
این متن داده‌ی سلامتیته؛ اگه نمی‌خوای همه‌ش رو بفرستی، چند خط اولش هم کافیه.

چیزهایی که توی همین تست باید ببینیم:
- «Value» برای خواب، اسم مرحله رو میده (مثل Core یا REM) یا یه عدد
- جزئیات «Source» روی گوشیت وجود داره و اسم دستگاه رو میده
- Format Date روی یه لیست، همه‌ی تاریخ‌ها رو تبدیل می‌کنه یا فقط اولی رو
