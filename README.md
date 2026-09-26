# شجرة عائلة السويلم — لوحة الإحصائيات

**Al-Suwailem Family Tree Analytics Dashboard**

موقع إحصائيات تفاعلي حديث لعائلة السويلم، يستند إلى البيانات الرسمية المنشورة.

## الميزات

- **الصفحة الرئيسية** — إحصائيات عامة، نمو العائلة، الأسماء الأكثر انتشاراً
- **الأسماء** — بحث متقدم، تكرار الأسماء، رسوم بيانية تفاعلية
- **الشجرة** — عارض الشجرة الأصلي المدمج
- **الفروع** — ٣٤ فرع مع الممثلين والتوزيع
- **الأجيال** — بيانات ١١ جيل
- **الإحصائيات** — تحليلات متقدمة ومقارنات
- **جودة البيانات** — تقرير الاستخراج والتحقق
- **عن الشجرة** — المصادر والمراجع وأمراء ثادق

## التقنيات

- HTML / CSS / JavaScript (لا يحتاج بناء)
- Chart.js للرسوم البيانية
- IBM Plex Sans Arabic للخط العربي
- تصميم تفاعلي مع دعم الوضع الداكن والفاتح
- دعم كامل للغة العربية (RTL)

## الهيكل

```
├── index.html          # الصفحة الرئيسية
├── names.html          # إحصائيات الأسماء
├── tree.html           # الشجرة التفاعلية
├── branches.html       # فروع العائلة
├── generations.html    # الأجيال
├── analytics.html      # إحصائيات متقدمة
├── data-quality.html   # جودة البيانات
├── about.html          # عن الشجرة
├── css/
│   └── styles.css      # التصميم
├── js/
│   └── app.js          # المنطق المشترك
└── data/
    ├── entities.json        # النصوص المستخرجة
    ├── names.json           # إحصائيات الأسماء
    ├── branches.json        # بيانات الفروع
    ├── generations.json     # بيانات الأجيال
    ├── statistics.json      # الإحصائيات الرسمية
    ├── representatives.json # الممثلون
    ├── extraction-report.json # تقرير الاستخراج
    └── quality-issues.json  # مشاكل البيانات
```

## البيانات

### المصدر
- الموقع الرسمي: https://tree.alswailem.app/family-tree
- صفحة المعلومات: https://tree.alswailem.app/family-tree/info

### القيود
- الشجرة الأصلية هي <strong>عارض صور تفاعلي</strong> وليست قاعدة بيانات منظمة
- لا توجد علاقات أب-ابن منفصلة لكل فرد
- لا توجد معرفات فريدة للأفراد
- إحصائيات الأسماء تعتمد على تكرار النصوص الظاهرة على الشجرة

### النتائج
| البيان | القيمة |
|--------|--------|
| إجمالي العائلة | ٣٬٤٠٠ |
| الأجيال | ١١ |
| الفروع | ٣٤ |
| الذكور | ١٬٨٥١ |
| الإناث | ١٬٥٤٩ |
| النصوص المستخرجة | ٣٬٥٨٤ |
| الأسماء الفريدة | ٤٣٤ |
| أكثر اسم تكراراً | محمد (٢١٥ مرة) |
| تكرار عمر | ٢٧ مرة |

## الاستضافة

موقع ساكن — يعمل على GitHub Pages أو أي خادم ويب بسيط:

```bash
# مثال: تشغيل محلي
python3 -m http.server 8080
# ثم افتح: http://localhost:8080
```

## الترخيص

جميع الحقوق محفوظة لصندوق أسرة السويلم.
هذا المشروع هو أداة تحليلية مستقلة تستند إلى البيانات العامة المنشورة.

# Genealogy graph data

`python scripts/build_genealogy_graph.py` regenerates `data/genealogy.json`,
`data/genealogy-review.json`, and `data/genealogy-report.json` from the
explicitly verified relations in `data/verified-relations.json`. It never
derives parentage from label positions. Run `python -m unittest discover -s
tests -v` to check the known Omar and Salma chains, search queries, and graph
integrity.

Open `genealogy-debug.html` from the hosted site to browse resolved and
unresolved records and jump to a person's location. Existing verified data
does not include traced branch polylines, so the debug page does not draw a
branch overlay. The extraction report records this limitation and current
coverage.
