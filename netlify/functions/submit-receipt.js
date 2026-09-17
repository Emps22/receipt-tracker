const { google } = require('googleapis');
const { getStore } = require('@netlify/blobs');

// Reads the Google service account credentials from environment variables.
// Set these in Netlify: Site settings -> Environment variables
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY   (paste the full key; keep the \n escapes)
//   GOOGLE_SHEET_ID      (the spreadsheet that will log submissions)
//   NETLIFY_SITE_ID      (your site's ID, from Site configuration -> General)
//   NETLIFY_API_TOKEN    (a personal access token, from User settings -> Applications)
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

function getReceiptStore() {
  return getStore({
    name: 'receipts',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
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

    //
