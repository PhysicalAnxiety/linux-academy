(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'vim',
    part: 2,
    no: 13,
    key: 'vi',
    mins: 35,
    title: T('Editors: vim survival and nano', 'Editors: vim survival aur nano'),
    blurb: T('Servers have no mouse and no notepad. Learn nano (easy) and enough vim to never get stuck, plus scripted edits with sed.', 'Servers par mouse aur notepad nahi hota. nano (aasaan) seekho aur itna vim jisse kabhi atko nahi, saath mein sed se scripted edits.'),
    blocks: [
      BIG(
        'On a real server you will edit config files all day, and there is no mouse and no Notepad. Two editors are always there: **nano** (friendly, shows its shortcuts) and **vi / vim** (powerful, installed on almost every Linux machine on Earth). You do not need to be a vim wizard. You need to know enough to open a file, change it, save it and get out.',
        'Real server par tum din bhar config files edit karoge, aur wahan na mouse hota hai na Notepad. Do editors hamesha milte hain: **nano** (friendly, shortcuts khud dikhata hai) aur **vi / vim** (taakatwar, lagbhag har Linux machine par installed). Tumhe vim ka jadugar nahi banna. Bas itna aana chahiye: file kholo, badlo, save karo aur bahar niklo.'
      ),
      JOB('Interviewers love the question "how do you quit vim?". It is a joke, but it tells them whether you have really used a server. After this lesson you will answer it in your sleep.', 'Interviewers ka favourite sawaal hai "vim se bahar kaise nikalte ho?". Ye mazaak hai, par isse pata chalta hai ki tumne sach mein server use kiya hai ya nahi. Is lesson ke baad tum neend mein bhi jawab de doge.'),
      H('Start easy: nano', 'Aasaan se shuru: nano'),
      P('nano works like a normal text box: you type and the text appears. The bottom of the screen lists the shortcuts. **^** means the Ctrl key, so **^O** is Ctrl+O.', 'nano ek normal text box ki tarah chalta hai: tum type karte ho aur text dikhta hai. Neeche shortcuts ki list hoti hai. **^** ka matlab Ctrl key, to **^O** matlab Ctrl+O.'),
      CMD('nano notes.txt', 'Open a file in nano. Type something, press Ctrl+O then Enter to save, and Ctrl+X to leave. (Here the buttons under the editor do the same.)', 'nano mein file kholo. Kuch type karo, save karne ko Ctrl+O phir Enter dabao, aur bahar nikalne ko Ctrl+X. (Yahan editor ke neeche ke buttons yehi karte hain.)'),
      TABLE(
        [
          ['Ctrl+O', 'write Out: save the file', 'Write Out: file save karo'],
          ['Ctrl+X', 'eXit nano (it asks to save if you changed something)', 'nano se bahar (kuch badla ho to save karne ko puchta hai)'],
          ['Ctrl+W', 'Where is: search for text', 'Where is: text dhundo'],
          ['Ctrl+K / Ctrl+U', 'cut a line / paste it back', 'line kaato / wapas paste karo'],
          ['Ctrl+G', 'help screen', 'help screen'],
        ],
        'Keys in nano',
        'nano ke keys'
      ),
      H('Why vim? Because it is everywhere', 'Vim kyun? Kyunki ye har jagah hai'),
      P('vim is the grown-up version of **vi**, the editor that comes with every Unix. Some minimal servers have only vi, and a rescue shell has nothing else. That is why people learn it. Its big idea is that the keyboard has **modes**.', 'vim, **vi** ka bada version hai, wo editor jo har Unix ke saath aata hai. Kuch minimal servers par sirf vi hota hai, aur rescue shell mein aur kuch nahi milta. Isliye log ise seekhte hain. Iska bada idea hai ki keyboard ke **modes** hote hain.'),
      STORY('Think of a TV remote that has a "talk" switch. With the switch off, the buttons are commands: 5 changes channel. With the switch on, the same buttons type digits into a message. vim is the same. In **normal mode** the keys are commands (d deletes, p pastes). In **insert mode** the keys just type letters. You flip between them with **i** (go to insert) and **Esc** (back to normal).', 'Ek TV remote socho jisme "talk" switch hai. Switch off ho to buttons commands hain: 5 channel badalta hai. Switch on ho to wahi buttons message mein digits type karte hain. vim bilkul aisa hai. **Normal mode** mein keys commands hain (d delete karta hai, p paste). **Insert mode** mein keys bas letters type karti hain. In dono ke beech **i** (insert mein jao) aur **Esc** (wapas normal) se badalte ho.'),
      PRE(`   ┌───────────── Esc ─────────────┐
   ▼                                │
 NORMAL  ──── i a o I A O ───▶  INSERT      (keys type letters)
 (keys are commands)
   │
   └── : ──▶  COMMAND LINE   (:w save  :q quit  :wq both  :q! quit and throw away)`),
      CMD('vi poem.txt', 'Open a file. You land in NORMAL mode. Try j and k to move down and up, then type :q and Enter to leave. (On a fresh Ubuntu, vi is the small vim-tiny. Install the full vim with  sudo apt install vim .)', 'File kholo. Tum NORMAL mode mein pahunchte ho. j aur k se neeche aur upar jao, phir :q aur Enter se bahar niklo. (Fresh Ubuntu par vi chhota vim-tiny hota hai. Poora vim  sudo apt install vim  se aata hai.)'),
      H('The survival kit: five things you must know', 'Survival kit: paanch cheezein jo aani hi chahiye'),
      TABLE(
        [
          ['i', 'go to INSERT mode (now you can type). Press Esc to come back.', 'INSERT mode mein jao (ab type kar sakte ho). Wapas aane ko Esc.'],
          ['Esc', 'back to NORMAL mode. Press it twice if you are not sure which mode you are in.', 'NORMAL mode mein wapas. Pata na ho kaunsa mode hai to do baar dabao.'],
          [':w', 'write (save) the file', 'write (save) karo'],
          [':q', 'quit (refuses if you have unsaved changes)', 'quit (unsaved changes ho to mana kar deta hai)'],
          [':wq', 'save AND quit (ZZ and :x do the same)', 'save AUR quit (ZZ aur :x bhi yehi karte hain)'],
          [':q!', 'quit and THROW AWAY changes. This is the "get me out of here" command.', 'quit aur changes PHENK do. Ye "mujhe yahan se nikalo" command hai.'],
        ],
        'Keys',
        'Keys'
      ),
      WARN('Everyone gets stuck in vim once: you type text but nothing happens, or letters do strange things, because you are in the wrong mode. Do not panic and do not close the window. Press **Esc** twice, then type **:q!** and Enter.', 'Har koi ek baar vim mein atakta hai: tum text type karte ho par kuch nahi hota, ya letters ajeeb kaam karte hain, kyunki galat mode mein ho. Ghabrao mat aur window band mat karo. **Esc** do baar dabao, phir **:q!** type karke Enter.'),
      H('Moving around (in normal mode)', 'Idhar-udhar jaana (normal mode mein)'),
      TABLE(
        [
          ['h  j  k  l', 'left, down, up, right (arrow keys work too)', 'left, down, up, right (arrow keys bhi chalte hain)'],
          ['w  /  b', 'jump forward / backward one word', 'ek word aage / peeche kudo'],
          ['0  /  $', 'start / end of the line', 'line ki shuruaat / ant'],
          ['gg  /  G', 'first line / last line of the file', 'file ki pehli / aakhri line'],
          ['42G  or  :42', 'go to line 42', 'line 42 par jao'],
          ['/word  then  n', 'search for "word"; n jumps to the next match, N to the previous', '"word" dhundo; n agle match par, N pichle par'],
        ],
        'Move',
        'Move'
      ),
      H('Changing text: verbs + motions', 'Text badalna: verbs + motions'),
      P('vim feels like a language. A **verb** says what to do, a **motion** says how far. **d** (delete) + **w** (word) = delete a word. **y** (yank, which means copy) + **y** = copy the whole line. Put a number in front to repeat: **3dd** deletes three lines.', 'vim ek bhasha jaisa lagta hai. **Verb** batata hai kya karna hai, **motion** batata hai kitna door tak. **d** (delete) + **w** (word) = ek word delete. **y** (yank yaani copy) + **y** = poori line copy. Aage number lagao to dohrata hai: **3dd** teen lines delete karta hai.'),
      ANAT([
        ['3', 'op', 'how many times (a count)', 'kitni baar (count)'],
        ['d', 'cmd', 'the verb: delete (y = copy, c = change)', 'verb: delete (y = copy, c = change)'],
        ['w', 'arg', 'the motion: one word (d d = whole line, $ = to end of line)', 'motion: ek word (d d = poori line, $ = line ke ant tak)'],
      ]),
      TABLE(
        [
          ['x', 'delete the character under the cursor', 'cursor wale akshar ko delete karo'],
          ['dd', 'delete (cut) the current line', 'current line delete (cut) karo'],
          ['yy  then  p', 'copy the line, then paste it below (P pastes above)', 'line copy karo, phir neeche paste (P upar paste)'],
          ['u  /  Ctrl+r', 'undo / redo', 'undo / redo'],
          ['o  /  O', 'open a NEW line below / above and start typing', 'neeche / upar NAYI line kholo aur type karo'],
          ['A  /  I', 'start typing at the END / START of the line', 'line ke ANT / SHURU se type karo'],
          ['cw', 'change word: delete it and start typing the new one', 'word badlo: delete karke naya type karo'],
          ['D', 'delete from the cursor to the end of the line', 'cursor se line ke ant tak delete'],
          ['r + letter', 'replace one character', 'ek akshar badlo'],
          ['J', 'join the next line onto this one', 'agli line ko isme jodo'],
        ],
        'Edit',
        'Edit'
      ),
      THINK('what does 5dd do?', '5dd kya karta hai?', 'It deletes 5 lines starting at the cursor and puts them in the clipboard, so you can paste them somewhere else with p.', 'Ye cursor se 5 lines delete karta hai aur unhe clipboard mein rakhta hai, to tum unhe kahin aur p se paste kar sakte ho.'),
      H('Find and replace the whole file', 'Poori file mein dhundo aur badlo'),
      P('Type a colon, then a **substitute** command. The % means "every line", and the g at the end means "every match on the line".', 'Colon type karo, phir **substitute** command. % ka matlab "har line", aur aakhir ka g matlab "line ke har match par".'),
      ANAT([
        [':', 'op', 'start a command', 'command shuru'],
        ['%s', 'cmd', 's = substitute, % = on all lines', 's = substitute, % = saari lines par'],
        ['/cat/dog/', 'arg', 'replace "cat" with "dog"', '"cat" ko "dog" se badlo'],
        ['g', 'opt', 'every match on each line, not just the first', 'har line ke saare match, sirf pehla nahi'],
      ]),
      TIP('Add a **c** at the end (`:%s/cat/dog/gc`) and vim asks yes/no for each match. Slow, but safe when you are editing something important.', 'Aakhir mein **c** jodo (`:%s/cat/dog/gc`) to vim har match par haan/na puchta hai. Dheema hai, par zaroori cheez edit karte waqt safe.'),
      H('Edit without an editor: sed and friends', 'Bina editor ke edit: sed aur dost'),
      P('Servers run scripts at 3 a.m., and scripts cannot press keys. For automatic edits you use commands. **sed -i** edits a file in place using the same s/old/new/ idea you just learned.', 'Servers raat 3 baje scripts chalate hain, aur scripts keys nahi dabate. Automatic edits ke liye commands use hote hain. **sed -i** file ko wahin edit karta hai, wahi s/old/new/ idea jo abhi seekha.'),
      CMD(['cp animals.txt animals.bak', 'sed -i "s/cat/tiger/g" animals.txt', 'diff animals.bak animals.txt | head -6'], 'Make a backup first, then replace in place. diff shows exactly what changed.', 'Pehle backup banao, phir wahin replace karo. diff dikhata hai ki kya badla.'),
      CMD(['echo "alias ll=\'ls -l\'" >> ~/.bashrc', 'tail -n 2 ~/.bashrc'], '>> appends one line to the end of a file. Perfect for adding a setting.', '>> file ke ant mein ek line jodta hai. Koi setting jodne ke liye perfect.'),
      CMD(['sed -i "/^$/d" notes.txt', 'sed -n "2,4p" notes.txt'], 'Delete empty lines, or print only lines 2 to 4.', 'Khali lines hatao, ya sirf line 2 se 4 print karo.'),
      CMD(['printf "line1\\nline2\\n" | sudo tee /tmp/demo.txt', 'cat /tmp/demo.txt'], 'tee writes to a file that needs root, which a plain > redirect cannot do (the redirect runs as YOU, not as sudo).', 'tee aisi file mein likhta hai jise root chahiye, jo simple > redirect nahi kar sakta (redirect TUM chalate ho, sudo nahi).'),
      H('Make your editor the default', 'Apna editor default banao'),
      P('Many programs (crontab -e, git commit, visudo) open "your editor". Which one is set by the **EDITOR** variable.', 'Kai programs (crontab -e, git commit, visudo) "tumhara editor" kholte hain. Kaunsa, ye **EDITOR** variable tay karta hai.'),
      CMD(['echo $EDITOR', 'export EDITOR=vim', 'echo $EDITOR'], 'Change it for this session. Put the export line in ~/.bashrc to make it permanent.', 'Is session ke liye badlo. Hamesha ke liye ~/.bashrc mein export line daalo.'),
      JOB('Rule of the road: never edit an important config directly without a backup, and for the sudoers file use **visudo**, which checks the syntax before saving. A typo in sudoers can lock everyone out. You will meet it again in the sudo lesson.', 'Sadak ka niyam: zaroori config ko bina backup ke seedha edit mat karo, aur sudoers file ke liye **visudo** use karo, jo save karne se pehle syntax check karta hai. Sudoers mein ek typo sabko bahar kar sakta hai. Sudo ke lesson mein phir milenge.'),
      H('Reading without editing: less', 'Bina edit kiye padhna: less'),
      TABLE(
        [
          ['less server.log', 'open a big file one screen at a time', 'badi file ek screen ek baar mein kholo'],
          ['space / b', 'page down / page up inside less', 'less ke andar page down / page up'],
          ['/ERROR  then  n', 'search inside less, jump to next match', 'less ke andar search, agle match par jao'],
          ['G  /  g', 'bottom / top of the file', 'file ka neeche / upar'],
          ['q', 'quit less', 'less se bahar'],
        ],
        'less keys',
        'less ke keys'
      ),
      FUN('vim was written by Bram Moolenaar, and its famous motto is charity: it asks users to help children in Uganda. Many people say the learning curve is a cliff, but those who climb it edit text faster than anyone.', 'vim Bram Moolenaar ne likha tha, aur iska mashhoor motto charity hai: ye users se Uganda ke bachchon ki madad karne ko kehta hai. Kai log kehte hain seekhna chadhai jaisa hai, par jo chadh jate hain wo sabse tez text edit karte hain.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['i  Esc', 'insert mode / back to normal', 'insert mode / wapas normal'],
        [':wq   :q!', 'save+quit / quit and discard', 'save+quit / quit aur discard'],
        ['dd  yy  p', 'delete, copy, paste a line', 'line delete, copy, paste'],
        ['u', 'undo', 'undo'],
        ['/text  n', 'search, next match', 'search, agla match'],
        [':%s/a/b/g', 'replace a with b everywhere', 'a ko b se har jagah badlo'],
        ['sed -i "s/a/b/g" f', 'the same, from a script', 'wahi, script se'],
        ['export EDITOR=vim', 'choose your editor', 'apna editor chuno'],
      ]),
    ],
    missions: [
      M('vim-m1', 'Write your first file with vi', 'vi se apni pehli file likho', 'Open  vi cheese.txt , press i, type a sentence that mentions cheese, press Esc, then type :wq and Enter to save and quit.', ' vi cheese.txt  kholo, i dabao, cheese ke baare mein ek sentence type karo, Esc dabao, phir :wq likhkar Enter dabao (save aur quit).', 'Remember the order: i, type, Esc, :wq, Enter.', 'Order yaad rakho: i, type, Esc, :wq, Enter.', (sh) => /cheese/i.test(LX.cat(sh, '~/cheese.txt')), ['vi cheese.txt'], { testSolve: ["echo 'I love cheese' > cheese.txt"] }),
      M('vim-m2', 'Replace everywhere', 'Har jagah badlo', 'Every "cat" in animals.txt must become "kitten". In vi use  :%s/cat/kitten/g  or, without an editor,  sed -i .', 'animals.txt mein har "cat" "kitten" ban jana chahiye. vi mein  :%s/cat/kitten/g  use karo ya bina editor ke  sed -i .', 'vi animals.txt, then :%s/cat/kitten/g and :wq. Or sed -i "s/cat/kitten/g" animals.txt', 'vi animals.txt, phir :%s/cat/kitten/g aur :wq. Ya sed -i "s/cat/kitten/g" animals.txt', (sh) => { const t = LX.cat(sh, '~/animals.txt'); return /kitten/.test(t) && !/cat/.test(t); }, ['sed -i "s/cat/kitten/g" animals.txt'], {}),
      M('vim-m3', 'Pick vim as your editor', 'vim ko apna editor banao', 'Set the EDITOR variable to vim for this session, so programs like crontab -e will use it.', 'Is session ke liye EDITOR variable ko vim par set karo, taaki crontab -e jaise programs ise use karein.', 'export EDITOR=vim', 'export EDITOR=vim', (sh) => sh.vars.EDITOR === 'vim', ['export EDITOR=vim'], {}),
    ],
    quiz: [
      mcq(1, 'In vim, which mode do you use to type text into the file?', 'vim mein file mein text type karne ke liye kaunsa mode hota hai?', ['Normal mode', 'Insert mode', 'Command mode only', 'Panic mode'], 1, 'Insert mode types letters. You enter it with i and leave it with Esc.', 'Insert mode letters type karta hai. i se andar aate ho aur Esc se bahar.'),
      mcq(2, 'You opened a file in vim by accident and changed things. How do you leave WITHOUT saving?', 'Galti se vim mein file khol di aur kuch badal diya. BINA save kiye kaise niklo?', ['Close the window', 'Press Esc, then type :q!', 'Type :wq', 'Press Ctrl+X'], 1, ':q! means quit and throw the changes away. Ctrl+X is nano, not vim.', ':q! ka matlab quit aur changes phenko. Ctrl+X nano hai, vim nahi.'),
      mcq(3, 'In normal mode, what does dd do?', 'Normal mode mein dd kya karta hai?', ['Deletes the current line', 'Duplicates the line', 'Moves down twice', 'Deletes the whole file'], 0, 'dd cuts the current line (and keeps it for pasting with p).', 'dd current line kaat deta hai (aur p se paste ke liye rakhta hai).'),
      cmd(4, 'Type the vim command (with the colon) that saves the file AND quits.', 'Wo vim command (colon ke saath) type karo jo file save kare AUR quit kare.', { verify: (sh, r, c) => /^(:wq!?|:x|ZZ|:xit)$/.test(c.trim()), sample: ':wq', alt: [':x', 'ZZ'], wrong: [':q!', ':q'], hintEn: 'w for write, q for quit.', hintHi: 'w matlab write, q matlab quit.' }, ':wq writes and quits. :x and ZZ do the same.', ':wq likhta hai aur quit karta hai. :x aur ZZ bhi yehi karte hain.'),
      mcq(5, 'You press yy and then move down and press p. What happened?', 'Tumne yy dabaya, phir neeche gaye aur p dabaya. Kya hua?', ['The line was deleted', 'The line was copied and pasted below the cursor', 'Vim quit', 'The word was changed'], 1, 'yy yanks (copies) the line, p pastes it after the current line.', 'yy line yank (copy) karta hai, p use current line ke baad paste karta hai.'),
      cmd(6, 'Make vim your default editor for this session by setting the right variable.', 'Sahi variable set karke vim ko is session ke liye default editor banao.', { verify: (sh) => sh.vars.EDITOR === 'vim', sample: 'export EDITOR=vim', alt: ['EDITOR=vim; export EDITOR'], wrong: ['echo $EDITOR'], hintEn: 'The variable name is EDITOR. Use export.', hintHi: 'Variable ka naam EDITOR hai. export use karo.' }, 'export EDITOR=vim makes programs that open an editor use vim.', 'export EDITOR=vim se editor kholne wale programs vim use karte hain.'),
      cmd(7, 'Type the vim command that replaces every "cat" with "dog" on all lines of the file.', 'Wo vim command type karo jo file ki saari lines mein har "cat" ko "dog" se badal de.', { verify: (sh, r, c) => /^:%s\/cat\/dog\/g$/.test(c.trim()), sample: ':%s/cat/dog/g', wrong: [':s/cat/dog/', ':%s/dog/cat/g'], hintEn: ': then %s / old / new / g', hintHi: ': phir %s / purana / naya / g' }, '% = all lines, s = substitute, g = every match on each line.', '% = saari lines, s = substitute, g = har line ka har match.'),
      cmd(8, 'Without an editor: in animals.txt change every "dog" into "puppy", in place.', 'Bina editor ke: animals.txt mein har "dog" ko "puppy" karo, wahin file mein.', { verify: (sh) => { const t = sh.readFile(sh.abs('~/animals.txt')); return /puppy/.test(t) && !/dog/.test(t); }, sample: 'sed -i "s/dog/puppy/g" animals.txt', alt: ["sed -i 's/dog/puppy/g' animals.txt"], wrong: ['sed "s/dog/puppy/g" animals.txt'], hintEn: 'sed with -i changes the file itself.', hintHi: 'sed ka -i file ko khud badalta hai.' }, '-i edits in place. Without it, sed only prints the result and the file stays the same.', '-i wahin edit karta hai. Iske bina sed sirf result print karta hai aur file waisi hi rehti hai.'),
      mcq(9, 'You want to jump to the very last line of a big file in vim. Which keys?', 'Badi file mein vim ki aakhri line par jaana hai. Kaunsi keys?', ['gg', 'G', '$', ':w'], 1, 'G (capital) goes to the last line. gg goes to the first.', 'G (capital) aakhri line par jata hai. gg pehli line par.'),
      cmd(10, 'Boss level: in todo.txt change "learn linux" to "master linux" in place, then show the file with cat in the same line.', 'Boss level: todo.txt mein "learn linux" ko "master linux" karo (wahin), phir usi line mein cat se file dikhao.', { verify: (sh, r) => { const t = sh.readFile(sh.abs('~/todo.txt')); return /master linux/.test(t) && !/learn linux/.test(t) && /master linux/.test(r.out); }, sample: 'sed -i "s/learn linux/master linux/" todo.txt && cat todo.txt', alt: ["sed -i 's/learn linux/master linux/' todo.txt; cat todo.txt"], wrong: ['cat todo.txt'], hintEn: 'sed -i first, then && cat.', hintHi: 'Pehle sed -i, phir && cat.' }, 'sed -i changes the file; && runs cat only if sed succeeded.', 'sed -i file badalta hai; && cat tabhi chalata hai jab sed safal ho.'),
    ],
  });
})();
