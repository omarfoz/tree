(function () {
  "use strict";
  function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
  function n(v){return Number(v).toLocaleString("ar-SA");}
  function metric(label,value,sub){return "<div class=\"card card-stat\"><div class=\"card-label\">"+label+"</div><div class=\"card-value\">"+value+"</div><div class=\"card-sublabel\">"+sub+"</div></div>";}
  function parsePeriods(text){const out=[],re=/(\d{3,4})(?:-(\d{3,4}))?/g;let m;while((m=re.exec(text))){const start=Number(m[1]),end=m[2]?Number(m[2]):start;out.push({start,end});}return out;}
  function tenure(a){return parsePeriods(a.datesH).reduce((s,p)=>s+Math.max(1,p.end-p.start),0);}

  async function load(){
    const stats=await fetch("data/statistics.json").then(r=>r.json()),edGrid=document.getElementById("editions-grid");
    stats.editions.forEach((e,i)=>{const card=document.createElement("div");card.className="card animate-in";card.style.animationDelay=i*.08+"s";card.innerHTML="<div class=\"flex justify-between items-center mb-1\"><span class=\"badge "+(i===stats.editions.length-1?"badge-green":"badge-muted")+"\">"+n(e.year)+"هـ</span><span class=\"text-muted\" style=\"font-size:.8rem\">"+esc(e.label)+"</span></div><div style=\"font-size:1.8rem;font-weight:700\">"+n(e.total)+"</div><div class=\"text-muted\" style=\"font-size:.85rem\">فرد</div><div style=\"margin-top:10px;font-size:.8rem\" class=\"text-muted\">"+n(e.male)+" ذكر — "+n(e.female)+" أنثى</div><div style=\"margin-top:6px;font-size:.75rem\" class=\"text-muted\">"+esc(e.details)+"</div>";edGrid.appendChild(card);});
    document.getElementById("oral-sources").innerHTML=stats.oralSources.map(s=>"<div class=\"source-row\">"+esc(s)+"</div>").join("");
    document.getElementById("book-sources").innerHTML=stats.sources.map(s=>"<div class=\"source-row\">"+esc(s)+"</div>").join("");
    renderAmirs(stats.amirs);
  }

  function renderAmirs(amirs){
    const enriched=amirs.map(a=>{const periods=parsePeriods(a.datesH);return{a,periods,start:Math.min(...periods.map(p=>p.start)),end:Math.max(...periods.map(p=>p.end)),duration:tenure(a)};}).sort((x,y)=>x.start-y.start);
    const earliest=Math.min(...enriched.map(x=>x.start)),latest=Math.max(...enriched.map(x=>x.end)),longest=enriched.slice().sort((a,b)=>b.duration-a.duration)[0],generations=[...new Set(enriched.map(x=>x.a.generation))].sort((a,b)=>a-b);
    document.getElementById("amir-metrics").innerHTML=metric("سجلات الإمارة",n(enriched.length),"حسب البيانات الموثقة في الشجرة")+metric("الفترة الزمنية",n(earliest)+"–"+n(latest)+"هـ","من أقدم بداية إلى آخر نهاية")+metric("الأجيال الممثلة",n(generations[0])+"–"+n(generations[generations.length-1]),"من الجيل الثاني حتى السابع")+metric("أطول مدة مسجلة",n(longest.duration)+" سنة",esc(longest.a.name));
    document.getElementById("amirs-timeline").innerHTML=enriched.map(x=>"<div class=\"timeline-item\"><div class=\"timeline-dot\"></div><div class=\"timeline-card card\"><div class=\"flex justify-between wrap\" style=\"gap:10px\"><div><div class=\"timeline-year\">"+esc(x.a.datesH)+"</div><h3>"+esc(x.a.name)+"</h3></div><div class=\"pill-list\"><span class=\"badge badge-green\">الجيل "+n(x.a.generation)+"</span><span class=\"badge badge-muted\">مدة مسجلة ≈ "+n(x.duration)+" سنة</span></div></div>"+(x.periods.length>1?"<div class=\"text-muted\" style=\"font-size:.82rem;margin-top:8px\">تتضمن أكثر من فترة إمارة منفصلة.</div>":"")+"</div></div>").join("");
    document.getElementById("amirs-tbody").innerHTML=enriched.map((x,i)=>"<tr><td class=\"rank\">"+n(i+1)+"</td><td class=\"name-cell\">"+esc(x.a.name)+"</td><td class=\"number\">"+n(x.a.generation)+"</td><td class=\"text-muted\">"+esc(x.a.datesH)+"</td><td class=\"number\">"+n(x.duration)+"</td></tr>").join("");
  }
  load();
})();