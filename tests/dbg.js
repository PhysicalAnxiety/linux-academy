const LX = require('./load.js');
console.log(JSON.stringify(LX.tokenize('echo {} \; x')));
console.log(JSON.stringify(LX.tokenize('echo a \; x')));
