(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'scripting',
    no: 12,
    key: '#!',
    mins: 40,
    title: T('Shell Scripting and Automation', 'Shell Scripting aur Automation'),
    blurb: T('Teach the computer to do boring jobs by itself: variables, decisions, loops, functions and scheduled tasks.', 'Computer ko boring kaam khud karna sikhao: variables, faisle, loops, functions aur schedule kiye hue tasks.'),
    blocks: [
      BIG(
        'A **shell script** is a text file full of commands that bash runs one after another. Anything you can type, you can save in a script and run again and again. Add **variables**, **if** decisions and **loops**, and you have a tiny robot that works for you.',
        '**Shell script** ek text file hai jisme commands bhari hoti hain aur bash unhe ek ke baad ek chalata hai. Jo kuch tum type kar sakte ho, use script mein save karke baar-baar chala sakte ho. **Variables**, **if** wale faisle aur **loops** jodo, aur tumhare paas ek chhota robot hai jo tumhare liye kaam karta hai.'
      ),
      STORY('A script is a recipe card for a robot. "Take notes.txt. Copy it into the backups folder. Put today\'s date in the name. Tell me when you are done." Write the card once, and the robot can follow it every single day without getting bored.', 'Script robot ke liye recipe card hai. "notes.txt lo. Use backups folder mein copy karo. Naam mein aaj ki date lagao. Kaam ho jaye to mujhe batao." Card ek baar likho, aur robot use roz bina bore hue follow kar sakta hai.'),
      H('Your first script', 'Tumhari pehli script'),
      P('Three ingredients: the first line **#!/bin/bash** (called the shebang) tells Linux which program should run the file; then your commands; then the **x** permission so the file is runnable.', 'Teen cheezein: pehli line **#!/bin/bash** (jise shebang kehte hain) Linux ko batati hai ki file kaun sa program chalaye; phir tumhari commands; phir **x** permission taaki file runnable ho.'),
      CMD(["echo '#!/bin/bash' > hi.sh", "echo 'echo Hello from my first script' >> hi.sh", 'cat hi.sh', 'chmod +x hi.sh', './hi.sh'], 'We build the file with echo here. In real life you would write it with nano hi.sh.', 'Yahan hum file ko echo se banate hain. Asli zindagi mein tum use nano hi.sh se likhte.'),
      TIP('You can also run a script without the x permission by handing it to bash: `bash hi.sh`.', 'Bina x permission ke bhi script chala sakte ho use bash ko dekar: `bash hi.sh`.'),
      H('Variables', 'Variables'),
      P('A variable is a labelled box. Make one with **name=value**. There must be **no spaces** around the equals sign. Read it back with a dollar sign: **$name**.', 'Variable ek naam wala dabba hai. **name=value** se banao. Barabar ke nishaan ke aas-paas **space nahi** hona chahiye. Dollar sign se wapas padho: **$name**.'),
      CMD(['name=Aarav', 'echo "Hello, $name"', "echo 'Hello, $name'"], 'Double quotes let the box open and show its content. Single quotes print exactly what you typed.', 'Double quotes dabba kholte hain aur uska content dikhate hain. Single quotes bilkul wahi print karte hain jo tumne type kiya.'),
      WARN('`name = Aarav` (with spaces) does not work: bash thinks name is a command. Write `name=Aarav`.', '`name = Aarav` (spaces ke saath) nahi chalta: bash sochta hai name ek command hai. `name=Aarav` likho.'),
      H('Command substitution and maths', 'Command ka jawab aur maths'),
      TABLE([
        ['$(command)', 'run the command and paste its output right here', 'command chalao aur uska output yahin chipka do'],
        ['$((7 * 6))', 'do arithmetic with whole numbers', 'poore numbers ka arithmetic karo'],
      ]),
      CMD(['today=$(date +%F)', 'echo "Today is $today"', 'echo "This folder has $(ls | wc -l) items"', 'echo $((7 * 6))'], 'A variable can hold the answer of a command. $(...) is the magic.', 'Variable kisi command ka jawab rakh sakta hai. $(...) yahan jaadu hai.'),
      H('Arguments: giving a script input', 'Arguments: script ko input dena'),
      P('Inside a script, **$1** is the first word typed after the script name, **$2** the second, and **$#** counts them all.', 'Script ke andar, **$1** script ke naam ke baad type kiya pehla shabd hai, **$2** doosra, aur **$#** sabko ginta hai.'),
      CMD(['echo \'echo "Hello, $1! You gave $# word(s)."\' > greet.sh', 'chmod +x greet.sh', './greet.sh Ravi', './greet.sh Ravi Meera'], 'Single quotes keep $1 safe inside the file so it is read later when the script runs.', 'Single quotes $1 ko file ke andar surakshit rakhte hain taaki wo baad mein, script chalte waqt, padha jaye.'),
      H('Exit status: did it work?', 'Exit status: kaam hua ya nahi?'),
      P('Every command leaves a number behind: **0** means success, anything else means a problem. Look at it with **$?**.', 'Har command ek number peeche chhodti hai: **0** matlab safal, kuch aur matlab samasya. Use **$?** se dekho.'),
      CMD(['ls poem.txt', 'echo $?', 'ls nothere.txt', 'echo $?'], 'First 0 (found it), then non-zero (not found).', 'Pehle 0 (mil gayi), phir non-zero (nahi mili).'),
      H('Decisions: if', 'Faisle: if'),
      PRE(`if [ -f poem.txt ]; then
  echo "The poem exists"
else
  echo "No poem here"
fi`),
      CMD('if [ -f poem.txt ]; then echo "The poem exists"; else echo "No poem here"; fi', 'The same decision on one line, separated by semicolons. [ ] is a test. Mind the spaces inside the brackets!', 'Wahi faisla ek line mein, semicolons se alag. [ ] ek test hai. Brackets ke andar spaces ka dhyaan rakho!'),
      TABLE(
        [
          ['[ -f file ]', 'file exists and is a regular file', 'file hai aur normal file hai'],
          ['[ -d dir ]', 'directory exists', 'directory hai'],
          ['[ -e path ]', 'anything exists there', 'wahan kuch bhi hai'],
          ['[ "$a" = "$b" ]', 'two strings are equal', 'do strings barabar hain'],
          ['[ $n -gt 5 ]', 'number is greater than 5 (-lt less, -eq equal, -ne not equal)', 'number 5 se bada hai (-lt chhota, -eq barabar, -ne barabar nahi)'],
          ['[ -z "$s" ]', 'string is empty', 'string khali hai'],
        ],
        'Test',
        'Test'
      ),
      H('Loops: do it many times', 'Loops: kai baar karo'),
      CMD('for i in 1 2 3; do echo "Round $i"; done', 'A for loop walks through a list, running the commands between do and done for each item.', 'for loop ek list par chalta hai aur har item ke liye do aur done ke beech ki commands chalata hai.'),
      CMD('for f in *.txt; do echo "$f has $(wc -l < $f) lines"; done', 'The star lists every .txt file, and the loop reports on each. Real automation!', 'Star har .txt file list karta hai, aur loop har ek ki report deta hai. Asli automation!'),
      CMD('n=1; while [ $n -le 3 ]; do echo "n is $n"; n=$((n + 1)); done', 'A while loop repeats as long as the test is true. Do not forget to change n or it never stops (press Ctrl+C).', 'while loop tab tak dohrata hai jab tak test sach hai. n badalna mat bhoolo warna wo kabhi nahi rukega (Ctrl+C dabao).'),
      H('Functions: your own commands', 'Functions: tumhari apni commands'),
      CMD('hello() { echo "Hi $1, welcome!"; }; hello Ravi; hello Meera', 'Define once, use many times. Inside a function $1 is the first word you give it.', 'Ek baar banao, kai baar use karo. Function ke andar $1 wo pehla shabd hai jo tum use do.'),
      H('Asking the user: read', 'User se poochna: read'),
      CMD(['read -p "What is your name? " who', 'echo "Namaste, $who!"'], 'read waits for you to type and stores it in a variable. Try answering in the terminal.', 'read tumhare type karne ka intezaar karta hai aur use variable mein rakhta hai. Terminal mein jawab dekar try karo.'),
      H('A real script: a backup', 'Asli script: ek backup'),
      P('Let us build something useful: a script that copies notes.txt into a backups folder with today\'s date in the file name.', 'Kuch kaam ka banate hain: ek script jo notes.txt ko backups folder mein aaj ki date ke naam ke saath copy kare.'),
      PRE(`#!/bin/bash
stamp=$(date +%F)                    # today, like 2026-10-26
mkdir -p backups                     # make the folder if it is missing
cp notes.txt "backups/notes_$stamp.txt"
echo "Backup done on $stamp"`),
      CMD(["echo '#!/bin/bash' > backup.sh", "echo 'stamp=$(date +%F)' >> backup.sh", "echo 'mkdir -p backups' >> backup.sh", 'echo \'cp notes.txt "backups/notes_$stamp.txt"\' >> backup.sh', 'echo \'echo "Backup done on $stamp"\' >> backup.sh', 'chmod +x backup.sh', './backup.sh', 'ls backups'], 'Build, make executable, run, check. A # starts a comment: the robot ignores it, humans read it.', 'Banao, executable banao, chalao, check karo. # comment shuru karta hai: robot use ignore karta hai, insaan padhte hain.'),
      H('Environment and PATH', 'Environment aur PATH'),
      P('Programs find commands by searching the folders listed in the **PATH** variable. A normal variable lives only in your shell; **export** shares it with programs you start.', 'Programs commands ko **PATH** variable mein likhe folders mein dhoondh kar paate hain. Normal variable sirf tumhare shell mein rehta hai; **export** use un programs ke saath share karta hai jo tum shuru karte ho.'),
      CMD(['echo $PATH', 'export GREETING=Namaste', 'printenv GREETING'], 'PATH is a list of folders separated by colons.', 'PATH colon se alag kiye hue folders ki list hai.'),
      CMD(['mkdir -p ~/bin', 'cp backup.sh ~/bin', 'export PATH=$PATH:$HOME/bin', 'backup.sh'], 'Now backup.sh runs from anywhere by name, because ~/bin is in the PATH. (Put the export line in ~/.bashrc to keep it forever.)', 'Ab backup.sh kahin se bhi naam se chalti hai, kyunki ~/bin PATH mein hai. (Hamesha ke liye rakhne ko export wali line ~/.bashrc mein daalo.)'),
      H('Automatic timing: cron', 'Apne aap timing: cron'),
      P('**cron** is the clock-robot. It runs your commands at the times you list in your **crontab**. Edit it with **crontab -e**. Each line has five time fields and then the command.', '**cron** ghadi wala robot hai. Wo tumhari commands un samay par chalata hai jo tumne apne **crontab** mein likhe hain. Use **crontab -e** se edit karo. Har line mein paanch time fields aur phir command hoti hai.'),
      ANAT([
        ['30', 'cmd', 'minute (0 to 59)', 'minute (0 se 59)'],
        ['2', 'opt', 'hour (0 to 23)', 'ghanta (0 se 23)'],
        ['*', 'arg', 'day of the month (* means every)', 'mahine ka din (* matlab har)'],
        ['*', 'arg', 'month (* means every)', 'mahina (* matlab har)'],
        ['*', 'arg', 'day of the week (* means every)', 'hafte ka din (* matlab har)'],
        ['/home/learner/backup.sh', 'op', 'the command to run: here every day at 02:30', 'chalane wali command: yahan roz 02:30 par'],
      ]),
      TABLE([
        ['* * * * *', 'every minute', 'har minute'],
        ['0 * * * *', 'at the start of every hour', 'har ghante ke shuru mein'],
        ['0 9 * * 1', 'every Monday at 09:00', 'har Monday subah 09:00 baje'],
        ['*/15 * * * *', 'every 15 minutes', 'har 15 minute mein'],
      ], 'Schedule', 'Schedule'),
      CMD('crontab -l', 'Lists your scheduled jobs. At first: no crontab. Try crontab -e to open the editor, add a line and save.', 'Tumhare scheduled jobs list karta hai. Shuru mein: no crontab. crontab -e se editor kholo, ek line jodo aur save karo.'),
      FUN('Many of the websites, backups and reports of the world run from a handful of cron lines on some quiet Linux server.', 'Duniya ki kai websites, backups aur reports kisi shaant Linux server par kuch cron lines se chalti hain.'),
      THINK('what is wrong with  count = 5 ?', ' count = 5  mein kya galat hai?', 'The spaces. In bash a variable assignment must be written count=5 with no spaces, otherwise bash looks for a command named count.', 'Spaces. Bash mein variable assignment count=5 bina spaces ke likhna padta hai, warna bash count naam ki command dhoondhta hai.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['#!/bin/bash', 'first line of a script', 'script ki pehli line'],
        ['chmod +x s.sh; ./s.sh', 'make it runnable and run it', 'runnable banao aur chalao'],
        ['x=5; echo $x', 'variable', 'variable'],
        ['$(cmd)  $((1+2))', 'command output / maths', 'command ka output / maths'],
        ['$1 $2 $#', 'script arguments', 'script ke arguments'],
        ['$?', 'exit status of last command', 'pichli command ka exit status'],
        ['if [ test ]; then ...; fi', 'decision', 'faisla'],
        ['for x in list; do ...; done', 'loop over a list', 'list par loop'],
        ['while [ test ]; do ...; done', 'loop while true', 'jab tak sach loop'],
        ['f() { ...; }', 'function', 'function'],
        ['crontab -e', 'schedule jobs', 'jobs schedule karo'],
      ]),
      BIG(
        'Congratulations! You now know the whole beginner Linux toolbox: moving around, files, text, search, pipes, permissions, processes, software, networking and scripts. The next step is practice. Pick a small boring task in your life and automate it with a script.',
        'Badhai ho! Ab tumhe beginner Linux ka poora toolbox aata hai: ghoomna, files, text, search, pipes, permissions, processes, software, networking aur scripts. Agla kadam practice hai. Apni zindagi ka koi chhota boring kaam chuno aur use script se automate karo.'
      ),
    ],
    missions: [
      M('script-m1', 'Your first robot', 'Tumhara pehla robot', 'Create a script greet.sh that prints a greeting, make it executable, and run it with ./greet.sh.', 'greet.sh naam ki script banao jo greeting print kare, use executable banao aur ./greet.sh se chalao.', "echo 'echo Hello Linux' > greet.sh, chmod +x greet.sh, ./greet.sh", "echo 'echo Hello Linux' > greet.sh, chmod +x greet.sh, ./greet.sh", (sh) => sh.isFile('~/greet.sh') && (sh.stat('~/greet.sh').mode & 0o111) !== 0 && sh.log.some((r) => /^\s*\.\/greet\.sh/.test(r.cmd) && r.code === 0 && r.out.trim().length > 0), ["echo 'echo Hello Linux' > greet.sh", 'chmod +x greet.sh', './greet.sh']),
      M('script-m2', 'Count to five', 'Paanch tak ginti', 'Use a for loop to print the numbers 1 2 3 4 5, each on its own line.', 'for loop se 1 2 3 4 5 numbers print karo, har ek apni line par.', 'for i in 1 2 3 4 5; do echo $i; done', 'for i in 1 2 3 4 5; do echo $i; done', (sh, last) => !!last && /\bfor\b/.test(last.cmd) && last.out.trim() === '1\n2\n3\n4\n5', ['for i in 1 2 3 4 5; do echo $i; done']),
      M('script-m3', 'A box with the year', 'Saal wala dabba', 'Store the current year (date +%Y) in a variable using $( ), then print a line that looks like Year: 2026. Do it in one line.', 'Maujooda saal (date +%Y) ko $( ) se variable mein rakho, phir aisi line print karo jaise Year: 2026. Ek hi line mein karo.', 'year=$(date +%Y); echo "Year: $year"', 'year=$(date +%Y); echo "Year: $year"', (sh, last) => !!last && /\$\(/.test(last.cmd) && /^Year: 20\d\d$/.test(last.out.trim()), ['year=$(date +%Y); echo "Year: $year"']),
    ],
    quiz: [
      mcq(1, 'What does the first line  #!/bin/bash  of a script do?', 'Script ki pehli line  #!/bin/bash  kya karti hai?', ['Tells Linux to run the file with bash', 'Deletes the file', 'Makes a comment only', 'Installs bash'], 0, 'The shebang names the program that should run the script.', 'Shebang us program ka naam batata hai jo script chalaye.'),
      mcq(2, 'You wrote  name=Aarav . How do you print the value?', 'Tumne  name=Aarav  likha. Value kaise print karoge?', ['echo name', 'echo $name', 'echo &name', 'print name'], 1, 'The dollar sign reads the variable: echo $name.', 'Dollar sign variable padhta hai: echo $name.'),
      mcq(3, 'What does  $?  contain?', ' $?  mein kya hota hai?', ['The current folder', 'The exit status of the last command', 'Your password', 'The date'], 1, '0 means success, anything else means the last command had a problem.', '0 matlab safal, kuch aur matlab pichli command mein samasya thi.'),
      cmd(4, 'Store the number 5 in a variable x and print it, in one line.', 'Number 5 ko variable x mein rakho aur print karo, ek line mein.', { verify: (sh, r, c) => r.out.trim() === '5' && c.includes('$x'), sample: 'x=5; echo $x', wrong: ['x=5'], hintEn: 'No spaces around =, then echo $x.', hintHi: '= ke aas-paas space nahi, phir echo $x.' }, 'x=5 stores it, echo $x prints it.', 'x=5 use rakhta hai, echo $x print karta hai.'),
      cmd(5, 'Print the result of 7 times 6 using arithmetic expansion.', 'Arithmetic expansion se 7 guna 6 ka result print karo.', { verify: (sh, r, c) => r.out.trim() === '42' && c.includes('$(('), sample: 'echo $((7*6))', alt: ['echo $((7 * 6))'], hintEn: 'Double parentheses after a dollar sign.', hintHi: 'Dollar sign ke baad double parentheses.' }, '$(( )) does integer maths.', '$(( )) integer maths karta hai.'),
      cmd(6, 'Print the text  I am in /home/learner  but let the shell find the folder with command substitution.', 'Text  I am in /home/learner  print karo par folder ko shell se command substitution ke zariye dhoondhwao.', { verify: (sh, r, c) => r.out.trim() === 'I am in /home/learner' && /\$\(|`/.test(c) && !c.includes('/home/learner'), sample: 'echo "I am in $(pwd)"', hintEn: 'pwd prints the folder. $( ) pastes the output.', hintHi: 'pwd folder print karta hai. $( ) output chipkata hai.' }, '$(pwd) is replaced by the output of pwd.', '$(pwd) pwd ke output se badal jata hai.'),
      cmd(7, 'Use a for loop to print the word hi three times, one per line.', 'for loop se hi shabd teen baar print karo, har baar nayi line.', { verify: (sh, r, c) => /\bfor\b/.test(c) && r.out.trim() === 'hi\nhi\nhi', sample: 'for i in 1 2 3; do echo hi; done', alt: ['for i in a b c; do echo hi; done'], hintEn: 'for i in 1 2 3; do ...; done', hintHi: 'for i in 1 2 3; do ...; done' }, 'The commands between do and done run once for every item.', 'do aur done ke beech ki commands har item ke liye ek baar chalti hain.'),
      cmd(8, 'Write an if statement that prints yes when the file poem.txt exists and no otherwise.', 'Aisa if statement likho jo poem.txt maujood ho to yes print kare aur warna no.', { verify: (sh, r, c) => /\bif\b/.test(c) && /\bfi\b/.test(c) && r.out.trim() === 'yes', sample: 'if [ -f poem.txt ]; then echo yes; else echo no; fi', alt: ['if [ -e poem.txt ]; then echo yes; else echo no; fi'], hintEn: 'if [ -f file ]; then ...; else ...; fi', hintHi: 'if [ -f file ]; then ...; else ...; fi' }, '[ -f poem.txt ] is true when the file exists.', '[ -f poem.txt ] tab sach hai jab file maujood ho.'),
      cmd(9, 'Define a function called hello that prints Hi followed by its first argument, then call it with Ravi.', 'hello naam ka function banao jo Hi aur uska pehla argument print kare, phir use Ravi ke saath chalao.', { verify: (sh, r, c) => r.out.trim() === 'Hi Ravi' && /hello\s*\(\)/.test(c), sample: 'hello() { echo "Hi $1"; }; hello Ravi', alt: ['hello () { echo Hi $1; }; hello Ravi'], hintEn: 'name() { commands; }  then call it by name.', hintHi: 'naam() { commands; }  phir naam se bulao.' }, '$1 inside a function is the first word given to it.', 'Function ke andar $1 use diya gaya pehla shabd hota hai.'),
      cmd(10, 'Boss level: loop over every .txt file in your home folder and print each name, a colon, a space and its number of lines, like  poem.txt: 4 .', 'Boss level: home folder ki har .txt file par loop chalao aur har ka naam, colon, space aur lines ki sankhya print karo, jaise  poem.txt: 4 .', { verify: (sh, r, c) => /\bfor\b/.test(c) && r.out.includes('poem.txt: 4') && r.out.includes('todo.txt: 5') && r.out.includes('numbers.txt: 8'), sample: 'for f in *.txt; do echo "$f: $(wc -l < $f)"; done', hintEn: 'Loop over *.txt and use $(wc -l < $f) for the count.', hintHi: '*.txt par loop chalao aur ginti ke liye $(wc -l < $f) use karo.' }, 'wc -l < file prints only the number, and $( ) pastes it into the echo line.', 'wc -l < file sirf number print karta hai, aur $( ) use echo line mein chipka deta hai.'),
    ],
  });
})();
