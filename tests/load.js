const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
globalThis.window = globalThis;
const files = ['sim-fs', 'sim-core', 'sim-help', 'cmds-files', 'cmds-text', 'cmds-sys', 'cmds-shell2', 'ext-sys1', 'ext-storage', 'ext-systemd', 'ext-net', 'ext-web', 'ext-sec', 'ext-git', 'ext-py', 'ext-pylib', 'ext-dev', 'ext-docker', 'ext-ansible', 'ext-misc', 'ext-time', 'ext-pkg', 'ext-hard', 'ext-lsm', 'ext-perf', 'ext-boot', 'ext-backup', 'ext-db', 'ext-shell', 'ext-git2', 'ext-cloud', 'ext-terraform', 'content-api'];
for (const f of files) (0, eval)(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'));
const dir = path.join(root, 'js', 'lessons');
if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.js')) (0, eval)(fs.readFileSync(path.join(dir, f), 'utf8'));
module.exports = globalThis.LX;
