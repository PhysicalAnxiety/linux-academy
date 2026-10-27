(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'processes',
    no: 9,
    key: 'ps',
    mins: 25,
    title: T('Processes and Jobs', 'Processes aur Jobs'),
    blurb: T('Every running program is a process. See them, park them in the background and stop the ones that misbehave.', 'Har chalta hua program ek process hai. Unhe dekho, background mein rakho aur jo galat karein unhe roko.'),
    blocks: [
      BIG(
        'A **program** is a recipe sitting in a book. A **process** is the recipe being cooked right now. Linux can cook hundreds at once, and gives each one a number called its **PID** (process ID).',
        '**Program** ek recipe hai jo kitab mein rakhi hai. **Process** wo recipe hai jo abhi pak rahi hai. Linux sainkdon ko ek saath pakata hai, aur har ek ko ek number deta hai jise **PID** (process ID) kehte hain.'
      ),
      STORY('A kitchen has many cooks working at once. The head chef (the kernel) gives every cook a badge number. If one cook burns the rice and refuses to stop, you tell the head chef the badge number and the cook is sent out. That is exactly what kill does.', 'Ek kitchen mein kai cooks ek saath kaam karte hain. Head chef (kernel) har cook ko ek badge number deta hai. Agar ek cook chawal jala de aur rukna na chahe, to tum head chef ko badge number batate ho aur cook ko bahar bhej diya jata hai. Bilkul yahi kill karta hai.'),
      H('See the processes: ps', 'Processes dekho: ps'),
      CMD('ps', 'Only the processes of your own terminal: your shell (bash) and the ps command itself.', 'Sirf tumhare apne terminal ke processes: tumhara shell (bash) aur ps command khud.'),
      CMD('ps aux', 'Every process of every user. The columns: who owns it, its PID, CPU and memory use, and the command.', 'Har user ka har process. Columns: owner kaun, PID, CPU aur memory use, aur command.'),
      ANAT([
        ['ps', 'cmd', 'process status', 'process status'],
        ['aux', 'opt', 'a = all users, u = user-friendly format, x = include ones without a terminal', 'a = saare users, u = aasan format, x = bina terminal wale bhi'],
      ]),
      CMD('top', 'A live table of the busiest processes. In a real terminal it refreshes every few seconds and q quits. Here you get one snapshot.', 'Sabse vyast processes ki live table. Asli terminal mein ye har kuch second mein refresh hoti hai aur q se band hoti hai. Yahan ek snapshot milta hai.'),
      CMD('pgrep sshd', 'Look up the PID of a process by its name.', 'Naam se kisi process ka PID dhoondho.'),
      FUN('Process number 1 is called init (or systemd). It is the grandparent of every other process. If it ever dies, the whole system goes down.', 'Process number 1 ka naam init (ya systemd) hai. Wo baaki har process ka dada hai. Agar wo kabhi mar gaya to poora system gir jata hai.'),
      H('Foreground and background', 'Foreground aur background'),
      P('Normally a command **holds the prompt** until it finishes: it runs in the **foreground**. Put an **&** at the end and it runs in the **background**, so you get your prompt back immediately.', 'Normally ek command **prompt ko pakad kar rakhti hai** jab tak wo khatam na ho: wo **foreground** mein chalti hai. Aakhir mein **&** laga do to wo **background** mein chalti hai aur tumhe prompt turant wapas mil jata hai.'),
      CMD(['sleep 300 &', 'jobs', 'ps'], 'sleep 300 just waits 300 seconds. The [1] is its job number and the other number is its PID.', 'sleep 300 bas 300 second intezaar karta hai. [1] uska job number hai aur doosra number uska PID.'),
      TABLE(
        [
          ['cmd &', 'start cmd in the background', 'cmd ko background mein shuru karo'],
          ['jobs', 'list your background jobs', 'apne background jobs list karo'],
          ['fg', 'bring a job to the foreground', 'job ko foreground mein laao'],
          ['bg', 'let a stopped job continue in the background', 'ruke hue job ko background mein chalne do'],
          ['Ctrl+C', 'stop (interrupt) the foreground program', 'foreground program ko roko (interrupt)'],
          ['Ctrl+Z', 'pause the foreground program (then bg or fg)', 'foreground program ko pause karo (phir bg ya fg)'],
        ],
        'Key / command',
        'Key / command'
      ),
      CMD('ping -c 3 localhost', 'ping -c 3 sends three pings and stops by itself. Without -c it would run forever until you press Ctrl+C. Try ping localhost and press Ctrl+C after a few lines.', 'ping -c 3 teen pings bhej kar khud ruk jata hai. -c ke bina wo hamesha chalta jab tak tum Ctrl+C na dabao. ping localhost try karo aur kuch lines ke baad Ctrl+C dabao.'),
      H('Stop a process: kill', 'Process roko: kill'),
      P('kill does not always kill. It **sends a signal**: a message to the process. The default signal (TERM, number 15) politely says "please finish and leave". If the process ignores it, signal 9 (KILL) removes it without asking.', 'kill hamesha maarta nahi. Wo ek **signal bhejta hai**: process ko ek sandesh. Default signal (TERM, number 15) tameez se kehta hai "please khatam karo aur nikal jao". Agar process na maane to signal 9 (KILL) bina poochhe use hata deta hai.'),
      CMD(['sleep 500 &', 'kill %1', 'jobs'], '%1 means "job number 1". The job is terminated and the list is empty.', '%1 ka matlab "job number 1". Job terminate ho jata hai aur list khali ho jati hai.'),
      TABLE([
        ['kill 4012', 'politely ask process 4012 to stop (signal 15)', 'process 4012 se tameez se rukne ko kaho (signal 15)'],
        ['kill -9 4012', 'force it to stop at once (signal 9)', 'use turant zabardasti roko (signal 9)'],
        ['kill %2', 'stop background job number 2', 'background job number 2 roko'],
        ['pkill sleep', 'stop every process named sleep', 'sleep naam ke saare processes roko'],
        ['killall sleep', 'same idea, by name', 'wahi idea, naam se'],
      ]),
      WARN('You may only kill your own processes. Killing someone else\'s, or a system process, needs sudo. And think before you do it: `sudo kill -9` on the wrong PID can crash a service or the whole machine.', 'Tum sirf apne processes maar sakte ho. Kisi aur ka ya system process maarne ke liye sudo chahiye. Aur karne se pehle socho: galat PID par `sudo kill -9` kisi service ya poori machine ko crash kar sakta hai.'),
      CMD('kill 412', 'Try to kill the SSH server (PID 412) as a normal user. Linux says no: Operation not permitted.', 'Normal user ki tarah SSH server (PID 412) ko maarne ki koshish karo. Linux mana karta hai: Operation not permitted.'),
      H('How healthy is the machine?', 'Machine kitni swasth hai?'),
      TABLE([
        ['uptime', 'how long it has been running, and the load', 'kitne samay se chal rahi hai, aur load'],
        ['free -h', 'memory (RAM) used and free', 'memory (RAM) use hui aur khali'],
        ['df -h', 'disk space used and free', 'disk space use hua aur khali'],
        ['nproc', 'number of CPU cores', 'CPU cores ki sankhya'],
      ]),
      TRY('Check the vital signs:', 'Vital signs check karo:', ['uptime', 'free -h', 'df -h']),
      THINK('you ran  sleep 100  in the foreground and your prompt is stuck. What are your options?', 'tumne  sleep 100  foreground mein chalaya aur prompt atak gaya. Tumhare paas kya options hain?', 'Press Ctrl+C to stop it, or Ctrl+Z to pause it and then bg to let it continue in the background. Next time start it with & at the end.', 'Ctrl+C se roko, ya Ctrl+Z se pause karke bg se background mein chalne do. Agli baar aakhir mein & laga kar shuru karo.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['ps aux', 'all processes', 'saare processes'],
        ['top', 'live view', 'live view'],
        ['cmd &', 'run in background', 'background mein chalao'],
        ['jobs, fg, bg', 'manage background jobs', 'background jobs sambhalo'],
        ['kill PID', 'ask it to stop', 'rukne ko kaho'],
        ['kill -9 PID', 'force it to stop', 'zabardasti roko'],
        ['pgrep name', 'find a PID by name', 'naam se PID dhoondho'],
      ]),
    ],
    missions: [
      M('proc-m1', 'Roll call', 'Hazri lo', 'List every process on the machine with ps aux.', 'ps aux se machine ke har process ki list dikhao.', 'ps aux', 'ps aux', (sh) => sh.log.some((r) => /^\s*ps\s+(aux|-ef|-aux)/.test(r.cmd) && r.code === 0), ['ps aux']),
      M('proc-m2', 'Park a job', 'Job ko park karo', 'Start sleep 300 in the background with &, then list your jobs.', 'sleep 300 ko & se background mein shuru karo, phir apne jobs list karo.', 'sleep 300 &  then  jobs', 'sleep 300 &  phir  jobs', (sh) => sh.jobs.length >= 1 && sh.log.some((r) => /^\s*jobs\b/.test(r.cmd)) && sh.log.some((r) => /sleep\s+\d+\s*&/.test(r.cmd)), ['sleep 300 &', 'jobs']),
      M('proc-m3', 'Stop the sleeper', 'Sone wale ko roko', 'Kill the background sleep job so that your job list is empty again.', 'Background sleep job ko kill karo taaki tumhari job list dobara khali ho jaye.', 'kill %1  (or use the PID)', 'kill %1  (ya PID use karo)', (sh) => sh.log.some((r) => /sleep\s+\d+\s*&/.test(r.cmd)) && sh.log.some((r) => /^\s*(kill|pkill|killall)\b/.test(r.cmd)) && sh.jobs.length === 0, ['sleep 300 &', 'kill %1']),
    ],
    quiz: [
      mcq(1, 'What is a process?', 'Process kya hai?', ['A program that is running right now', 'A deleted file', 'A folder', 'A password'], 0, 'A process is a running program, and each one has a PID.', 'Process ek chalta hua program hai, aur har ek ka ek PID hota hai.'),
      mcq(2, 'Which command shows a live, refreshing list of the busiest processes?', 'Kaun si command sabse vyast processes ki live, refresh hoti list dikhati hai?', ['top', 'ls', 'pwd', 'date'], 0, 'top is the live view; q quits it.', 'top live view hai; q se band hota hai.'),
      mcq(3, 'What does pressing Ctrl+C do to a running command?', 'Chalti hui command par Ctrl+C dabane se kya hota hai?', ['Copies it', 'Interrupts (stops) it', 'Pauses the computer', 'Closes the terminal'], 1, 'Ctrl+C sends the interrupt signal, so the program stops.', 'Ctrl+C interrupt signal bhejta hai, to program ruk jata hai.'),
      cmd(4, 'List every process of every user.', 'Har user ka har process list karo.', { verify: (sh, r, c) => /^\s*ps\b/.test(c) && r.out.includes('sshd') && /USER|UID/.test(r.out), sample: 'ps aux', alt: ['ps -ef'], wrong: ['ps'], hintEn: 'ps with the letters a, u, x.', hintHi: 'ps aur akshar a, u, x.' }, 'ps aux shows all processes. Plain ps shows only your terminal.', 'ps aux saare processes dikhata hai. Seedha ps sirf tumhara terminal dikhata hai.'),
      mcq(5, 'What does an ampersand & at the end of a command do?', 'Command ke end mein ampersand & kya karta hai?', ['Runs it in the background', 'Runs it twice', 'Hides the output', 'Runs it as root'], 0, 'The & lets the command run in the background and gives the prompt back.', '& command ko background mein chalne deta hai aur prompt wapas de deta hai.'),
      cmd(6, 'Start  sleep 200  in the background.', ' sleep 200  ko background mein shuru karo.', { verify: (sh) => sh.jobs.length === 1 && /200/.test(sh.jobs[0].cmd), sample: 'sleep 200 &', wrong: ['sleep 200'], hintEn: 'Add the special character at the end.', hintHi: 'Aakhir mein special character lagao.' }, 'sleep 200 & returns the prompt immediately.', 'sleep 200 & turant prompt wapas de deta hai.'),
      cmd(7, 'A background sleep 500 is running. List your background jobs.', 'Ek background sleep 500 chal raha hai. Apne background jobs list karo.', { setup: ['sleep 500 &'], verify: (sh, r, c) => /^\s*jobs\b/.test(c) && r.out.includes('sleep 500'), sample: 'jobs', hintEn: 'The command is named after what it lists.', hintHi: 'Command ka naam wahi hai jo wo list karti hai.' }, 'jobs lists the background and stopped jobs of this terminal.', 'jobs is terminal ke background aur ruke hue jobs list karta hai.'),
      cmd(8, 'A background sleep 500 is job number 1. Stop it.', 'Ek background sleep 500 job number 1 hai. Use roko.', { setup: ['sleep 500 &'], verify: (sh) => sh.jobs.length === 0, sample: 'kill %1', alt: ['pkill sleep', 'killall sleep', 'kill $!'], hintEn: '%1 means job number 1.', hintHi: '%1 matlab job number 1.' }, 'kill %1 terminates job number 1.', 'kill %1 job number 1 ko terminate karta hai.'),
      cmd(9, 'Print only the PID number of the sshd process.', 'Sirf sshd process ka PID number print karo.', { verify: (sh, r, c) => r.out.trim() === '412' && /^\s*pgrep\b/.test(c), sample: 'pgrep sshd', hintEn: 'p + grep for processes.', hintHi: 'processes ke liye p + grep.' }, 'pgrep looks processes up by name and prints their PIDs.', 'pgrep naam se processes dhoondhta hai aur unke PID print karta hai.'),
      cmd(10, 'Boss level: the SSH server (PID 412) is misbehaving. Force-kill it with administrator rights using signal 9.', 'Boss level: SSH server (PID 412) galat behave kar raha hai. Administrator rights se signal 9 ke saath use zabardasti maar do.', { verify: (sh) => sh.services.ssh.active === false, sample: 'sudo kill -9 412', wrong: ['kill -9 412'], hintEn: 'Normal users cannot kill system processes. Add sudo.', hintHi: 'Normal user system processes nahi maar sakte. sudo lagao.' }, 'Without sudo you get Operation not permitted. With sudo and -9 the process is force-killed.', 'sudo ke bina Operation not permitted milta hai. sudo aur -9 ke saath process zabardasti mar jata hai.'),
    ],
  });
})();
