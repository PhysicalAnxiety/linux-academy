(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'help',
    no: 5,
    key: 'man',
    mins: 20,
    title: T('Help and Shell Superpowers', 'Help aur shell ki superpowers'),
    blurb: T('Nobody remembers every command. Learn to ask Linux for help, and use shortcuts that make typing ten times faster.', 'Har command kisi ko yaad nahi rehti. Linux se help maangna seekho, aur aise shortcuts jo typing ko das guna tez bana dein.'),
    blocks: [
      BIG(
        'Professionals do not memorise everything. They know **how to look things up**. Linux comes with a built-in manual for almost every command, and the shell remembers what you typed before. Use both and you will feel like a wizard.',
        'Professionals sab kuch yaad nahi rakhte. Unhe pata hota hai **kaise dhoondhna hai**. Linux mein lagbhag har command ka built-in manual aata hai, aur shell tumhari pehle type ki hui commands yaad rakhta hai. Dono use karo aur tum jaadugar jaisa feel karoge.'
      ),
      STORY('Imagine a game with a rule book in the box. You do not memorise the book, you open it when you are stuck. The man command is that rule book, and --help is the quick card on the back of the box.', 'Socho ek game jiske dabbe mein rule book hai. Tum use ratte nahi, atakte ho to kholte ho. man command wahi rule book hai, aur --help dabbe ke peeche wala quick card.'),
      H('man: the manual', 'man: manual'),
      CMD('man ls', 'Opens the manual page for ls: NAME, SYNOPSIS, DESCRIPTION, OPTIONS. In a real terminal you scroll with Space and quit with q.', 'ls ka manual page kholta hai: NAME, SYNOPSIS, DESCRIPTION, OPTIONS. Asli terminal mein Space se scroll aur q se bahar nikalte hain.'),
      H('--help: the quick card', '--help: quick card'),
      CMD('mkdir --help', 'Almost every command understands --help and prints a short summary of how to use it.', 'Lagbhag har command --help samajhti hai aur use kaise karna hai uska chhota summary print karti hai.'),
      CMD('whatis ls', 'One line: what does this command do?', 'Ek line mein: ye command kya karti hai?'),
      CMD('apropos copy', 'Forgot the command name but know what you want? Search all manuals by keyword.', 'Command ka naam bhool gaye par pata hai kya chahiye? Keyword se saare manuals mein dhoondho.'),
      H('Reading a man page', 'Man page kaise padhein'),
      PRE(`NAME
       ls - list directory contents          <- what it is

SYNOPSIS
       ls [OPTION]... [FILE]...              <- how to write it
                                                [ ] means optional
                                                ... means "can repeat"
OPTIONS
       -a, --all                             <- a short form and a long form
              do not ignore entries starting with .`),
      TIP('Every option usually has a short form with one dash (-a) and a long form with two dashes (--all). They do the same thing. Short is quick to type, long is easier to read in scripts.', 'Har option ka aksar ek chhota roop one dash wala (-a) aur ek lamba roop two dashes wala (--all) hota hai. Dono ek hi kaam karte hain. Chhota type karne mein tez, lamba scripts mein padhne mein aasan.'),
      H('Superpower 1: Tab completion', 'Superpower 1: Tab completion'),
      P('Type the first letters of a command or file and press **Tab**. If there is only one match Linux completes it. If there are many, press Tab twice and it lists them all.', 'Kisi command ya file ke pehle kuch akshar type karo aur **Tab** dabao. Ek hi match hai to Linux poora kar deta hai. Kai hain to do baar Tab dabao aur wo sabki list dikha deta hai.'),
      TRY('Try it in the terminal: type  ls Doc  and press Tab. Then type  cd ~/Pic  and press Tab. Then type just  his  and press Tab twice.', 'Terminal mein try karo:  ls Doc  type karke Tab dabao. Phir  cd ~/Pic  type karke Tab dabao. Phir sirf  his  type karke do baar Tab dabao.', ['ls Documents', 'cd ~/Pictures && pwd']),
      H('Superpower 2: History', 'Superpower 2: History'),
      P('The shell remembers every command. The **Up arrow** walks back through them. The **history** command lists them with numbers.', 'Shell har command yaad rakhta hai. **Up arrow** unme peeche le jata hai. **history** command unhe numbers ke saath list karti hai.'),
      CMD(['echo one', 'echo two', 'history'], 'See your last commands with numbers.', 'Apni pichli commands numbers ke saath dekho.'),
      TABLE([
        ['!!', 'run the previous command again', 'pichli command dobara chalao'],
        ['!3', 'run command number 3 from history', 'history ki command number 3 chalao'],
        ['!ec', 'run the last command that started with ec', 'ec se shuru hone wali aakhri command chalao'],
        ['Ctrl+R', 'search your history by typing a few letters', 'kuch akshar type karke history mein search karo'],
        ['history -c', 'forget all history', 'saari history bhool jao'],
      ]),
      TIP('`sudo !!` means "run the last command again, but as administrator". Super handy when you forgot sudo and got Permission denied.', '`sudo !!` ka matlab "pichli command dobara chalao, par administrator ban kar". Jab sudo lagana bhool jao aur Permission denied mile tab bahut kaam aata hai.'),
      H('Superpower 3: Keyboard shortcuts', 'Superpower 3: Keyboard shortcuts'),
      TABLE(
        [
          ['Ctrl+C', 'stop the running command', 'chal rahi command rok do'],
          ['Ctrl+L', 'clear the screen (same as clear)', 'screen saaf karo (clear jaisa)'],
          ['Ctrl+A', 'jump to the start of the line', 'line ke shuru par jao'],
          ['Ctrl+E', 'jump to the end of the line', 'line ke end par jao'],
          ['Ctrl+U', 'delete everything before the cursor', 'cursor ke pehle ka sab kuch hatao'],
          ['Ctrl+W', 'delete the word before the cursor', 'cursor ke pehle ka ek shabd hatao'],
          ['Ctrl+D', 'say "I am done typing" (ends input)', '"main type kar chuka" bolo (input khatam)'],
        ],
        'Keys',
        'Keys'
      ),
      H('Superpower 4: Your own shortcuts, aliases', 'Superpower 4: Apne shortcuts, aliases'),
      P('An **alias** is a nickname for a long command. Write alias, the nickname, an equals sign and the real command in quotes.', '**Alias** ek lambi command ka nickname hai. alias likho, nickname, barabar ka nishaan aur asli command quotes mein.'),
      ANAT([
        ['alias', 'cmd', 'make a nickname', 'nickname banao'],
        ['hello', 'arg', 'the nickname (no spaces around =)', 'nickname (= ke aas-paas space nahi)'],
        ["='echo Namaste'", 'opt', 'the real command, in quotes', 'asli command, quotes mein'],
      ]),
      CMD(["alias hello='echo Namaste, friend'", 'hello'], 'Define the alias, then use it. Plain alias with nothing after it lists all your aliases.', 'Alias banao, phir use karo. Sirf alias likhne par saare aliases ki list milti hai.'),
      CMD('alias', 'See every alias. Notice ll is already one!', 'Saare aliases dekho. Dekho ll pehle se ek alias hai!'),
      WARN('An alias made in the terminal disappears when you close it. To keep it forever, put the line in the file ~/.bashrc. (We will use that in the scripting lesson.)', 'Terminal mein banaya alias terminal band hote hi chala jata hai. Hamesha ke liye rakhne ko wo line file ~/.bashrc mein daalo. (Scripting lesson mein isse use karenge.)'),
      H('Who is this command? type and which', 'Ye command kaun hai? type aur which'),
      CMD('type cd', 'Tells what kind of thing a name is: a program, a builtin, an alias or a function.', 'Batata hai ki naam kis tarah ki cheez hai: program, builtin, alias ya function.'),
      CMD('which ls', 'Prints the full path of the program that would run.', 'Jo program chalega uska poora path print karta hai.'),
      THINK('ll is not in the manual. Why?', 'll ka manual kyun nahi hai?', 'Because ll is an alias, a nickname for ls -alF. The manual has ls. Use type ll to confirm.', 'Kyunki ll ek alias hai, ls -alF ka nickname. Manual mein ls hai. type ll chala kar confirm karo.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['man cmd', 'open the manual of cmd', 'cmd ka manual kholo'],
        ['cmd --help', 'quick usage summary', 'jaldi usage summary'],
        ['whatis cmd', 'one-line description', 'ek line ka description'],
        ['apropos word', 'search manuals by keyword', 'keyword se manuals search karo'],
        ['history', 'list previous commands', 'pichli commands list karo'],
        ['!!', 'repeat last command', 'pichli command repeat karo'],
        ['alias n=\'cmd\'', 'create a nickname', 'nickname banao'],
        ['type cmd', 'what is cmd?', 'cmd kya hai?'],
      ]),
    ],
    missions: [
      M('help-m1', 'Ask the manual', 'Manual se pucho', 'Read the manual of any command with man, OR ask a command for --help. Try it on cp.', 'Kisi bhi command ka manual man se padho, YA command se --help maango. cp par try karo.', 'man cp   or   cp --help', 'man cp   ya   cp --help', (sh) => sh.log.some((r) => (/^\s*man\s+cp\b/.test(r.cmd) || /^\s*cp\s+--help/.test(r.cmd)) && r.code === 0), ['man cp']),
      M('help-m2', 'Make a nickname', 'Nickname banao', 'Create your very own alias. Any name that is not ll, la or l and any command you like.', 'Apna khud ka alias banao. ll, la ya l ke alawa koi bhi naam aur koi bhi command.', "alias hi='echo Hello'", "alias hi='echo Hello'", (sh) => Object.keys(sh.aliases).some((k) => !['ll', 'la', 'l'].includes(k)), ["alias hi='echo Hello'"]),
      M('help-m3', 'Time machine', 'Time machine', 'Run any command, then repeat it with the history shortcut !! (two exclamation marks).', 'Koi bhi command chalao, phir history shortcut !! (do exclamation marks) se use dobara chalao.', 'Run  date  and then type  !!', 'date chalao aur phir !! type karo', (sh) => sh.log.some((r) => /^\s*!!\s*$/.test(r.raw || '')), ['date', '!!']),
    ],
    quiz: [
      mcq(1, 'Which command opens the manual page of ls?', 'Kaun si command ls ka manual page kholti hai?', ['help ls', 'man ls', 'show ls', 'read ls'], 1, 'man is short for manual.', 'man manual ka short hai.'),
      mcq(2, 'What does pressing the Tab key do while you type?', 'Type karte waqt Tab key dabane se kya hota hai?', ['Deletes the line', 'Completes the name for you', 'Closes the terminal', 'Runs the command twice'], 1, 'Tab completes commands and file names, and lists the options when there are several.', 'Tab commands aur file names poore karta hai, aur kai options hon to unki list dikhata hai.'),
      mcq(3, 'Which key combination stops a running command?', 'Kaun si key combination chal rahi command ko rokti hai?', ['Ctrl+S', 'Ctrl+C', 'Ctrl+X', 'Ctrl+P'], 1, 'Ctrl+C sends an interrupt: the program is asked to stop.', 'Ctrl+C interrupt bhejta hai: program se ruknay ko kaha jata hai.'),
      cmd(4, 'Print the short help text of mkdir using its --help option.', 'mkdir ka chhota help text uske --help option se print karo.', { verify: (sh, r, c) => /^\s*mkdir\s+--help/.test(c) && r.out.includes('Usage: mkdir'), sample: 'mkdir --help', wrong: ['mkdir'], hintEn: 'Two dashes and the word help.', hintHi: 'Do dashes aur help shabd.' }, '--help works on almost every command.', '--help lagbhag har command par chalta hai.'),
      mcq(5, 'What does  !!  do at the prompt?', 'Prompt par  !!  kya karta hai?', ['Clears the screen', 'Repeats the previous command', 'Exits the terminal', 'Shows the manual'], 1, '!! is replaced by your previous command, and sudo !! is the famous use.', '!! tumhari pichli command se badal jata hai, aur sudo !! uska mashhoor use hai.'),
      cmd(6, 'Show your command history.', 'Apni command history dikhao.', { setup: ['echo a', 'echo b'], verify: (sh, r, c) => /^\s*history\s*$/.test(c) && r.out.includes('echo a') && r.out.includes('echo b'), sample: 'history', hintEn: 'The command is named after what it shows.', hintHi: 'Command ka naam wahi hai jo wo dikhati hai.' }, 'history prints every command you typed with a number.', 'history tumhari type ki har command number ke saath print karti hai.'),
      mcq(7, 'Which command tells you whether  cd  is a program, a builtin or an alias?', 'Kaun si command batati hai ki  cd  program, builtin ya alias hai?', ['type cd', 'what cd', 'find cd', 'is cd'], 0, 'type cd answers: cd is a shell builtin.', 'type cd jawab deta hai: cd is a shell builtin.'),
      cmd(8, "Create an alias called greet that runs  echo Hello Linux .", 'greet naam ka alias banao jo  echo Hello Linux  chalaye.', { verify: (sh) => sh.aliases.greet === 'echo Hello Linux', sample: "alias greet='echo Hello Linux'", wrong: ['greet=echo'], hintEn: "alias name='command'. No spaces around the equals sign.", hintHi: "alias naam='command'. Barabar ke nishaan ke aas-paas space nahi." }, 'alias nickname=\'command\' stores the nickname for this session.', "alias nickname='command' nickname ko is session ke liye yaad rakhta hai."),
      cmd(9, 'Print the full path of the ls program.', 'ls program ka poora path print karo.', { verify: (sh, r) => r.out.trim() === '/usr/bin/ls', sample: 'which ls', alt: ['command -v ls'], hintEn: 'A command that locates other commands.', hintHi: 'Ek command jo doosri commands ko locate karti hai.' }, 'which ls prints /usr/bin/ls.', 'which ls /usr/bin/ls print karta hai.'),
      cmd(10, 'Boss level: make an alias called lt that lists files in the long format, newest first (ls with -l and -t).', 'Boss level: lt naam ka alias banao jo files ko long format mein, sabse nayi pehle, list kare (ls ke saath -l aur -t).', { verify: (sh) => /^ls\s+(-lt|-tl|-l\s+-t|-t\s+-l)$/.test(sh.aliases.lt || ''), sample: "alias lt='ls -lt'", alt: ["alias lt='ls -tl'"], hintEn: '-t sorts by time, newest first. Combine l and t after one dash.', hintHi: '-t time ke hisaab se sort karta hai, sabse nayi pehle. l aur t ko ek dash ke baad jodo.' }, 'ls -lt gives long format sorted by modification time, newest first.', 'ls -lt long format deta hai, modification time ke hisaab se, sabse nayi pehle.'),
    ],
  });
})();
