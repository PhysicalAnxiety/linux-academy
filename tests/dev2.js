const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  const run = async (t) => {
    let out = '';
    await sh.run(t, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
    console.log('$ ' + t.split('\n')[0].slice(0, 150) + '\n' + LX.stripAnsi(out));
  };
  await run('sudo apt install -y build-essential >/dev/null; mkdir -p c; cd c');
  sh.writeFile(sh.cwd + '/hello.c', `#include <stdio.h>
int add(int a, int b) { return a + b; }
int main(int argc, char *argv[]) {
    int x = 4;
    printf("Hello, C!\\n");
    for (int i = 0; i < 3; i++) {
        printf("i=%d sum=%d\\n", i, add(i, x));
    }
    printf("args: %d first=%s\\n", argc, argv[1]);
    return 0;
}
`, false);
  sh.writeFile(sh.cwd + '/Makefile', 'CC=gcc\nall: hello2\nhello2: hello.c\n\t$(CC) -o hello2 hello.c\nclean:\n\trm -f hello2\n.PHONY: all clean\n', false);
  for (const t of [
    'gcc -Wall hello.c -o hello && ./hello a b',
    'cat > m.c <<EOF\n#include <stdio.h>\n#include <math.h>\nint main() { printf("%f\\n", sqrt(16.0)); return 0; }\nEOF\ngcc m.c -o m; gcc m.c -o m -lm && ./m',
    'make; make; touch hello.c; make; make clean; ./hello2',
    'make -f nope',
    'sudo dnf install -y tree 2>&1 | tail -14; rpm -q tree; rpm -qa | head -3; dnf list installed | head -4',
    'dnf install tree',
    'sudo dnf remove -y tree | tail -4; rpm -q tree',
    'sudo install -m 755 hello /usr/local/bin/hello-c && hello-c x y | tail -2; ls -l /usr/local/bin/hello-c',
    'snap list; sudo flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo; flatpak remotes; dpkg -L tree; dpkg -S /usr/bin/ls; sudo apt install -y tree >/dev/null; dpkg -L tree',
    'tar -cjf x.tar.bz2 hello.c && tar -tjf x.tar.bz2 && file x.tar.bz2',
  ]) await run(t);
})();
