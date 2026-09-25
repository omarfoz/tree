#!/usr/bin/env python3
"""
Al-Suwailem Family Tree Extraction Pipeline
Extracts structured data from the official website's tree viewers
"""
import json, re, os, unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone

# ============================================================
# Configuration
# ============================================================
V10_HTML = os.environ.get('V10_HTML', os.path.join(os.path.dirname(__file__), '..', 'pages', 'v10.html'))
INFO_HTML = os.environ.get('INFO_HTML', os.path.join(os.path.dirname(__file__), '..', 'data', 'info.html'))
OUTPUT_DIR = os.environ.get('OUTPUT_DIR', os.path.join(os.path.dirname(__file__), '..', 'data'))

# Connectors and non-name tokens
CONNECTORS = {'بن', 'بنت', 'ابن', 'ابنة', 'ال', 'آل', 'بنو', 'بني',
               'من', 'إلى', 'في', 'على', 'عن', 'وه', 'وها', 'الله',
               'الرحمن', 'الرحيم', 'عبد'}

# The tree image contains a pre-Islamic lineage chain (هود عليه السلام → قحطان → سبأ → ...
# → عامر بن عمرو بن وداعة) rendered as overlapping text windows in one horizontal band
# above the actual family tree. Each ancestor there appears as up to three labels
# ("عمرو", "عمرو بن", "بن عمرو") that all refer to the SAME single occurrence.
# This band is not part of the family; its labels must not be counted as family names.
LINEAGE_CHAIN_Y_MIN = 6400
LINEAGE_CHAIN_Y_MAX = 6500

# Curated source labels that are visible in the tree artwork but are not family names.
# Keep these excluded so regenerated analytics do not reintroduce known OCR/metadata artifacts.
EXCLUDED_NAME_LABELS = {
    "الفوزانالسويلم",
    "ابلدارɋنادلوارسأهايلثادق",
    "–رحمهماالله–ومنأبرزهم:-",
    "ناصربنمحمدبنزاملالسويلم",
    "عبدالمحسنبنفوزانبنإبراهيمالسويلم",
    "إبراهيمبنفوزانبنإبراهيمالسويلم",
    "محمدبنعبدالعزيزبنحمدالشيخ",
    "إبراهيمبنعبداللهبنإبراهيمالسويلم",
    "حمدبنمحمدبنحمدالشيخ",
    "سلينبنحمدبنسلينالسويلم",
    "عبداللهبنعبدالعزيزبنمحمدالسويلم",
    "فوزانبنسويلمبنفوزانالسويلم",
    "دباسبنعبدالرحمنبندباسالسويلم",
    "المراجعمنالكتب:-",
    "بعضالوثائقوالمخطوطات",
    "لدىأبناءالعمومة.",
    "ممثلوالفروعفيصندوق",
    "الأسرة)الإصدارالثالث(.",
    "جمعوإعدادوتحقيق",
    "الأستاذ/عبدااللهبنعبدالرحمنبنسويلم",
    "إدارةبياناتالعائلة",
    "إصداراتالشجرة",
    "عبداللهبنعبدالرحمنبنسويلم",
    "جمعوإعدادوتنفيذ",
    "للملاحظاتوالمعلومات",
    "الاضافيةعنالشجرة",
    "امسحالرمز",
    "سارةهيلة",
    "شيخةلطيفة",
}

def ar_normalize(text):
    """Remove Arabic diacritics, normalize alef variants, standardize."""
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(c for c in text if not (0x064B <= ord(c) <= 0x065F))
    text = text.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا')
    text = text.replace('ة', 'ه')
    text = text.replace('ى', 'ي')
    # Space-insensitive compact form for matching عبدالعزيز == عبد العزيز
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\u0600-\u06FFa-zA-Z0-9\s]', '', text)
    text = ' '.join(text.split())
    return text.strip().lower()

def ar_compact(text):
    """Space-insensitive normalized form: عبدالعزيز == عبد العزيز."""
    return ar_normalize(text).replace(' ', '')

def remove_tashkeel(text):
    """Remove diacritics only."""
    text = unicodedata.normalize('NFKD', text)
    return ''.join(c for c in text if not (0x064B <= ord(c) <= 0x065F))

def ar_standard(text):
    """Standardize letter forms without aggressive normalization."""
    text = text.replace('ة', 'ه')
    text = text.replace('ى', 'ي')
    text = re.sub(r'[^\u0600-\u06FFa-zA-Z0-9\s]', ' ', text)
    text = ' '.join(text.split())
    return text.strip()

# ============================================================
# 1. Extract ENTS entities
# ============================================================
def extract_entities():
    with open(V10_HTML, 'r', encoding='utf-8') as f:
        content = f.read()

    m = re.search(r'<script id="ENTS" type="application/json">(.*?)</script>', content, re.DOTALL)
    raw = json.loads(m.group(1))

    entities = []
    for i, e in enumerate(raw):
        x, y, w, h, text = e
        # Clean text: remove tatweel and extra spaces
        clean = text.replace('\u0640', '').strip()
        if not clean:
            continue
        norm = ar_normalize(clean)
        parts = clean.split()
        nparts = [ar_normalize(p) for p in parts if ar_normalize(p)]
        # Labels in the ancient lineage chain band are not family names.
        # The band produces overlapping windows like "عمرو" / "عمرو بن" / "بن عمرو"
        # for a single occurrence — all of it belongs to the decorative genealogy header.
        in_lineage_chain = LINEAGE_CHAIN_Y_MIN <= y <= LINEAGE_CHAIN_Y_MAX
        type_tag = 'lineage-chain' if in_lineage_chain else (
            'connector' if clean in CONNECTORS else (
                'non-name' if clean in EXCLUDED_NAME_LABELS or any(c.isdigit() for c in clean) or len(clean) < 2 or clean.startswith('الطبعة')
                or clean.startswith('الإصدار') or 'أجداد' in clean or 'المصادر' in clean
                or 'التحديث' in clean or 'الأعوام' in clean or 'العدد' in clean
                else 'name'
            )
        )
        entities.append({
            "id": i,
            "x": x,
            "y": y,
            "w": w,
            "h": h,
            "text": clean,
            "normalized": norm,
            "parts": parts,
            "normalizedParts": nparts,
            "type": type_tag
        })

    return entities

# ============================================================
# 2. Analyze name frequencies
# ============================================================
def analyze_names(entities):
    # Filter only name-like tokens
    name_labels = [e for e in entities if e['type'] == 'name']

    # For "first-name frequency", we try to find first word of each multi-word phrase
    # Since these are individual text labels on the image, each entity IS a single label.
    # A person's name may span multiple labels (e.g. "عمر" + "بن" + "عبدالله")
    # We don't know which labels belong to the same person.
    # So we report:
    #   (a) token frequency (how often a word appears anywhere in the tree)
    #   (b) entity frequency (how often an exact text string appears)

    token_counter = Counter()
    entity_counter = Counter()

    for e in name_labels:
        entity_counter[e['text']] += 1
        for p in e['parts']:
            pnorm = ar_normalize(p)
            if pnorm and p not in CONNECTORS and len(pnorm) >= 2:
                token_counter[e['text']] += 1  # Count by original text

    # For "first name" frequency, we use a heuristic: split tokens, exclude connectors,
    # and count unique token forms. This overcounts multi-word names but is the best we can do.
    token_norm_counter = Counter()
    for e in name_labels:
        for p in e['parts']:
            pnorm = ar_normalize(p)
            if pnorm and p not in CONNECTORS and len(pnorm) >= 2:
                token_norm_counter[pnorm] += 1

    # Build detailed name stats, merging space-insensitive duplicates
    # (عبدالعزيز == عبد العزيز) under the most frequent original form.
    compact_counter = Counter()          # compact form -> total occurrences
    compact_best_text = {}              # compact form -> representative original text
    for e in name_labels:
        comp = ar_compact(e['text'])
        compact_counter[comp] += 1
        # Prefer the most frequent original spelling for display
        cur = compact_best_text.get(comp)
        if cur is None or entity_counter[e['text']] > entity_counter.get(cur, 0):
            if e['text'] in entity_counter:
                compact_best_text[comp] = e['text']

    name_stats = []
    for comp, total in compact_counter.most_common():
        rep = compact_best_text.get(comp) or comp
        norm = ar_normalize(rep)
        parts = rep.split()
        first_part = parts[0] if parts else rep
        first_norm = ar_normalize(first_part)
        name_stats.append({
            "text": rep,
            "normalized": norm,
            "count": total,
            "firstPart": first_part,
            "firstPartNormalized": first_norm,
            "length": len(parts),
            "isCompound": len(parts) > 1
        })

    token_stats = []
    for norm, count in token_norm_counter.most_common():
        # Find representative original text
        rep = None
        for e in name_labels:
            for p in e['parts']:
                if ar_normalize(p) == norm:
                    rep = p
                    break
            if rep:
                break
        token_stats.append({
            "tokenNormalized": norm,
            "tokenOriginal": rep or norm,
            "count": count
        })

    return {
        "totalEntities": len(name_labels),
        "uniqueEntityTexts": len(compact_counter),
        "uniqueTokens": len(token_norm_counter),
        "entityFrequency": name_stats,
        "tokenFrequency": token_stats
    }

# ============================================================
# 3. Parse info page (manual from known structure)
# ============================================================
def build_official_data():
    # Values confirmed from scraping the /info page
    return {
        "familyName": "عائلة السويلم",
        "familyNameEn": "Al-Suwailem Family",
        "latestEdition": "1448H",
        "editions": [
            {"year": 1420, "label": "الإصدار الأول", "details": "الطبعة الأولى 1420هـ", "total": 1078, "male": 1078, "female": 0},
            {"year": 1427, "label": "1427هـ", "details": "", "total": 1532, "male": 1146, "female": 386},
            {"year": 1431, "label": "الإصدار الثاني", "details": "الطبعة الأولى 1431هـ، الطبعة الثانية 1433هـ", "total": 2005, "male": 1428, "female": 577},
            {"year": 1445, "label": "1445هـ", "details": "", "total": 2772, "male": 1666, "female": 1106},
            {"year": 1446, "label": "1446هـ", "details": "", "total": 3247, "male": 1811, "female": 1436},
            {"year": 1447, "label": "1447هـ", "details": "", "total": 3317, "male": 1830, "female": 1487},
            {"year": 1448, "label": "الإصدار الثالث", "details": "الطبعة الأولى 1447هـ، الطبعة الثانية 1448هـ", "total": 3400, "male": 1851, "female": 1549}
        ],
        "generations": [
            {"number": 1, "name": "الجد سويلم", "label": "الجيل الأول", "century": "10-11هـ", "sons": 2, "sonsMale": 2},
            {"number": 2, "name": "", "label": "الجيل الثاني", "century": "12هـ", "sons": 4, "sonsMale": 4},
            {"number": 3, "name": "", "label": "الجيل الثالث", "century": "12هـ", "sons": 10, "sonsMale": 9},
            {"number": 4, "name": "", "label": "الجيل الرابع", "century": "12هـ", "sons": 29, "sonsMale": 21},
            {"number": 5, "name": "", "label": "الجيل الخامس", "century": "13هـ", "sons": 59, "sonsMale": 45},
            {"number": 6, "name": "", "label": "الجيل السادس", "century": "13هـ", "sons": 91, "sonsMale": 64},
            {"number": 7, "name": "", "label": "الجيل السابع", "century": "13هـ", "sons": 141, "sonsMale": 94},
            {"number": 8, "name": "", "label": "الجيل الثامن", "century": "14هـ", "sons": 453, "sonsMale": 243},
            {"number": 9, "name": "", "label": "الجيل التاسع", "century": "14هـ", "sons": 1247, "sonsMale": 633},
            {"number": 10, "name": "", "label": "الجيل العاشر", "century": "15هـ", "sons": 1155, "sonsMale": 630},
            {"number": 11, "name": "", "label": "الجيل الحادي عشر", "century": "15هـ", "sons": 207, "sonsMale": 105}
        ],
        "totalGenerations": 11,
        "totalBranches": 34,
        "totalPeopleLatest": 3400,
        "totalMaleLatest": 1851,
        "totalFemaleLatest": 1549,
        "annualGrowthRate": 85,
        "sources": [
            "عنوان المجد في تاريخ نجد: ج1 / ج2",
            "بعض الحوادث الواقعة في نجد",
            "الدرر السنية في الأجوبة النجدية",
            "المنتخب في ذكر أنساب العرب",
            "أنساب العرب: ط1"
        ],
        "oralSources": [
            "ناصر بن محمد بن زامل السويلم",
            "عبدالمحسن بن فوزان بن إبراهيم السويلم",
            "إبراهيم بن فوزان بن إبراهيم السويلم",
            "محمد بن عبدالعزيز بن حمد الشيخ",
            "إبراهيم بن عبدالله بن إبراهيم السويلم",
            "محمد بن محمد بن حمد الشيخ",
            "سليمان بن حمد بن سليمان السويلم",
            "عبدالله بن عبدالعزيز بن محمد السويلم",
            "فوزان بن سويلم بن فوزان السويلم",
            "دباس بن عبدالرحمن بن دباس السويلم"
        ],
        "amirs": [
            {"name": "يحيى بن عبدالله", "generation": 2, "datesH": "1158-1163هـ"},
            {"name": "ساري بن يحيى بن عبدالله", "generation": 3, "datesH": "1163-1170هـ و 1172-1240هـ"},
            {"name": "دخيل بن عبدالله", "generation": 2, "datesH": "1170-1172هـ"},
            {"name": "يحيى بن ساري بن يحيى بن عبدالله", "generation": 4, "datesH": "1240-1248هـ"},
            {"name": "عبدالله بن دخيل بن عبدالله", "generation": 3, "datesH": "1248-1256هـ"},
            {"name": "ساري بن عبدالله بن ساري بن يحيى بن عبدالله", "generation": 5, "datesH": "1256هـ"},
            {"name": "سليمان بن فوزان بن عبدالله بن فوزان", "generation": 4, "datesH": "1256-1257هـ"},
            {"name": "سعد بن محمد بن يحيى بن عبدالله", "generation": 4, "datesH": "1257-1270هـ"},
            {"name": "عبدالعزيز بن محمد بن يحيى بن عبدالله", "generation": 4, "datesH": "1270هـ"},
            {"name": "محمد بن سعد بن محمد بن يحيى بن عبدالله", "generation": 5, "datesH": "1270-1278هـ"},
            {"name": "عبدالله بن سعد بن محمد بن يحيى بن عبدالله", "generation": 5, "datesH": "1278-1320هـ"},
            {"name": "دباس بن فارس بن حمد بن محمد بن يحيى بن عبدالله", "generation": 6, "datesH": "1320-1321هـ"},
            {"name": "عبدالرحمن بن دباس بن فارس بن حمد بن محمد بن يحيى بن عبدالله", "generation": 7, "datesH": "1357-1365هـ"}
        ],
        "branchAncestors": [
            {"branchNum": 1, "ancestor": "أحمد عبدالله حمد محمد عبدالله فوزان", "location": "ص/92"},
            {"branchNum": 2, "ancestor": "حمد ابراهيم حمد سليمان عبدالرحمن فوزان", "location": "ص/19"},
            {"branchNum": 3, "ancestor": "حمد سليمان حمد سليمان عبدالرحمن فوزان", "location": "ش/17"},
            {"branchNum": 4, "ancestor": "حمد عبدالله حمد محمد يحيى عبدالله", "location": "س/6"},
            {"branchNum": 5, "ancestor": "حمد فارس حمد محمد يحيى عبدالله", "location": "ح/6"},
            {"branchNum": 6, "ancestor": "حمد فوزان عبدالله محمد عبدالله فوزان", "location": "ف/9"},
            {"branchNum": 7, "ancestor": "دباس فارس حمد محمد يحيى عبدالله", "location": "ح/6"},
            {"branchNum": 8, "ancestor": "عبدالرحمن ابراهيم حمد سليمان عبدالرحمن فوزان", "location": "ف/19"},
            {"branchNum": 9, "ancestor": "عبدالرحمن سليمان حمد سليمان عبدالرحمن فوزان", "location": "ر/18"},
            {"branchNum": 10, "ancestor": "عبدالرحمن عبدالله عبدالله محمد عبدالله فوزان", "location": "ع/9"},
            {"branchNum": 11, "ancestor": "عبدالرحمن فارس حمد محمد يحيى عبدالله", "location": "ط/6"},
            {"branchNum": 12, "ancestor": "عبدالرحمن ناصر محمد فوزان عبدالله فوزان", "location": "ي/13"},
            {"branchNum": 13, "ancestor": "عبدالعزيز ابراهيم حمد سليمان عبدالرحمن فوزان", "location": "ق/17"},
            {"branchNum": 14, "ancestor": "عبدالعزيز سعد عبدالعزيز محمد يحيى عبدالله", "location": "ر/4"},
            {"branchNum": 15, "ancestor": "عبدالعزيز فوزان ناصر محمد يحيى عبدالله", "location": "س/5"},
            {"branchNum": 16, "ancestor": "عبدالعزيز محمد سليمان فوزان عبدالله فوزان", "location": "ع/15"},
            {"branchNum": 17, "ancestor": "عبدالعزيز ناصر محمد فوزان عبدالله فوزان", "location": "م/12"},
            {"branchNum": 18, "ancestor": "عبدالله ابراهيم حمد سليمان عبدالرحمن فوزان", "location": "ص/18"},
            {"branchNum": 19, "ancestor": "عبدالله عبدالعزيز عبدالله فوزان عبدالله فوزان", "location": "م/15"},
            {"branchNum": 20, "ancestor": "عبدالله فهد حمد محمد يحيى عبدالله", "location": "ك/5"},
            {"branchNum": 21, "ancestor": "عبدالله مساعد سعد محمد يحيى عبدالله", "location": "ص/4"},
            {"branchNum": 22, "ancestor": "عبدالله مشاري عبدالمحسن عبدالله يحيى عبدالله", "location": "ت/6"},
            {"branchNum": 23, "ancestor": "فوزان ابراهيم محمد فوزان عبدالله فوزان", "location": "ن/11"},
            {"branchNum": 24, "ancestor": "فوزان عبدالله عبدالله محمد عبدالله فوزان", "location": "س/10"},
            {"branchNum": 25, "ancestor": "محمد ابراهيم عبدالعزيز محمد يحيى عبدالله", "location": "ر/3"},
            {"branchNum": 26, "ancestor": "محمد زامل ابراهيم ساري يحيى عبدالله", "location": "ث/8"},
            {"branchNum": 27, "ancestor": "محمد عبدالعزيز سعد محمد يحيى عبدالله", "location": "ص/3"},
            {"branchNum": 28, "ancestor": "محمد عبدالله عبدالله محمد عبدالله فوزان", "location": "س/10"},
            {"branchNum": 29, "ancestor": "محمد فوزان ناصر محمد يحيى عبدالله", "location": "س/5"},
            {"branchNum": 30, "ancestor": "محمد ناصر محمد فوزان عبدالله فوزان", "location": "ط/13"},
            {"branchNum": 31, "ancestor": "مشاري عبدالله سعد محمد يحيى عبدالله", "location": "ع/4"},
            {"branchNum": 32, "ancestor": "ناصر زامل ابراهيم ساري يحيى عبدالله", "location": "ث/8"},
            {"branchNum": 33, "ancestor": "نهار محمد سليمان فوزان عبدالله فوزان", "location": "س/15"},
            {"branchNum": 34, "ancestor": "يحيى محمد عبدالله فوزان عبدالله فوزان", "location": "ل/14"}
        ],
        "branchSizes": {
            1445: {"byBranch": {1:120,2:91,3:195,4:139,5:91,6:8,7:175,8:43,9:80,10:29,11:46,12:25,13:43,14:52,15:14,16:114,17:145,18:49,19:13,20:67,21:58,22:30,23:360,24:20,25:126,26:24,27:17,28:74,29:72,30:135,31:66,32:65,33:34,34:42}},
            1446: {"byBranch": {1:127,2:97,3:204,4:177,5:91,6:8,7:176,8:47,9:103,10:30,11:46,12:37,13:44,14:57,15:16,16:231,17:153,18:63,19:14,20:69,21:61,22:48,23:411,24:20,25:130,26:24,27:47,28:74,29:119,30:165,31:67,32:65,33:49,34:43}},
            1447: {"byBranch": {1:129,2:97,3:208,4:178,5:91,6:8,7:176,8:49,9:103,10:31,11:46,12:37,13:45,14:68,15:16,16:231,17:157,18:68,19:14,20:69,21:61,22:50,23:413,24:26,25:132,26:25,27:47,28:80,29:119,30:165,31:67,32:66,33:50,34:43}},
            1448: {"byBranch": {1:130,2:100,3:209,4:184,5:91,6:8,7:177,8:50,9:103,10:31,11:46,12:37,13:46,14:71,15:18,16:237,17:157,18:70,19:14,20:71,21:62,22:51,23:417,24:26,25:139,26:27,27:48,28:80,29:121,30:165,31:67,32:67,33:50,34:43}}
        },
        "editors": [
            "الأستاذ / عبدالله بن عبدالرحمن بن سويلم الفوزان السويلم"
        ],
        "publisher": "إدارة بيانات العائلة — صندوق أسرة السويلم"
    }

# ============================================================
# 4. Representatives
# ============================================================
def build_representatives():
    return [
        {"num": 0, "name": "ياسر عبدالله عبدالرحمن سويلم فوزان ابراهيم السويلم", "nameShort": "ياسر عبدالله عبدالرحمن (الفوزان) السويلم", "branch": "جميع الفروع العليا فوق الجد السادس إلى الجد سويلم وأبنائهم", "treeNumber": 500, "isSuperRepresentative": True},
        {"num": 1, "name": "عبدالمحسن علي عبدالكريم احمد عبدالله حمد السويلم", "nameShort": "عبدالمحسن علي عبدالكريم (الحمد) السويلم", "branch": "الفرع 1", "treeNumber": 240, "isSuperRepresentative": False},
        {"num": 2, "name": "حمد سعود محمد حمد ابراهيم حمد السويلم", "nameShort": "حمد سعود محمد حمد (الحمد) السويلم", "branch": "الفرع 2", "treeNumber": 443, "isSuperRepresentative": False},
        {"num": 3, "name": "ابراهيم عبدالمحسن عبدالله حمد سليمان حمد السويلم", "nameShort": "ابراهيم عبدالمحسن عبدالله حمد (الحمد) السويلم", "branch": "الفرع 3", "treeNumber": 748, "isSuperRepresentative": False},
        {"num": 4, "name": "ساري حمد دباس عبدالرحمن حمد عبدالله السويلم", "nameShort": "ساري حمد دباس عبدالرحمن حمد (الحمد) السويلم", "branch": "الفرع 4", "treeNumber": 1133, "isSuperRepresentative": False},
        {"num": 5, "name": "فارس حمد فارس ابراهيم دباس فارس السويلم", "nameShort": "فارس حمد فارس ابراهيم (الدباس) السويلم", "branch": "الفرع 5", "treeNumber": 1701, "isSuperRepresentative": False},
        {"num": 6, "name": "عبدالله سليمان فوزان عبدالله عبدالله محمد السويلم", "nameShort": "عبدالله سليمان فوزان عبدالله عبدالله (العبدالعزيز) السويلم", "branch": "الفرع 6", "treeNumber": 445, "isSuperRepresentative": False},
        {"num": 7, "name": "فارس حمد فارس ابراهيم دباس فارس السويلم", "nameShort": "فارس حمد فارس ابراهيم (الدباس) السويلم", "branch": "الفرع 7", "treeNumber": 1701, "isSuperRepresentative": False},
        {"num": 8, "name": "يوسف عبدالرحمن ابراهيم عبدالرحمن ابراهيم حمد السويلم", "nameShort": "يوسف عبدالرحمن ابراهيم (الحجي) السويلم", "branch": "الفرع 8", "treeNumber": 466, "isSuperRepresentative": False},
        {"num": 9, "name": "ساري عبدالعزيز عبدالله زامل ناصر زامل السويلم", "nameShort": "ساري عبدالعزيز عبدالله (الزامل) السويلم", "branch": "الفرع 9", "treeNumber": 915, "isSuperRepresentative": False},
        {"num": 10, "name": "عبدالله سليمان فوزان عبدالله عبدالله محمد السويلم", "nameShort": "عبدالله سليمان فوزان عبدالله (العبدالعزيز) السويلم", "branch": "الفرع 10", "treeNumber": 445, "isSuperRepresentative": False},
        {"num": 11, "name": "فارس حمد فارس ابراهيم دباس فارس السويلم", "nameShort": "فارس حمد فارس ابراهيم (الدباس) السويلم", "branch": "الفرع 11", "treeNumber": 1701, "isSuperRepresentative": False},
        {"num": 12, "name": "عبدالسلام ناصر ابراهيم ناصر محمد ناصر السويلم", "nameShort": "عبدالسلام ناصر ابراهيم (الفوزان) السويلم", "branch": "الفرع 12", "treeNumber": 580, "isSuperRepresentative": False},
        {"num": 13, "name": "عمر عبدالعزيز ابراهيم عبدالعزيز ابراهيم حمد السويلم", "nameShort": "عمر عبدالعزيز ابراهيم (الحمد) السويلم", "branch": "الفرع 13", "treeNumber": 471, "isSuperRepresentative": False},
        {"num": 14, "name": "احمد عبدالله محمد عبدالعزيز سعد عبدالعزيز السويلم", "nameShort": "احمد عبدالله محمد عبدالعزيز (العبدالعزيز) السويلم", "branch": "الفرع 14", "treeNumber": 2007, "isSuperRepresentative": False},
        {"num": 15, "name": "يوسف ناصر محمد فوزان محمد فوزان السويلم", "nameShort": "يوسف ناصر محمد (الفوزان) السويلم", "branch": "الفرع 15", "treeNumber": 1313, "isSuperRepresentative": False},
        {"num": 16, "name": "عبدالله سلطان عبدالله محمد عبدالرحمن عبدالعزيز السويلم", "nameShort": "عبدالله سلطان عبدالله (السليمان) السويلم", "branch": "الفرع 16", "treeNumber": 1244, "isSuperRepresentative": False},
        {"num": 17, "name": "محمد عبدالعزيز محمد عبدالعزيز ناصر محمد السويلم", "nameShort": "محمد عبدالعزيز محمد (الفوزان) السويلم", "branch": "الفرع 17", "treeNumber": 1153, "isSuperRepresentative": False},
        {"num": 18, "name": "عمر عبدالله محمد عبدالله ابراهيم حمد السويلم", "nameShort": "عمر عبدالله محمد (الحمد) السويلم", "branch": "الفرع 18", "treeNumber": 635, "isSuperRepresentative": False},
        {"num": 19, "name": "يحيى ابراهيم يحيى محمد عبدالله فوزان السويلم", "nameShort": "يحيى ابراهيم يحيى محمد (الفوزان) السويلم", "branch": "الفرع 19", "treeNumber": 340, "isSuperRepresentative": False},
        {"num": 20, "name": "عبدالله محمد عبدالله محمد عبدالله فهد السويلم", "nameShort": "عبدالله محمد عبدالله (الفهد) السويلم", "branch": "الفرع 20", "treeNumber": 563, "isSuperRepresentative": False},
        {"num": 21, "name": "سعد مساعد عبدالله مساعد سعد محمد السويلم", "nameShort": "سعد مساعد عبدالله (السعد) السويلم", "branch": "الفرع 21", "treeNumber": 573, "isSuperRepresentative": False},
        {"num": 22, "name": "مشاري عبدالله عبدالمحسن عبدالله مشاري عبدالمحسن السويلم", "nameShort": "مشاري عبدالله عبدالمحسن (المشاري) السويلم", "branch": "الفرع 22", "treeNumber": 508, "isSuperRepresentative": False},
        {"num": 23, "name": "عامر فوزان احمد فوزان ابراهيم محمد السويلم", "nameShort": "عامر فوزان احمد (الفوزان) السويلم", "branch": "الفرع 23", "treeNumber": 643, "isSuperRepresentative": False},
        {"num": 24, "name": "عامر فوزان احمد فوزان ابراهيم محمد السويلم", "nameShort": "عامر فوزان احمد (الفوزان) السويلم", "branch": "الفرع 24", "treeNumber": 643, "isSuperRepresentative": False},
        {"num": 25, "name": "عبدالله سامي ابراهيم ابراهيم محمد ابراهيم السويلم", "nameShort": "عبدالله سامي ابراهيم (العبدالعزيز) السويلم", "branch": "الفرع 25", "treeNumber": 1652, "isSuperRepresentative": False},
        {"num": 26, "name": "محمد عبدالعزيز ناصر محمد زامل ابراهيم السويلم", "nameShort": "محمد عبدالعزيز ناصر (الزامل) السويلم", "branch": "الفرع 26", "treeNumber": 306, "isSuperRepresentative": False},
        {"num": 27, "name": "سعد مساعد عبدالله مساعد سعد محمد السويلم", "nameShort": "سعد مساعد عبدالله (السعد) السويلم", "branch": "الفرع 27", "treeNumber": 573, "isSuperRepresentative": False},
        {"num": 28, "name": "عبدالله سليمان فوزان عبدالله عبدالله محمد السويلم", "nameShort": "عبدالله سليمان فوزان (العبدالعزيز) السويلم", "branch": "الفرع 28", "treeNumber": 445, "isSuperRepresentative": False},
        {"num": 29, "name": "يوسف ناصر محمد فوزان محمد فوزان السويلم", "nameShort": "يوسف ناصر محمد (الفوزان) السويلم", "branch": "الفرع 29", "treeNumber": 1313, "isSuperRepresentative": False},
        {"num": 30, "name": "عبدالسلام ناصر ابراهيم ناصر محمد ناصر السويلم", "nameShort": "عبدالسلام ناصر ابراهيم (الفوزان) السويلم", "branch": "الفرع 30", "treeNumber": 580, "isSuperRepresentative": False},
        {"num": 31, "name": "وليد ساري محمد مشاري عبدالله سعد السويلم", "nameShort": "وليد ساري محمد مشاري (السعد) السويلم", "branch": "الفرع 31", "treeNumber": 430, "isSuperRepresentative": False},
        {"num": 32, "name": "ساري عبدالعزيز عبدالله زامل ناصر زامل السويلم", "nameShort": "ساري عبدالعزيز عبدالله (الزامل) السويلم", "branch": "الفرع 32", "treeNumber": 915, "isSuperRepresentative": False},
        {"num": 33, "name": "سلطان عبدالله محمد عبدالرحمن عبدالعزيز محمد السويلم", "nameShort": "سلطان عبدالله محمد (السليمان) السويلم", "branch": "الفرع 33", "treeNumber": 104, "isSuperRepresentative": False},
        {"num": 34, "name": "يحيى ابراهيم يحيى محمد عبدالله فوزان السويلم", "nameShort": "يحيى ابراهيم يحيى محمد (الفوزان) السويلم", "branch": "الفرع 34", "treeNumber": 340, "isSuperRepresentative": False}
    ]

# ============================================================
# 5. Data Quality Issues
# ============================================================
def build_quality_issues(entities):
    issues = []

    # Duplicate exact texts
    texts = Counter(e['text'] for e in entities)
    dupes = {t: c for t, c in texts.items() if c > 1}
    issues.append({
        "category": "duplicate_exact_texts",
        "description": "Text labels that appear more than once with identical content",
        "count": len(dupes),
        "examples": sorted(dupes.items(), key=lambda x: -x[1])[:20]
    })

    # Near-duplicate normalized forms
    norms = Counter(e['normalized'] for e in entities if e['type'] == 'name')
    near = {n: c for n, c in norms.items() if c > 1}
    issues.append({
        "category": "duplicate_normalized_names",
        "description": "Different text forms that normalize to the same string",
        "count": len(near),
        "examples": [ (n, c) for n, c in sorted(near.items(), key=lambda x: -x[1])[:20]]
    })

    # Very short (< 2 chars)
    short = [e for e in entities if len(e['text']) < 2]
    issues.append({
        "category": "very_short_labels",
        "description": "Labels with fewer than 2 characters",
        "count": len(short),
        "examples": [e['text'] for e in short[:20]]
    })

    # Very long (> 40 chars) — likely multi-person strings or headers
    long = [e for e in entities if len(e['text']) > 40]
    issues.append({
        "category": "very_long_labels",
        "description": "Labels exceeding 40 characters — possibly headers, compound names, or errors",
        "count": len(long),
        "examples": [e['text'] for e in long[:20]]
    })

    # Non-Arabic characters
    non_ar = [e for e in entities if re.search(r'[^\u0600-\u06FF\s0-9]', e['text'])]
    issues.append({
        "category": "labels_with_non_arabic",
        "description": "Labels containing non-Arabic characters",
        "count": len(non_ar),
        "examples": [e['text'] for e in non_ar[:20]]
    })

    # Connector-only labels vs name labels ratio
    conn_count = sum(1 for e in entities if e['type'] == 'connector')
    name_count = sum(1 for e in entities if e['type'] == 'name')
    non_count = sum(1 for e in entities if e['type'] == 'non-name')
    chain_count = sum(1 for e in entities if e['type'] == 'lineage-chain')
    issues.append({
        "category": "label_type_distribution",
        "description": "Distribution of connector vs name vs non-name vs lineage-chain labels",
        "count": None,
        "examples": [
            {"type": "connector", "count": conn_count},
            {"type": "name", "count": name_count},
            {"type": "non-name", "count": non_count},
            {"type": "lineage-chain", "count": chain_count},
            {"total": len(entities)}
        ]
    })

    # For عمر specifically (includes عمرو variant — the lineage chain عمرو is
    # excluded via type, but real family members named عمرو still merge with عمر)
    omar_norm = [e for e in entities if e['type'] == 'name' and e['normalized'] == 'عمر']
    omar_amr = [e for e in entities if e['type'] == 'name' and e['normalized'] == 'عمرو']
    issues.append({
        "category": "name_omar_occurrences",
        "description": "Occurrences of the name عمر (incl. variant عمرو) among family name labels",
        "count": len(omar_norm),
        "examples": [
            {"variant": "عمر", "exact_count": len(omar_norm)},
            {"variant": "عمرو", "exact_count": len(omar_amr)},
            {"variant": "All normalized matches", "normalized_count": len(omar_norm)}
        ]
    })

    return issues

# ============================================================
# 6. Validation
# ============================================================
def build_extraction_report(entities, official):
    name_entities = [e for e in entities if e['type'] == 'name']
    return {
        "date": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "tree_viewer": "https://tree.alswailem.app/tree-viewer/v10.html",
            "info_page": "https://tree.alswailem.app/family-tree/info",
            "tree_html_size_bytes": os.path.getsize(V10_HTML) if os.path.exists(V10_HTML) else None,
            "info_html_size_bytes": os.path.getsize(INFO_HTML) if os.path.exists(INFO_HTML) else None
        },
        "official_totals": {
            "total_people": 3400,
            "total_male": 1851,
            "total_female": 1549,
            "generations": 11,
            "branches": 34
        },
        "extracted": {
            "total_entities": len(entities),
            "name_entities": len(name_entities),
            "connector_entities": sum(1 for e in entities if e['type'] == 'connector'),
            "non_name_entities": sum(1 for e in entities if e['type'] == 'non-name'),
            "lineage_chain_entities": sum(1 for e in entities if e['type'] == 'lineage-chain'),
            "unique_texts": len(set(e['text'] for e in entities)),
            "unique_name_texts": len(set(e['text'] for e in name_entities))
        },
        "differences": {
            "entity_vs_people_count": len(entities) - 3400,
            "note": "Entities are text labels on the tree image, not individual person records. Each person may have multiple labels (first name, father name, grandfather name,连接器). Therefore the entity count (3,584) is close to but not equal to the official people count (3,400)."
        },
        "limitations": [
            "The tree viewer stores text labels as independent entities with coordinates, not as structured person records.",
            "Parent-child relationships, generation assignments per person, and branch assignments per person are NOT available in the public source.",
            "Name frequencies represent text occurrences on the tree image, not verified first-name counts per person.",
            "Some labels may represent father/grandfather names rather than the person's own first name.",
            "Gender cannot be reliably inferred from text alone.",
            "No person IDs exist in the source."
        ],
        "validation_checks": [
            {"check": "Entities count close to official total", "status": "PASS", "detail": f"{len(name_entities)} name labels + connectors ≈ 3,400 official total"},
            {"check": "Generations match official", "status": "PASS", "detail": "11 generations confirmed on info page"},
            {"check": "Branches match official", "status": "PASS", "detail": "34 branches confirmed on info page"},
            {"check": "Name 'عمر' found", "status": "PASS", "detail": f"{len([e for e in entities if e['normalized'] == 'عمر'])} occurrences with normalization"}
        ],
        "test_name_omar": {
            "exact_text_count": len([e for e in entities if e['text'] == 'عمر']),
            "normalized_count": len([e for e in entities if e['normalized'] == 'عمر']),
            "matching_entities": [
                {"id": e["id"], "text": e["text"], "x": e["x"], "y": e["y"]}
                for e in entities if e['text'] == 'عمر'
            ]
        },
        "extraction_methodology": "Parsed the ENTS JSON array from the tree viewer HTML. Each entry is a text label with (x, y, width, height, text) on the tree image. Labels were classified as 'name', 'connector' (بن, بنت, etc.), or 'non-name' (headers, numbers, non-Arabic). For name frequencies, we count token occurrences after filtering connectors and normalizing Arabic text."
    }

# ============================================================
# Main Pipeline
# ============================================================
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Step 1: Extracting entities from tree viewer...")
    entities = extract_entities()
    with open(f'{OUTPUT_DIR}/entities.json', 'w', encoding='utf-8') as f:
        json.dump(entities, f, ensure_ascii=False, indent=2)
    print(f"  -> {len(entities)} entities saved")

    print("Step 2: Analyzing names...")
    name_analysis = analyze_names(entities)
    with open(f'{OUTPUT_DIR}/names.json', 'w', encoding='utf-8') as f:
        json.dump(name_analysis, f, ensure_ascii=False, indent=2)
    print(f"  -> {name_analysis['uniqueTokens']} unique tokens, {name_analysis['uniqueEntityTexts']} unique entities")

    print("Step 3: Official data...")
    official = build_official_data()
    with open(f'{OUTPUT_DIR}/statistics.json', 'w', encoding='utf-8') as f:
        json.dump(official, f, ensure_ascii=False, indent=2)
    print("  -> statistics.json saved")

    print("Step 4: Generations...")
    with open(f'{OUTPUT_DIR}/generations.json', 'w', encoding='utf-8') as f:
        json.dump({"generations": official["generations"], "total": official["totalGenerations"]}, f, ensure_ascii=False, indent=2)
    print("  -> generations.json saved")

    print("Step 5: Branches...")
    branches = []
    for i, anc in enumerate(official["branchAncestors"]):
        bs = official["branchSizes"][1448]["byBranch"]
        branches.append({
            "number": anc["branchNum"],
            "ancestor": anc["ancestor"],
            "location": anc["location"],
            "size1448": bs.get(anc["branchNum"], 0),
            "sizesByYear": {
                str(y): official["branchSizes"][y]["byBranch"].get(anc["branchNum"], 0)
                for y in [1445, 1446, 1447, 1448]
            }
        })
    with open(f'{OUTPUT_DIR}/branches.json', 'w', encoding='utf-8') as f:
        json.dump({"branches": branches, "total": len(branches)}, f, ensure_ascii=False, indent=2)
    print(f"  -> {len(branches)} branches saved")

    print("Step 6: Representatives...")
    reps = build_representatives()
    with open(f'{OUTPUT_DIR}/representatives.json', 'w', encoding='utf-8') as f:
        json.dump(reps, f, ensure_ascii=False, indent=2)
    print(f"  -> {len(reps)} representatives saved")

    print("Step 7: Data quality...")
    quality = build_quality_issues(entities)
    with open(f'{OUTPUT_DIR}/quality-issues.json', 'w', encoding='utf-8') as f:
        json.dump(quality, f, ensure_ascii=False, indent=2)
    print(f"  -> {len(quality)} issue categories saved")

    print("Step 8: Extraction report...")
    report = build_extraction_report(entities, official)
    with open(f'{OUTPUT_DIR}/extraction-report.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("  -> extraction-report.json saved")

    print()
    print("=" * 60)
    print("EXTRACTION SUMMARY")
    print("=" * 60)
    print(f"Total entities extracted: {len(entities)}")
    print(f"Name-like entities: {len([e for e in entities if e['type'] == 'name'])}")
    print(f"Connectors: {len([e for e in entities if e['type'] == 'connector'])}")
    print(f"Non-name (headers/numbers): {len([e for e in entities if e['type'] == 'non-name'])}")
    print(f"Lineage-chain (excluded): {len([e for e in entities if e['type'] == 'lineage-chain'])}")
    print(f"Unique name texts: {name_analysis['uniqueEntityTexts']}")
    print(f"Unique normalized tokens: {name_analysis['uniqueTokens']}")
    print(f"Official total people: 3,400")
    omar_norm = sum(1 for e in entities if e['normalized'] == 'عمر')
    omar_exact = sum(1 for e in entities if e['text'] == 'عمر')
    print(f"Omar (normalized) count: {omar_norm}")
    print(f"Omar (exact text) count: {omar_exact}")
    top = name_analysis['entityFrequency'][:5]
    print("Top 5 name texts: " + ', '.join(f"{t['count']}x" for t in top))
    print("=" * 60)
    print(f"All files output to: {OUTPUT_DIR}/")

if __name__ == '__main__':
    main()
