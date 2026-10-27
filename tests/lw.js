const LX = require('./load.js');
const fs = require('fs');
(async () => {
  const sh = new LX.Shell({ fast: true });
  const script = fs.readFileSync(process.argv[2], 'utf8');
  sh.writeFile('/home/learner/logwatch.sh', script, false);
  sh.fs.lookup('/home/learner/logwatch.sh').mode = 0o755;
  const run = async (t) => { let out = ''; await sh.run(t, { stdout: (s) => (out += s), stderr: (s) => (out += s) }); console.log('$ ' + t + '\n' + LX.stripAnsi(out)); };
  for (const t of process.argv.slice(3)) await run(t);
})();
