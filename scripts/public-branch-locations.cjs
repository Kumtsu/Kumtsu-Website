const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Read the audited, version-controlled location list and its explicit corrections.
// Never copy customer, staffing, phone, document, or other internal data.
function publicLocations(html) {
  const match = html.match(/const branches=(\[.*?\]);/);
  if (!match) throw new Error('Cloud Kitchen branch list was not found');
  const initial = JSON.parse(match[1]);
  const corrections = html.split('\n').filter(line => /^(Object\.assign\(branches\.find\(|branches\.push\()/.test(line));
  const source = `const branches=${JSON.stringify(initial)};\n${corrections.join('\n')}\nJSON.stringify(branches.map(({code,name,address,lat,lng})=>({code,name,address,lat,lng})))`;
  const branches = JSON.parse(vm.runInNewContext(source, {}, { timeout: 1000 }));
  const seen = new Set();
  for (const branch of branches) {
    if (!/^BR\d{3}$/.test(branch.code) || seen.has(branch.code)) throw new Error('Invalid or duplicate branch code');
    if (!branch.name || !branch.address || !Number.isFinite(branch.lat) || !Number.isFinite(branch.lng) || Math.abs(branch.lat) > 90 || Math.abs(branch.lng) > 180) throw new Error(`Incomplete branch location: ${branch.code}`);
    seen.add(branch.code);
  }
  return branches.sort((a, b) => a.code.localeCompare(b.code));
}

if (require.main === module) {
  const html = fs.readFileSync(path.join(__dirname, '../internal/cloud-kitchen.html'), 'utf8');
  // Print only. Review and apply this snapshot through the normal code workflow.
  process.stdout.write(JSON.stringify(publicLocations(html), null, 2));
}
module.exports = { publicLocations };
