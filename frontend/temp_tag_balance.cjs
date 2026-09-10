const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname,'src/pages/AdminDashboard.jsx'),'utf8');
const lines = src.split(/\r?\n/);
const openRegex = /<([A-Za-z][A-Za-z0-9]*)\b[^>]*?(?<!\/)>/g;
const closeRegex = /<\/([A-Za-z][A-Za-z0-9]*)\b[^>]*?>/g;
const selfCloseRegex = /<([A-Za-z][A-Za-z0-9]*)\b[^>]*?\/\s*>/g;
const stack=[];
for(let i=0;i<lines.length;i++){
  let line=lines[i];
  let m;
  while((m=selfCloseRegex.exec(line))){ /* ignore */ }
  while((m=openRegex.exec(line))){
    const tag=m[1];
    if(tag==='>') continue;
    if(tag==='!') continue;
    stack.push({tag,line:i+1,text:m[0]});
  }
  while((m=closeRegex.exec(line))){
    const tag=m[1];
    let last = stack.length?stack[stack.length-1]:null;
    if(last && last.tag===tag){ stack.pop(); }
    else { stack.push({tag:'/'+tag,line:i+1,text:m[0]}); }
  }
}
console.log('leftover', stack.length);
console.log(stack.slice(-20));
