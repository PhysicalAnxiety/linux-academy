const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  for (const t of process.argv.slice(2)) {
    let out = '';
    await sh.run(t, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
    console.log('$ ' + t + '\n' + LX.stripAnsi(out));
  }
})();
