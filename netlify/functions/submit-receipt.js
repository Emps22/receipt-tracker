const { google } = require('googleapis');
const { getStore } = require('@netlify/blobs');

// Reads the Google service account credentials from environment variables.
// Set these in Netlify: Site settings -> Environment variables
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY   (paste the full key; keep the \n escapes)
//   GOOGLE_SHEET_ID      (the spreadsheet that will log submissions)
// Photos are stored in Netlify Blobs, not Google Drive, since service
// accounts don't have their own Drive storage quota on non-Workspace accounts.
function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY env vars');
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { imageBase64, mimeType, amount, date, note, submitter } = JSON.parse(event.body || '{}');

    if (!imageBase64 || !mimeType) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing receipt image' }) };
    }

    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
      throw new Error('Missing GOOGLE_SHEET_ID env var');
    }

    // 1. Store the photo in Netlify Blobs.
    const buffer = Buffer.from(imageBase64, 'base64');
    const extension = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const imageId = `receipt-${Date.now()}.${extension}`;

    const store = getStore('receipts');
    await store.set(imageId, buffer, {
      metadata: { mimeType },
    });

    // 2. Build a public URL that serves the photo back through our own function.
    const siteUrl = process.env.URL || `https://${event.headers.host}`;
    const imageUrl = `${siteUrl}/.netlify/functions/get-receipt-image?id=${encodeURIComponent(imageId)}`;

    // 3. Append a row to the tracking sheet, with a live thumbnail via =IMAGE().
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const submittedAt = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          date || submittedAt.slice(0, 10),
          amount || '',
          note || '',
          submitter || '',
          `=IMAGE("${imageUrl}")`,
          imageUrl,
          submittedAt,
        ]],
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, imageUrl }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Something went wrong' }),
    };
  }
};
