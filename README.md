# Receipt Drop

A tiny mobile-friendly site: snap a photo of a receipt, fill in a few fields, and it
gets logged straight to a Google Sheet (with a live thumbnail) plus the full photo
saved in a Google Drive folder. No Netlify account access needed for your reviewer —
they just open the Sheet.

## How it works

```
phone camera -> index.html -> Netlify Function -> Google Drive (photo)
                                                 -> Google Sheet (row + thumbnail)
```

## 1. Create the Google Sheet

1. Make a new Google Sheet. Name the first tab `Sheet1` (default name is fine).
2. Add a header row (optional, just for you): `Date | Amount | Note | Submitter | Photo | Link | Submitted At`
3. Copy the Sheet ID out of the URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

## 2. Create the Google Drive folder

1. Make a new folder in Drive — this is where full-size receipt photos will land.
2. Copy its folder ID out of the URL the same way:
   `https://drive.google.com/drive/folders/`**`THIS_PART`**

## 3. Create a Google Cloud service account

This is the "robot user" that the Netlify Function will act as.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create (or pick) a project.
2. Enable two APIs: **Google Drive API** and **Google Sheets API** (search for each under "APIs & Services" → "Enable APIs").
3. Go to "APIs & Services" → "Credentials" → "Create Credentials" → "Service account."
4. Give it any name (e.g. `receipt-bot`). No special roles needed.
5. Once created, open the service account → "Keys" → "Add Key" → "Create new key" → JSON. This downloads a `.json` file — keep it safe, don't commit it anywhere.
6. Copy the service account's email address (looks like `receipt-bot@your-project.iam.gserviceaccount.com`).

## 4. Share your Sheet and Drive folder with the service account

- Open the Google Sheet → Share → paste the service account email → give it **Editor** access.
- Open the Drive folder → Share → paste the same email → **Editor** access.

Without this step, the function will get a permissions error.

## 5. Set environment variables in Netlify

In your Netlify site: **Site settings → Environment variables**, add:

| Key | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the service account email from step 3 |
| `GOOGLE_PRIVATE_KEY` | the `private_key` value from the downloaded JSON (keep the `\n` characters as-is, paste the whole string in quotes) |
| `GOOGLE_DRIVE_FOLDER_ID` | folder ID from step 2 |
| `GOOGLE_SHEET_ID` | sheet ID from step 1 |

## 6. Deploy

- Push this folder to a GitHub repo and connect it in Netlify, **or**
- Drag-and-drop the folder into Netlify's dashboard, **or**
- Use the Netlify CLI: `netlify deploy --prod`

Netlify will auto-detect `netlify.toml`, install the `googleapis` dependency, and
serve `public/index.html` with the function live at `/.netlify/functions/submit-receipt`.

## 7. Try it

Open the site on your phone, take a photo of a receipt, fill in the amount/date/note,
and submit. Check your Google Sheet — a new row should appear within a couple seconds,
with a thumbnail rendered via `=IMAGE()` in column E and a clickable full-size link in
column F.

## Notes & things to adjust later

- **Image visibility**: the function sets each uploaded photo to "anyone with the
  link can view" so the `=IMAGE()` formula and the reviewer's link both work without
  needing Drive access themselves. If that's too open for sensitive receipts, you can
  instead share the Drive folder with specific reviewer emails and give them `reader`
  permission on each file rather than "anyone with the link."
- **No login/gate**: right now anyone with the site URL can submit a receipt. If you
  want to restrict who can submit, easiest options are Netlify's built-in password
  protection (Pro plan) or a simple shared PIN field checked in the function.
- **Costs**: this uses a Netlify Function (small compute cost per submission, well
  within free-tier credits at normal volume) instead of Netlify Forms, so there's no
  100-submissions cap even on legacy accounts.
