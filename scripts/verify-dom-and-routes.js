import fs from 'fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');

const idMatches = Array.from(js.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)).map(m => m[1]);
const missing = [];

for (const id of idMatches) {
    if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
        if (!missing.includes(id)) missing.push(id);
    }
}

console.log('Total getElementById calls:', idMatches.length);
console.log('Missing DOM IDs:', missing);

['cat-toggle', 'cat-manager-body', 'cat-form', 'cat-name', 'cat-submit-btn', 'category-chips'].forEach(id => {
    const count = (html.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length;
    console.log(`ID ${id} occurrences:`, count);
});

