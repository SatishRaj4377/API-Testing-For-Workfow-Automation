const express = require('express');
const request = require('request');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cookieParser());

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const SCOPE = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
].join(" ");

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

// Get sheet title by ID
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
app.get('/logout', (_, res) => {
  res.clearCookie('access_token');
  res.redirect('/');
});
app.listen(3000, () => console.log('Listening at http://localhost:3000'));