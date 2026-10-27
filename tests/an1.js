const LX = require('./load.js');
(async () => {
  const sh = new LX.Shell({ fast: true });
  const run = async (t) => {
    let out = '';
    await sh.run(t, { stdout: (s) => (out += s), stderr: (s) => (out += s) });
    console.log('$ ' + t.split('\n')[0].slice(0, 150) + '\n' + LX.stripAnsi(out));
  };
  sh.hooks.readLine = async (p, o) => (o && o.secret ? 'pw' : /continue connecting/.test(p) ? 'yes' : null);
  await run('sudo apt install -y ansible >/dev/null; mkdir ans; cd ans');
  sh.writeFile(sh.cwd + '/inventory.ini', '[web]\ndemo-server\n\n[db]\ndb01\n\n[all:vars]\nansible_user=learner\n', false);
  sh.writeFile(sh.cwd + '/site.yml', `---
- name: Configure web servers
  hosts: web
  become: true
  vars:
    pkg: nginx
    greeting: Hello from Ansible
  tasks:
    - name: Install nginx
      apt:
        name: "{{ pkg }}"
        state: present
        update_cache: yes

    - name: Write index page
      copy:
        content: "<h1>{{ greeting }}</h1>\\n"
        dest: /var/www/html/index.html
        mode: "0644"
      notify: restart nginx

    - name: Show message
      debug:
        msg: "Installed {{ pkg }} on {{ inventory_hostname }}"

    - name: Ensure nginx is running
      service:
        name: nginx
        state: started
        enabled: yes

  handlers:
    - name: restart nginx
      service:
        name: nginx
        state: restarted
`, false);
  for (const t of [
    'ansible all -i inventory.ini -m ping',
    'ansible localhost -m ping',
    'ansible localhost -m shell -a "echo hi; whoami"',
    'ansible-inventory -i inventory.ini --graph',
    'ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 >/dev/null; ssh-copy-id learner@demo-server >/dev/null 2>&1; ansible web -i inventory.ini -m ping; ansible all -i inventory.ini -m ping',
    'ansible web -i inventory.ini -m command -a "hostname"',
    'ansible-playbook -i inventory.ini site.yml',
    'ansible-playbook -i inventory.ini site.yml',
    'ansible-playbook -i inventory.ini --check site.yml | tail -8',
    'ansible web -i inventory.ini -m apt -a "name=htop state=present"; ansible web -i inventory.ini -b -m apt -a "name=htop state=present"',
    'ansible-playbook --syntax-check -i inventory.ini site.yml',
  ]) await run(t);
})();
