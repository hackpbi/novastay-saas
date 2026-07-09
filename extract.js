const fs = require('fs');
const path = require('path');
const dirs = ['src/views', 'src/components/dashboard'];
const results = [];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).filter(f => f.endsWith('.tsx')).forEach(file => {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/>([A-Za-z][A-Za-z0-9 \/.,()\-:%&+]{2,})</);
      if (m) {
        const text = m[1].trim();
        results.push({ file, line: i+1, text });
      }
    });
  });
});

const csv = ['file,line,text,korean'];
results.forEach(r => {
  const t = r.text.replace(/"/g, '""');
  csv.push(r.file + ',' + r.line + ',"' + t + '",""');
});

fs.writeFileSync('english_texts.csv', csv.join('\n'), 'utf8');
console.log('완료! 총 ' + results.length + '개');
