const LX = require('./load.js');
async function run(sh, line) {
  let out = '';
  await sh.run(line, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
  return LX.stripAnsi(out);
}
(async () => {
  const sh = new LX.Shell({ fast: true });
  const tests = [
    'cat <<EOF\nHello $USER\nsecond line\nEOF',
    "cat <<'EOF' > a.txt\nliteral $USER\nEOF\ncat a.txt",
    'cat <<-EOF\n\tindented\n\tEOF',
    'grep -c a <<< "banana"',
    'x=b; case $x in a) echo A;; b|c) echo BC;; *) echo other;; esac',
    'fruits=(apple banana cherry); echo ${fruits[1]} ${#fruits[@]}; for f in "${fruits[@]}"; do echo "- $f"; done',
    'fruits+=(mango); echo "${fruits[@]}"',
    'declare -A age; age[ravi]=12; age[meera]=11; echo ${age[ravi]}; for k in "${!age[@]}"; do echo $k=${age[$k]}; done',
    'n=5; if [[ $n -gt 3 && $n -lt 10 ]]; then echo mid; fi',
    's=hello.txt; [[ $s == *.txt ]] && echo txt; [[ $s =~ ^h(.)llo ]] && echo ${BASH_REMATCH[1]}',
    '(( i = 3 )); ((i++)); echo $i; echo $((i*2)); for ((j=0;j<3;j++)); do echo j$j; done',
    'f() { local x=1; echo "args: $# first: $1 all: $@"; for a in "$@"; do echo "[$a]"; done; }; f one "two words" three',
    'set -x; echo traced; set +x; echo quiet',
    "bash -c 'set -e; echo before; false; echo after'; echo status=$?",
    "bash -c 'set -u; echo $nothere' ; echo status=$?",
    "bash -c 'trap \"echo bye\" EXIT; echo hi'",
    'echo \'#!/bin/bash\nwhile getopts "ab:v" o; do case $o in a) echo flag a;; b) echo b=$OPTARG;; v) echo verbose;; esac; done\nshift $((OPTIND-1)); echo rest: $@\' > opt.sh; bash opt.sh -a -b hello -v x y',
    'declare -r K=1; K=2; echo $K',
    'printf -v v "%05d" 42; echo $v',
    'seq 3 | while read n; do echo "n=$n"; done',
    'i=0; while ((i<3)); do echo i=$i; ((i++)); done',
    'cat > s.sh <<EOF\n#!/bin/bash\nfor f in a b; do\n  echo "item $f"\ndone\nEOF\nbash s.sh',
  ];
  for (const t of tests) {
    console.log('$ ' + t.split('\n')[0]);
    try {
      console.log(await run(sh, t));
    } catch (e) {
      console.log('!! ' + e.stack);
    }
  }
})();
