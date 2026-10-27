// usage: node tests/pyrun.js file.py [args...]   runs a local python file inside the simulated python3
const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  let o = '';
  sh.writeFile('/tmp/_t.py', require('fs').readFileSync(process.argv[2], 'utf8'), false);
  await sh.run('python3 /tmp/_t.py ' + process.argv.slice(3).join(' '), { stdout: (s) => (o += s), stderr: (s) => (o += s) });
  console.log(o);
})();
