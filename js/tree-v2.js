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
  var verifiedParentByChild=new Map(),localParentByChild=new Map();
  var chain=[],selected=null,waitingParent=false,daughter=false,pendingParent=null;
  var viewer=null,viewerHooked=false,selectionEl=null,currentOccurrences=[],occurrenceIndex=0;
  var GRID=140,LOCAL_REL_KEY="smart-tree-confirmed-relations-v1";

  function norm(s){
    return String(s||"").normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,"")
      .replace(/\u0640/g,"")
      .replace(/[أإآٱ]/g,"ا").replace(/[ىئ]/g,"ي").replace(/ؤ/g,"و").replace(/ة/g,"ه")
      .replace(/\s+/g,"").replace(/ا{2,}/g,"ا");
  }

  function center(e){return{x:+e.x+(+e.w||0)/2,y:+e.y+(+e.h||0)/2};}
  function cellKey(x,y){return Math.floor(x/GRID)+"|"+Math.floor(y/GRID);}

  function loadLocalRelations(){
    localParentByChild.clear();
    try{
      var raw=localStorage.getItem(LOCAL_REL_KEY);
      var parsed=raw?JSON.parse(raw):null;
      var rels=(parsed&&Array.isArray(parsed.relations))?parsed.relations:[];
      rels.forEach(function(r){
        var child=+r.childId,parent=+r.parentId;
        if(Number.isFinite(child)&&Number.isFinite(parent)&&child!==parent)localParentByChild.set(child,parent);
      });
    }catch(e){}
  }

  function saveLocalRelations(){
    var rels=[];
    localParentByChild.forEach(function(parentId,childId){
      rels.push({childId:+childId,parentId:+parentId,status:"verified",source:"manual-confirmation"});
    });
    try{
      localStorage.setItem(LOCAL_REL_KEY,JSON.stringify({version:1,policy:"explicit-only",relations:rels}));
    }catch(e){}
  }

  function effectiveParentId(childId){
    childId=+childId;
    if(verifiedParentByChild.has(childId))return verifiedParentByChild.get(childId);
    if(localParentByChild.has(childId))return localParentByChild.get(childId);
    return null;
  }

  function relationSource(childId){
    childId=+childId;
    if(verifiedParentByChild.has(childId))return "file";
    if(localParentByChild.has(childId))return "local";
    return null;
  }

  function graphChainFrom(start){
    if(!start)return[];
    var out=[start],seen=new Set([+start.id]),cur=start,guard=0;
    while(cur&&guard++<64){
      var pid=effectiveParentId(cur.id);
      if(pid===null||pid===undefined||seen.has(+pid))break;
      var p=byId.get(+pid);
      if(!p)break;
      out.push(p);seen.add(+pid);cur=p;
    }
    return out;
  }

  function graphLabel(start){
    var c=graphChainFrom(start);
    if(c.length<2)return "";
    return c.map(function(e){return e.text;}).join(" ← ");
  }

  function addVerifiedRelation(child,parent){
    if(!child||!parent||child.id===parent.id)return false;
    if(verifiedParentByChild.has(+child.id)){
      return verifiedParentByChild.get(+child.id)===+parent.id;
    }
    localParentByChild.set(+child.id,+parent.id);
    saveLocalRelations();
    return true;
  }

  function injectVerifiedUI(){
    if(document.getElementById("pendingRelationCard"))return;
    var style=document.createElement("style");
    style.textContent=
      ".pending-relation{display:none;margin-top:11px;border-radius:18px;padding:12px 13px;background:#fff8e8;border:1px solid rgba(164,118,24,.24)}"+
      ".pending-relation.show{display:block}.pending-kicker{font-size:.72rem;color:#8a6514;font-weight:850}.pending-title{font-size:1rem;font-weight:900;margin-top:3px}"+
      ".pending-desc{font-size:.77rem;color:#776a4b;line-height:1.65;margin-top:4px}.pending-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}"+
      ".pending-actions button{min-height:44px;border-radius:13px;font-weight:850}.confirm-parent{border:0;background:#22302e;color:#fff}.reject-parent{border:1px solid rgba(47,41,35,.15);background:#fff;color:#514941}"+
      ".result-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}.result-lineage{font-size:.72rem;color:#6f665d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}"+
      ".verified-note{margin-top:9px;font-size:.72rem;color:#6f665d;line-height:1.6}.verified-note strong{color:#22302e}";
    document.head.appendChild(style);

    var next=document.querySelector(".next-card");
    var card=document.createElement("div");
    card.id="pendingRelationCard";card.className="pending-relation";
    card.innerHTML='<div class="pending-kicker">مراجعة يدوية مطلوبة</div><div id="pendingRelationTitle" class="pending-title"></div><div class="pending-desc">لن نعتمد أي علاقة من القرب أو الإحداثيات. راجع اتصال الغصن في الصورة ثم أكّد فقط إذا كنت متأكدًا.</div><div class="pending-actions"><button id="confirmParent" class="confirm-parent" type="button">تأكيد أنه الأب</button><button id="rejectParent" class="reject-parent" type="button">اختيار اسم آخر</button></div>';
    next.parentNode.insertBefore(card,next);

    var row=document.querySelector(".secondary-row");
    var note=document.createElement("div");
    note.className="verified-note";
    note.innerHTML='<strong>سياسة الدقة:</strong> لا توجد علاقات أب/ابن مستنتجة آليًا. السلسلة الذكية تستخدم العلاقات المؤكدة فقط.';
    row.parentNode.insertBefore(note,row);

    var exportBtn=document.createElement("button");
    exportBtn.id="exportRelations";exportBtn.type="button";exportBtn.className="small-btn";exportBtn.textContent="نسخ العلاقات المؤكدة";
    row.appendChild(exportBtn);

    document.getElementById("confirmParent").addEventListener("click",function(){
      if(!pendingParent||!chain.length)return;
      var child=chain[chain.length-1];
      if(!addVerifiedRelation(child,pendingParent)){
        showToast("توجد علاقة موثقة مختلفة لهذا الشخص. لم يتم تغييرها.",3200);
        pendingParent=null;refresh(false);return;
      }
      chain.push(pendingParent);
      var tail=graphChainFrom(pendingParent);
      for(var i=1;i<tail.length;i++){
        if(!chain.some(function(x){return x.id===tail[i].id;}))chain.push(tail[i]);
      }
      selected=pendingParent;pendingParent=null;waitingParent=false;
      showToast("تم اعتماد العلاقة يدويًا على هذا الجهاز.");
      refresh(false);
    });

    document.getElementById("rejectParent").addEventListener("click",function(){
      pendingParent=null;waitingParent=true;selected=chain[chain.length-1];
      showToast("اختر الأب الصحيح من الشجرة أو البحث.");
      refresh(false);
      setTimeout(function(){smartSearch.focus();},120);
    });

    exportBtn.addEventListener("click",function(){
      var rels=[];
      localParentByChild.forEach(function(parentId,childId){
        rels.push({childId:+childId,parentId:+parentId,status:"verified",source:"manual-confirmation"});
      });
      var payload=JSON.stringify({version:1,policy:"explicit-only",relations:rels},null,2);
      copyText(payload,"تم نسخ العلاقات المؤكدة بصيغة JSON.");
    });
  }

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
    var pendingCard=document.getElementById("pendingRelationCard");
    if(pendingCard){
      pendingCard.classList.toggle("show",!!pendingParent);
      if(pendingParent&&chain.length){
        document.getElementById("pendingRelationTitle").textContent=chain[chain.length-1].text+" ← "+pendingParent.text;
      }
    }
    var nextCard=document.querySelector(".next-card");
    if(nextCard)nextCard.style.display=pendingParent?"none":"";
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
      pendingParent=e;
      selected=e;
      waitingParent=false;
      showToast("راجع اتصال الغصن ثم أكّد العلاقة.");
    }else{
      chain=graphChainFrom(e);
      selected=e;
      waitingParent=false;
      pendingParent=null;
      if(chain.length>1)showToast("تم تحميل سلسلة مبنية على علاقات مؤكدة فقط.");
    }

    if(doLocate!==false)locate(e);else highlight(e);
    guide.classList.add("open");
    startHint.classList.add("hidden");
    searchResults.classList.remove("open");
    refresh(false);
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
      var copy=document.createElement("span");copy.className="result-copy";
      var n=document.createElement("span");n.className="result-name";n.textContent=e.text;
      copy.appendChild(n);
      var lineage=graphLabel(e);
      if(lineage){
        var l=document.createElement("span");l.className="result-lineage";l.textContent=lineage;
        copy.appendChild(l);
      }
      var m=document.createElement("span");m.className="result-meta";
      var src=relationSource(e.id);
      m.textContent=(src?(src==="file"?"موثق":"مؤكد")+" · ":"")+(total>1?("موضع "+idx+" من "+total):("الموضع #"+e.id));
      b.appendChild(copy);b.appendChild(m);
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
    pendingParent=null;
    waitingParent=true;
    refresh(false);
    guide.classList.add("open");
    smartSearch.value="";
    renderSearch("");
    setTimeout(function(){smartSearch.focus();},120);
  });

  document.getElementById("cancelWait").addEventListener("click",function(){
    waitingParent=false;
    pendingParent=null;
    refresh(false);
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
    chain=[];selected=null;waitingParent=false;pendingParent=null;currentOccurrences=[];
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
      fetch("data/names.json",{cache:"no-store"}).then(function(r){return r.json();}),
      fetch("data/verified-relations.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():{relations:[]};}).catch(function(){return{relations:[]};})
    ]).then(function(data){
      entities=data[0]||[];
      nameEntities=entities.filter(function(e){return e.type==="name";});
      nameEntities.forEach(function(e){byId.set(+e.id,e);});
      ((data[1]&&data[1].entityFrequency)||[]).forEach(function(n){freq.set(norm(n.text),n.count);});
      verifiedParentByChild.clear();
      ((data[2]&&data[2].relations)||[]).forEach(function(r){
        var child=+r.childId,parent=+r.parentId;
        if(r.status==="verified"&&Number.isFinite(child)&&Number.isFinite(parent)&&child!==parent)verifiedParentByChild.set(child,parent);
      });
      loadLocalRelations();
      buildSpatial();
      injectVerifiedUI();
      restoreHash();
    }).catch(function(){showToast("تعذر تحميل بيانات الأسماء، العارض نفسه ما زال يعمل.",3500);});
  }

  frame.addEventListener("load",function(){setTimeout(function(){waitForViewer(0);},350);});
  loadData().then(function(){setTimeout(function(){try{if(frame.contentDocument&&frame.contentDocument.readyState==="complete")waitForViewer(0);}catch(e){}},400);});
})();