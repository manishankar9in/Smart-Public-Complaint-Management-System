const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(path.join(__dirname,'src/pages/AdminDashboard.jsx'),'utf8').split(/\r?\n/);
const line = lines[1390];
console.log(JSON.stringify(line));
console.log('/<\\/div>/.test =>', /<\/div>/.test(line));
console.log('/<\\/div>/.exec =>', /<\/div>/.exec(line));
