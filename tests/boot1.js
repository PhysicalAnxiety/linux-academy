const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  const answers = [];
  sh.hooks = sh.hooks || {};
  sh.hooks.readLine = async (p) => { const a = answers.shift(); console.log('   [prompt] ' + p.slice(0, 90) + ' => ' + JSON.stringify(a)); return a === undefined ? '' : a; };
  const run = async (t, ans) => {
    if (ans) answers.push(...ans);
    let out = '';
    await sh.run(t, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
    console.log('[' + LX.stripAnsi(sh.prompt()).trim() + '] ' + t + '\n' + LX.stripAnsi(out));
  };
  for (const step of JSON.parse(process.argv[2])) await run(step[0], step[1]);
})();
