(function(){
  "use strict";

  var svg=document.getElementById("treeSvg");
  var viewport=document.getElementById("viewport");
  var edgesLayer=document.getElementById("edgesLayer");
  var nodesLayer=document.getElementById("nodesLayer");
  var stage=document.getElementById("graphStage");
  var search=document.getElementById("treeSearch");
  var results=document.getElementById("searchResults");
  var empty=document.getElementById("emptyState");
  var sheet=document.getElementById("personSheet");
  var toast=document.getElementById("toast");

  var people=new Map();
  var children=new Map();
  var genders=new Map();
  var report=null;
  var linkedIds=new Set();
  var expanded=new Set();
  var selectedId=null;
  var positions=new Map();
  var layoutBounds={x:0,y:0,w:1,h:1};
  var view={x:0,y:0,scale:1};
  var initialExpanded=new Set();
  var searchTimer=null;
  var NODE_W=190,NODE_H=66,H_GAP=30,V_GAP=118,PAD=90;
  var pointers=new Map(),panStart=null,pinchStart=null;

  function norm(s){
    return String(s||"").normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,"")
      .replace(/\u0640/g,"")
      .replace(/[أإآٱ]/g,"ا")
      .replace(/[ىئ]/g,"ي")
      .replace(/ؤ/g,"و")
      .replace(/ة/g,"ه")
      .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g,"")
      .replace(/ا{2,}/g,"")
      .toLowerCase();
  }

  function queryParts(q){
    var raw=String(q||"").trim().replace(/[،,]+/g," ").split(/\s+/).filter(Boolean);
    var cleaned=[];
    for(var i=0;i<raw.length;i++){
      var n=norm(raw[i]);
      if(["بن","بنت","ابن","ابنه"].indexOf(n)>=0)continue;
      if(n==="عبد"&&i+1<raw.length){
        cleaned.push(norm(raw[i]+raw[++i]));
      }else cleaned.push(n);
    }
    return cleaned.filter(Boolean);
  }

  function person(id){return people.get(+id)||null;}
  function fatherOf(id){var p=person(id);return p&&p.fatherId!=null?person(p.fatherId):null;}
  function childrenOf(id){return (children.get(+id)||[]).map(person).filter(Boolean);}

  function ancestorsOf(id,limit){
    var out=[],seen=new Set(),cur=person(id),guard=0,max=limit||64;
    while(cur&&cur.fatherId!=null&&guard++<max){
      var next=person(cur.fatherId);
      if(!next||seen.has(next.id))break;
      out.push(next);seen.add(next.id);cur=next;
    }
    return out;
  }

  function lineagePeople(id){
    var p=person(id);if(!p)return[];
    return [p].concat(ancestorsOf(id));
  }

  function isFemale(id){return genders.get(+id)==="female";}

  function fullLineage(id){
    var list=lineagePeople(id);
    if(!list.length)return"";
    var out=list[0].name;
    for(var i=1;i<list.length;i++){
      out+=(i===1&&isFemale(id)?" بنت ":" بن ")+list[i].name;
    }
    return out;
  }

  function lineageKey(id){
    return lineagePeople(id).map(function(p){return norm(p.name);});
  }

  function hasKnownRelation(id){
    var p=person(id);
    return !!(p&&(p.fatherId!=null||(children.get(+id)||[]).length));
  }

  function componentRoot(id){
    var cur=person(id),seen=new Set();
    if(!cur)return null;
    while(cur.fatherId!=null&&!seen.has(cur.id)){
      seen.add(cur.id);
      var f=person(cur.fatherId);
      if(!f)break;
      cur=f;
    }
    return cur.id;
  }

  function rootsForForest(){
    var roots=[];
    linkedIds.forEach(function(id){
      var p=person(id);
      if(!p)return;
      if(p.fatherId==null||!people.has(+p.fatherId))roots.push(p.id);
    });
    roots=Array.from(new Set(roots));
    roots.sort(function(a,b){return String(person(a).name).localeCompare(String(person(b).name),"ar");});
    return roots;
  }

  function buildIndexes(){
    children.clear();linkedIds.clear();
    people.forEach(function(p){
      if(p.fatherId!=null&&people.has(+p.fatherId)){
        if(!children.has(+p.fatherId))children.set(+p.fatherId,[]);
        children.get(+p.fatherId).push(p.id);
        linkedIds.add(p.id);linkedIds.add(+p.fatherId);
      }
    });
    children.forEach(function(ids){
      ids.sort(function(a,b){return String(person(a).name).localeCompare(String(person(b).name),"ar");});
    });

    initialExpanded.clear();
    if(linkedIds.size<=160){
      linkedIds.forEach(function(id){if((children.get(id)||[]).length)initialExpanded.add(id);});
    }else{
      rootsForForest().forEach(function(id){initialExpanded.add(id);});
    }
    expanded=new Set(initialExpanded);
  }

  function searchPeople(q){
    var parts=queryParts(q);
    if(!parts.length)return[];
    var rows=[];
    people.forEach(function(p){
      var name=norm(p.name);
      var firstScore=name===parts[0]?0:(name.indexOf(parts[0])===0?1:(name.indexOf(parts[0])>=0?2:99));
      if(firstScore===99)return;
      var keys=lineageKey(p.id);
      if(parts.length>1){
        if(keys.length<parts.length)return;
        for(var i=1;i<parts.length;i++)if(keys[i]!==parts[i])return;
      }
      rows.push({
        id:p.id,
        score:firstScore+(p.fatherId!=null?0:4),
        linked:hasKnownRelation(p.id),
        lineage:fullLineage(p.id)
      });
    });
    rows.sort(function(a,b){
      return a.score-b.score||
        (b.linked?1:0)-(a.linked?1:0)||
        a.lineage.localeCompare(b.lineage,"ar");
    });
    return rows.slice(0,80);
  }

  function renderSearch(q){
    var parts=queryParts(q),rows=searchPeople(q);
    document.getElementById("clearSearch").style.visibility=q?"visible":"hidden";
    if(!q){results.classList.remove("open");results.innerHTML="";return;}
    results.classList.add("open");
    if(!rows.length){
      results.innerHTML='<div class="search-empty">'+
        (parts.length>1?"لا توجد سلسلة نسب موثقة تطابق هذا البحث. لم يتم استخدام أي تخمين مكاني.":"لا توجد نتيجة مطابقة.")+
        '</div>';
      return;
    }

    if(parts.length>1&&rows.length===1){
      var exact=lineageKey(rows[0].id),ok=true;
      for(var i=0;i<parts.length;i++)if(exact[i]!==parts[i]){ok=false;break;}
      if(ok){
        results.classList.remove("open");
        selectPerson(rows[0].id,true);
        return;
      }
    }

    results.innerHTML="";
    rows.forEach(function(row){
      var p=person(row.id);
      var b=document.createElement("button");
      b.type="button";b.className="search-result";b.setAttribute("role","option");
      var copy=document.createElement("span");copy.className="result-copy";
      var n=document.createElement("span");n.className="result-name";n.textContent=p.name;
      var l=document.createElement("span");l.className="result-lineage";
      l.textContent=row.lineage||p.name;
      copy.appendChild(n);copy.appendChild(l);
      var badge=document.createElement("span");badge.className="result-badge";
      badge.textContent=row.linked?"نسب مرتبط":"غير مرتبط";
      b.appendChild(copy);b.appendChild(badge);
      b.addEventListener("click",function(){
        search.value=parts.length>1?row.lineage:p.name;
        results.classList.remove("open");
        selectPerson(row.id,true);
      });
      results.appendChild(b);
    });
  }

  function visibleChildren(id){
    if(!expanded.has(+id))return[];
    return (children.get(+id)||[]).slice();
  }

  function layoutForest(rootIds){
    positions.clear();
    var widthCache=new Map(),visiting=new Set();

    function measure(id){
      if(widthCache.has(id))return widthCache.get(id);
      if(visiting.has(id))return NODE_W;
      visiting.add(id);
      var kids=visibleChildren(id),w=NODE_W;
      if(kids.length){
        var total=0;
        kids.forEach(function(k,idx){total+=measure(k)+(idx?H_GAP:0);});
        w=Math.max(NODE_W,total);
      }
      visiting.delete(id);widthCache.set(id,w);return w;
    }

    var maxDepth=0;
    function place(id,left,depth,path){
      if(path.has(id))return;
      var nextPath=new Set(path);nextPath.add(id);
      var w=measure(id),kids=visibleChildren(id);
      var x=left+w/2,y=PAD+depth*V_GAP;
      positions.set(id,{x:x,y:y,depth:depth,w:w});
      maxDepth=Math.max(maxDepth,depth);
      if(kids.length){
        var childrenTotal=0;
        kids.forEach(function(k,idx){childrenTotal+=measure(k)+(idx?H_GAP:0);});
        var childLeft=left+(w-childrenTotal)/2;
        kids.forEach(function(k){
          place(k,childLeft,depth+1,nextPath);
          childLeft+=measure(k)+H_GAP;
        });
      }
    }

    var forestWidths=rootIds.map(measure);
    var total=PAD*2;
    forestWidths.forEach(function(w,idx){total+=w+(idx?70:0);});
    var left=PAD;
    rootIds.forEach(function(id,idx){
      place(id,left,0,new Set());
      left+=forestWidths[idx]+70;
    });
    layoutBounds={x:0,y:0,w:Math.max(total,stage.clientWidth||1),h:PAD*2+(maxDepth+1)*V_GAP};
  }

  function svgEl(name,attrs){
    var el=document.createElementNS("http://www.w3.org/2000/svg",name);
    Object.keys(attrs||{}).forEach(function(k){el.setAttribute(k,attrs[k]);});
    return el;
  }

  function selectedAncestrySet(){
    var set=new Set();
    if(selectedId==null)return set;
    set.add(+selectedId);
    ancestorsOf(selectedId).forEach(function(p){set.add(p.id);});
    return set;
  }

  function renderGraph(opts){
    opts=opts||{};
    edgesLayer.innerHTML="";nodesLayer.innerHTML="";
    var roots;
    if(selectedId!=null){
      var root=componentRoot(selectedId);
      roots=root!=null?[root]:[selectedId];
    }else{
      roots=rootsForForest();
    }
    if(!roots.length&&selectedId!=null)roots=[selectedId];

    empty.classList.toggle("hidden",roots.length>0);
    if(!roots.length){positions.clear();return;}

    layoutForest(roots);
    var ancestry=selectedAncestrySet();

    positions.forEach(function(pos,id){
      var p=person(id);
      if(!p||p.fatherId==null||!positions.has(+p.fatherId))return;
      var pp=positions.get(+p.fatherId);
      var y1=pp.y+NODE_H/2,y2=pos.y-NODE_H/2,mid=(y1+y2)/2;
      var path=svgEl("path",{
        d:"M "+pp.x+" "+y1+" C "+pp.x+" "+mid+", "+pos.x+" "+mid+", "+pos.x+" "+y2,
        class:"edge"+(ancestry.has(id)&&ancestry.has(+p.fatherId)?" ancestry":"")
      });
      edgesLayer.appendChild(path);
    });

    positions.forEach(function(pos,id){
      var p=person(id);if(!p)return;
      var g=svgEl("g",{class:"node-group",transform:"translate("+pos.x+" "+pos.y+")"});
      if(id===selectedId)g.classList.add("selected");
      else if(ancestry.has(id))g.classList.add("ancestor");
      else if(selectedId!=null)g.classList.add("dimmed");

      var rect=svgEl("rect",{x:-NODE_W/2,y:-NODE_H/2,width:NODE_W,height:NODE_H,rx:18,class:"node-card"});
      var name=svgEl("text",{x:0,y:-4,class:"node-name"});
      name.textContent=p.name;
      var meta=svgEl("text",{x:0,y:20,class:"node-meta"});
      var count=(children.get(id)||[]).length;
      meta.textContent=count?(count+" أبناء مرتبطين"):(p.fatherId!=null?"نسب موثق":"غير مرتبط");
      g.appendChild(rect);g.appendChild(name);g.appendChild(meta);
      g.addEventListener("pointerdown",function(ev){ev.stopPropagation();});
      g.addEventListener("click",function(ev){
        ev.stopPropagation();selectPerson(id,false);
      });

      if(count){
        var eg=svgEl("g",{transform:"translate("+(NODE_W/2-16)+" "+(NODE_H/2-3)+")"});
        var c=svgEl("circle",{r:13,class:"expand-badge"});
        var t=svgEl("text",{x:0,y:1,class:"expand-text"});t.textContent=expanded.has(id)?"−":"+";
        eg.appendChild(c);eg.appendChild(t);
        eg.addEventListener("pointerdown",function(ev){ev.stopPropagation();});
        eg.addEventListener("click",function(ev){
          ev.stopPropagation();
          if(expanded.has(id))expanded.delete(id);else expanded.add(id);
          renderGraph({keepView:true});
        });
        g.appendChild(eg);
      }
      nodesLayer.appendChild(g);
    });

    if(!opts.keepView)fitToView(false);
    else applyView();
  }

  function applyView(){
    viewport.setAttribute("transform","translate("+view.x+" "+view.y+") scale("+view.scale+")");
  }

  function fitToView(animate){
    if(!positions.size)return;
    var w=stage.clientWidth||1,h=stage.clientHeight||1;
    var pad=55;
    var scale=Math.min((w-pad*2)/layoutBounds.w,(h-pad*2)/layoutBounds.h,1.25);
    scale=Math.max(.24,scale);
    view.scale=scale;
    view.x=(w-layoutBounds.w*scale)/2;
    view.y=(h-layoutBounds.h*scale)/2;
    applyView();
  }

  function centerOn(id,preferredScale){
    var pos=positions.get(+id);if(!pos)return;
    var w=stage.clientWidth||1,h=stage.clientHeight||1;
    if(preferredScale)view.scale=Math.max(.34,Math.min(1.55,preferredScale));
    else view.scale=Math.max(view.scale,.9);
    view.x=w/2-pos.x*view.scale;
    view.y=h/2-pos.y*view.scale;
    applyView();
  }

  function expandPathTo(id){
    var p=person(id),guard=0,seen=new Set();
    while(p&&guard++<64&&!seen.has(p.id)){
      seen.add(p.id);
      if(p.fatherId!=null){
        expanded.add(+p.fatherId);
        p=person(p.fatherId);
      }else break;
    }
    expanded.add(+id);
  }

  function selectPerson(id,fromSearch){
    id=+id;if(!people.has(id))return;
    selectedId=id;
    expandPathTo(id);
    renderGraph({keepView:false});
    centerOn(id,1.05);
    updateSheet();
    empty.classList.add("hidden");
    results.classList.remove("open");
    document.getElementById("statusTitle").textContent=fullLineage(id)||person(id).name;
    if(fromSearch)showToast("تم تحديد "+person(id).name+" في الشجرة.");
  }

  function updateSheet(){
    var p=person(selectedId);
    if(!p){sheet.classList.remove("open");return;}
    document.getElementById("sheetName").textContent=p.name;
    document.getElementById("fullLineage").textContent=fullLineage(p.id)||p.name;
    var f=fatherOf(p.id);
    document.getElementById("fatherValue").textContent=f?f.name:"غير موثق";
    document.getElementById("childrenValue").textContent=String((children.get(p.id)||[]).length);
    document.getElementById("statusValue").textContent=p.fatherId!=null?(p.status==="verified"?"موثق":"مرتبط"):"غير مرتبط";
    sheet.classList.add("open");
  }

  function resetHome(){
    selectedId=null;
    expanded=new Set(initialExpanded);
    sheet.classList.remove("open");
    search.value="";renderSearch("");
    document.getElementById("statusTitle").textContent="العلاقات الموثقة فقط";
    renderGraph({keepView:false});
  }

  function showToast(msg){
    toast.textContent=msg;toast.classList.add("show");
    clearTimeout(showToast.t);showToast.t=setTimeout(function(){toast.classList.remove("show");},2200);
  }

  function zoomAt(clientX,clientY,factor){
    var r=stage.getBoundingClientRect(),px=clientX-r.left,py=clientY-r.top;
    var old=view.scale,next=Math.max(.22,Math.min(2.4,old*factor));
    if(next===old)return;
    var wx=(px-view.x)/old,wy=(py-view.y)/old;
    view.scale=next;
    view.x=px-wx*next;view.y=py-wy*next;applyView();
  }

  stage.addEventListener("wheel",function(ev){
    ev.preventDefault();zoomAt(ev.clientX,ev.clientY,ev.deltaY<0?1.12:.89);
  },{passive:false});

  stage.addEventListener("pointerdown",function(ev){
    pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    stage.setPointerCapture(ev.pointerId);
    if(pointers.size===1){
      panStart={x:ev.clientX,y:ev.clientY,vx:view.x,vy:view.y};
      pinchStart=null;
    }else if(pointers.size===2){
      var pts=Array.from(pointers.values());
      var dx=pts[1].x-pts[0].x,dy=pts[1].y-pts[0].y;
      pinchStart={dist:Math.hypot(dx,dy),scale:view.scale};
      panStart=null;
    }
  });

  stage.addEventListener("pointermove",function(ev){
    if(!pointers.has(ev.pointerId))return;
    pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(pointers.size===1&&panStart){
      view.x=panStart.vx+(ev.clientX-panStart.x);
      view.y=panStart.vy+(ev.clientY-panStart.y);
      applyView();
    }else if(pointers.size===2&&pinchStart){
      var pts=Array.from(pointers.values());
      var dx=pts[1].x-pts[0].x,dy=pts[1].y-pts[0].y;
      var dist=Math.hypot(dx,dy);
      var midX=(pts[0].x+pts[1].x)/2,midY=(pts[0].y+pts[1].y)/2;
      var factor=dist/(pinchStart.dist||dist);
      var target=Math.max(.22,Math.min(2.4,pinchStart.scale*factor));
      var current=view.scale;
      if(Math.abs(target-current)>.002)zoomAt(midX,midY,target/current);
    }
  });

  function endPointer(ev){
    pointers.delete(ev.pointerId);
    if(pointers.size===0){panStart=null;pinchStart=null;}
    else if(pointers.size===1){
      var pt=Array.from(pointers.values())[0];
      panStart={x:pt.x,y:pt.y,vx:view.x,vy:view.y};pinchStart=null;
    }
  }
  stage.addEventListener("pointerup",endPointer);
  stage.addEventListener("pointercancel",endPointer);

  search.addEventListener("input",function(){
    clearTimeout(searchTimer);
    var q=search.value.trim();
    searchTimer=setTimeout(function(){renderSearch(q);},160);
  });
  search.addEventListener("focus",function(){if(search.value.trim())renderSearch(search.value.trim());});
  search.addEventListener("keydown",function(ev){
    if(ev.key==="Enter"){
      var rows=searchPeople(search.value.trim());
      if(rows.length){ev.preventDefault();selectPerson(rows[0].id,true);}
    }
  });
  document.getElementById("clearSearch").addEventListener("click",function(){search.value="";renderSearch("");search.focus();});
  document.addEventListener("pointerdown",function(ev){if(!ev.target.closest(".search-wrap"))results.classList.remove("open");});

  document.querySelectorAll("[data-query]").forEach(function(b){
    b.addEventListener("click",function(){search.value=b.getAttribute("data-query");renderSearch(search.value);search.focus();});
  });

  document.getElementById("zoomIn").addEventListener("click",function(){
    var r=stage.getBoundingClientRect();zoomAt(r.left+r.width/2,r.top+r.height/2,1.18);
  });
  document.getElementById("zoomOut").addEventListener("click",function(){
    var r=stage.getBoundingClientRect();zoomAt(r.left+r.width/2,r.top+r.height/2,.84);
  });
  document.getElementById("fitView").addEventListener("click",function(){fitToView(true);});
  document.getElementById("centerSelected").addEventListener("click",function(){if(selectedId!=null)centerOn(selectedId,1.05);else fitToView(true);});
  document.getElementById("resetView").addEventListener("click",resetHome);
  document.getElementById("closeSheet").addEventListener("click",function(){sheet.classList.remove("open");});

  document.getElementById("showAncestors").addEventListener("click",function(){
    if(selectedId==null)return;
    expandPathTo(selectedId);renderGraph({keepView:false});centerOn(selectedId,1.05);
  });
  document.getElementById("showChildren").addEventListener("click",function(){
    if(selectedId==null)return;
    expanded.add(selectedId);renderGraph({keepView:false});centerOn(selectedId,.95);
  });
  document.getElementById("copyLineage").addEventListener("click",function(){
    if(selectedId==null)return;
    var text=fullLineage(selectedId);
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){showToast("تم نسخ الاسم الكامل.");});
    }else showToast(text);
  });

  window.addEventListener("resize",function(){if(positions.size)fitToView(false);});

  function renderStats(){
    var host=document.getElementById("stats");
    var total=people.size;
    var rel=report&&Number.isFinite(+report.resolvedParents)?+report.resolvedParents:
      Array.from(people.values()).filter(function(p){return p.fatherId!=null;}).length;
    var unresolved=report&&Number.isFinite(+report.unresolvedParents)?+report.unresolvedParents:Math.max(0,total-rel);
    var items=[
      total+" اسم",
      rel+" علاقة موثقة",
      unresolved+" غير مرتبط"
    ];
    host.innerHTML=items.map(function(x){return'<span class="stat-pill">'+x+'</span>';}).join("");
  }

  function load(){
    return Promise.all([
      fetch("data/genealogy.json",{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("genealogy");return r.json();}),
      fetch("data/verified-gender.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():{people:{}};}).catch(function(){return{people:{}};}),
      fetch("data/genealogy-report.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;})
    ]).then(function(data){
      var graph=data[0]||{},gender=data[1]||{};
      report=data[2]||null;
      Object.keys(graph.people||{}).forEach(function(k){
        var raw=graph.people[k],id=+raw.id;
        if(!Number.isFinite(id))id=+k;
        people.set(id,{
          id:id,
          name:String(raw.name||"").trim(),
          fatherId:raw.fatherId==null?null:+raw.fatherId,
          status:raw.status||"unresolved",
          confidence:raw.confidence==null?null:+raw.confidence,
          source:raw.source||null
        });
      });
      Object.keys(gender.people||{}).forEach(function(k){
        if(gender.people[k]&&gender.people[k].gender)genders.set(+k,gender.people[k].gender);
      });
      buildIndexes();renderStats();renderGraph({keepView:false});
      var initialQuery=new URLSearchParams(location.search).get("q");
      if(initialQuery){
        search.value=initialQuery;
        var rows=searchPeople(initialQuery);
        if(rows.length===1){
          selectPerson(rows[0].id,true);
        }else{
          renderSearch(initialQuery);
          search.focus();
        }
      }
    }).catch(function(err){
      empty.classList.remove("hidden");
      empty.querySelector("h1").textContent="تعذر تحميل بيانات الشجرة";
      empty.querySelector("p").textContent="تأكد من وجود data/genealogy.json ثم أعد تحميل الصفحة.";
      console.error(err);
    });
  }

  load();
})();