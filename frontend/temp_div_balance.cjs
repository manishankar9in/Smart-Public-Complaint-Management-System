const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname,'src/pages/AdminDashboard.jsx'),'utf8');
const lines = src.split(/\r?\n/);
let balance = 0;
for (let i = 0; i < lines.length; i++) {
  const opens = (lines[i].match(/<div\b/g) || []).length;
  const closes = (lines[i].match(/<\/div>/g) || []).length;
  balance += opens - closes;
  if (balance === 1) {
    console.log('balance 1 at line', i+1, JSON.stringify(lines[i]));
  }
}
console.log('final balance', balance);
