const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  sh.installed.add('shellcheck'); sh.addBinary('shellcheck');
  sh.writeFile('/home/learner/bad.sh', 'cd /tmp\nname=bob\nunused=1\nfor f in $HOME/*.txt; do\n  cp $f /backup\ndone\nx=`date`\ncat a | grep b\nread line\nmyfn() {\n  local y=$(ls)\n  echo $name\n}\nrm -rf $dir/*\n', false);
  sh.writeFile('/home/learner/good.sh', '#!/bin/bash\nset -euo pipefail\nname="bob"\necho "$name"\ncd /tmp || exit 1\nread -r line\nfor f in "$HOME"/*.txt; do\n  cp "$f" /backup\ndone\n', false);
  const run = async (t) => { let out = ''; await sh.run(t, { stdout: (s) => (out += s), stderr: (s) => (out += s) }); console.log('$ ' + t + '\n' + LX.stripAnsi(out)); };
  for (const t of ['shellcheck bad.sh; echo rc=$?', 'shellcheck good.sh; echo rc=$?', 'shellcheck -f gcc bad.sh | head -4', 'shellcheck -S warning bad.sh | grep -c SC']) await run(t);
})();
