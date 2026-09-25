"""
Validate every name in data/names.json against the ORIGINAL live tree search.
Uses the tree viewer's own search engine (#q input) and result counter (#rbar/#rtxt)
as the source of truth — no OCR, no guessing.

Outputs: validation-raw.json with per-name evidence.
"""
import json, re, sys, time, unicodedata
from playwright.sync_api import sync_playwright

URL = 'https://tree.alswailem.app/tree-viewer/v10.html'
NAMES_PATH = 'data/names.json'
OUT_PATH = 'C:/Users/Admin/AppData/Local/Temp/opencode/validation-raw.json'

AR_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')

def parse_rtxt(text):
    """Parse result counter text like '١ / ١ · رغدة' or '٢١٥ نتيجة' or 'لا توجد نتائج'."""
    t = text.strip().translate(AR_DIGITS)
    if 'لا توجد نتائج' in text:
        return {'found': False, 'idx': None, 'total': 0, 'label': None}
    m = re.match(r'(\d+)\s*/\s*(\d+)\s*·\s*(.+)$', t)
    if m:
        return {'found': True, 'idx': int(m.group(1)), 'total': int(m.group(2)), 'label': m.group(3).strip()}
    m2 = re.match(r'(\d+)\s+نتيجة', t)
    if m2:
        return {'found': True, 'idx': None, 'total': int(m2.group(1)), 'label': None}
    return {'found': None, 'idx': None, 'total': None, 'label': None}

def main():
    names = json.load(open(NAMES_PATH, encoding='utf-8'))['entityFrequency']
    todo = [n['text'] for n in names]
    print(f'validating {len(todo)} names')

    results = {}
    p = sync_playwright().start()
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1280, 'height': 900})
    pg.goto(URL, timeout=180000)
    pg.wait_for_timeout(6000)

    for i, name in enumerate(todo):
        for attempt in range(3):
            try:
                pg.fill('#q', name)
                # wait until rbar settles (class contains 'on' and text non-empty)
                pg.wait_for_timeout(1800)
                rtxt = pg.locator('#rtxt').inner_text()
                rcls = pg.locator('#rbar').get_attribute('class') or ''
                parsed = parse_rtxt(rtxt)
                results[name] = {
                    'searched': name,
                    'rbarClass': rcls,
                    'rtxt': rtxt.strip(),
                    'found': parsed['found'],
                    'total': parsed['total'],
                    'label': parsed['label'],
                }
                break
            except Exception as e:
                if attempt == 2:
                    results[name] = {'searched': name, 'error': str(e)[:200]}
                else:
                    pg.wait_for_timeout(3000)
        if i % 25 == 0:
            print(f'{i}/{len(todo)} done', flush=True)
            json.dump(results, open(OUT_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    json.dump(results, open(OUT_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    b.close(); p.stop()
    found = sum(1 for r in results.values() if r.get('found'))
    nf = sum(1 for r in results.values() if r.get('found') is False)
    err = sum(1 for r in results.values() if 'error' in r)
    print(f'DONE: found={found} notfound={nf} errors={err}')

if __name__ == '__main__':
    main()
