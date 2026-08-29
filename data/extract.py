#!/usr/bin/env python3
"""Extract all archive records from the legacy Next.js data chunk into
data/archive.json. Run from repo root: python3 data/extract.py
Sources:
  A. JSON module 45788 - 145 bilibili cut videos (route 09)
  B. JSON module 76044 - 70 daily photos
  C. daily-NNN literal objects - ~347 daily materials (route 08)
  D. s(...) calls - ~135 weibo/bilibili material entries (routes 02-07)
  E. audio arrays (voice clips + spoken quotes)
  F. remaining literal object arrays (fanmade covers, personality moments...)
Excluded on purpose: xiaohongshu discussion articles (used on ABOUT),
data-support/tutorial links (not archive media), merch card faces.
"""
import re, json, sys, os
from collections import Counter

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
js = open('_next/static/chunks/0hbd8ya4kl24-.js', encoding='utf-8').read()

records = []
seen = set()
DATE_IN = re.compile(r'(20\d\d)[.\-/](\d{1,2})[.\-/](\d{1,2})')

def norm_date(s):
    if not s:
        return None
    d = DATE_IN.search(s)
    return f'{d.group(1)}.{int(d.group(2)):02d}.{int(d.group(3)):02d}' if d else None

def add(rec):
    key = rec.get('local') or rec.get('url')
    if key and key in seen:
        return False
    if key:
        seen.add(key)
    records.append(rec)
    return True

def json_module(mid):
    m = re.search(str(mid) + r",\(e,i,t\)=>\{i\.exports=JSON\.parse\('", js)
    raw = js[m.end():js.find("')}", m.end())].replace("\\'", "'")
    return json.loads(raw)

# ---------- A. bilibili cuts ----------
for c in json_module(45788):
    add({'title': c['title'], 'date': c['date'].replace('-', '.'),
         'cat': c['category'], 'series': '瓜国大厨房 Cut', 'type': 'video',
         'url': c['url'], 'cover': c.get('cover'), 'source': 'B站 · 瓜国大厨房',
         'group': 'cuts'})

# ---------- B. daily photos ----------
for p in json_module(76044):
    add({'title': p['alt'].replace('魏子宸公开照片，来源 ', '返图 '),
         'date': p.get('date'), 'cat': '返图', 'series': '日常照片',
         'type': 'photo', 'url': p.get('sourceUrl'), 'local': p['src'],
         'cover': p['src'], 'source': p.get('source'), 'group': 'photos'})

# ---------- C. daily-NNN materials ----------
DAILY = re.compile(
    r'\{id:"daily-\d+",title:"((?:[^"\\]|\\.)*)",date:"([^"]*)",year:"[^"]*",'
    r'series:\[([^\]]*)\],url:"([^"]+)",theme:"([^"]+)"\}')
for m in DAILY.finditer(js):
    title, date, series_raw, url, theme = m.groups()
    series = re.findall(r'"((?:[^"\\]|\\.)*)"', series_raw)
    add({'title': title.replace('\\"', '"'), 'date': norm_date(date),
         'cat': series[0] if series else '日常', 'series': ' / '.join(series),
         'type': 'video', 'url': url, 'source': 'B站 · TF家族官方',
         'theme': theme, 'group': 'daily'})

# ---------- D. s(...) entries ----------
def parse_s_args(text, pos):
    args, depth, cur, instr = [], 0, '', False
    i = pos
    while i < len(text):
        ch = text[i]
        if instr:
            if ch == '\\':
                cur += text[i:i+2]; i += 2; continue
            if ch == '"':
                instr = False
            cur += ch
        else:
            if ch == '"':
                instr = True; cur += ch
            elif ch in '([{':
                depth += 1; cur += ch
            elif ch in ')]}':
                if depth == 0 and ch == ')':
                    args.append(cur.strip()); return args, i
                depth -= 1; cur += ch
            elif ch == ',' and depth == 0:
                args.append(cur.strip()); cur = ''
            else:
                cur += ch
        i += 1
    return args, i

def unq(a):
    return a[1:-1].replace('\\"', '"') if a.startswith('"') and a.endswith('"') else a

for m in re.finditer(r'\bs\((\d+),"', js):
    args, _ = parse_s_args(js, m.start() + 2)
    if len(args) < 8:
        continue
    num, platform, cat, title, url, author, arg7 = [unq(a) for a in args[:7]]
    tags = re.findall(r'"((?:[^"\\]|\\.)*)"', args[7]) if args[7].startswith('[') else []
    date = norm_date(title) or norm_date(arg7)
    series = '' if DATE_IN.fullmatch(arg7 or '') else arg7
    cover = None
    for a in args[8:]:
        v = unq(a)
        if v.startswith('/covers/') and os.path.exists(v[1:]):
            cover = v
            break
    add({'title': title, 'date': date, 'cat': cat, 'series': series,
         'type': 'video', 'url': url, 'cover': cover, 'source': f'{platform} · {author}',
         'tags': tags, 'group': 's'})

# ---------- E. audio ----------
GOBJ = re.compile(r'\{((?:[a-zA-Z]+:"(?:[^"\\]|\\.)*",?)+)\}')
PAIR = re.compile(r'([a-zA-Z]+):"((?:[^"\\]|\\.)*)"')
for m in GOBJ.finditer(js):
    kv = dict(PAIR.findall(m.group(1)))
    if kv.get('src', '').startswith('/audio/'):
        add({'title': kv.get('title', '语音'), 'date': None, 'cat': '语音',
             'series': '声音记录', 'type': 'audio', 'url': kv.get('url'),
             'local': kv['src'], 'source': kv.get('source', ''), 'group': 'audio'})
    elif kv.get('audioSrc', '').startswith('/audio/') and 'text' in kv:
        t = kv['text'].replace('\\"', '"')
        add({'title': t[:38] + ('…' if len(t) > 38 else ''), 'text': t,
             'date': None, 'cat': '语录', 'series': '声音记录', 'type': 'audio',
             'url': kv.get('url'), 'local': kv['audioSrc'],
             'source': kv.get('source', ''), 'group': 'quotes'})

# ---------- F. remaining literal arrays, grouped by adjacency ----------
EXCLUDE_T = re.compile(r'超话|BOT|速成|打投|控评|捞捞|净化|空瓶')
groups, cur, last_end = [], None, -10
for m in GOBJ.finditer(js):
    kv = dict(PAIR.findall(m.group(1)))
    if m.start() - last_end > 3 or cur is None:
        cur = {'start': m.start(), 'items': []}
        groups.append(cur)
    cur['items'].append(kv)
    cur['end'] = m.end()
    last_end = m.end()

for g in groups:
    items = g['items']
    if len(items) < 3:
        continue
    tail = js[g['end']:g['end'] + 260]
    fanmade = 'growth-covers' in tail
    urls = [kv.get('url', '') for kv in items]
    # account directories / tutorial link groups are not archive media
    if sum('weibo.com/u/' in u for u in urls) > len(items) / 2:
        continue
    titles_all = ' '.join(kv.get('title', '') for kv in items)
    if EXCLUDE_T.search(titles_all):
        continue
    # dou-yin interaction (fansa) collection: many douyin links, fan-name titles
    fansa = (not fanmade and len(items) >= 20
             and sum('douyin.com' in u for u in urls) > len(items) * 0.8)
    for idx, kv in enumerate(items):
        url = kv.get('url', '')
        if not url.startswith('http'):
            continue
        if 'eyebrow' in kv or 'summary' in kv:          # discussions -> ABOUT
            continue
        if 'src' in kv or 'audioSrc' in kv:             # audio handled above
            continue
        title = kv.get('title') or kv.get('song') or kv.get('name') or ''
        if not title:
            continue
        if fanmade:
            cat, series = '饭制', '饭制成长向'
        elif fansa:
            cat, series = '饭撒', '互动请求合集'
            title = f'饭撒 · {title}'
        else:
            cat = kv.get('category') or '物料'
            series = kv.get('category') or kv.get('platform', '物料')
        cover = kv.get('cover')
        if fanmade and not cover:
            p = f'growth-covers/growth-{idx+1:02d}.jpg'
            cover = '/' + p if os.path.exists(p) else None
        add({'title': title.replace('\\"', '"'), 'date': norm_date(title + kv.get('detail', '')),
             'cat': cat, 'series': series, 'type': 'video', 'url': url, 'cover': cover,
             'source': kv.get('source') or kv.get('platform', ''),
             'group': 'fanmade' if fanmade else ('fansa' if fansa else f'lit{len(items)}')})

# ---------- classify ----------
def classify(r):
    if r['type'] == 'photo':
        return 'PHOTO'
    if r['type'] == 'audio':
        return 'VOICE'
    hay = ' '.join([r.get('cat', ''), r.get('series', ''), r.get('theme', ''),
                    ' '.join(r.get('tags', [])), r['title']])
    if re.search(r'五公|舞台|随舞|歌曲|见面会|饭撒|演出|音乐节|路演|汇演|cover|唱跳', hay):
        return 'STAGE'
    if re.search(r'考核|练习|训练|成长|纪录|企划|综|专题|星期五|考古|饭制|突围|梦工厂|long-running|features|milestones', hay):
        return 'VARIETY'
    return 'DAILY'

for r in records:
    r['cls'] = classify(r)

# merge fetched bilibili covers (data/covers-cache.json, built by enrich_covers.py)
try:
    cache = json.load(open('data/covers-cache.json'))
except Exception:
    cache = {}
for r in records:
    if not r.get('cover') and r.get('url'):
        m = re.search(r'bilibili\.com/video/(BV\w+)', r['url'])
        if m and cache.get(m.group(1)):
            r['cover'] = cache[m.group(1)]

records.sort(key=lambda r: (r.get('date') or '9999', r.get('series') or '', r['title']))
for i, r in enumerate(records, 1):
    r['id'] = f'{i:04d}'

json.dump({'total': len(records), 'records': records},
          open('data/archive.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('total:', len(records), file=sys.stderr)
print('by group:', Counter(r['group'] for r in records), file=sys.stderr)
print('by cls:', Counter(r['cls'] for r in records), file=sys.stderr)
print('dated:', sum(1 for r in records if r.get('date')), file=sys.stderr)
print('with cover:', sum(1 for r in records if r.get('cover')), file=sys.stderr)
