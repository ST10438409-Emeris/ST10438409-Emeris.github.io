// netlify/functions/ocr.js
// Receives a base64 image, runs Tesseract.js OCR, returns extracted text.
// No GitHub token needed. No polling. Result comes back in one request.

const Tesseract = require('tesseract.js');

exports.handler = async (event) => {
  // CORS headers so the browser can call this
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { base64, mimeType } = JSON.parse(event.body);

    if (!base64 || !mimeType) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing base64 or mimeType' })
      };
    }

    // Convert base64 to a Buffer for Tesseract
    const imageBuffer = Buffer.from(base64, 'base64');

    // Run OCR
    const { data } = await Tesseract.recognize(imageBuffer, 'eng', {
      logger: () => {} // suppress progress logs
    });

    const text = data.text.trim();

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text || '[No text detected]' })
    };

  } catch (err) {
    console.error('OCR error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message })
    };
  }
};