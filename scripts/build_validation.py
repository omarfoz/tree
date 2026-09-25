"""Build data/name-validation.json from the live validation evidence.

Verdict rules:
- 'verified'   : tree search found the exact spelling; our spelling matches the tree label
- 'corrected'  : our spelling not found, but a variant was found and confirmed -> we fix ours
- 'reverted'   : our spelling was a previous wrong "correction"; tree proves original was right
- 'removed'    : proven not a name (tree finds nothing under any reasonable variant)
- 'needs_review': ambiguous
"""
import json, re
from datetime import datetime, timezone

raw = json.load(open('C:/Users/Admin/AppData/Local/Temp/opencode/validation-raw.json', encoding='utf-8'))
names = json.load(open('data/names.json', encoding='utf-8'))['entityFrequency']
phase2 = json.load(open('C:/Users/Admin/AppData/Local/Temp/opencode/phase2.json', encoding='utf-8'))

# Tree label canonical spelling where the search result displays it.
# The rbar shows "١ / ١٣ · عبدالمجيد" — the label of the CURRENT mark, which is the
# exact label text from the tree (d field, tatweel-stripped).
results = []

for n in names:
    text = n['text']
    r = raw.get(text, {})
    entry = {
        'current': text,
        'searched': text,
        'count': n['count'],
    }
    if r.get('error'):
        entry['status'] = 'needs_review'
        entry['confidence'] = 'low'
        entry['note'] = 'automation error: ' + r['error']
    elif r.get('found') is False:
        # not found under our spelling -> known cases
        if text == 'أحلام':
            v = phase2.get('أحالم', {})
            entry.update({
                'searched_variants': ['أحلام', 'أحالم'],
                'treeLabel': v.get('label'),
                'treeCount': v.get('total'),
                'status': 'reverted',
                'confidence': 'high',
                'note': 'أحلام not on tree (0 results); أحالم found 1/1. Previous correction أحالم->أحلام was wrong; restoring أحالم.',
            })
        elif text == 'إيلان':
            v = phase2.get('إيالن', {})
            entry.update({
                'searched_variants': ['إيلان', 'إيالن'],
                'treeLabel': v.get('label'),
                'treeCount': v.get('total'),
                'status': 'reverted',
                'confidence': 'high',
                'note': 'إيلان not on tree (0 results); إيالن found 1/1. Previous correction إيالن->إيلان was wrong; restoring إيالن.',
            })
        else:
            entry['status'] = 'needs_review'
            entry['confidence'] = 'low'
    else:
        tree_total = r.get('total')
        tree_label = r.get('label')
        if tree_label and tree_label != text:
            # tree shows a different canonical spelling in its result bar
            entry['treeLabel'] = tree_label
            entry['treeCount'] = tree_total
            # عبد المجيد -> عبدالمجيد : tree stores as single word
            entry['status'] = 'corrected'
            entry['confidence'] = 'high'
            entry['note'] = f'Tree label is "{tree_label}" (tree stores it without space). Merging/aligning spelling to tree.'
        else:
            entry['status'] = 'verified'
            entry['confidence'] = 'high'
            entry['treeCount'] = tree_total
            # count semantics differ (tree counts token matches); only flag big gaps
            if tree_total is not None and isinstance(tree_total, int) and tree_total < n['count']:
                entry['status'] = 'needs_review'
                entry['confidence'] = 'medium'
                entry['note'] = f'Tree search reports {tree_total} but our extraction counted {n["count"]}.'
    results.append(entry)

out = {
    'source': 'https://tree.alswailem.app/family-tree',
    'viewer': 'https://tree.alswailem.app/tree-viewer/v10.html',
    'validatedAt': datetime.now(timezone.utc).isoformat(),
    'method': "Searched each unique name from data/names.json in the original tree viewer's built-in search (Playwright automation). The viewer's result counter (e.g. '1 / 1') and displayed label are the source of truth. Tree search matches whole labels or word tokens with space-stripping normalization, so tree totals can exceed exact-text counts.",
    'summary': {},
    'results': results,
}

from collections import Counter
sc = Counter(r['status'] for r in results)
out['summary'] = dict(sc)

json.dump(out, open('data/name-validation.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(json.dumps(out['summary'], ensure_ascii=False, indent=1))
for r in results:
    if r['status'] != 'verified':
        print(r['status'], '|', r['current'], '|', r.get('treeLabel'), '|', r.get('note', '')[:90])
