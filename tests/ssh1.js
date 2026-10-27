const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  sh.hooks.readLine = async (p, o) => (o && o.secret ? 'pw' : /continue connecting/.test(p) ? 'yes' : null);
  for (const t of process.argv.slice(2)) {
    let out = '';
    await sh.run(t, { stdout: (s) => { out += s; }, stderr: (s) => { out += s; } });
    console.log('$ ' + t.slice(0, 200) + '\n' + LX.stripAnsi(out));
  }
})();
