const express = require('express');
const path = require('path');

const app = express();
const PORT = 8081;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Handle specific HTML files
app.get('/settings.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'settings.html'));
});

app.get('/terminal-test.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'terminal-test.html'));
});

// Fallback to index.html for SPA routing (but only for root and non-html routes)
app.get('*', (req, res) => {
  // If requesting a specific HTML file that doesn't exist, return 404
  if (req.path.endsWith('.html') && req.path !== '/index.html') {
    res.status(404).send('Not found');
  } else {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`Static server running at http://localhost:${PORT}`);
});