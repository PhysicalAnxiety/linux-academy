const LX = require('./load.js');
async function run(sh, line) {
  let out = '';
  await sh.run(line, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
  return LX.stripAnsi(out);
}
const PY = {
  basic: `
name = "Linux"
nums = [3, 1, 2]
nums.sort()
print(f"Hello {name}! {nums} {len(nums)}")
total = 0
for n in nums:
    total += n
print("total:", total, 10 / 4, 10 // 4, 2 ** 10, 7 % 3)
d = {"a": 1, "b": 2}
for k, v in d.items():
    print(k, v)
print(d, [x * x for x in range(5) if x % 2 == 0])
def fact(n):
    return 1 if n <= 1 else n * fact(n - 1)
print(fact(10), "%s has %d chars" % (name, len(name)), "{:>6.2f}|{:<5}|".format(3.14159, "ab"))
print(round(2.675, 2), sorted(["b", "a"], reverse=True), "a,b,c".split(","), " x ".strip())
`,
  err: `
def f(x):
    return 10 / x
def g():
    return f(0)
print("start")
g()
`,
  files: `
import os, sys
with open("out.txt", "w") as fh:
    fh.write("line1\\nline2\\n")
with open("out.txt") as fh:
    for line in fh:
        print(line.strip())
print(os.path.exists("out.txt"), sys.argv)
try:
    open("nope.txt")
except FileNotFoundError as e:
    print("caught:", e)
class Dog:
    def __init__(self, name):
        self.name = name
    def speak(self):
        return f"{self.name} says woof"
print(Dog("Rex").speak())
import subprocess
r = subprocess.run(["echo", "hi"], capture_output=True, text=True)
print(r.stdout.strip(), r.returncode)
import json
print(json.dumps({"a": [1, 2]}), json.loads('{"x": 5}')["x"])
`,
};
(async () => {
  const sh = new LX.Shell({ fast: true });
  const w = (n, c) => sh.writeFile(sh.cwd + '/' + n, c, false);
  w('basic.py', PY.basic);
  w('err.py', PY.err);
  w('files.py', PY.files);
  const tests = [
    'python3 basic.py',
    'python3 err.py; echo rc=$?',
    'python3 files.py a b',
    'python3 -c "import sys; print(sys.version_info[0], 1+2)"',
    'echo \'print("from stdin")\' | python3',
    'python3 -m venv v1',
    'sudo apt install -y python3-venv python3-pip >/dev/null; python3 -m venv v1 && ls v1 v1/bin; source v1/bin/activate; which python; pip install requests; pip list; python3 -c "import requests; print(requests.__name__)"; deactivate; python3 -c "import requests"',
    'pip install flask',
    'cd ~; printf "#!/usr/bin/env python3\\nprint(\\"shebang ok\\")\\n" > hello.py; chmod +x hello.py; ./hello.py',
  ];
  for (const t of tests) {
    console.log('$ ' + t.slice(0, 160));
    try { console.log(await run(sh, t)); } catch (e) { console.log('!! ' + e.stack); }
  }
})();
