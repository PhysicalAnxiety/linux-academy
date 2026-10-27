const LX = require('./load.js');
(async () => {
  const t = LX.topics.find((x) => x.id === process.argv[2]);
  const m = t.missions.find((x) => x.id === process.argv[3]);
  const sh = new LX.Shell({ fast: true });
  if (m.testAnswers) { const qa = m.testAnswers.slice(); sh.hooks.readLine = async (p) => { const a = qa.length ? qa.shift() : ''; console.log('  [prompt]', p.slice(0, 60), '=>', a); return a; }; }
  let last;
  for (const c of m.testSolve || m.solve) { let out = ''; last = await sh.run(c, { stdout: (s) => (out += s), stderr: (s) => (out += s) }); console.log('$', c.slice(0, 90), '\n', LX.stripAnsi(out).split('\n').slice(0, 6).join('\n')); }
  console.log('check =', m.check(sh, last), 'recovery=', sh.recovery);
})();
