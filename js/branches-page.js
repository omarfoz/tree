(function () {
  "use strict";
  let branchesData=[],repsData=[],branchMap=new Map(),repChart=null;
  function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
  function n(v){return Number(v).toLocaleString("ar-SA");}
  function metric(label,value,sub){return "<div class=\"card card-stat\"><div class=\"card-label\">"+label+"</div><div class=\"card-value\">"+value+"</div><div class=\"card-sublabel\">"+sub+"</div></div>";}
  function categoryOf(rep){const m=rep.nameShort&&rep.nameShort.match(/\(([^)]+)\)/);return m?m[1]:"غير محدد";}

  async function load(){
    const data=await Promise.all([fetch("data/branches.json").then(r=>r.json()),fetch("data/representatives.json").then(r=>r.json())]);
    branchesData=data[0].branches;repsData=Object.values(data[1]).sort((a,b)=>a.num-b.num);branchMap=new Map(branchesData.map(b=>[b.number,b]));
    renderBranchChart();renderRepresentativeDashboard();renderReps("");renderTable("num");
  }

  function renderBranchChart(){
    new Chart(document.getElementById("branchChart"),{type:"bar",data:{labels:branchesData.map(b=>"فرع "+b.number),datasets:[{label:"١٤٤٨هـ",data:branchesData.map(b=>b.size1448),backgroundColor:"rgba(13,118,189,.8)",borderRadius:4,barPercentage:.7},{label:"١٤٤٥هـ",data:branchesData.map(b=>b.sizesByYear["1445"]),backgroundColor:"rgba(74,205,123,.6)",borderRadius:4,barPercentage:.7}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"top",rtl:true},tooltip:{rtl:true}},scales:{x:{grid:{display:false},ticks:{font:{family:"'IBM Plex Sans Arabic'",size:10}}},y:{beginAtZero:true,grid:{color:"rgba(47,36,21,.06)"}}}}});
  }

  function renderRepresentativeDashboard(){
    const branchReps=repsData.filter(r=>!r.isSuperRepresentative),byPerson=new Map();
    branchReps.forEach(r=>{if(!byPerson.has(r.name))byPerson.set(r.name,[]);byPerson.get(r.name).push(r);});
    const shared=[...byPerson.entries()].filter(x=>x[1].length>1).sort((a,b)=>b[1].length-a[1].length),categories=new Map();
    branchReps.forEach(r=>{const cat=categoryOf(r);if(!categories.has(cat))categories.set(cat,{branches:[],size1448:0,size1445:0});const g=categories.get(cat),b=branchMap.get(r.num);g.branches.push(r.num);if(b){g.size1448+=b.size1448;g.size1445+=b.sizesByYear["1445"];}}); 
    const catArr=[...categories.entries()].map(([label,g])=>({label,branches:g.branches,size1448:g.size1448,size1445:g.size1445})).sort((a,b)=>b.size1448-a.size1448);
    document.getElementById("rep-metrics").innerHTML=metric("تكليفات الفروع",n(branchReps.length),"ممثل لكل فرع من الفروع الـ٣٤")+metric("ممثلون مختلفون",n(byPerson.size),"بعد دمج الشخص الذي يمثل أكثر من فرع")+metric("يمثلون عدة فروع",n(shared.length),"أشخاص لديهم أكثر من تكليف")+metric("تجميعات مسماة",n(categories.size),"مستخرجة من الاسم المختصر بين القوسين");
    document.getElementById("shared-reps").innerHTML=shared.map(([name,reps])=>"<div class=\"shared-rep-row\"><div><strong>"+esc(reps[0].nameShort)+"</strong><div class=\"text-muted\" style=\"font-size:.8rem\">"+esc(name)+"</div></div><div class=\"pill-list\">"+reps.map(r=>"<span class=\"badge badge-green\">فرع "+n(r.num)+"</span>").join("")+"</div></div>").join("");
    const totalAssigned=branchesData.reduce((s,b)=>s+b.size1448,0);
    document.getElementById("rep-groups-tbody").innerHTML=catArr.map(g=>{const growth=g.size1445?((g.size1448/g.size1445-1)*100):0;return"<tr><td class=\"name-cell\">"+esc(g.label)+"</td><td>"+g.branches.map(x=>n(x)).join("، ")+"</td><td class=\"number\">"+n(g.size1448)+"</td><td class=\"number\">"+(g.size1448/totalAssigned*100).toFixed(1)+"%</td><td><span class=\"badge badge-green\">+"+growth.toFixed(1)+"%</span></td></tr>";}).join("");
    if(repChart)repChart.destroy();repChart=new Chart(document.getElementById("repGroupsChart"),{type:"bar",data:{labels:catArr.map(x=>x.label),datasets:[{label:"مجموع الفروع ١٤٤٨هـ",data:catArr.map(x=>x.size1448),backgroundColor:"rgba(13,118,189,.8)",borderRadius:5}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{rtl:true}},scales:{x:{beginAtZero:true},y:{grid:{display:false}}}}});
  }

  function renderReps(query){
    const q=window.arCompact(query||""),container=document.getElementById("reps-grid");container.innerHTML="";
    const filtered=repsData.filter(r=>!q||window.arCompact(r.name+" "+r.nameShort+" "+r.branch).includes(q));
    filtered.forEach((r,i)=>{const card=document.createElement("div");card.className="card animate-in";card.style.animationDelay=Math.min(i*.025,.4)+"s";const sharedCount=repsData.filter(x=>x.name===r.name&&!x.isSuperRepresentative).length;card.innerHTML="<div class=\"flex justify-between items-center mb-1\"><span class=\"badge "+(r.isSuperRepresentative?"badge-gold":"badge-green")+"\">"+(r.isSuperRepresentative?"ممثل عام":"ممثل فرع "+n(r.num))+"</span><span class=\"text-muted\" style=\"font-size:.8rem\">#"+n(r.treeNumber)+"</span></div><div style=\"font-size:1.05rem;font-weight:700\">"+esc(r.nameShort)+"</div><div class=\"text-muted\" style=\"font-size:.82rem;margin-top:5px\">"+esc(r.name)+"</div><div class=\"flex wrap items-center\" style=\"gap:6px;margin-top:12px\"><span class=\"badge badge-muted\">"+esc(categoryOf(r))+"</span>"+(sharedCount>1?"<span class=\"badge badge-gold\">يمثل "+n(sharedCount)+" فروع</span>":"")+"</div>";container.appendChild(card);});
    document.getElementById("rep-results").textContent="عرض "+n(filtered.length)+" من "+n(repsData.length)+" سجل ممثل";
  }

  function renderTable(sortBy){
    let sorted=[...branchesData];if(sortBy==="size")sorted.sort((a,b)=>b.size1448-a.size1448);else if(sortBy==="size-asc")sorted.sort((a,b)=>a.size1448-b.size1448);else if(sortBy==="alpha")sorted.sort((a,b)=>a.ancestor.localeCompare(b.ancestor,"ar"));
    const tbody=document.getElementById("branch-tbody");tbody.innerHTML="";sorted.forEach(b=>{const growth=(b.size1448-b.sizesByYear["1445"])/b.sizesByYear["1445"]*100,tr=document.createElement("tr");tr.innerHTML="<td class=\"number\" style=\"font-weight:700\">"+n(b.number)+"</td><td class=\"name-cell\">"+esc(b.ancestor)+"</td><td class=\"text-muted\">"+esc(b.location)+"</td><td class=\"number\">"+n(b.size1448)+"</td><td><span class=\"badge "+(growth>0?"badge-green":"badge-muted")+"\">"+(growth>0?"+":"")+growth.toFixed(1)+"%</span></td>";tbody.appendChild(tr);});
  }

  document.getElementById("branch-sort").addEventListener("change",e=>renderTable(e.target.value));
  document.getElementById("rep-search").addEventListener("input",e=>renderReps(e.target.value));
  load();
})();