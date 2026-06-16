import http from 'http';

const data = JSON.stringify({
  imageData: 'data:image/jpeg;base64,' + 'A'.repeat(6000),
  rawMetrics: {
    brightness: 120,
    sharpness: 35,
    megapixels: 1.2
  }
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/gemini/quality-check',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(res.statusCode, body));
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
