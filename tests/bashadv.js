const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  const script = `#!/usr/bin/env bash
set -euo pipefail
LOG=/tmp/demo.log
TMP=$(mktemp -d)
cleanup() { rm -rf "$TMP"; echo "cleaned" >> "$LOG"; }
trap cleanup EXIT
trap 'echo "error on line $LINENO" >&2' ERR
usage() { cat <<EOF2
Usage: \${0##*/} [-v] [-n COUNT] FILE...
EOF2
}
VERBOSE=0; COUNT=3
while getopts ":vn:h" opt; do
  case $opt in
    v) VERBOSE=1 ;;
    n) COUNT=$OPTARG ;;
    h) usage; exit 0 ;;
    \\?) echo "bad option -$OPTARG" >&2; usage; exit 2 ;;
    :) echo "-$OPTARG needs a value" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
[[ $# -ge 1 ]] || { usage; exit 2; }
declare -A size
for f in "$@"; do
  [[ -r $f ]] || { echo "skip $f"; continue; }
  size[$f]=$(wc -c < "$f")
  (( VERBOSE )) && echo "$f: \${size[$f]} bytes"
done
for k in "\${!size[@]}"; do echo "$k \${size[$k]}"; done | sort -k2 -n -r | head -n "$COUNT"
`;
  sh.writeFile('/home/learner/top.sh', script, false);
  sh.fs.lookup('/home/learner/top.sh').mode = 0o755;
  const run = async (t) => { let out = ''; const r = await sh.run(t, { stdout: (s) => (out += s), stderr: (s) => (out += s) }); console.log('$ ' + t + '\n' + LX.stripAnsi(out)); };
  for (const t of ['./top.sh -v /etc/passwd /etc/hostname /etc/hosts nothere', './top.sh -n 1 /etc/passwd /etc/hostname', './top.sh', './top.sh -x /etc/hostname', './top.sh -n', './top.sh -h', 'cat /tmp/demo.log', 'bash -n top.sh && echo syntax-ok', 'bash -x top.sh /etc/hostname 2>&1 | head -5', 'shellcheck top.sh']) await run(t);
})();
