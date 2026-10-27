import glob, os
order = ['sim-fs', 'sim-core', 'sim-help', 'cmds-files', 'cmds-text', 'cmds-sys', 'cmds-shell2', 'ext-sys1', 'ext-storage', 'ext-systemd', 'ext-net', 'ext-web', 'ext-sec', 'ext-git', 'ext-py', 'ext-pylib', 'ext-dev', 'ext-docker', 'ext-ansible', 'ext-misc', 'ext-time', 'ext-pkg', 'ext-hard', 'ext-lsm', 'ext-perf', 'ext-boot', 'ext-backup', 'ext-db', 'ext-shell', 'ext-git2', 'ext-cloud', 'ext-terraform', 'term-ui', 'vim', 'content-api']
js = [open(f'js/{n}.js').read() for n in order]
js += [open(f).read() for f in sorted(glob.glob('js/lessons/*.js'))]
js.append(open('js/app.js').read())
code = '\n'.join(js)
assert '</script' not in code.lower()
css = open('css/style.css').read()
title = '<title>Linux Academy</title>'
body = f'''{title}
<meta name="claude:viewport-fit-sides" content="cover">
<style>
{css}
</style>
<div id="app"></div>
<script>
{code}
</script>
'''
os.makedirs('dist', exist_ok=True)
open('dist/artifact.html','w').write(body)
full = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{title}
<style>html{{color-scheme:light}}body{{margin:0}}</style>
<style>
{css}
</style>
</head>
<body>
<div id="app"></div>
<script>
{code}
</script>
</body>
</html>
'''
open('dist/linux-academy.html','w').write(full)
print(len(body)//1024, 'KB')
