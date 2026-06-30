const fs = require('fs');
const parser = require('@babel/parser');
const path = require('path');
const file = path.join(__dirname, 'src/pages/AdminDashboard.jsx');
const src = fs.readFileSync(file, 'utf8');
try {
  parser.parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  console.log('ok');
} catch (e) {
  console.error('message:', e.message);
  console.error('loc:', e.loc);
}
