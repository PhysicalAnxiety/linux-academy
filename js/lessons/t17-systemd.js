(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  const BROKEN = [
    'printf "#!/bin/bash\\necho report generated\\nsleep 3600\\n" | sudo tee /usr/local/bin/report.sh > /dev/null',
    'sudo chmod +x /usr/local/bin/report.sh',
    'printf "[Unit]\\nDescription=Nightly report service\\n\\n[Service]\\nExecStart=/usr/local/bin/reportr.sh\\nRestart=on-failure\\n\\n[Install]\\nWantedBy=multi-user.target\\n" | sudo tee /etc/systemd/system/reporter.service > /dev/null',
    'sudo systemctl daemon-reload',
    'sudo systemctl start reporter',
  ];

  LX.topics.push({
    id: 'systemd',
    part: 2,
    no: 17,
    key: 'systemctl',
    mins: 45,
    title: T('Services with systemd', 'systemd ke saath Services'),
    blurb: T('The boss of every Linux machine. Start, stop and enable services, write your own unit file, read why a service failed and understand boot targets.', 'Har Linux machine ka boss. Services start, stop aur enable karo, apni unit file likho, padho ki service kyun fail hui aur boot targets samjho.'),
    blocks: [
      BIG(
        'When Linux boots, the first program that starts is **systemd** (process number 1). Its job is to start everything else in the right order, keep it running, restart it if it crashes, and shut it down cleanly. Every web server, database and SSH daemon on a modern server is a **service** managed by systemd. The command you use to talk to it is **systemctl**.',
        'Jab Linux boot hota hai to sabse pehle jo program chalta hai wo **systemd** hai (process number 1). Iska kaam hai baaki sab kuch sahi order mein start karna, chalte rakhna, crash ho to dobara chalana aur saaf tareeke se band karna. Modern server par har web server, database aur SSH daemon systemd ke sambhale hue **service** hain. Isse baat karne ki command **systemctl** hai.'
      ),
      STORY('Think of systemd as the manager of a restaurant kitchen. Each cook (a service) has a written job card (a unit file) saying what to cook, who must start first (dependencies) and what to do if the stove goes out (restart policy). The manager reads the cards at opening time and keeps every station running.', 'Systemd ko restaurant kitchen ka manager socho. Har cook (service) ke paas likhi hui job card (unit file) hai: kya banana hai, kaun pehle shuru karega (dependencies) aur chulha bujh jaye to kya karna hai (restart policy). Manager khulne ke waqt cards padhta hai aur har station chalta rakhta hai.'),
      JOB('Almost every troubleshooting story on a modern server starts with "is the service running, and if not, why?" The pair `systemctl status` and `journalctl -u` answers it in seconds. Learn them to the point of reflex.', 'Modern server par lagbhag har troubleshooting kahani "service chal rahi hai ya nahi, aur nahi to kyun?" se shuru hoti hai. `systemctl status` aur `journalctl -u` ki jodi seconds mein jawab deti hai. Inhe reflex banne tak seekho.'),
      H('Everyday verbs', 'Roz ke verbs'),
      TABLE(
        [
          ['systemctl status ssh', 'is it running? since when? last log lines, PID, memory', 'chal rahi hai? kab se? aakhri log lines, PID, memory'],
          ['sudo systemctl start ssh', 'start it NOW', 'abhi START karo'],
          ['sudo systemctl stop ssh', 'stop it now', 'abhi band karo'],
          ['sudo systemctl restart ssh', 'stop then start (brief downtime)', 'band phir start (thodi der downtime)'],
          ['sudo systemctl reload ssh', 'ask it to re-read its config WITHOUT dropping connections', 'config dobara padhne ko kaho, connections TOOTE BINA'],
          ['sudo systemctl enable ssh', 'start automatically at every boot', 'har boot par apne aap start'],
          ['sudo systemctl disable ssh', 'do not start at boot (does not stop it now)', 'boot par start mat karo (abhi band nahi karta)'],
          ['sudo systemctl enable --now ssh', 'enable AND start in one go (--now)', 'enable AUR start ek saath (--now)'],
          ['systemctl is-active ssh', 'prints active / inactive / failed. Great in scripts.', 'active / inactive / failed print karta hai. Scripts mein kamaal.'],
          ['systemctl is-enabled ssh', 'will it start at boot?', 'boot par start hogi?'],
          ['sudo systemctl mask cron', 'block it completely: nobody can start it, even by accident', 'poori tarah block: koi bhi, galti se bhi, start nahi kar sakta'],
        ],
        'Command',
        'Command'
      ),
      THINK('what is the difference between start and enable?', 'start aur enable mein kya fark hai?', 'start affects NOW. enable affects the NEXT BOOT. After installing a server you usually want both, which is what `enable --now` does. People forget enable and then the service is missing after a reboot.', 'start ABHI ke liye hai. enable AGLE BOOT ke liye. Server install karne ke baad aam taur par dono chahiye, aur `enable --now` yehi karta hai. Log enable bhool jate hain aur reboot ke baad service gayab.'),
      CMD(['systemctl status ssh', 'systemctl is-active ssh', 'systemctl is-enabled ssh'], 'Read the status screen like a doctor reads a chart: Loaded (is the unit file found and enabled?), Active (running, failed, inactive?), Main PID, and the last log lines.', 'Status screen ko doctor ke chart ki tarah padho: Loaded (unit file mili aur enabled?), Active (running, failed, inactive?), Main PID aur aakhri log lines.'),
      CMD(['sudo systemctl stop cron', 'systemctl is-active cron', 'sudo systemctl start cron', 'systemctl is-active cron'], 'Try the cycle on cron (cron does the scheduling jobs you will meet in a later lesson).', 'Cycle cron par try karo (cron wahi scheduling karta hai jo ek aage ke lesson mein milega).'),
      H('Finding things', 'Cheezein dhundna'),
      CMD(['systemctl list-units --type=service --state=running', 'systemctl list-unit-files --type=service', 'systemctl --failed'], 'What is running now, what exists on disk, and what is broken. `systemctl --failed` is the first thing to type on a sick server.', 'Abhi kya chal raha hai, disk par kya maujood hai, aur kya toota hua hai. Bimar server par `systemctl --failed` sabse pehle type karo.'),
      H('Anatomy of a unit file', 'Unit file ki banawat'),
      CMD('systemctl cat ssh', 'cat shows the unit file, including any local overrides.', 'cat unit file dikhata hai, local overrides ke saath.'),
      PRE(`[Unit]                              <- who am I and who do I depend on?
Description=Ticker demo
After=network.target                <- start me AFTER the network is ready

[Service]                           <- how do I run?
ExecStart=/usr/local/bin/ticker.sh  <- the command (always a FULL path)
Restart=on-failure                  <- restart me if I crash
User=learner                        <- run as this user, not root

[Install]                           <- what does "enable" do?
WantedBy=multi-user.target          <- start me in normal multi-user boots`),
      TABLE(
        [
          ['Type=simple', 'the default: the command in ExecStart IS the service and stays running', 'default: ExecStart wali command HI service hai aur chalti rehti hai'],
          ['Type=forking', 'old-style daemons that start, fork into the background and exit', 'purane daemons jo start hote hain, background mein fork karte hain aur exit'],
          ['Type=oneshot', 'runs once and finishes (backups, setup tasks). Often used with timers.', 'ek baar chalti hai aur khatam (backups, setup tasks). Aksar timers ke saath.'],
          ['Restart=on-failure / always', 'what to do when it dies. always = even after a clean exit.', 'marne par kya karna hai. always = saaf exit ke baad bhi.'],
          ['After= / Wants= / Requires=', 'ordering and dependencies: After only orders, Wants asks for another unit, Requires fails if it fails', 'ordering aur dependencies: After sirf order, Wants doosri unit maangta hai, Requires uske fail hone par fail'],
        ],
        'Setting',
        'Setting'
      ),
      TIP('Your own units go in **/etc/systemd/system/**. The files shipped by packages live in /usr/lib/systemd/system/ and get replaced on upgrades, so never edit those. To tweak a packaged service use `sudo systemctl edit name`, which creates a small override file for you.', 'Apni units **/etc/systemd/system/** mein jati hain. Packages ki files /usr/lib/systemd/system/ mein rehti hain aur upgrade par badal jati hain, isliye unhe kabhi edit mat karo. Packaged service ko tweak karne ke liye `sudo systemctl edit name` use karo, jo tumhare liye chhoti override file banata hai.'),
      H('Write your own service', 'Apni service likho'),
      P('Let us turn a small script into a real service that starts at boot and restarts if it crashes.', 'Chalo ek chhoti script ko asli service banate hain jo boot par start ho aur crash par restart ho.'),
      CMD(['printf "#!/bin/bash\\nwhile true; do echo tick; sleep 5; done\\n" | sudo tee /usr/local/bin/ticker.sh > /dev/null', 'sudo chmod +x /usr/local/bin/ticker.sh'], 'Step 1: the program. It must be executable.', 'Step 1: program. Ye executable honi chahiye.'),
      CMD(['printf "[Unit]\\nDescription=Ticker demo\\n\\n[Service]\\nExecStart=/usr/local/bin/ticker.sh\\nRestart=on-failure\\nUser=learner\\n\\n[Install]\\nWantedBy=multi-user.target\\n" | sudo tee /etc/systemd/system/ticker.service > /dev/null', 'sudo systemctl daemon-reload'], 'Step 2: the unit file. Step 3 is daemon-reload: it tells systemd to re-read its files. Forget it and systemd keeps using the old version.', 'Step 2: unit file. Step 3 daemon-reload hai: ye systemd ko files dobara padhne ko kehta hai. Bhool gaye to systemd purana version use karta rahega.'),
      CMD(['sudo systemctl enable --now ticker', 'systemctl status ticker', 'journalctl -u ticker -n 3 --no-pager'], 'Step 4: enable and start. The output of your script goes to the journal automatically, so no log file is needed.', 'Step 4: enable aur start. Tumhari script ka output apne aap journal mein jata hai, log file ki zaroorat nahi.'),
      CMD(['sudo systemctl stop ticker', 'sudo systemctl disable ticker'], 'Clean up when done.', 'Kaam ke baad saaf karo.'),
      H('Why did it fail? A detective method', 'Fail kyun hui? Detective ka tareeka'),
      STEPS([
        ['`systemctl status name`: read Active and the "Process:" line. The status code tells a lot.', '`systemctl status name`: Active aur "Process:" line padho. Status code bahut kuch batata hai.'],
        ['`journalctl -xeu name`: the full log of that unit, jumped to the end (-e), with explanations (-x).', '`journalctl -xeu name`: us unit ka poora log, end tak (-e), explanations (-x) ke saath.'],
        ['Fix the cause: the unit file, the script, a permission, a port that is taken.', 'Wajah theek karo: unit file, script, permission ya koi port jo pehle se le liya gaya.'],
        ['`sudo systemctl daemon-reload` if you changed the unit, then `start` again.', 'Unit badli ho to `sudo systemctl daemon-reload`, phir dobara `start`.'],
      ]),
      TABLE(
        [
          ['status=203/EXEC', 'systemd could not run the ExecStart program: wrong path, a typo, or the file is not executable', 'systemd ExecStart program chala nahi paya: galat path, typo, ya file executable nahi'],
          ['status=217/USER', 'the User= does not exist', 'User= maujood nahi hai'],
          ['status=200/CHDIR', 'WorkingDirectory= does not exist', 'WorkingDirectory= maujood nahi'],
          ['status=1/FAILURE', 'the program itself ran and exited with an error: look at its own log lines', 'program chala aur error ke saath exit hua: uski apni log lines dekho'],
          ['start-limit-hit', 'it crashed too many times in a short time, so systemd gave up (reset with systemctl reset-failed)', 'chhote time mein bahut baar crash hui, systemd ne haar maan li (systemctl reset-failed se reset)'],
        ],
        'You see',
        'Tumhe dikhta hai'
      ),
      CMD(['printf "#!/bin/bash\\necho report generated\\nsleep 3600\\n" | sudo tee /usr/local/bin/report.sh > /dev/null', 'sudo chmod +x /usr/local/bin/report.sh', 'printf "[Unit]\\nDescription=Nightly report service\\n\\n[Service]\\nExecStart=/usr/local/bin/reportr.sh\\nRestart=on-failure\\n\\n[Install]\\nWantedBy=multi-user.target\\n" | sudo tee /etc/systemd/system/reporter.service > /dev/null', 'sudo systemctl daemon-reload', 'sudo systemctl start reporter', 'systemctl status reporter | head -8'], 'A broken service on purpose: spot the typo reportr.sh. The status shows 203/EXEC. (You get a ready-made broken machine for this in the Practice tab.)', 'Jaanbujhkar kharab service: typo reportr.sh pakdo. Status mein 203/EXEC dikhta hai. (Practice tab mein iske liye ready-made kharab machine milti hai.)'),
      CMD(['journalctl -u reporter --no-pager | tail -n 4', 'sudo sed -i "s/reportr/report/" /etc/systemd/system/reporter.service', 'sudo systemctl daemon-reload', 'sudo systemctl restart reporter', 'systemctl is-active reporter'], 'Read the log, fix the path, reload and restart. This loop is the heart of the job.', 'Log padho, path theek karo, reload aur restart. Is loop mein hi naukri ka dil hai.'),
      H('Targets: the modern runlevels', 'Targets: aaj ke runlevels'),
      P('A **target** is a named group of services that together make the machine "ready" for something. Instead of numbers (old runlevels 0-6) systemd uses names.', 'Ek **target** services ka naam wala group hai jo milkar machine ko kisi kaam ke liye "ready" banata hai. Numbers (purane runlevels 0-6) ki jagah systemd naam use karta hai.'),
      TABLE(
        [
          ['multi-user.target', 'text-only, networking, all normal services. The usual server target.', 'sirf text, networking, saari normal services. Aam server target.'],
          ['graphical.target', 'multi-user plus a desktop. Ubuntu\'s default, even on servers.', 'multi-user plus desktop. Ubuntu ka default, servers par bhi.'],
          ['rescue.target', 'single-user maintenance mode: basic system, root shell, no network services', 'single-user maintenance mode: basic system, root shell, network services nahi'],
          ['emergency.target', 'even less: just a root shell with the root filesystem read-only', 'usse bhi kam: bas root shell, root filesystem read-only'],
          ['reboot.target / poweroff.target', 'what shutdown and reboot actually switch to', 'shutdown aur reboot asal mein inpar switch karte hain'],
        ],
        'Target',
        'Target'
      ),
      CMD(['systemctl get-default', 'sudo systemctl set-default multi-user.target', 'systemctl get-default', 'systemctl list-dependencies | head -n 8'], 'Choose what the machine boots into. list-dependencies draws what a target pulls in.', 'Chuno ki machine kis mein boot ho. list-dependencies dikhata hai ki target kya kya kheenchta hai.'),
      CMD('systemd-analyze blame | head -n 5', 'Which services slowed the boot? Handy when a server "takes forever to start".', 'Kin services ne boot dheema kiya? Jab server "start hone mein bahut time leta hai" tab kaam aata hai.'),
      JOB('Red Hat and Ubuntu use the same systemctl commands, only service names differ: sshd vs ssh, httpd vs apache2, firewalld vs ufw. That is why systemd skills transfer between companies.', 'Red Hat aur Ubuntu same systemctl commands use karte hain, bas service ke naam alag hain: sshd vs ssh, httpd vs apache2, firewalld vs ufw. Isi liye systemd ki skill companies ke beech kaam aati hai.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['systemctl status|start|stop|restart|reload X', 'control a service now', 'service abhi control karo'],
        ['systemctl enable|disable --now X', 'boot behaviour (and now)', 'boot ka behaviour (aur abhi)'],
        ['systemctl --failed', 'what is broken?', 'kya toota hai?'],
        ['journalctl -xeu X', 'why did it fail?', 'fail kyun hui?'],
        ['systemctl daemon-reload', 'after editing a unit file', 'unit file badalne ke baad'],
        ['systemctl cat X / edit X', 'view / override a unit', 'unit dekho / override karo'],
        ['systemctl get-default / set-default', 'default boot target', 'default boot target'],
        ['systemd-analyze blame', 'slow boot hunt', 'slow boot ki khoj'],
      ]),
    ],
    missions: [
      M('systemd-m1', 'Your first real service', 'Tumhari pehli asli service', 'Turn the script /usr/local/bin/hello-loop.sh into a service called hello-loop: create the script (executable), a unit file in /etc/systemd/system/, run daemon-reload, then enable it and start it with --now.', '/usr/local/bin/hello-loop.sh script ko hello-loop naam ki service banao: script banao (executable), /etc/systemd/system/ mein unit file, daemon-reload chalao, phir --now ke saath enable aur start karo.', 'Script with while true, chmod +x, unit file with ExecStart, systemctl daemon-reload, systemctl enable --now hello-loop', 'while true wali script, chmod +x, ExecStart wali unit file, systemctl daemon-reload, systemctl enable --now hello-loop', (sh) => { const s = sh.services['hello-loop']; return !!s && s.active === true && s.enabled === true; }, ['printf "#!/bin/bash\\nwhile true; do echo hi; sleep 5; done\\n" | sudo tee /usr/local/bin/hello-loop.sh > /dev/null', 'sudo chmod +x /usr/local/bin/hello-loop.sh', 'printf "[Unit]\\nDescription=Hello loop\\n\\n[Service]\\nExecStart=/usr/local/bin/hello-loop.sh\\nRestart=on-failure\\n\\n[Install]\\nWantedBy=multi-user.target\\n" | sudo tee /etc/systemd/system/hello-loop.service > /dev/null', 'sudo systemctl daemon-reload', 'sudo systemctl enable --now hello-loop']),
      M('systemd-m2', 'Fix the broken service', 'Kharab service theek karo', 'The service reporter will not start. Find out why and fix it so that it is active (running). (Press the lab button to get the broken machine.)', 'Service reporter start nahi hoti. Pata lagao kyun aur use theek karo taaki wo active (running) ho. (Kharab machine ke liye lab button dabao.)', 'systemctl status reporter and journalctl -u reporter will show the wrong file name. Fix the unit file, daemon-reload, restart.', 'systemctl status reporter aur journalctl -u reporter galat file naam dikhayenge. Unit file theek karo, daemon-reload, restart.', (sh) => !!sh.services.reporter && sh.services.reporter.active === true, BROKEN.concat(['sudo sed -i "s/reportr/report/" /etc/systemd/system/reporter.service', 'sudo systemctl daemon-reload', 'sudo systemctl restart reporter']), { lab: { setup: BROKEN, en: 'a server where the "reporter" service refuses to start.', hi: 'ek server jahan "reporter" service start hone se mana karti hai.' }, testSolve: BROKEN.concat(['sudo sed -i "s/reportr/report/" /etc/systemd/system/reporter.service', 'sudo systemctl daemon-reload', 'sudo systemctl restart reporter']) }),
      M('systemd-m3', 'Server boot mode', 'Server ka boot mode', 'Set the default boot target to multi-user.target (a server does not need a desktop).', 'Default boot target ko multi-user.target set karo (server ko desktop nahi chahiye).', 'sudo systemctl set-default multi-user.target', 'sudo systemctl set-default multi-user.target', (sh) => sh.defaultTarget === 'multi-user.target', ['sudo systemctl set-default multi-user.target']),
    ],
    quiz: [
      mcq(1, 'What is the first process that starts on a systemd Linux machine (PID 1)?', 'systemd wali Linux machine par sabse pehle kaunsa process chalta hai (PID 1)?', ['bash', 'systemd', 'ssh', 'cron'], 1, 'systemd is PID 1 and starts everything else.', 'systemd PID 1 hai aur baaki sab kuch start karta hai.'),
      cmd(2, 'Show the status of the ssh service.', 'ssh service ka status dikhao.', { verify: (sh, r) => /ssh\.service/.test(r.out) && /Active:/.test(r.out), sample: 'systemctl status ssh', alt: ['systemctl status ssh.service', 'sudo systemctl status ssh'], wrong: ['systemctl start ssh'], hintEn: 'systemctl, the verb, the service name.', hintHi: 'systemctl, verb, service ka naam.' }, 'status shows state, PID and recent logs.', 'status state, PID aur haal ke logs dikhata hai.'),
      mcq(3, 'You ran `systemctl enable nginx`. What does that do?', 'Tumne `systemctl enable nginx` chalaya. Iska kya asar hota hai?', ['Starts nginx right now', 'Makes nginx start automatically at boot', 'Installs nginx', 'Reloads its config'], 1, 'enable only changes what happens at the next boot. Use --now to also start it.', 'enable sirf agle boot ka behaviour badalta hai. Saath mein abhi start karna ho to --now.'),
      cmd(4, 'Stop the cron service and then make sure it does NOT start at the next boot, in one command line using &&.', 'cron service rokho aur dhyan rakho ki wo agle boot par start NA ho, ek hi command line mein && use karke.', { verify: (sh) => sh.services.cron && sh.services.cron.active === false && sh.services.cron.enabled === false, sample: 'sudo systemctl stop cron && sudo systemctl disable cron', alt: ['sudo systemctl disable --now cron'], wrong: ['sudo systemctl stop cron'], hintEn: 'Two actions: stop now, disable for boot (or disable --now).', hintHi: 'Do kaam: abhi stop, boot ke liye disable (ya disable --now).' }, 'stop affects now, disable affects boot. `disable --now` does both.', 'stop abhi ke liye, disable boot ke liye. `disable --now` dono karta hai.'),
      mcq(5, 'You edited a unit file in /etc/systemd/system/. What must you run before restarting the service?', 'Tumne /etc/systemd/system/ ki unit file badli. Service restart karne se pehle kya chalana zaroori hai?', ['systemctl daemon-reload', 'systemctl rebuild', 'reboot', 'nothing'], 0, 'daemon-reload makes systemd re-read unit files.', 'daemon-reload systemd ko unit files dobara padhwata hai.'),
      cmd(6, 'List only the services that have FAILED.', 'Sirf wo services list karo jo FAIL hui hain.', { verify: (sh, r, c) => /--failed|--state=failed/.test(c) && /loaded units listed|UNIT/.test(r.out), sample: 'systemctl --failed', alt: ['systemctl list-units --state=failed', 'systemctl list-units --failed'], wrong: ['systemctl list-units'], hintEn: 'There is a --failed flag.', hintHi: '--failed naam ka flag hai.' }, 'systemctl --failed is the first thing to run on a sick server.', 'Bimar server par sabse pehle systemctl --failed chalao.'),
      mcq(7, 'The status of a service shows `status=203/EXEC`. What is the most likely problem?', 'Service ke status mein `status=203/EXEC` dikhta hai. Sabse sambhavit problem kya hai?', ['Disk is full', 'systemd could not run the ExecStart program (wrong path or not executable)', 'The network is down', 'The password expired'], 1, '203/EXEC means the program in ExecStart could not be executed at all.', '203/EXEC ka matlab ExecStart wala program chalaya hi nahi ja saka.'),
      cmd(8, 'The service reporter is broken: its unit file points to reportr.sh instead of report.sh. Fix the file with sed, reload systemd and start the service, all in one line.', 'Service reporter kharab hai: uski unit file report.sh ki jagah reportr.sh ko point karti hai. sed se file theek karo, systemd reload karo aur service start karo, sab ek line mein.', { setup: BROKEN, verify: (sh) => sh.services.reporter && sh.services.reporter.active === true, sample: 'sudo sed -i "s/reportr/report/" /etc/systemd/system/reporter.service && sudo systemctl daemon-reload && sudo systemctl restart reporter', alt: ['sudo sed -i "s/reportr/report/" /etc/systemd/system/reporter.service && sudo systemctl daemon-reload && sudo systemctl start reporter'], wrong: ['sudo systemctl restart reporter'], hintEn: 'sed -i on the unit file, then daemon-reload, then start.', hintHi: 'Unit file par sed -i, phir daemon-reload, phir start.' }, 'The service could not find its program. Fix the path, reload, restart.', 'Service ko apna program nahi mila. Path theek karo, reload, restart.'),
      cmd(9, 'Show the exact unit file of the ssh service (including the Description line).', 'ssh service ki exact unit file dikhao (Description line ke saath).', { verify: (sh, r) => /Description=OpenBSD Secure Shell server/.test(r.out) && /\[Service\]/.test(r.out), sample: 'systemctl cat ssh', alt: ['systemctl cat ssh.service', 'cat /usr/lib/systemd/system/ssh.service'], wrong: ['systemctl status ssh'], hintEn: 'systemctl has a verb that prints the unit file.', hintHi: 'systemctl ka ek verb unit file print karta hai.' }, 'systemctl cat prints the unit file and any drop-in overrides.', 'systemctl cat unit file aur drop-in overrides print karta hai.'),
      cmd(10, 'Boss level: make the machine boot into multi-user.target by default and print the new default in the same line.', 'Boss level: machine ko default mein multi-user.target mein boot karao aur usi line mein naya default print karo.', { verify: (sh, r) => sh.defaultTarget === 'multi-user.target' && /multi-user\.target\s*$/.test(r.out.trim()), sample: 'sudo systemctl set-default multi-user.target && systemctl get-default', alt: ['sudo systemctl set-default multi-user.target; systemctl get-default'], wrong: ['systemctl get-default'], hintEn: 'set-default, then get-default.', hintHi: 'set-default, phir get-default.' }, 'set-default changes the symlink that decides the boot target; get-default prints it.', 'set-default wo symlink badalta hai jo boot target tay karta hai; get-default use print karta hai.'),
    ],
  });
})();
