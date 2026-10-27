const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  const run = async (t) => {
    let out = '';
    await sh.run(t, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
    console.log('$ ' + t.split('\n')[0].slice(0, 150) + '\n' + LX.stripAnsi(out));
  };
  const lines = [];
  sh.hooks.readLine = async (p, o) => (o && o.secret ? 'pw' : lines.length ? lines.shift() : null);
  for (const t of [
    'docker ps',
    'sudo apt install -y docker.io docker-compose-v2 > /dev/null; docker ps',
    'sudo usermod -aG docker learner; docker run hello-world | head -4',
    'docker run -d --name web -p 8080:80 nginx; docker ps; curl -s localhost:8080 | head -4; docker logs web | tail -2',
    'docker run -d -p 8080:80 nginx; docker ps -a',
    'docker exec web cat /etc/os-release | head -2; docker exec web ls /usr/share/nginx/html',
    'echo "<h1>My Site</h1>" > index.html; docker run -d --name web2 -p 9090:80 -v $PWD:/usr/share/nginx/html nginx; curl -s localhost:9090',
    'docker stop web web2; docker ps; docker ps -a --format "{{.Names}} {{.Status}}"; docker rm web web2',
    'docker images; docker run --rm ubuntu:24.04 cat /etc/os-release | head -2',
    'docker run mysql',
  ]) await run(t);
  lines.push('cat /etc/os-release | head -1', 'apt update >/dev/null; apt install -y curl > /dev/null; echo installed', 'hostname', 'exit');
  await run('docker run -it --name u1 ubuntu bash; whoami; hostname');
  await run('docker ps -a | head -3');
  console.log('PROMPT:', sh.prompt && sh.prompt());
})();
