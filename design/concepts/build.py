"""Inline the logo and any shared scripts into each concept so every file stands alone."""
import pathlib, re
here = pathlib.Path(__file__).parent
logo = 'data:image/png;base64,' + (here / 'logo.b64').read_text().strip()
include = re.compile(r'/\*@include ([^*]+)\*/')
for src in sorted((here / 'src').glob('*.html')):
    text = include.sub(lambda m: '\n'.join((here / 'src' / p).read_text() for p in m.group(1).split()), src.read_text())
    (here / src.name).write_text(text.replace('__LOGO__', logo))
    print('built', src.name)
