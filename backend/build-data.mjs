import { readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync(new URL('../statistics-2025.js', import.meta.url), 'utf8');
const data = JSON.parse(source.slice(source.indexOf('= ') + 2).trim().replace(/;$/, ''));
if (data.ar !== 2025 || data.filter.rum !== '1 och 2') throw Error('Fel statistikfilter');
writeFileSync(new URL('./generated-data.mjs', import.meta.url), 'export default ' + JSON.stringify(data) + ';\n');
