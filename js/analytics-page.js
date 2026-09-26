(function(){
  "use strict";

  let spatial=null,entities=[],spatialMode="heat";
  let editionChart=null,generationChart=null,diversityChart=null,bandChart=null;

  function n(v){return Number(v||0).toLocaleString("ar-SA");}
  function pct(v,digits){return Number(v||0).toLocaleString("ar-SA",{minimumFractionDigits:digits||0,maximumFractionDigits:digits||0})+"٪";}
  function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
  function css(name,fallback){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback;}
  function metric(label,value,sub){
    return '<div class="card card-stat kpi-card"><div class="card-label">'+esc(label)+'</div><div class="card-value">'+esc(value)+'</div><div class="card-sublabel">'+esc(sub)+'</div></div>';
  }
  function chartColors(){
    return [
      css("--color-chart-1","#0D76BD"),
      css("--color-chart-2","#4ACD7B"),
      css("--color-chart-3","#666258"),
      css("--color-chart-5","#22302E")
    ];
  }
  function chartText(){return css("--color-ink-soft","#666258");}
  function chartGrid(){return css("--color-border","rgba(47,36,21,.06)");}

  function commonChartOptions(){
    return {
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:550},
      layout:{padding:{top:8,right:8,bottom:8,left:8}},
      plugins:{
        legend:{
          position:"top",
          rtl:true,
          labels:{
            color:chartText(),
            usePointStyle:true,
            pointStyle:"circle",
            boxWidth:8,
            padding:16,
            font:{family:"IBM Plex Sans Arabic, sans-serif",size:12}
          }
        },
        tooltip:{
          rtl:true,
          titleAlign:"right",
          bodyAlign:"right",
          padding:12
        }
      },
      scales:{
        x:{
          ticks:{color:chartText(),maxRotation:0,minRotation:0,font:{family:"IBM Plex Sans Arabic, sans-serif",size:11}},
          grid:{display:false}
        },
        y:{
          beginAtZero:true,
          ticks:{color:chartText(),font:{family:"IBM Plex Sans Arabic, sans-serif",size:11}},
          grid:{color:chartGrid()}
        }
      }
    };
  }

  async function load(){
    try{
      const data=await Promise.all([
        fetch("data/statistics.json",{cache:"no-store"}).then(r=>r.json()),
        fetch("data/names.json",{cache:"no-store"}).then(r=>r.json()),
        fetch("data/extraction-report.json",{cache:"no-store"}).then(r=>r.json()),
        fetch("data/entities.json",{cache:"no-store"}).then(r=>r.json()),
        fetch("data/spatial-analysis.json",{cache:"no-store"}).then(r=>r.json()),
        fetch("data/genealogy-report.json",{cache:"no-store"}).then(r=>r.json()),
        fetch("data/quality-issues.json",{cache:"no-store"}).then(r=>r.json())
      ]);

      const stats=data[0],namesData=data[1],report=data[2],genealogy=data[5],quality=data[6];
      entities=(data[3]||[]).filter(e=>e.type==="name");
      spatial=data[4];

      renderOverview(stats,namesData,report,genealogy);
      renderEditions(stats);
      renderGenerations(stats);
      renderNames(namesData);
      renderGenealogy(genealogy);
      renderSpatial();
      renderQuality(quality);
      renderReport(report);

      new MutationObserver(function(){
        refreshCharts();
        drawSpatial();
      }).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    }catch(err){
      console.error(err);
      const main=document.querySelector("main");
      if(main){
        const box=document.createElement("div");
        box.className="disclaimer mt-3";
        box.textContent="تعذر تحميل بعض بيانات التحليلات. أعد تحميل الصفحة أو تحقق من ملفات data.";
        main.prepend(box);
      }
    }
  }

  function renderOverview(stats,namesData,report,genealogy){
    const latest=stats.editions[stats.editions.length-1];
    document.getElementById("overview-kpis").innerHTML=
      metric("إجمالي الأفراد",n(latest.total),"العدد الرسمي في إصدار "+latest.year+"هـ")+
      metric("الأجيال",n(stats.totalGenerations),"من الجيل الأول حتى الحادي عشر")+
      metric("الفروع",n(stats.totalBranches),"فروع العائلة الموثقة")+
      metric("الأسماء الفريدة",n(namesData.uniqueEntityTexts),"تسميات أسماء بعد التطبيع");

    document.getElementById("latest-edition-summary").innerHTML=
      '<div class="summary-row"><span>الإجمالي</span><strong>'+n(latest.total)+'</strong></div>'+
      '<div class="summary-row"><span>الذكور</span><strong>'+n(latest.male)+'</strong></div>'+
      '<div class="summary-row"><span>الإناث</span><strong>'+n(latest.female)+'</strong></div>'+
      '<div class="summary-row"><span>نسبة الإناث</span><strong>'+pct(latest.female/latest.total*100,1)+'</strong></div>'+
      '<div class="summary-row"><span>نصوص الأسماء المستخرجة</span><strong>'+n(report.extracted.name_entities)+'</strong></div>';
  }

  function renderEditions(stats){
    const colors=chartColors(),eds=stats.editions;
    const opts=commonChartOptions();
    opts.plugins.legend.display=true;
    editionChart=new Chart(document.getElementById("editionChart"),{
      type:"bar",
      data:{
        labels:eds.map(e=>e.year+"هـ"),
        datasets:[
          {label:"الإجمالي",data:eds.map(e=>e.total),backgroundColor:colors[0],borderRadius:7,maxBarThickness:52},
          {label:"الذكور",data:eds.map(e=>e.male),backgroundColor:colors[3],borderRadius:7,maxBarThickness:52},
          {label:"الإناث",data:eds.map(e=>e.female),backgroundColor:colors[1],borderRadius:7,maxBarThickness:52}
        ]
      },
      options:opts
    });
  }

  function renderGenerations(stats){
    const colors=chartColors(),gens=stats.generations;
    const opts=commonChartOptions();
    opts.indexAxis="y";
    opts.plugins.legend.display=false;
    opts.scales.x.beginAtZero=true;
    opts.scales.y.grid={display:false};
    opts.scales.y.ticks={
      color:chartText(),
      autoSkip:false,
      font:{family:"IBM Plex Sans Arabic, sans-serif",size:11},
      callback:function(v){return this.getLabelForValue(v);}
    };
    generationChart=new Chart(document.getElementById("generationChart"),{
      type:"bar",
      data:{
        labels:gens.map(g=>g.label),
        datasets:[{label:"الأفراد",data:gens.map(g=>g.sons),backgroundColor:colors[3],borderRadius:6,maxBarThickness:24}]
      },
      options:opts
    });
  }

  function renderNames(namesData){
    const once=namesData.entityFrequency.filter(x=>x.count===1).length;
    const rare=namesData.entityFrequency.filter(x=>x.count<=3).length;
    const common=namesData.entityFrequency.filter(x=>x.count>=10).length;
    const top10=namesData.entityFrequency.slice(0,10).reduce((s,x)=>s+x.count,0);

    document.getElementById("diversity-summary").innerHTML=
      '<div class="summary-row"><span>اسم يظهر مرة واحدة</span><strong>'+n(once)+'</strong></div>'+
      '<div class="summary-row"><span>٣ مرات أو أقل</span><strong>'+n(rare)+'</strong></div>'+
      '<div class="summary-row"><span>١٠ مرات أو أكثر</span><strong>'+n(common)+'</strong></div>'+
      '<div class="summary-row"><span>الأسماء الفريدة</span><strong>'+n(namesData.uniqueEntityTexts)+'</strong></div>'+
      '<div class="summary-row"><span>حصة أعلى ١٠ أسماء</span><strong>'+pct(top10/namesData.totalEntities*100,1)+'</strong></div>';

    document.getElementById("top-names-tbody").innerHTML=namesData.entityFrequency.slice(0,15).map(function(x,i){
      return '<tr><td><span class="rank-badge">'+n(i+1)+'</span></td><td><div class="name-trend"><strong>'+esc(x.text)+'</strong></div></td><td class="number"><strong>'+n(x.count)+'</strong></td><td class="number">'+pct(x.count/namesData.totalEntities*100,1)+'</td></tr>';
    }).join("");

    const colors=chartColors();
    const opts=commonChartOptions();
    opts.plugins.legend.display=true;
    opts.scales=undefined;
    diversityChart=new Chart(document.getElementById("diversityChart"),{
      type:"doughnut",
      data:{
        labels:["مرة واحدة","٢–٥ مرات","٦–٢٠ مرة","أكثر من ٢٠"],
        datasets:[{
          data:[
            namesData.entityFrequency.filter(x=>x.count===1).length,
            namesData.entityFrequency.filter(x=>x.count>=2&&x.count<=5).length,
            namesData.entityFrequency.filter(x=>x.count>=6&&x.count<=20).length,
            namesData.entityFrequency.filter(x=>x.count>20).length
          ],
          backgroundColor:[colors[0],colors[1],colors[2],colors[3]],
          borderWidth:0,
          hoverOffset:4
        }]
      },
      options:opts
    });
  }

  function renderGenealogy(g){
    const coverage=Math.max(0,Math.min(100,Number(g.coveragePercent||0)));
    document.getElementById("coverage-card").innerHTML=
      '<div class="coverage-ring" style="--coverage:'+coverage+'%"><strong>'+pct(coverage,2)+'</strong></div>'+
      '<div class="coverage-copy"><h3>تغطية علاقات الأب الموثقة</h3><p>'+
      'تم توثيق <strong>'+n(g.resolvedParents)+'</strong> علاقات من أصل <strong>'+n(g.totalNameEntities)+'</strong> تسمية اسم. '+
      'المتبقي <strong>'+n(g.unresolvedParents)+'</strong> غير مرتبط حتى الآن، ولا يتم ملؤه بالتخمين.'+
      '</p><div class="mt-2"><a class="btn btn-primary btn-sm" href="digital-tree.html">فتح الشجرة الإلكترونية</a></div></div>';

    const tests=(g.groundTruthTests||[]);
    document.getElementById("genealogy-tests").innerHTML=
      '<div style="font-weight:700;margin-bottom:10px">اختبارات النسب الموثقة</div>'+
      (tests.length?tests.map(function(t){
        return '<div class="summary-row"><span>'+esc(t.expected)+'</span><strong class="'+(t.passed?"text-primary":"")+'">'+(t.passed?"ناجح":"يحتاج مراجعة")+'</strong></div>';
      }).join(""):'<div class="text-muted">لا توجد اختبارات مسجلة.</div>')+
      '<div class="disclaimer mt-2">هذه النسبة تقيس الربط الإلكتروني فقط، ولا تعني أن بيانات الشجرة الأصلية ناقصة.</div>';
  }

  function renderSpatial(){
    if(!spatial)return;
    const maxCell=spatial.grid.densest[0];
    document.getElementById("spatial-metrics").innerHTML=
      metric("نصوص الأسماء",n(spatial.nameLabelCount),"التسميات الداخلة في التحليل المكاني")+
      metric("أعلى خلية كثافة",n(maxCell.count),"صف "+n(maxCell.row)+" · عمود "+n(maxCell.col))+
      metric("مرشحات تداخل",n(spatial.potentialOverlaps.count),"تداخل هندسي محتمل، وليس خطأ مؤكدًا")+
      metric("نطاق المصدر",n(spatial.bounds.width)+" × "+n(spatial.bounds.height),"بوحدات إحداثيات العارض الأصلي");

    document.getElementById("dense-cells-tbody").innerHTML=spatial.grid.densest.slice(0,10).map(function(c){
      return '<tr><td class="number">'+n(c.row)+'</td><td class="number">'+n(c.col)+'</td><td class="number"><strong>'+n(c.count)+'</strong></td><td class="text-muted">X '+n(c.xMin)+'–'+n(c.xMax)+' · Y '+n(c.yMin)+'–'+n(c.yMax)+'</td></tr>';
    }).join("");

    const opts=commonChartOptions();
    opts.plugins.legend.display=false;
    bandChart=new Chart(document.getElementById("spatialBandChart"),{
      type:"bar",
      data:{
        labels:spatial.horizontalBands.map(b=>"النطاق "+b.band),
        datasets:[{label:"عدد نصوص الأسماء",data:spatial.horizontalBands.map(b=>b.count),backgroundColor:chartColors()[1],borderRadius:5,maxBarThickness:42}]
      },
      options:opts
    });

    document.querySelectorAll(".spatial-mode").forEach(function(btn){
      btn.addEventListener("click",function(){
        document.querySelectorAll(".spatial-mode").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        spatialMode=btn.dataset.mode;
        drawSpatial();
      });
    });
    drawSpatial();
    window.addEventListener("resize",drawSpatial);
  }

  function parseHex(hex){
    const h=String(hex||"").trim().replace("#","");
    if(h.length!==6)return[13,118,189];
    return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  }

  function drawSpatial(){
    if(!spatial)return;
    const canvas=document.getElementById("spatial-map"),wrap=canvas.parentElement;
    const viewportW=Math.max(280,wrap.clientWidth-18);
    const naturalAspect=spatial.bounds.width/spatial.bounds.height;
    const cssW=Math.max(620,viewportW);
    const cssH=Math.max(440,Math.min(720,cssW/naturalAspect));
    const dpr=Math.min(window.devicePixelRatio||1,2);

    canvas.width=Math.round(cssW*dpr);
    canvas.height=Math.round(cssH*dpr);
    canvas.style.width=cssW+"px";
    canvas.style.height=cssH+"px";

    const ctx=canvas.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const bg=css("--color-bg-elevated","#fff");
    const ink=css("--color-ink-muted","#666");
    const rgb=parseHex(css("--color-chart-1","#0D76BD"));
    ctx.fillStyle=bg;ctx.fillRect(0,0,cssW,cssH);

    const pad=30,W=cssW-pad*2,H=cssH-pad*2;
    if(spatialMode==="heat"){
      const cellW=W/spatial.grid.cols,cellH=H/spatial.grid.rows;
      spatial.grid.cells.forEach(function(c){
        const alpha=.05+.8*(c.count/spatial.grid.maxCount);
        ctx.fillStyle="rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+alpha.toFixed(3)+")";
        ctx.fillRect(pad+(c.col-1)*cellW,pad+(c.row-1)*cellH,cellW+.5,cellH+.5);
        if(c.count>=spatial.grid.maxCount*.62){
          ctx.fillStyle=alpha>.5?"#fff":ink;
          ctx.font="600 11px IBM Plex Sans Arabic, sans-serif";
          ctx.textAlign="center";ctx.textBaseline="middle";
          ctx.fillText(c.count,pad+(c.col-.5)*cellW,pad+(c.row-.5)*cellH);
        }
      });
    }else{
      ctx.fillStyle="rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+",.42)";
      entities.forEach(function(e){
        const px=pad+(e.x-spatial.bounds.xMin)/spatial.bounds.width*W;
        const py=pad+(e.y-spatial.bounds.yMin)/spatial.bounds.height*H;
        ctx.beginPath();ctx.arc(px,py,1.8,0,Math.PI*2);ctx.fill();
      });
    }
    ctx.strokeStyle=ink;ctx.globalAlpha=.32;ctx.strokeRect(pad,pad,W,H);ctx.globalAlpha=1;
  }

  function renderQuality(items){
    const labels={
      duplicate_exact_texts:"تكرار النصوص",
      duplicate_normalized_names:"تكرار بعد التطبيع",
      labels_with_non_arabic:"نصوص تحتاج مراجعة",
      very_long_labels:"نصوص طويلة",
      very_short_labels:"تسميات قصيرة"
    };
    const wanted=["duplicate_exact_texts","duplicate_normalized_names","labels_with_non_arabic"];
    const found=wanted.map(k=>(items||[]).find(x=>x.category===k)).filter(Boolean);
    document.getElementById("quality-insights").innerHTML=found.map(function(item){
      const sample=(item.examples||[]).slice(0,3).map(function(x){return Array.isArray(x)?x[0]:String(x);}).join("، ");
      return '<div class="card insight-card"><span class="badge badge-muted">'+n(item.count)+'</span><h3>'+esc(labels[item.category]||item.category)+'</h3><p>'+esc(item.description)+'</p>'+(sample?'<p class="mt-1"><strong>أمثلة:</strong> '+esc(sample)+'</p>':'')+'</div>';
    }).join("");
  }

  function renderReport(report){
    document.getElementById("report-card").innerHTML=
      '<p><strong>المصدر الأساسي:</strong> عارض الشجرة وصفحة المعلومات الرسمية التي استُخرجت منها الملفات الحالية.</p>'+
      '<p><strong>الإجمالي الرسمي:</strong> '+n(report.official_totals.total_people)+' فرد. <strong>نصوص الأسماء المستخرجة:</strong> '+n(report.extracted.name_entities)+'.</p>'+
      '<p><strong>مهم:</strong> التسميات النصية ليست سجلات أشخاص مستقلة بالضرورة، لذلك لا يجوز تحويل القرب المكاني أو ترتيب النصوص إلى علاقة أب/ابن.</p>'+
      '<p><strong>القيود المسجلة:</strong></p>'+
      '<ul>'+report.limitations.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+
      '<div class="flex wrap" style="gap:8px;margin-top:16px">'+
      '<a href="data/extraction-report.json" class="btn btn-ghost btn-sm" download>تنزيل تقرير الاستخراج</a>'+
      '<a href="data/genealogy-report.json" class="btn btn-ghost btn-sm" download>تنزيل تقرير النسب الإلكتروني</a>'+
      '</div>';
  }

  function refreshCharts(){
    [editionChart,generationChart,diversityChart,bandChart].forEach(function(ch){
      if(!ch)return;
      const colors=chartColors();
      if(ch===editionChart){
        ch.data.datasets[0].backgroundColor=colors[0];
        ch.data.datasets[1].backgroundColor=colors[3];
        ch.data.datasets[2].backgroundColor=colors[1];
      }else if(ch===generationChart){
        ch.data.datasets[0].backgroundColor=colors[3];
      }else if(ch===diversityChart){
        ch.data.datasets[0].backgroundColor=[colors[0],colors[1],colors[2],colors[3]];
      }else if(ch===bandChart){
        ch.data.datasets[0].backgroundColor=colors[1];
      }
      if(ch.options&&ch.options.plugins&&ch.options.plugins.legend&&ch.options.plugins.legend.labels){
        ch.options.plugins.legend.labels.color=chartText();
      }
      if(ch.options&&ch.options.scales){
        Object.keys(ch.options.scales).forEach(function(k){
          const s=ch.options.scales[k];
          if(s.ticks)s.ticks.color=chartText();
          if(s.grid&&s.grid.display!==false)s.grid.color=chartGrid();
        });
      }
      ch.update("none");
    });
  }

  load();
})();