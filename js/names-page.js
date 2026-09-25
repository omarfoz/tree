(function () {
  "use strict";
  let allNames=[], entitiesData=[], nameEntities=[], totalNameEntities=0, chartInstance=null, diversityChart=null, rankMap=new Map();

  function esc(value){return String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
  function arNum(n,digits){return digits!=null?Number(n).toLocaleString("ar-SA",{minimumFractionDigits:digits,maximumFractionDigits:digits}):Number(n).toLocaleString("ar-SA");}
  function metricCard(label,value,sub){return "<div class=\"card card-stat\"><div class=\"card-label\">"+label+"</div><div class=\"card-value\">"+value+"</div><div class=\"card-sublabel\">"+sub+"</div></div>";}
  function rarity(n){if(n.count===1)return{label:"نادر جدًا",cls:"badge-gold"};if(n.count<=3)return{label:"نادر",cls:"badge-gold"};if(n.count<10)return{label:"متوسط",cls:"badge-muted"};return{label:"شائع",cls:"badge-green"};}
  function levenshtein(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let prev=Array.from({length:n+1},(_,i)=>i);for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++){const cost=a[i-1]===b[j-1]?0:1;cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+cost);}prev=cur;}return prev[n];}
  function similarNames(target){const key=window.arCompact(target.text),limit=key.length<=4?1:2;return allNames.filter(n=>window.arCompact(n.text)!==key).map(n=>({name:n,distance:levenshtein(key,window.arCompact(n.text))})).filter(x=>x.distance<=limit).sort((a,b)=>a.distance-b.distance||b.name.count-a.name.count).slice(0,10);}
  function variantsFor(target){const key=window.arCompact(target.text),map=new Map();nameEntities.forEach(e=>{if(window.arCompact(e.text)===key)map.set(e.text,(map.get(e.text)||0)+1);});return[...map.entries()].sort((a,b)=>b[1]-a[1]);}

  async function load(){
    const data=await Promise.all([fetch("data/names.json").then(r=>r.json()),fetch("data/entities.json").then(r=>r.json())]);
    const namesRes=data[0];entitiesData=data[1];allNames=namesRes.entityFrequency;nameEntities=entitiesData.filter(e=>e.type==="name");totalNameEntities=nameEntities.length;
    rankMap=new Map(allNames.map((n,i)=>[window.arCompact(n.text),i+1]));renderDiversity(namesRes);
    const q=new URLSearchParams(location.search).get("q");
    if(q){document.getElementById("name-search").value=q;render(q,99999);const exact=allNames.find(n=>window.arCompact(n.text)===window.arCompact(q));if(exact)setTimeout(()=>showDetail(exact,false),80);}else render("",10);
  }

  function renderDiversity(namesRes){
    const once=allNames.filter(n=>n.count===1).length,rare=allNames.filter(n=>n.count<=3).length,top10=allNames.slice(0,10).reduce((s,n)=>s+n.count,0);
    const probs=allNames.map(n=>n.count/namesRes.totalEntities),entropy=-probs.reduce((s,p)=>s+(p?p*Math.log2(p):0),0),maxEntropy=Math.log2(allNames.length),diversity=maxEntropy?entropy/maxEntropy*100:0;
    document.getElementById("name-metrics").innerHTML=metricCard("الأسماء الفريدة",arNum(namesRes.uniqueEntityTexts),"بعد دمج الصيغ المتقاربة")+metricCard("تظهر مرة واحدة",arNum(once),(once/allNames.length*100).toFixed(1)+"% من الأسماء الفريدة")+metricCard("٣ مرات أو أقل",arNum(rare),(rare/allNames.length*100).toFixed(1)+"% من الأسماء الفريدة")+metricCard("حصة أعلى ١٠",(top10/namesRes.totalEntities*100).toFixed(1)+"%","من كل مرات ظهور الأسماء");
    document.getElementById("diversity-extra").innerHTML="<div class=\"diversity-meter\"><div class=\"flex justify-between items-center\"><strong>مؤشر تنوع الأسماء</strong><strong>"+diversity.toFixed(1)+"%</strong></div><div class=\"progress-bar mt-1\"><div class=\"progress-bar-fill\" style=\"width:"+diversity.toFixed(1)+"%\"></div></div><p class=\"text-muted\" style=\"font-size:.82rem;margin:10px 0 0\">مؤشر Shannon مطبّع: كلما اقترب من ١٠٠٪ كان التوزيع أقل اعتمادًا على عدد صغير من الأسماء.</p></div><div class=\"mt-3\"><strong>أسماء نادرة (١–٣ مرات)</strong><div class=\"text-muted\" style=\"font-size:.8rem;margin-top:4px\">تشمل النادرة جدًا (مرة واحدة) والنادرة (مرتين أو ثلاث).</div><div id=\"rare-name-pills\" class=\"pill-list mt-2\"></div></div>";
    const rareNames=allNames.filter(n=>n.count<=3).slice().sort((a,b)=>a.count-b.count||a.text.localeCompare(b.text,"ar"));
    document.getElementById("rare-name-pills").innerHTML=rareNames.map(n=>"<button class=\"name-pill\" data-name=\""+esc(n.text)+"\" title=\"ظهر "+arNum(n.count)+" مرة\">"+esc(n.text)+" <small style=\"opacity:.65\">"+arNum(n.count)+"×</small></button>").join("");
    document.querySelectorAll("#rare-name-pills [data-name]").forEach(btn=>btn.addEventListener("click",()=>{const item=allNames.find(x=>x.text===btn.dataset.name);if(item)showDetail(item,true);}));
    if(diversityChart)diversityChart.destroy();
    diversityChart=new Chart(document.getElementById("nameDiversityChart"),{type:"doughnut",data:{labels:["مرة واحدة","٢–٥ مرات","٦–٢٠ مرة","أكثر من ٢٠"],datasets:[{data:[allNames.filter(n=>n.count===1).length,allNames.filter(n=>n.count>=2&&n.count<=5).length,allNames.filter(n=>n.count>=6&&n.count<=20).length,allNames.filter(n=>n.count>20).length],backgroundColor:["#0D76BD","#4ACD7B","#666258","#342B24"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"top",rtl:true},tooltip:{rtl:true}}}});
  }

  function render(searchQ,limit){
    const compactQ=window.arCompact(searchQ);let filtered=allNames;if(compactQ)filtered=allNames.filter(n=>window.arCompact(n.text).includes(compactQ)||window.arCompact(n.firstPart).includes(compactQ));filtered=filtered.slice(0,limit);
    document.getElementById("results-info").textContent="عرض "+arNum(filtered.length)+" من "+arNum(allNames.length)+" اسم فريد"+(searchQ?" — نتائج البحث عن \""+searchQ+"\"":"");renderChart(filtered.slice(0,30));
    const tbody=document.getElementById("names-tbody");tbody.innerHTML="";
    filtered.forEach(n=>{const r=rarity(n),tr=document.createElement("tr");tr.style.cursor="pointer";tr.addEventListener("click",()=>showDetail(n,true));tr.innerHTML="<td class=\"rank\">"+arNum(rankMap.get(window.arCompact(n.text))||0)+"</td><td class=\"name-cell\">"+esc(n.text)+"</td><td class=\"number\">"+arNum(n.count)+"</td><td class=\"number\">"+(n.count/totalNameEntities*100).toFixed(2)+"%</td><td><span class=\"badge "+r.cls+"\">"+r.label+"</span></td><td>"+(n.length>1?arNum(n.length)+" كلمات":"كلمة واحدة")+"</td>";tbody.appendChild(tr);});
  }

  function renderChart(data){
    const ctx=document.getElementById("namesChart").getContext("2d");if(chartInstance)chartInstance.destroy();
    chartInstance=new Chart(ctx,{type:"bar",data:{labels:data.map(n=>n.text),datasets:[{label:"مرات الظهور",data:data.map(n=>n.count),backgroundColor:data.map((_,i)=>i<3?"rgba(13,118,189,.85)":i<10?"rgba(74,205,123,.75)":"rgba(52,43,36,.15)"),borderRadius:6,barPercentage:.65}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:c=>c.raw+" ظهور"}}},scales:{x:{beginAtZero:true,grid:{color:"rgba(47,36,21,.06)"}},y:{grid:{display:false},ticks:{font:{family:"'IBM Plex Sans Arabic'",size:12}}}}}});
  }

  function showDetail(nameObj,updateUrl){
    const key=window.arCompact(nameObj.text),matches=nameEntities.filter(e=>window.arCompact(e.text)===key),variants=variantsFor(nameObj),similars=similarNames(nameObj),r=rarity(nameObj),rank=rankMap.get(key)||0,pct=nameObj.count/totalNameEntities*100;
    document.getElementById("detail-name").textContent=nameObj.text;
    document.getElementById("detail-stats").innerHTML="<span class=\"badge badge-green\">الترتيب "+arNum(rank)+"</span><span class=\"badge badge-green\">"+arNum(nameObj.count)+" ظهور</span><span class=\"badge badge-gold\">"+pct.toFixed(2)+"%</span><span class=\"badge "+r.cls+"\">"+r.label+"</span>";
    document.getElementById("detail-variants").innerHTML=variants.length?variants.map(v=>"<span class=\"name-pill\">"+esc(v[0])+" <small>"+arNum(v[1])+"</small></span>").join(""):"<span class=\"text-muted\">لا توجد صيغ أخرى.</span>";
    document.getElementById("detail-similar").innerHTML=similars.length?similars.map(x=>"<button class=\"name-pill similar-name\" data-name=\""+esc(x.name.text)+"\">"+esc(x.name.text)+" <small>Δ"+x.distance+" · "+arNum(x.name.count)+"</small></button>").join(""):"<span class=\"text-muted\">لا توجد أسماء قريبة كتابيًا ضمن الحد المستخدم.</span>";
    document.querySelectorAll("#detail-similar .similar-name").forEach(btn=>btn.addEventListener("click",()=>{const item=allNames.find(x=>x.text===btn.dataset.name);if(item)showDetail(item,true);}));
    const loc=document.getElementById("detail-entities");loc.innerHTML=matches.slice(0,80).map(e=>"<div class=\"location-row\"><span style=\"font-weight:600\">"+esc(e.text)+"</span><span class=\"text-muted\">("+arNum(e.x)+", "+arNum(e.y)+")</span></div>").join("");if(matches.length>80)loc.innerHTML+="<div class=\"text-muted\" style=\"padding:10px\">تم عرض أول ٨٠ موضعًا من "+arNum(matches.length)+".</div>";
    document.getElementById("name-detail").style.display="block";if(updateUrl)history.replaceState(null,"","names.html?q="+encodeURIComponent(nameObj.text));document.getElementById("name-detail").scrollIntoView({behavior:"smooth",block:"start"});
  }

  window.closeDetail=function(){document.getElementById("name-detail").style.display="none";history.replaceState(null,"","names.html");};
  const searchEl=document.getElementById("name-search");let timer;searchEl.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>{const active=document.querySelector(".top-filter.active");render(searchEl.value,active?parseInt(active.dataset.n,10):99999);},220);});
  document.querySelectorAll(".top-filter").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".top-filter").forEach(b=>b.classList.remove("active"));btn.classList.add("active");render(searchEl.value,parseInt(btn.dataset.n,10));}));
  load();
})();