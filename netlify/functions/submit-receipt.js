const { google } = require('googleapis');
const { Readable } = require('stream');

// Reads the service account credentials from environment variables.
// Set these in Netlify: Site settings -> Environment variables
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY        (paste the full key; keep the \n escapes)
//   GOOGLE_DRIVE_FOLDER_ID    (the Drive folder that will store photos)
//   GOOGLE_SHEET_ID           (the spreadsheet that will log submissions)
function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY env vars');
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });
}

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
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

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!folderId || !sheetId) {
      throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID or GOOGLE_SHEET_ID env vars');
    }

    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Upload the image to the shared Drive folder.
    const buffer = Buffer.from(imageBase64, 'base64');
    const fileName = `receipt-${Date.now()}.${(mimeType.split('/')[1] || 'jpg')}`;

    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: bufferToStream(buffer),
      },
      fields: 'id',
    });

    const fileId = uploadRes.data.id;

    // 2. Make the file viewable by anyone with the link, so =IMAGE() can render it
    //    and the reviewer can open it without needing Drive access themselves.
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;

    // 3. Append a row to the tracking sheet, with a live thumbnail via =IMAGE().
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
          viewUrl,
          submittedAt,
        ]],
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, viewUrl }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Something went wrong' }),
    };
  }
};
