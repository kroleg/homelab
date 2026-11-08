const fs = require('node:fs');
const pug = require('pug');
for (const file of fs.readdirSync('src/views')) {
  if (file.endsWith('.pug')) pug.compileFile(`src/views/${file}`);
}
