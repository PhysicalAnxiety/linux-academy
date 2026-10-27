(function () {
  const LX = globalThis.LX;
  const S = (en, hi, ids) => LX.skills.push({ en, hi, ids });
  S('Work confidently on the command line (files, text, pipes, help)', 'Command line par aatmavishwas se kaam (files, text, pipes, help)', ['intro', 'navigate', 'files', 'reading', 'help', 'search', 'pipes', 'vim']);
  S('Manage users, groups, permissions and sudo', 'Users, groups, permissions aur sudo sambhalna', ['permissions', 'users', 'sudo', 'perms-adv']);
  S('Control processes and services; read the logs', 'Processes aur services control karna; logs padhna', ['processes', 'systemd', 'logs']);
  S('Schedule and automate jobs (cron, timers, scripts)', 'Jobs schedule aur automate karna (cron, timers, scripts)', ['schedule', 'scripting', 'bash-adv']);
  S('Handle disks, file systems and LVM', 'Disks, file systems aur LVM sambhalna', ['disks', 'lvm']);
  S('Back up and restore data (tar, rsync, databases)', 'Data ka backup aur restore (tar, rsync, databases)', ['backup']);
  S('Understand networking and fix connectivity problems', 'Networking samajhna aur connectivity ki samasya theek karna', ['network', 'netbasics', 'netconfig']);
  S('Secure a server: firewall, SSH, hardening, SELinux/AppArmor', 'Server surakshit karna: firewall, SSH, hardening, SELinux/AppArmor', ['firewall', 'ssh', 'hardening', 'mac']);
  S('Install software and run web servers', 'Software install karna aur web servers chalana', ['packages', 'packages-adv', 'web']);
  S('Tune performance, recover a server that will not boot, troubleshoot', 'Performance tune karna, na boot hone wala server recover karna, troubleshoot', ['perf', 'boot', 'trouble']);
  S('Use Git for scripts, configs and teamwork', 'Scripts, configs aur teamwork ke liye Git', ['git']);
  S('Run applications in containers (Docker, Compose)', 'Applications ko containers mein chalana (Docker, Compose)', ['docker']);
  S('Automate servers with Ansible and Python', 'Ansible aur Python se servers automate karna', ['ansible', 'python']);
  S('Know the cloud: VMs, cloud-init, Terraform', 'Cloud samajhna: VMs, cloud-init, Terraform', ['cloud']);
  S('Work like a junior on the job: capstone, interviews, certifications', 'Junior ki tarah kaam: capstone, interviews, certifications', ['capstone']);
})();
