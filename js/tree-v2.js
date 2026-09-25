(function(){
  "use strict";

  var frame=document.getElementById("viewerFrame");
  var sheet=document.getElementById("sheet");
  var toast=document.getElementById("toast");
  var pickToggle=document.getElementById("pickToggle");
  var personName=document.getElementById("personName");
  var personMeta=document.getElementById("personMeta");
  var chainText=document.getElementById("chainText");
  var nearList=document.getElementById("nearList");
  var actions=document.getElementById("actions");
  var help=document.getElementById("help");

  var entities=[],nameEntities=[],freq=new Map(),byBox=new Map(),byId=new Map();
  var chain=[],selected=null,waitingParent=false,pickMode=true,daughter=false,viewerReady=false;

  function norm(s){
    return String(s||"").normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,"")
      .replace(/\u0640/g,"")
      .replace(/[أإآٱ]/g,"ا").replace(/[ىئ]/g,"ي").replace(/ؤ/g,"و").replace(/ة/g,"ه")
      .replace(/\s+/g,"").replace(/ا{2,}/g,"ا");
  }

  function keyBox(e){
    return [Math.round(+e.x),Math.round(+e.y),Math.round(+e.w),Math.round(+e.h)].join("|");
  }

  function post(msg){
    if(frame.contentWindow) frame.contentWindow.postMessage(msg,location.origin);
  }

  function showToast(msg,ms){
    toast.textContent=msg;
    toast.classList.add("on");
    clearTimeout(showToast.t);
    showToast.t=setTimeout(function(){toast.classList.remove("on");},ms||2200);
  }

  function chainString(){
    if(!chain.length)return "—";
    var out=String(chain[0].text||"");
    for(var i=1;i<chain.length;i++){
      out+=(i===1&&daughter?" بنت ":" بن ")+String(chain[i].text||"");
    }
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
    return {ids:ids,daughter:p.get("daughter")==="1"};
  }

  function restoreHash(){
    var state=parseHash();
    if(!state||!state.ids.length)return;
    var restored=state.ids.map(function(id){return byId.get(id);}).filter(Boolean);
    if(!restored.length)return;
    chain=restored;
    selected=chain[chain.length-1];
    daughter=state.daughter;
    sheet.classList.add("open");
    refresh();
    locate(chain[0]);
    showToast("تم استعادة سلسلة النسب من الرابط.");
  }

  function refresh(){
    chainText.textContent=chainString();
    document.getElementById("undo").disabled=chain.length<2;
    document.getElementById("reset").disabled=chain.length===0;
    document.getElementById("copyChain").disabled=chain.length===0;
    document.getElementById("copyLink").disabled=chain.length===0;
    document.getElementById("genderConnector").textContent="الرابط: "+(daughter?"بنت":"بن");
    actions.classList.toggle("waiting",waitingParent);
    document.getElementById("addFather").textContent=waitingParent?"اضغط الآن على اسم الأب":"أضف الأب من الشجرة";

    if(selected){
      personName.textContent=selected.text;
      var c=freq.get(norm(selected.text))||0;
      personMeta.textContent="الموضع #"+selected.id+" · "+(c?("ظهر "+c+" مرة في بيانات الأسماء"):"اسم في الشجرة");
      renderNear(selected);
    }
    updateHash();
  }

  function renderNear(base){
    if(!nameEntities.length){
      nearList.innerHTML='<span class="empty">جارٍ تحميل البيانات…</span>';
      return;
    }
    var bx=+base.x+(+base.w||0)/2,by=+base.y+(+base.h||0)/2;
    var list=nameEntities.filter(function(e){return e.id!==base.id;}).map(function(e){
      var x=+e.x+(+e.w||0)/2,y=+e.y+(+e.h||0)/2,dx=x-bx,dy=y-by;
      return {e:e,d:Math.sqrt(dx*dx+dy*dy)};
    }).sort(function(a,b){return a.d-b.d;}).slice(0,10);

    nearList.innerHTML="";
    list.forEach(function(item){
      var b=document.createElement("button");
      b.type="button";
      b.className="near-btn";
      b.textContent=item.e.text;
      b.addEventListener("click",function(){acceptEntity(item.e,true);});
      nearList.appendChild(b);
    });
  }

  function locate(e){
    if(!e)return;
    post({type:"locate",q:e.text,cur:0,items:[{x:e.x,y:e.y,w:e.w,h:e.h,label:e.text}]});
  }

  function acceptEntity(e,doLocate){
    if(!e || (e.type&&e.type!=="name")){
      showToast("هذا النص ليس اسمًا معتمدًا في بيانات الأسماء.");
      return;
    }

    selected=e;
    if(waitingParent && chain.length){
      if(chain.some(function(x){return x.id===e.id;})){
        showToast("هذا الاسم موجود بالفعل في السلسلة.");
        return;
      }
      chain.push(e);
      waitingParent=false;
      showToast("تمت إضافة "+e.text+" إلى سلسلة النسب.");
    }else{
      chain=[e];
      waitingParent=false;
    }

    if(doLocate)locate(e);
    sheet.classList.add("open");
    refresh();
  }

  function resolvePicked(d){
    var e=byBox.get(keyBox(d));
    if(!e){
      var best=null,bd=1e9;
      for(var i=0;i<nameEntities.length;i++){
        var n=nameEntities[i],dx=(+n.x)-(+d.x),dy=(+n.y)-(+d.y),v=dx*dx+dy*dy;
        if(v<bd&&v<144){bd=v;best=n;}
      }
      e=best||{id:null,x:d.x,y:d.y,w:d.w,h:d.h,text:d.label,type:"name"};
    }
    acceptEntity(e,false);
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

  document.getElementById("addFather").addEventListener("click",function(){
    if(!chain.length){showToast("اختر الشخص أولًا من الشجرة.");return;}
    waitingParent=!waitingParent;
    refresh();
    if(waitingParent){
      sheet.classList.remove("open");
      showToast("اضغط الآن على اسم الأب في الشجرة.",3200);
    }
  });

  document.getElementById("undo").addEventListener("click",function(){
    if(chain.length>1){
      chain.pop();
      selected=chain[chain.length-1];
      locate(selected);
      refresh();
    }
  });

  document.getElementById("reset").addEventListener("click",function(){
    chain=[];selected=null;waitingParent=false;
    sheet.classList.remove("open");
    refresh();
    post({type:"search",q:""});
  });

  document.getElementById("genderConnector").addEventListener("click",function(){
    daughter=!daughter;refresh();
  });

  document.getElementById("focusSelected").addEventListener("click",function(){
    if(selected){locate(selected);showToast("تم تحديد الاسم على الشجرة.");}
  });

  document.getElementById("copyChain").addEventListener("click",function(){
    if(chain.length)copyText(chainString(),"تم نسخ سلسلة النسب.");
  });

  document.getElementById("copyLink").addEventListener("click",function(){
    if(chain.length)copyText(location.href,"تم نسخ رابط السلسلة.");
  });

  document.getElementById("closeSheet").addEventListener("click",function(){sheet.classList.remove("open");});

  pickToggle.addEventListener("click",function(){
    pickMode=!pickMode;
    post({type:"pickMode",on:pickMode});
    pickToggle.classList.toggle("off",!pickMode);
    pickToggle.textContent="اختيار الأسماء: "+(pickMode?"مفعّل":"متوقف");
    showToast(pickMode?"اضغط على أي اسم لعرضه.":"يمكنك الآن تحريك الشجرة بدون تحديد أسماء.");
  });

  document.getElementById("helpBtn").addEventListener("click",function(){help.classList.add("open");});
  document.getElementById("closeHelp").addEventListener("click",function(){help.classList.remove("open");});
  help.addEventListener("click",function(e){if(e.target===help)help.classList.remove("open");});

  window.addEventListener("message",function(ev){
    if(ev.origin!==location.origin||!ev.data)return;
    if(ev.data.type==="ready"){
      viewerReady=true;
      post({type:"pickMode",on:pickMode});
    }else if(ev.data.type==="picked"){
      resolvePicked(ev.data);
    }else if(ev.data.type==="cur"){
      if(!sheet.classList.contains("open")&&!waitingParent){
        showToast("اضغط على الاسم المحدد لعرض بطاقته وبناء سلسلة النسب.",2600);
      }
    }
  });

  function loadData(){
    return Promise.all([
      fetch("data/entities.json",{cache:"no-store"}).then(function(r){return r.json();}),
      fetch("data/names.json",{cache:"no-store"}).then(function(r){return r.json();})
    ]).then(function(data){
      entities=data[0]||[];
      nameEntities=entities.filter(function(e){return e.type==="name";});
      nameEntities.forEach(function(e){byBox.set(keyBox(e),e);byId.set(+e.id,e);});
      ((data[1]&&data[1].entityFrequency)||[]).forEach(function(n){freq.set(norm(n.text),n.count);});
      restoreHash();
    }).catch(function(){
      showToast("تعذر تحميل بيانات الأسماء، العارض نفسه ما زال يعمل.",3500);
    });
  }

  frame.addEventListener("load",function(){
    setTimeout(function(){post({type:"ping"});post({type:"pickMode",on:pickMode});},500);
  });

  loadData();
  setTimeout(function(){if(!viewerReady)post({type:"ping"});},1300);
  setTimeout(function(){showToast("ابحث عن اسم ثم اضغط عليه لعرض سلسلة النسب.",3200);},1700);
})();