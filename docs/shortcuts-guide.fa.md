# راهنمای ساخت Shortcutهای نبض

این راهنما رو قدم‌به‌قدم با هم روی گوشی اجرا می‌کنیم. iOS فقط Shortcutهای امضاشده رو import می‌کنه، برای همین باید دستی ساخته بشن.
اسم اکشن‌ها انگلیسیه؛ توی Shortcuts با جست‌وجوی همین اسم پیداشون کن.

> نکته‌ی کلی: اپ نبض ورودی رو با تحمل زیاد می‌خونه (ارقام فارسی، تاریخ جلالی، فرمت‌های مختلف تاریخ).
> ولی هر جا گفتیم **Format Date → ISO 8601**، همون رو بزن؛ مطمئن‌ترین حالته.

---

## ۰. پوشه و فایل‌ها

1. اپ **Files** ← iCloud Drive ← پوشه‌ی **Shortcuts** ← یه پوشه‌ی جدید به اسم `nabz` بساز.
2. فایل‌ها رو خود Shortcutها می‌سازن؛ لازم نیست دستی چیزی بذاری.

---

## ۱. Automation «نبض-تمرین»

**Shortcuts ← Automation ← + ← Apple Watch Workout ← When any workout is: Started و Ended** (هر دو تیک)
← **Run Immediately** و **Notify When Run خاموش**.

### الف) خواندن وضعیت
1. **Get File** — Folder: `Shortcuts`، Path: `nabz/state.json`، **Error If Not Found: خاموش**.
2. **Get Dictionary from Input** (ورودی: فایل مرحله‌ی ۱).
3. **Get Dictionary Value** — Key: `open` ← اسم متغیر: `Open`.
4. **Get Dictionary Value** — Key: `start` (از همون دیکشنری) ← **Get Dates from Input** ← اسم متغیر: `StartDate`.
5. **Get Time Between Dates** — از `StartDate` تا **Current Date**، به **Hours** ← اسم متغیر: `Hours`.

### ب) تصمیم: شروع یا پایان؟
6. **If** `Open` **is** `1` (یا `true`) — و داخلش یه **If** دیگه: `Hours` **is less than** `4`:

   **← این یعنی پایان تمرین (END):**
   1. **Find Health Samples** — Type: **Heart Rate**، Start Date **is after** `StartDate`، Sort by **Start Date**، Order **Oldest First**، Limit خاموش ← متغیر: `HR`.
   2. **Get Details of Health Samples** — Detail: **Start Date** (ورودی `HR`) ← **Format Date** ← ISO 8601 ← متغیر: `HRT`.
   3. **Get Details of Health Samples** — Detail: **Value** (ورودی `HR`) ← متغیر: `HRV`.
      (این دو اکشن روی کل لیست یه‌جا کار می‌کنن؛ حلقه‌ی Repeat لازم نیست و سریعه.)
   4. **Find Health Samples** — Type: **Active Energy**، Start Date **is after** `StartDate` ← **Get Details: Value** ← **Calculate Statistics: Sum** ← متغیر: `Kcal`.
   5. **Format Date** — `StartDate` ← ISO 8601 ← متغیر: `S`. **Format Date** — **Current Date** ← ISO 8601 ← متغیر: `E`.
   6. **Dictionary** با کلیدهای: `start` = `S`، `end` = `E`، `activeKcal` = `Kcal` (Number)،
      `hr` = یه Dictionary دیگه با `t` = `HRT` و `v` = `HRV` ← متغیر: `Workout`.
   7. **Get File** `nabz/queue.json` (Error If Not Found خاموش) ← **Get Dictionary from Input** ← **Get Dictionary Value** Key: `items` ← متغیر: `Items`.
   8. **Add to Variable** — `Workout` به `Items`.
   9. **Dictionary** — `items` = `Items` ← **Save File** به `nabz/queue.json` با **Overwrite روشن**.
   10. **Dictionary** — `open` = `0` ← **Save File** `nabz/state.json` (Overwrite روشن).

   **Otherwise (از If داخلی: جلسه‌ی باز بیشتر از ۴ ساعته = پایانش ثبت نشده) و Otherwise (از If بیرونی: جلسه‌ی بازی نیست):**
   11. **Format Date** — **Current Date** ← ISO 8601.
   12. **Dictionary** — `open` = `1`، `start` = تاریخ مرحله‌ی ۱۱ ← **Save File** `nabz/state.json` (Overwrite روشن).

> چیزی که باید با هم چک کنیم: اینکه Automation موقع **شروع** و **پایان** هر دو اجرا میشه، و اینکه
> «Get Details of Health Samples» روی یه لیست چند هزارتایی سریع جواب میده.

---

## ۲. Shortcut «نبض-سینک»

اسمش دقیقاً باید **`نبض-سینک`** باشه؛ اپ با همین اسم صداش می‌زنه.
در تنظیمات Shortcut: **Receive: Text** (از Share Sheet لازم نیست).

1. **Get Dates from Input** — ورودی: **Shortcut Input** ← متغیر: `Since`.
   (اگه ورودی خالی بود: **If** Shortcut Input **does not have any value** ← **Adjust Date** Current Date منهای ۱۴ روز ← `Since`.)
2. برای هر کدوم از این‌ها یه **Find Health Samples** با شرط **Start Date is after `Since`**، Sort: Start Date، Limit خاموش:

| Type | کلید در خروجی | جزئیاتی که می‌خوایم |
|---|---|---|
| Heart Rate | `heartRate` | Start Date ← `t`، Value ← `v` |
| Resting Heart Rate | `restingHR` | Start Date ← `t`، Value ← `v` |
| Heart Rate Variability | `hrvSDNN` | Start Date ← `t`، Value ← `v` |
| Sleep | `sleep` | Start Date ← `start`، End Date ← `end`، Value ← `v`، Source ← `source` |
| Active Energy | `activeEnergy` | Start Date ← `start`، End Date ← `end`، Value ← `v`، Source ← `source` |
| Exercise Minutes | `exerciseMinutes` | Start Date ← `start`، End Date ← `end`، Value ← `v`، Source ← `source` |
| Steps | `steps` | Start Date ← `start`، End Date ← `end`، Value ← `v`، Source ← `source` |

   برای هر ردیف: **Get Details of Health Samples** برای هر جزئیات (تاریخ‌ها با **Format Date ← ISO 8601**)،
   بعد یه **Dictionary** که هر کلید (`t`، `v`، `start` و …) به لیست همون جزئیات اشاره کنه.

3. **Get File** `nabz/queue.json` (Error If Not Found خاموش) ← **Get Dictionary from Input** ← متغیر: `Queue`.
4. **Dictionary** نهایی:
   - `v` = `1` (Number)
   - `generatedAt` = Current Date (ISO 8601)
   - `since` = `Since` (ISO 8601)
   - `workouts` = `Queue`
   - `samples` = یه Dictionary با کلیدهای جدول بالا
5. **Copy to Clipboard** (ورودی: Dictionary نهایی).
6. **Dictionary** — `items` = یه لیست خالی ← **Save File** `nabz/queue.json` (Overwrite روشن). *(صف خالی میشه)*
7. (اختیاری) **Show Notification** — «برگرد به نبض و Paste رو بزن».

### نمونه‌ی خروجی (برای مقایسه)
```json
{
  "v": 1,
  "generatedAt": "2026-11-19T07:30:00Z",
  "since": "2026-11-18T19:00:00Z",
  "workouts": { "items": [ { "start": "…", "end": "…", "activeKcal": 312.4, "hr": { "t": ["…"], "v": [98] } } ] },
  "samples": {
    "heartRate": { "t": ["…"], "v": [72] },
    "steps": { "start": ["…"], "end": ["…"], "v": [230], "source": ["Apple Watch"] }
  }
}
```

---

## ۳. استفاده

1. توی اپ نبض، بالای صفحه‌ی «امروز» روی **سینک** بزن.
2. Shortcuts باز میشه و «نبض-سینک» اجرا میشه.
3. برگرد به نبض ← **چسباندن داده‌ها** ← توی پیام iOS، **Paste** رو بزن.
4. اگه iOS اجازه‌ی Paste نداد: **دستی بچسبون** ← متن رو Paste کن ← **خواندن متن**.

اگه بیشتر از ۳ هفته از آخرین سینک گذشته باشه، اپ پیشنهاد می‌کنه به‌جاش یه export.zip تازه بدی.

## اولین تست واقعی
بعد از ساختن «نبض-سینک»، یه بار اجراش کن و خروجی کلیپ‌بورد رو (مثلاً توی Notes) نگاه کن. اگه شکلش با
نمونه فرق داشت (فرمت تاریخ، ارقام، کلیدها)، همون متن رو بفرست تا پارسر رو باهاش تطبیق بدیم.
