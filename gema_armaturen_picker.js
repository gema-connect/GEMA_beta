/* gema_armaturen_picker.js — wiederverwendbares Armaturen-Auswahl-Widget
   Für Berechnungsmodule (Druckverlust KW, Zirkulation, Heizungsleitungen …):
   - Katalog-Auswahl (GemaArmaturen) mit Zähler, ζ + kvs pro aktueller Dimension
   - Manuelle Einträge: Name + Druckverlust (Einheit konfigurierbar, intern kPa)
   - Druckverlustdiagramm pro Armatur: Lieferanten-Upload (Bild) ODER generierte Δp-Q-Kurve
     mit Betriebspunkt-Markierung (GemaArmaturen.curvePoints)

   API:
   GemaArmaturenPicker.open({
     title, dn, di_mm, Q_ls, v_ms, rho,
     unit: 'kPa'|'Pa'|'mbar',              // Einheit der manuellen Eingaben/Summen (Default kPa)
     mode: 'multi'|'kvs-single',           // kvs-single: eine Armatur wählen → {armaturId,kvs}
     selection: {armaturen:{id:cnt}, manuell:[{name,dp}]},   // dp in kPa
     onSave(result)                        // result = computeSelectionDp(...) + {selection}
   });
   GemaArmaturenPicker.openDiagramm(armaturId, {dn, di_mm, Q_ls, rho});
   GemaArmaturenPicker.drawCurve(canvas, armaturId, {dn, di_mm, Q_ls, rho});   // fürs PDF/Inline
*/
(function(w){
  'use strict';
  var _st=null;   // {opts, sel, sort}
  var UNIT={kPa:{f:1,lbl:'kPa'},Pa:{f:1000,lbl:'Pa'},mbar:{f:10,lbl:'mbar'}};

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function fmt(v,d){return Number.isFinite(v)?v.toFixed(d===undefined?2:d):'–';}

  // ── Styles + Modal einmalig injizieren ──
  function ensureDom(){
    if(document.getElementById('gapModal'))return;
    var css=document.createElement('style');
    css.textContent=
      '#gapModal{position:fixed;inset:0;z-index:11000;background:rgba(8,20,40,.62);backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:18px;overflow-y:auto}'+
      '#gapModal.gap-hidden{display:none}'+
      '.gap-box{background:#fff;border-radius:16px;width:100%;max-width:820px;box-shadow:0 24px 64px rgba(0,0,0,.25);margin:auto;display:flex;flex-direction:column;max-height:92vh;font-family:inherit}'+
      '.gap-hd{padding:13px 18px;border-bottom:1px solid #e2e7f0;display:flex;align-items:center;gap:10px;flex-shrink:0;background:#f8faff;border-radius:16px 16px 0 0}'+
      '.gap-hd-ic{width:34px;height:34px;border-radius:9px;background:#2563eb;color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0}'+
      '.gap-hd-t{font-size:14.5px;font-weight:900;color:#0f172a}'+
      '.gap-hd-s{font-size:11px;color:#64748b;margin-top:1px}'+
      '.gap-x{margin-left:auto;width:30px;height:30px;border-radius:7px;border:1.5px solid #cdd4e4;background:#f4f6fb;cursor:pointer;font-size:13px;color:#64748b}'+
      '.gap-bd{padding:14px 18px;overflow-y:auto;flex:1 1 auto}'+
      '.gap-ft{padding:11px 16px;border-top:1px solid #e2e7f0;background:#f8faff;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0;border-radius:0 0 16px 16px}'+
      '.gap-btn{padding:7px 15px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;border:1.5px solid #cdd4e4;background:#fff;color:#334155;font-family:inherit}'+
      '.gap-btn.pri{background:#2563eb;border-color:#2563eb;color:#fff}'+
      '.gap-sec{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin:14px 0 8px;padding-bottom:5px;border-bottom:2px solid #e2e7f0;display:flex;align-items:center;gap:6px}'+
      '.gap-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}'+
      '@media(max-width:640px){.gap-grid{grid-template-columns:1fr 1fr}}'+
      '.gap-card{border:1.5px solid #cdd4e4;border-radius:10px;padding:9px 10px;background:#fff;transition:.15s}'+
      '.gap-card.active{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 2px rgba(37,99,235,.1)}'+
      '.gap-card-n{font-size:11.5px;font-weight:700;color:#0f172a;line-height:1.3}'+
      '.gap-card-h{font-size:10px;color:#64748b;margin-top:1px}'+
      '.gap-card-z{font-size:10.5px;font-family:ui-monospace,monospace;color:#2563eb;font-weight:600;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}'+
      '.gap-cnt{display:flex;align-items:center;gap:5px;margin-top:6px}'+
      '.gap-cbt{width:24px;height:24px;border-radius:6px;border:1.5px solid #cdd4e4;background:#f4f6fb;font-size:14px;cursor:pointer;font-weight:700;color:#334155}'+
      '.gap-cnum{font-size:13px;font-weight:800;font-family:ui-monospace,monospace;min-width:20px;text-align:center}'+
      '.gap-diag-btn{margin-left:auto;padding:2px 8px;border-radius:6px;border:1px solid #bfcfff;background:#eff6ff;color:#2563eb;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit}'+
      '.gap-manu-row{display:flex;gap:6px;align-items:center;margin-bottom:6px}'+
      '.gap-manu-row input{padding:6px 9px;border:1.5px solid #cdd4e4;border-radius:7px;font-size:12.5px;font-family:inherit;outline:none}'+
      '.gap-manu-row input:focus{border-color:#2563eb}'+
      '.gap-sum{background:#eff6ff;border:1.5px solid #bfcfff;border-radius:9px;padding:8px 13px;margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:center}'+
      '.gap-sum b{font-family:ui-monospace,monospace}'+
      '.gap-sort{padding:5px 12px;border-radius:7px;border:1.5px solid #cdd4e4;background:#fff;color:#64748b;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}'+
      '.gap-sort.active{background:#2563eb;color:#fff;border-color:#2563eb}'+
      '#gapDiag{position:fixed;inset:0;z-index:11500;background:rgba(8,20,40,.7);display:flex;align-items:center;justify-content:center;padding:18px}'+
      '#gapDiag.gap-hidden{display:none}'+
      '.gap-diag-box{background:#fff;border-radius:14px;padding:16px;max-width:640px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3)}'+
      '.gap-diag-t{font-size:13px;font-weight:800;color:#0f172a;margin-bottom:10px;display:flex;align-items:center;gap:8px}';
    document.head.appendChild(css);
    var m=document.createElement('div');
    m.id='gapModal';m.className='gap-hidden';
    m.innerHTML='<div class="gap-box">'+
      '<div class="gap-hd"><div class="gap-hd-ic">🔧</div><div><div class="gap-hd-t" id="gapTitle">Armaturen</div><div class="gap-hd-s" id="gapSub"></div></div><button class="gap-x" onclick="GemaArmaturenPicker.close()">✕</button></div>'+
      '<div class="gap-bd" id="gapBody"></div>'+
      '<div class="gap-ft"><div id="gapFtSum" style="font-size:11.5px;color:#64748b;flex:1"></div>'+
      '<button class="gap-btn" onclick="GemaArmaturenPicker.close()">Abbrechen</button>'+
      '<button class="gap-btn pri" id="gapSave">✓ Übernehmen</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click',function(e){if(e.target===m)close();});
    var d=document.createElement('div');
    d.id='gapDiag';d.className='gap-hidden';
    d.innerHTML='<div class="gap-diag-box"><div class="gap-diag-t" id="gapDiagT"></div><div id="gapDiagBody"></div>'+
      '<div style="text-align:right;margin-top:10px"><button class="gap-btn" onclick="document.getElementById(\'gapDiag\').classList.add(\'gap-hidden\')">Schliessen</button></div></div>';
    document.body.appendChild(d);
    d.addEventListener('click',function(e){if(e.target===d)d.classList.add('gap-hidden');});
    document.getElementById('gapSave').addEventListener('click',save);
    window.addEventListener('keydown',function(e){
      if(e.key!=='Escape')return;
      var dg=document.getElementById('gapDiag');
      if(dg&&!dg.classList.contains('gap-hidden')){dg.classList.add('gap-hidden');return;}
      close();
    });
  }

  // ── Öffnen ──
  function open(opts){
    if(typeof GemaArmaturen==='undefined'){alert('Armaturen-Katalog nicht geladen.');return;}
    ensureDom();
    opts=opts||{};
    _st={
      opts:opts,
      sort:'hersteller',
      sel:{
        armaturen:JSON.parse(JSON.stringify((opts.selection&&opts.selection.armaturen)||{})),
        manuell:JSON.parse(JSON.stringify((opts.selection&&opts.selection.manuell)||[]))
      }
    };
    document.getElementById('gapTitle').textContent=(opts.mode==='kvs-single'?'⚙ Armatur wählen (kvs)':'🔧 Armaturen & Druckverluste')+(opts.title?' – '+opts.title:'');
    document.getElementById('gapSub').textContent=(opts.dn?('Dimension '+opts.dn):'')+(opts.Q_ls>0?(' · Q = '+fmt(opts.Q_ls,3)+' l/s'):'');
    document.getElementById('gapSave').style.display=opts.mode==='kvs-single'?'none':'';
    renderBody();
    document.getElementById('gapModal').classList.remove('gap-hidden');
  }
  function close(){
    var m=document.getElementById('gapModal');
    if(m)m.classList.add('gap-hidden');
    _st=null;
  }

  // ── Body ──
  function renderBody(){
    var body=document.getElementById('gapBody');
    var o=_st.opts;
    var h='';
    h+='<div style="display:flex;gap:6px;margin-bottom:4px">'+
       '<button class="gap-sort'+(_st.sort==='hersteller'?' active':'')+'" onclick="GemaArmaturenPicker._sort(\'hersteller\')">Nach Hersteller</button>'+
       '<button class="gap-sort'+(_st.sort==='typ'?' active':'')+'" onclick="GemaArmaturenPicker._sort(\'typ\')">Nach Typ</button></div>';
    var all=GemaArmaturen.getAll();
    // Optionaler Typ-Filter (opts.typen, z.B. ['druckminderer'] im Druckdispositiv):
    // ohne Angabe bleibt der volle Katalog sichtbar (Bestandsschutz).
    if(Array.isArray(o.typen)&&o.typen.length){
      var tf=all.filter(function(a){return o.typen.indexOf(a.typ)>=0;});
      if(tf.length)all=tf;
    }
    var groups=[];
    if(_st.sort==='hersteller'){
      GemaArmaturen.getHersteller().forEach(function(hn){
        var it=all.filter(function(a){return a.hersteller===hn;});
        if(it.length)groups.push({t:hn,items:it});
      });
      var gen=all.filter(function(a){return !a.hersteller||a.hersteller==='—';});
      if(gen.length)groups.push({t:'Standard (herstellerunabhängig)',items:gen});
    } else {
      GemaArmaturen.getTypen().forEach(function(t){
        var items=all.filter(function(a){return a.typ===t.id;});
        if(items.length)groups.push({t:t.icon+' '+t.name,items:items});
      });
    }
    groups.forEach(function(g){
      h+='<div class="gap-sec">'+esc(g.t)+'</div><div class="gap-grid">';
      g.items.forEach(function(a){h+=cardHtml(a);});
      h+='</div>';
    });
    // Manuelle Einträge
    if(o.mode!=='kvs-single'){
      var u=UNIT[o.unit||'kPa']||UNIT.kPa;
      h+='<div class="gap-sec">✍️ Manuelle Armaturen (Name + Druckverlust)</div><div id="gapManu">';
      _st.sel.manuell.forEach(function(m,i){
        h+='<div class="gap-manu-row">'+
           '<input type="text" style="flex:2" placeholder="Bezeichnung, z.B. Systemtrenner BA" value="'+esc(m.name)+'" oninput="GemaArmaturenPicker._manu('+i+',\'name\',this.value)"/>'+
           '<input type="text" inputmode="decimal" style="width:90px;text-align:right;font-family:ui-monospace,monospace" placeholder="0.0" value="'+esc(m.dp!==''&&m.dp!=null?(Math.round(m.dp*u.f*1000)/1000):'')+'" onchange="GemaArmaturenPicker._manuDp('+i+',this.value)"/>'+
           '<span style="font-size:11px;color:#64748b;width:34px">'+u.lbl+'</span>'+
           '<button class="gap-cbt" title="Entfernen" onclick="GemaArmaturenPicker._manuDel('+i+')">✕</button></div>';
      });
      h+='</div><button class="gap-btn" style="font-size:11.5px;padding:5px 12px" onclick="GemaArmaturenPicker._manuAdd()">+ Manuelle Armatur</button>';
      h+='<div class="gap-sum" id="gapSum"></div>';
    }
    body.innerHTML=h;
    updateSum();
  }

  function cardHtml(a){
    var o=_st.opts;
    var z=GemaArmaturen.getZeta(a.id,o.dn);
    var kvs=GemaArmaturen.getKvs(a.id,o.dn);
    var cnt=_st.sel.armaturen[a.id]||0;
    var hasDiag=!!(a.diagramm&&(a.diagramm.url||a.diagramm.dataUrl))||kvs>0||z>0;
    var badge=a.status==='verifiziert'?' <span style="color:#16a34a;font-size:10px">✓</span>':' <span style="color:#d97706;font-size:10px">⚠</span>';
    var h='<div class="gap-card'+(cnt>0?' active':'')+'" data-gapid="'+esc(a.id)+'">'+
      '<div class="gap-card-n">'+esc(a.name)+badge+'</div>'+
      '<div class="gap-card-h">'+esc(a.hersteller||'—')+(a.serie&&a.serie!=='—'?' · '+esc(a.serie):'')+'</div>'+
      '<div class="gap-card-z">'+
        (kvs>0?'<span>kvs '+fmt(kvs,1)+'</span>':'')+
        '<span>ζ = '+fmt(z,2)+'</span>'+
        (hasDiag?'<button class="gap-diag-btn" onclick="GemaArmaturenPicker._diag(\''+esc(a.id)+'\')">📈 Diagramm</button>':'')+
      '</div>';
    if(o.mode==='kvs-single'){
      if(o.dn){
        h+='<div class="gap-cnt"><button class="gap-btn pri" style="font-size:11px;padding:4px 12px" '+(kvs>0?'onclick="GemaArmaturenPicker._pickKvs(\''+esc(a.id)+'\',\''+esc(o.dn)+'\')"':'disabled style="opacity:.4;font-size:11px;padding:4px 12px"')+'>'+(kvs>0?'kvs '+fmt(kvs,2)+' übernehmen':'kein kvs hinterlegt')+'</button></div>';
      } else {
        // Ohne vorgegebene Dimension: alle hinterlegten kvs-Werte als Auswahl-Buttons (DN-abhängig)
        var kvsKeys=Object.keys(a.kvs||{}).filter(function(d){return parseFloat(a.kvs[d])>0;});
        if(kvsKeys.length){
          h+='<div class="gap-cnt" style="flex-wrap:wrap">'+kvsKeys.map(function(d){
            return '<button class="gap-btn" style="font-size:10.5px;padding:3px 9px;border-color:#bfcfff;color:#2563eb" onclick="GemaArmaturenPicker._pickKvs(\''+esc(a.id)+'\',\''+esc(d)+'\')">DN '+esc(d)+' · kvs '+fmt(parseFloat(a.kvs[d]),2)+'</button>';
          }).join('')+'</div>';
        } else {
          h+='<div class="gap-cnt"><span style="font-size:10.5px;color:#94a3b8">kein kvs hinterlegt</span></div>';
        }
      }
    } else {
      h+='<div class="gap-cnt">'+
        '<button class="gap-cbt" onclick="GemaArmaturenPicker._inc(\''+esc(a.id)+'\',-1)">−</button>'+
        '<span class="gap-cnum">'+cnt+'</span>'+
        '<button class="gap-cbt" onclick="GemaArmaturenPicker._inc(\''+esc(a.id)+'\',1)">+</button></div>';
    }
    return h+'</div>';
  }

  function _inc(id,d){
    var s=_st.sel.armaturen;
    s[id]=(s[id]||0)+d;
    if(s[id]<=0)delete s[id];
    // Karte in place aktualisieren
    var card=document.querySelector('.gap-card[data-gapid="'+id+'"]');
    if(card){
      var cnt=s[id]||0;
      card.classList.toggle('active',cnt>0);
      var n=card.querySelector('.gap-cnum');if(n)n.textContent=cnt;
    }
    updateSum();
  }
  function _sort(m){_st.sort=m;renderBody();}
  function _manuAdd(){_st.sel.manuell.push({name:'',dp:''});renderBody();}
  function _manuDel(i){_st.sel.manuell.splice(i,1);renderBody();}
  function _manu(i,k,v){if(_st.sel.manuell[i])_st.sel.manuell[i][k]=v;updateSum();}
  function _manuDp(i,v){
    var u=UNIT[_st.opts.unit||'kPa']||UNIT.kPa;
    var num=parseFloat(String(v).replace(',','.'));
    if(_st.sel.manuell[i])_st.sel.manuell[i].dp=Number.isFinite(num)?num/u.f:'';   // intern kPa
    updateSum();
  }
  function _pickKvs(id,dn){
    var o=_st.opts;
    var useDn=dn||o.dn;
    var kvs=GemaArmaturen.getKvs(id,useDn);
    var a=GemaArmaturen.getById(id);
    if(o.onSave)o.onSave({mode:'kvs-single',armaturId:id,name:a?a.name:id,dn:useDn,kvs:kvs});
    close();
  }

  function currentResult(){
    var o=_st.opts;
    var res=GemaArmaturen.computeSelectionDp(_st.sel,{dn:o.dn,Q_ls:o.Q_ls,v_ms:o.v_ms,rho:o.rho});
    res.selection=JSON.parse(JSON.stringify(_st.sel));
    return res;
  }
  function updateSum(){
    if(!_st||_st.opts.mode==='kvs-single')return;
    var o=_st.opts;
    var u=UNIT[o.unit||'kPa']||UNIT.kPa;
    var r=currentResult();
    var el=document.getElementById('gapSum');
    if(el)el.innerHTML=
      '<span style="font-size:11.5px;color:#64748b">Σζ (ζ-basiert): <b>'+fmt(r.zetaSum,2)+'</b></span>'+
      '<span style="font-size:11.5px;color:#64748b">Δp kvs-Armaturen: <b>'+fmt(r.dpKvs_kPa*u.f,u.f===1?2:0)+' '+u.lbl+'</b>'+(o.Q_ls>0?'':' <i style="font-size:10px">(Q fehlt)</i>')+'</span>'+
      '<span style="font-size:11.5px;color:#64748b">Δp manuell: <b>'+fmt(r.dpManu_kPa*u.f,u.f===1?2:0)+' '+u.lbl+'</b></span>';
    var ft=document.getElementById('gapFtSum');
    if(ft)ft.textContent='Übernahme: Σζ → ζ-Summe der Teilstrecke · kvs- und manuelle Δp direkt additiv';
  }
  function save(){
    if(!_st)return;
    var o=_st.opts;
    var r=currentResult();
    if(o.onSave)o.onSave(r);
    close();
  }

  // ── Diagramm ──
  function _diag(id){
    var o=_st?_st.opts:{};
    openDiagramm(id,{dn:o.dn,di_mm:o.di_mm,Q_ls:o.Q_ls,rho:o.rho});
  }
  function openDiagramm(armaturId,ctx){
    ensureDom();
    ctx=ctx||{};
    var a=GemaArmaturen.getById(armaturId);
    if(!a)return;
    var d=document.getElementById('gapDiag');
    var t=document.getElementById('gapDiagT');
    var body=document.getElementById('gapDiagBody');
    t.innerHTML='📈 '+esc(a.name)+(ctx.dn?' <span style="font-weight:600;color:#64748b;font-size:11px">· '+esc(ctx.dn)+'</span>':'');
    var h='';
    if(a.diagramm&&(a.diagramm.url||a.diagramm.dataUrl)){
      h+='<div style="font-size:10.5px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:6px">Datenblatt-Diagramm (Lieferant)</div>'+
         '<img src="'+esc(a.diagramm.url||a.diagramm.dataUrl)+'" style="max-width:100%;border:1px solid #e2e7f0;border-radius:8px" alt="Druckverlustdiagramm"/>';
    }
    var pts=GemaArmaturen.curvePoints(armaturId,ctx.dn,{di_mm:ctx.di_mm,rho:ctx.rho,Qmax_ls:ctx.Q_ls>0?ctx.Q_ls*1.6:0});
    if(pts){
      h+='<div style="font-size:10.5px;font-weight:800;text-transform:uppercase;color:#64748b;margin:10px 0 6px">Berechnete Kennlinie ('+(GemaArmaturen.getKvs(armaturId,ctx.dn)>0?'kvs':'ζ')+')</div>'+
         '<canvas id="gapDiagCv" width="580" height="300" style="width:100%;max-width:580px;border:1px solid #e2e7f0;border-radius:8px"></canvas>';
    }
    if(!h)h='<div style="color:#64748b;font-size:12px;padding:12px">Kein Diagramm verfügbar — weder Datenblatt-Upload noch kvs/ζ-Werte für diese Dimension.</div>';
    body.innerHTML=h;
    d.classList.remove('gap-hidden');
    if(pts){var cv=document.getElementById('gapDiagCv');if(cv)_drawCurveOn(cv,armaturId,ctx,pts);}
  }

  // Kurve auf beliebiges Canvas zeichnen (auch für PDF-Sektion in Modulen)
  function drawCurve(canvas,armaturId,ctx){
    ctx=ctx||{};
    var pts=GemaArmaturen.curvePoints(armaturId,ctx.dn,{di_mm:ctx.di_mm,rho:ctx.rho,Qmax_ls:ctx.Q_ls>0?ctx.Q_ls*1.6:0});
    if(!pts)return false;
    _drawCurveOn(canvas,armaturId,ctx,pts);
    return true;
  }
  function _drawCurveOn(canvas,armaturId,octx,pts){
    var g=canvas.getContext('2d');
    var W=canvas.width,H=canvas.height,P={l:52,r:14,t:14,b:34};
    g.clearRect(0,0,W,H);
    g.fillStyle='#fff';g.fillRect(0,0,W,H);
    var qmax=pts[pts.length-1].q||1;
    var dpmax=Math.max.apply(null,pts.map(function(p){return p.dp;}))||1;
    dpmax*=1.08;
    function X(q){return P.l+(W-P.l-P.r)*q/qmax;}
    function Y(dp){return H-P.b-(H-P.t-P.b)*dp/dpmax;}
    // Grid + Achsen
    g.strokeStyle='#e2e7f0';g.lineWidth=1;g.font='10px DM Sans, sans-serif';g.fillStyle='#64748b';
    for(var i=0;i<=5;i++){
      var q=qmax*i/5,x=X(q);
      g.beginPath();g.moveTo(x,P.t);g.lineTo(x,H-P.b);g.stroke();
      g.textAlign='center';g.fillText(q.toFixed(2),x,H-P.b+14);
      var dp=dpmax*i/5,y=Y(dp);
      g.beginPath();g.moveTo(P.l,y);g.lineTo(W-P.r,y);g.stroke();
      g.textAlign='right';g.fillText(dp.toFixed(dp<10?1:0),P.l-6,y+3);
    }
    g.fillStyle='#334155';g.textAlign='center';
    g.fillText('Q [l/s]',(P.l+W-P.r)/2,H-6);
    g.save();g.translate(12,(P.t+H-P.b)/2);g.rotate(-Math.PI/2);g.fillText('Δp [kPa]',0,0);g.restore();
    // Kurve
    g.strokeStyle='#2563eb';g.lineWidth=2;g.beginPath();
    pts.forEach(function(p,i){var x=X(p.q),y=Y(p.dp);if(i===0)g.moveTo(x,y);else g.lineTo(x,y);});
    g.stroke();
    // Betriebspunkt
    if(octx.Q_ls>0){
      var dpOp=GemaArmaturen.getDp(armaturId,octx.dn,{Q_ls:octx.Q_ls,v_ms:octx.v_ms,rho:octx.rho}).dp_kPa;
      if(!(dpOp>0)&&octx.di_mm){ // ζ-Basis ohne v: aus Q + di ableiten
        var A=Math.PI/4*Math.pow(octx.di_mm/1000,2);
        var v=A>0?(octx.Q_ls/1000)/A:0;
        dpOp=GemaArmaturen.getDp(armaturId,octx.dn,{Q_ls:octx.Q_ls,v_ms:v,rho:octx.rho}).dp_kPa;
      }
      if(dpOp>0&&octx.Q_ls<=qmax){
        var px=X(octx.Q_ls),py=Y(Math.min(dpOp,dpmax));
        g.fillStyle='#dc2626';
        g.beginPath();g.arc(px,py,4.5,0,2*Math.PI);g.fill();
        g.strokeStyle='#dc2626';g.setLineDash([4,3]);g.lineWidth=1;
        g.beginPath();g.moveTo(px,H-P.b);g.lineTo(px,py);g.lineTo(P.l,py);g.stroke();
        g.setLineDash([]);
        g.fillStyle='#dc2626';g.font='bold 10px DM Sans, sans-serif';g.textAlign='left';
        g.fillText('Betriebspunkt '+fmt(dpOp,2)+' kPa',Math.min(px+8,W-150),Math.max(py-8,12));
      }
    }
  }

  w.GemaArmaturenPicker={
    open:open, close:close, openDiagramm:openDiagramm, drawCurve:drawCurve,
    _inc:_inc, _sort:_sort, _manu:_manu, _manuDp:_manuDp, _manuAdd:_manuAdd, _manuDel:_manuDel,
    _diag:_diag, _pickKvs:_pickKvs
  };
})(window);
