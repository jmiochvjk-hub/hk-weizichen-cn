#!/usr/bin/env python3
"""Fetch real bilibili cover URLs for archive records that lack one.
Writes data/covers-cache.json (bvid -> cover url); extract.py merges it.
Run from repo root. Re-runnable: already-cached bvids are skipped."""
import json, re, time, os, sys, urllib.request

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
arch = json.load(open('data/archive.json'))
try:
    cache = json.load(open('data/covers-cache.json'))
except Exception:
    cache = {}

todo = []
for r in arch['records']:
    if r.get('cover') or not r.get('url'):
        continue
    m = re.search(r'bilibili\.com/video/(BV\w+)', r['url'])
    if m and m.group(1) not in cache:
        todo.append(m.group(1))
todo = list(dict.fromkeys(todo))
print(f'{len(todo)} covers to fetch', flush=True)

for i, bv in enumerate(todo):
    try:
        req = urllib.request.Request(
            'https://api.bilibili.com/x/web-interface/view?bvid=' + bv,
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                     'Referer': 'https://www.bilibili.com/'})
        d = json.load(urllib.request.urlopen(req, timeout=10))
        pic = (d.get('data') or {}).get('pic')
        if d.get('code') == 0 and pic:
            cache[bv] = pic.replace('http://', 'https://')
        else:
            cache[bv] = None          # remember misses so we don't re-ask
    except Exception as e:
        print(bv, 'ERR', e, flush=True)
        time.sleep(2)
    if i % 25 == 0:
        print(f'{i}/{len(todo)}', flush=True)
        json.dump(cache, open('data/covers-cache.json', 'w'))
    time.sleep(0.35)

json.dump(cache, open('data/covers-cache.json', 'w'))
ok = sum(1 for v in cache.values() if v)
print(f'done: {ok} covers cached, {len(cache) - ok} misses', flush=True)
