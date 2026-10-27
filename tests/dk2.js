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
  await run('sudo apt install -y docker.io docker-compose-v2 > /dev/null; sudo usermod -aG docker learner');
  await run('docker run -it --name u1 ubuntu:24.04 bash');
  console.log('INSIDE PROMPT:', LX.stripAnsi(sh.prompt()));
  await run('cat /etc/os-release | head -1; apt update >/dev/null; apt install -y curl >/dev/null; echo "hello from container" > /root/f.txt; ls /root');
  await run('exit');
  console.log('BACK PROMPT:', LX.stripAnsi(sh.prompt()));
  await run('docker ps -a; docker start u1; docker exec u1 cat /root/f.txt; docker exec u1 which curl');
  // build
  sh.writeFile(sh.cwd + '/Dockerfile', 'FROM nginx:alpine\nCOPY index.html /usr/share/nginx/html/index.html\nEXPOSE 80\n', false);
  sh.writeFile(sh.cwd + '/index.html', '<h1>Built by me</h1>\n', false);
  await run('docker build -t mysite:1.0 .');
  await run('docker build -t mysite:1.0 .; docker images');
  await run('docker run -d -p 8081:80 --name site mysite:1.0; curl -s localhost:8081');
  sh.writeFile(sh.cwd + '/Dockerfile2', 'FROM ubuntu:24.04\nRUN apt-get update && apt-get install -y curl\nRUN false\n', false);
  await run('docker build -f Dockerfile2 -t bad .');
  // network + compose
  await run('docker network create appnet; docker run -d --name db --network appnet -e MYSQL_ROOT_PASSWORD=secret mysql; docker run -d --name cache --network appnet redis; docker exec cache getent hosts db 2>&1 | head -2; docker network ls');
  sh.writeFile(sh.cwd + '/compose.yaml', 'services:\n  web:\n    image: nginx\n    ports:\n      - "8082:80"\n    depends_on:\n      - cache\n  cache:\n    image: redis\n', false);
  await run('mkdir -p app && cd app');
  sh.writeFile(sh.cwd + '/compose.yaml', 'services:\n  web:\n    image: nginx\n    ports:\n      - "8082:80"\n    depends_on:\n      - cache\n  cache:\n    image: redis\n', false);
  await run('docker compose up -d; docker compose ps; curl -s -o /dev/null -w "%{http_code}\\n" localhost:8082; docker compose down');
})();
