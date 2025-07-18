const express = require('express');
const request = require('request');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();
const app = express();
app.use(cookieParser());
const bodyParser = require('body-parser');
app.use(bodyParser.json());
const http = require('http').createServer(app); // <-- FIXED: define http server
const io = require('socket.io')(http); // Use this http server for Socket.IO



const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const SCOPE = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/auth/google', (req, res) => {
  const url = [
    'https://accounts.google.com/o/oauth2/v2/auth',
    '?response_type=code',
    `&client_id=${CLIENT_ID}`,
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
    `&scope=${encodeURIComponent(SCOPE)}`,
    '&access_type=offline',
    '&prompt=consent'
  ].join('');
  res.redirect(url);
});

app.get('/auth/google/callback', (req, res) => {
  const code = req.query.code;
  request.post('https://oauth2.googleapis.com/token', {
    form: {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    },
    json: true
  }, (_, __, body) => {
    if (body.access_token) {
      res.cookie('access_token', body.access_token);
      res.redirect('/');
    } else {
      res.send('OAuth error: ' + JSON.stringify(body));
    }
  });
});

// List spreadsheets (using Google Drive API)
app.get('/spreadsheets', (req, res) => {
  const accessToken = req.cookies['access_token'];
  if (!accessToken) return res.status(401).send('Not authenticated!');
  request.get({
    url: 'https://www.googleapis.com/drive/v3/files',
    qs: {
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: 'files(id,name)',
      pageSize: 50,
    },
    headers: { 'Authorization': `Bearer ${accessToken}` },
    json: true
  }, (_, __, body) => {
    if (body && body.files) {
      res.json(body.files);
    } else {
      res.status(400).send(body && body.error ? body.error.message : 'Drive API error');
    }
  });
});

// List sheets (tabs) in a spreadsheet
app.get('/sheets', (req, res) => {
  const accessToken = req.cookies['access_token'];
  const spreadsheetId = req.query.id;
  if (!accessToken) return res.status(401).send('Not authenticated!');
  if (!spreadsheetId) return res.status(400).send('No spreadsheet ID');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  request.get(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  }, (_, __, body) => {
    try {
      const data = JSON.parse(body);
      if (data.error) return res.status(400).send(data.error.message || "Error from Sheets API");
      const sheets = (data.sheets || []).map(s => s.properties.title);
      res.json(sheets);
    } catch {
      res.status(500).send("API Error");
    }
  });
});

// Get column headers (first row)
app.get('/headers', (req, res) => {
  const accessToken = req.cookies['access_token'];
  const spreadsheetId = req.query.id;
  const sheetName = req.query.sheet;
  if (!accessToken) return res.status(401).send('Not authenticated!');
  if (!spreadsheetId || !sheetName) return res.status(400).send('No spreadsheet ID or sheet name');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
  request.get(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  }, (_, __, body) => {
    try {
      const data = JSON.parse(body);
      if (data.error) return res.status(400).send(data.error.message || "Error from Sheets API");
      res.json(data.values && data.values[0] ? data.values[0] : []);
    } catch {
      res.status(500).send("API Error");
    }
  });
});

// Get all data (rows) of a sheet
app.get('/sheetdata', (req, res) => {
  const accessToken = req.cookies['access_token'];
  const spreadsheetId = req.query.id;
  const sheetName = req.query.sheet;
  if (!accessToken) return res.status(401).send('Not authenticated!');
  if (!spreadsheetId || !sheetName) return res.status(400).send('No spreadsheet ID or sheet name');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;
  request.get(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  }, (_, __, body) => {
    try {
      const data = JSON.parse(body);
      if (data.error) return res.status(400).send(data.error.message || "Error from Sheets API");
      res.json(data.values || []);
    } catch {
      res.status(500).send("API Error");
    }
  });
});

// Old single-sheet name endpoint for auth check
app.get('/sheetname', (req, res) => {
  const accessToken = req.cookies['access_token'];
  const spreadsheetId = req.query.id;
  if (!accessToken) return res.status(401).send('Not authenticated!');
  if (!spreadsheetId) return res.status(400).send('No spreadsheet ID');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  request.get(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  }, (_, __, body) => {
    try {
      const data = JSON.parse(body);
      if (data.error) return res.status(400).send(data.error.message || "Error from Sheets API");
      res.json({ title: data.properties ? data.properties.title : '' });
    } catch {
      res.status(500).send("API Error");
    }
  });
});

// Update spreadsheet header (first row)
app.post('/updateheader', (req, res) => {
  const accessToken = req.cookies['access_token'];
  const spreadsheetId = req.body.id;
  const sheetName = req.body.sheet;
  const newHeaders = req.body.headers; // array

  if (!accessToken) return res.status(401).send('Not authenticated!');
  if (!spreadsheetId || !sheetName || !newHeaders)
    return res.status(400).send('Missing parameters');

  const range = `${sheetName}!1:1`;
  request.put({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    headers: { 'Authorization': `Bearer ${accessToken}` },
    json: { values: [newHeaders] }
  }, (_, __, body) => {
    if (body && !body.error) {
      res.json({ success: true });
    } else {
      res.status(400).send((body && body.error && body.error.message) || "API Error");
    }
  });
});

app.post('/webhook-test', (req, res) => {
  const editData = req.body;
  io.emit('webhookSuccess', editData);
  res.status(200).json({received: true});
});

// Command Prompt WebHook Trigger 
// curl -X POST http://localhost:3000/webhook-test -H "Content-Type: application/json" -d "{\"message\": \"hello\"}"

app.get('/logout', (_, res) => {
  res.clearCookie('access_token');
  res.redirect('/');
});

http.listen(3000, () => console.log('Listening at http://localhost:3000'));