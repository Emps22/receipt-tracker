const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (!id) {
    return { statusCode: 400, body: 'Missing id' };
  }

  try {
    const store = getStore({
      name: 'receipts',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });
    const result = await store.getWithMetadata(id, { type: 'arrayBuffer' });

    if (!result) {
      return { statusCode: 404, body: 'Not found' };
    }

    const mimeType = (result.metadata && result.metadata.mimeType) || 'image/jpeg';
    const buffer = Buffer.from(result.data);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Something went wrong' };
  }
};
