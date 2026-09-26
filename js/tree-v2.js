(function(){
  "use strict";

  var frame=document.getElementById("viewerFrame");
  var guide=document.getElementById("guide");
  var startHint=document.getElementById("startHint");
  var toast=document.getElementById("toast");
  var personName=document.getElementById("personName");
  var personMeta=document.getElementById("personMeta");
  var chainFlow=document.getElementById("chainFlow");
  var chainCount=document.getElementById("chainCount");
  var help=document.getElementById("help");
  var smartSearch=document.getElementById("smartSearch");
  var searchResults=document.getElementById("searchResults");
  var searchClear=document.getElementById("searchClear");
  var duplicateNav=document.getElementById("duplicateNav");
  var dupLabel=document.getElementById("dupLabel");

  var entities=[],nameEntities=[],freq=new Map(),byId=new Map(),spatial=new Map();
  var chain=[],selected=null,waitingParent=false,daughter=false;
  var viewer=null,viewerHooked=false,selectionEl=null,currentOccurrences=[],occurrenceIndex=0;
  var GRID=140;

  function norm(s){
    return String(s||"").normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,"")
      .replace(/\u0640/g,"")
      .replace(/[أإآٱ]/g,"ا").replace(/[ىئ]/g,"ي").replace(/ؤ/g,"و").replace(/ة/g,"ه")
      .replace(/\s+/g,"").replace(/ا{2,}/g,"ا");
  }

  function center(e){return{x:+e.x+(+e.w||0)/2,y:+e.y+(+e.h||0)/2};}
  function cellKey(x,y){return Math.floor(x/GRID)+"|"+Math.floor(y/GRID);}

  function relationName(){
    if(chain.length<=1)return "الأب";
    if(chain.length===2)return "الجد";
    return "الجد الأعلى";
  }

  function targetName(){
    if(!chain.length)return "";
    return chain[chain.length-1].text||"";
  }

  function buildSpatial(){
    spatial.clear();
    nameEntities.forEach(function(e){
      var c=center(e),k=cellKey(c.x,c.y);
      if(!spatial.has(k))spatial.set(k,[]);
      spatial.get(k).push(e);
    });
  }

  function showToast(msg,ms){
    toast.textContent=msg;
    toast.classList.add("on");
    clearTimeout(showToast.t);
    showToast.t=setTimeout(function(){toast.classList.remove("on");},ms||2200);
  }

  function chainString(){
    if(!chain.length)return "";
    var out=String(chain[0].text||"");
    for(var i=1;i<chain.length;i++)out+=(i===1&&daughter?" بنت ":" بن ")+String(chain[i].text||"");
    return out;
  }

  function updateHash(){
    if(!chain.length){
      if(location.hash)history.replaceState(null,"",location.pathname+location.search);
      return;
    }
    var ids=chain.map(function(e){return e.id;}).filter(function(id){return id!==null&&id!==undefined;});
    var h="chain="+ids.join(",");
    if(daughter)h+="&daughter=1";
    history.replaceState(null,"",location.pathname+location.search+"#"+h);
  }

  function parseHash(){
    var raw=(location.hash||"").replace(/^#/,"");
    if(!raw)return null;
    var p=new URLSearchParams(raw);
    var ids=(p.get("chain")||"").split(",").map(function(v){return parseInt(v,10);}).filter(Number.isFinite);
    return{ids:ids,daughter:p.get("daughter")==="1"};
  }

  function restoreHash(){
    var state=parseHash();
    if(!state||!state.ids.length)return;
    var restored=state.ids.map(function(id){return byId.get(id);}).filter(Boolean);
    if(!restored.length)return;
    chain=restored;
    selected=chain[chain.length-1];
    daughter=state.daughter;
    guide.classList.add("open");
    startHint.classList.add("hidden");
    refresh();
    locate(chain[0]);
    showToast("تم استعادة سلسلة النسب من الرابط.");
  }

  function findViewer(){
    var w;
    try{w=frame.contentWindow;}catch(e){return null;}
    if(!w)return null;
    if(w.viewer&&w.viewer.viewport&&typeof w.viewer.addHandler==="function")return w.viewer;
    var keys=[];
    try{keys=Object.keys(w);}catch(e2){return null;}
    for(var i=0;i<keys.length;i++){
      var v;
      try{v=w[keys[i]];}catch(e3){continue;}
      if(v&&typeof v==="object"&&v.viewport&&v.world&&typeof v.addHandler==="function"&&typeof v.addOverlay==="function")return v;
    }
    return null;
  }

  function waitForViewer(tries){
    viewer=findViewer();
    if(viewer){hookViewer();return;}
    if((tries||0)<45)setTimeout(function(){waitForViewer((tries||0)+1);},300);
    else showToast("البحث الذكي متاح، لكن الضغط المباشر على الرسم لم يرتبط بعد.",3500);
  }

  function hookViewer(){
    if(!viewer||viewerHooked)return;
    viewerHooked=true;
    viewer.addHandler("canvas-click",function(ev){
      if(!ev||ev.quick===false||!ev.position)return;
      var vp=viewer.viewport.pointFromPixel(ev.position);
      var img=viewer.viewport.viewportToImageCoordinates(vp);
      var e=nearestAt(img.x,img.y);
      if(!e)return;
      if(ev.preventDefaultAction!==undefined)ev.preventDefaultAction=true;
      acceptEntity(e,false);
    });
    viewer.addHandler("open",function(){if(selected)highlight(selected);});
    showToast("جاهز — ابحث عن الشخص أو اضغط على اسمه.",2400);
  }

  function nearestAt(x,y){
    var cx=Math.floor(x/GRID),cy=Math.floor(y/GRID),candidates=[];
    for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++){
      var a=spatial.get((cx+dx)+"|"+(cy+dy));
      if(a)candidates=candidates.concat(a);
    }
    var best=null,bestScore=1e9;
    candidates.forEach(function(e){
      var ex=+e.x,ey=+e.y,ew=+e.w||24,eh=+e.h||28;
      var inside=x>=ex-12&&x<=ex+ew+12&&y>=ey-12&&y<=ey+eh+12;
      var c=center(e),d=Math.hypot(c.x-x,c.y-y);
      var score=inside?d:d+90;
      if(score<bestScore&&d<95){best=e;bestScore=score;}
    });
    return best;
  }

  function highlight(e){
    if(!viewer||!e)return;
    if(!selectionEl){
      selectionEl=document.createElement("div");
      selectionEl.className="selection-ring";
    }
    var pad=10;
    var rect=viewer.viewport.imageToViewportRectangle(+e.x-pad,+e.y-pad,(+e.w||28)+pad*2,(+e.h||30)+pad*2);
    try{viewer.removeOverlay(selectionEl);}catch(err){}
    viewer.addOverlay({element:selectionEl,location:rect,checkResize:false});
  }

  function locate(e){
    if(!viewer||!e){selected=e||selected;return;}
    var c=center(e),boxW=520,boxH=360;
    var rect=viewer.viewport.imageToViewportRectangle(c.x-boxW/2,c.y-boxH/2,boxW,boxH);
    viewer.viewport.fitBounds(rect,true);
    highlight(e);
  }

  function occurrencesFor(e){
    var k=norm(e.text);
    return nameEntities.filter(function(x){return norm(x.text)===k;}).sort(function(a,b){return (+a.y)-(+b.y)||(+a.x)-(+b.x);});
  }

  function syncOccurrence(e){
    currentOccurrences=occurrencesFor(e);
    occurrenceIndex=Math.max(0,currentOccurrences.findIndex(function(x){return x.id===e.id;}));
    duplicateNav.classList.toggle("show",currentOccurrences.length>1);
    if(currentOccurrences.length>1)dupLabel.textContent="هذا الاسم موجود "+currentOccurrences.length+" مرات · "+(occurrenceIndex+1)+" من "+currentOccurrences.length;
  }

  function renderChain(){
    chainFlow.innerHTML="";
    if(!chain.length){
      chainFlow.innerHTML='<span style="color:#81786c;font-size:.82rem">لم تبدأ السلسلة بعد.</span>';
      chainCount.textContent="";
      return;
    }
    chain.forEach(function(e,i){
      if(i>0){
        var link=document.createElement("span");
        link.className="chain-link";
        link.textContent=(i===1&&daughter)?"بنت":"بن";
        chainFlow.appendChild(link);
      }
      var b=document.createElement("button");
      b.type="button";
      b.className="chain-person"+(i===0?" root":"");
      b.textContent=e.text;
      b.title="إظهار "+e.text+" على الشجرة";
      b.addEventListener("click",function(){selected=e;locate(e);refresh(false);});
      chainFlow.appendChild(b);
    });
    chainCount.textContent=chain.length===1?"شخص واحد":chain.length+" أسماء";
  }

  function refresh(updateSelected){
    if(updateSelected!==false&&chain.length)selected=chain[chain.length-1];
    renderChain();

    document.getElementById("undo").disabled=chain.length<2;
    document.getElementById("reset").disabled=chain.length===0;
    document.getElementById("copyChain").disabled=chain.length===0;
    document.getElementById("copyLink").disabled=chain.length===0;
    document.getElementById("genderConnector").textContent="الرابط: "+(daughter?"بنت":"بن");

    guide.classList.toggle("waiting",waitingParent);
    if(selected){
      personName.textContent=selected.text;
      syncOccurrence(selected);
      var c=freq.get(norm(selected.text))||currentOccurrences.length||0;
      personMeta.textContent=(c?("ظهر الاسم "+c+" مرة في الشجرة"):"اسم في الشجرة")+" · الموضع #"+selected.id;
    }

    var rel=relationName();
    document.getElementById("nextTitle").textContent="اختر "+rel;
    document.getElementById("nextDesc").textContent=chain.length===1
      ?"بعد الضغط على الزر اختر اسم الأب من الشجرة أو ابحث عنه بالأعلى."
      :"أكمل السلسلة باختيار "+rel+" للشخص الأخير.";
    document.getElementById("nextRelation").textContent="ابدأ اختيار "+rel;

    document.getElementById("waitStep").textContent="أنت الآن تختار "+rel;
    document.getElementById("waitTitle").textContent="اختر "+rel+" لـ "+targetName();
    document.getElementById("waitDesc").textContent="اضغط على الاسم داخل الشجرة، أو اكتب اسمه في البحث بالأعلى. عند الاختيار سيضاف مباشرة إلى السلسلة.";
    document.getElementById("cancelWait").textContent="إلغاء اختيار "+rel;

    smartSearch.placeholder=waitingParent?("ابحث عن "+rel+" لـ "+targetName()):"ابدأ بكتابة اسم الشخص، مثال: عمر";
    updateHash();
  }

  function acceptEntity(e,doLocate){
    if(!e||e.type!=="name"){showToast("هذا الموضع ليس اسمًا معتمدًا في بيانات الأسماء.");return;}

    if(waitingParent&&chain.length){
      if(chain.some(function(x){return x.id===e.id;})){showToast("هذا الاسم موجود بالفعل في السلسلة.");return;}
      chain.push(e);
      selected=e;
      waitingParent=false;
      showToast("تمت إضافة "+e.text+" إلى سلسلة النسب.");
    }else{
      chain=[e];
      selected=e;
      waitingParent=false;
    }

    if(doLocate!==false)locate(e);else highlight(e);
    guide.classList.add("open");
    startHint.classList.add("hidden");
    searchResults.classList.remove("open");
    refresh();
  }

  function searchNames(q){
    var k=norm(q);
    if(!k)return[];
    var exact=[],starts=[],contains=[];
    nameEntities.forEach(function(e){
      var n=norm(e.text);
      if(n===k)exact.push(e);
      else if(n.indexOf(k)===0)starts.push(e);
      else if(n.indexOf(k)>=0)contains.push(e);
    });
    return exact.concat(starts,contains).slice(0,80);
  }

  function renderSearch(q){
    var list=searchNames(q);
    searchClear.style.display=q?"grid":"none";
    if(!q){searchResults.classList.remove("open");searchResults.innerHTML="";return;}
    searchResults.classList.add("open");
    if(!list.length){searchResults.innerHTML='<div class="no-result">لا توجد نتيجة مطابقة في بيانات الأسماء.</div>';return;}

    var seen=new Map();
    searchResults.innerHTML="";
    list.forEach(function(e){
      var k=norm(e.text),idx=(seen.get(k)||0)+1;seen.set(k,idx);
      var total=freq.get(k)||occurrencesFor(e).length||1;
      var b=document.createElement("button");
      b.type="button";
      b.className="result-btn";
      var n=document.createElement("span");n.className="result-name";n.textContent=e.text;
      var m=document.createElement("span");m.className="result-meta";
      m.textContent=total>1?("موضع "+idx+" من "+total):("الموضع #"+e.id);
      b.appendChild(n);b.appendChild(m);
      b.addEventListener("click",function(){
        smartSearch.value=e.text;
        searchResults.classList.remove("open");
        acceptEntity(e,true);
      });
      searchResults.appendChild(b);
    });
  }

  function copyText(text,ok){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){showToast(ok);}).catch(function(){fallbackCopy(text,ok);});
    }else fallbackCopy(text,ok);
  }

  function fallbackCopy(text,ok){
    var ta=document.createElement("textarea");
    ta.value=text;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.opacity="0";
    document.body.appendChild(ta);ta.select();
    try{document.execCommand("copy");showToast(ok);}catch(e){showToast("تعذر النسخ تلقائيًا.");}
    ta.remove();
  }

  document.getElementById("nextRelation").addEventListener("click",function(){
    if(!chain.length){showToast("اختر الشخص أولًا.");return;}
    waitingParent=true;
    refresh();
    guide.classList.add("open");
    smartSearch.value="";
    renderSearch("");
    setTimeout(function(){smartSearch.focus();},120);
  });

  document.getElementById("cancelWait").addEventListener("click",function(){
    waitingParent=false;
    refresh();
  });

  document.getElementById("undo").addEventListener("click",function(){
    if(chain.length>1){
      chain.pop();
      selected=chain[chain.length-1];
      waitingParent=false;
      locate(selected);
      refresh();
    }
  });

  document.getElementById("reset").addEventListener("click",function(){
    chain=[];selected=null;waitingParent=false;currentOccurrences=[];
    guide.classList.remove("open");
    startHint.classList.remove("hidden");
    smartSearch.value="";
    renderSearch("");
    smartSearch.placeholder="ابدأ بكتابة اسم الشخص، مثال: عمر";
    if(viewer&&selectionEl){try{viewer.removeOverlay(selectionEl);}catch(e){}}
    updateHash();
  });

  document.getElementById("genderConnector").addEventListener("click",function(){daughter=!daughter;refresh(false);});
  document.getElementById("focusSelected").addEventListener("click",function(){if(selected){locate(selected);showToast("تم إظهار الاسم على الشجرة.");}});

  document.getElementById("prevOccurrence").addEventListener("click",function(){
    if(currentOccurrences.length<2)return;
    occurrenceIndex=(occurrenceIndex-1+currentOccurrences.length)%currentOccurrences.length;
    var e=currentOccurrences[occurrenceIndex];
    if(chain.length===1)chain=[e];
    selected=e;
    locate(e);
    refresh(false);
  });

  document.getElementById("nextOccurrence").addEventListener("click",function(){
    if(currentOccurrences.length<2)return;
    occurrenceIndex=(occurrenceIndex+1)%currentOccurrences.length;
    var e=currentOccurrences[occurrenceIndex];
    if(chain.length===1)chain=[e];
    selected=e;
    locate(e);
    refresh(false);
  });

  document.getElementById("copyChain").addEventListener("click",function(){if(chain.length)copyText(chainString(),"تم نسخ الاسم الكامل.");});
  document.getElementById("copyLink").addEventListener("click",function(){if(chain.length)copyText(location.href,"تم نسخ رابط السلسلة.");});
  document.getElementById("closeGuide").addEventListener("click",function(){guide.classList.remove("open");});

  document.getElementById("helpBtn").addEventListener("click",function(){help.classList.add("open");});
  document.getElementById("closeHelp").addEventListener("click",function(){help.classList.remove("open");});
  help.addEventListener("click",function(e){if(e.target===help)help.classList.remove("open");});

  var st;
  smartSearch.addEventListener("input",function(){
    clearTimeout(st);
    var q=smartSearch.value.trim();
    st=setTimeout(function(){renderSearch(q);},70);
  });
  smartSearch.addEventListener("focus",function(){if(smartSearch.value.trim())renderSearch(smartSearch.value.trim());});
  searchClear.addEventListener("click",function(){smartSearch.value="";renderSearch("");smartSearch.focus();});
  document.addEventListener("pointerdown",function(e){if(!e.target.closest(".topbar"))searchResults.classList.remove("open");});

  function loadData(){
    return Promise.all([
      fetch("data/entities.json",{cache:"no-store"}).then(function(r){return r.json();}),
      fetch("data/names.json",{cache:"no-store"}).then(function(r){return r.json();})
    ]).then(function(data){
      entities=data[0]||[];
      nameEntities=entities.filter(function(e){return e.type==="name";});
      nameEntities.forEach(function(e){byId.set(+e.id,e);});
      ((data[1]&&data[1].entityFrequency)||[]).forEach(function(n){freq.set(norm(n.text),n.count);});
      buildSpatial();
      restoreHash();
    }).catch(function(){showToast("تعذر تحميل بيانات الأسماء، العارض نفسه ما زال يعمل.",3500);});
  }

  frame.addEventListener("load",function(){setTimeout(function(){waitForViewer(0);},350);});
  loadData().then(function(){setTimeout(function(){try{if(frame.contentDocument&&frame.contentDocument.readyState==="complete")waitForViewer(0);}catch(e){}},400);});
})();