/* gema_chat.js — GEMA-weiter Kontext-Chat (WhatsApp-Stil)
 * ---------------------------------------------------------
 * Direkt-Chats zwischen GEMA-Benutzern (Beteiligte, Lieferanten, Team) mit
 * KONTEXT-Bezug: ein Chat kann aus einem Modul heraus gestartet werden
 * (Ausschreibung, Offertanfrage, Bestellung, Objekt …) und trägt den Bezug
 * als klickbaren Chip im Kopf — beide Seiten wissen sofort, worum es geht
 * und wer schreibt (Name + Rolle + Anzeigebild aus dem GEMA-Profil).
 *
 * UI: 💬-Button in der Nav (neben der Glocke) mit Ungelesen-Badge →
 * rechtes Panel im WhatsApp-Layout (Chat-Liste → Thread mit Bubbles,
 * Tag-Trennern, Lesehäkchen ✓/✓✓, Avatar, Kontext-Chip; Mobile Vollbild).
 *
 * Storage (moduleKey `chat`, ALLES cross-org → NUR GemaSync.saveRecord,
 * NIE persistCollection):
 *   Thread   chat:<id>                  → Pool-Cache gema_chat_threads_pool_v1
 *   Nachricht chatmsg:<threadId>_<id>   → pro Thread via loadCollection
 *                                          (Prefix-Filter) + lokaler Cache
 *                                          gema_chat_msgcache_v1 (LRU, 100/Thread)
 *   Gelesen  chatread:cr_<threadId>_<uid> → gema_chat_read_pool_v1
 *            (ein Record pro User+Thread — keine Schreibkonflikte)
 *
 * Public API:
 *   GemaChat.start({userId?|userIds?|email?|lieferantId?, kontext?, text?})
 *     kontext = {typ, refId, label, url, urlExtern?} — url für den Starter,
 *     urlExtern für die Gegenseite (z.B. Planer→pm_objekte, Lieferant→Dashboard)
 *   GemaChat.open(threadId?) / GemaChat.close() / GemaChat.toggle()
 *   GemaChat.unreadCount()  — Anzahl Threads mit Ungelesenem
 */
(function(w,d){
  'use strict';
  if(w.GemaChat)return;

  var MK='chat';
  var TH_PREFIX='chat:', TH_CACHE='gema_chat_threads_pool_v1';
  var RD_PREFIX='chatread:', RD_CACHE='gema_chat_read_pool_v1';
  var MSG_PREFIX='chatmsg:';
  var MSG_CACHE='gema_chat_msgcache_v1';
  var NOTIF_LOCK='gema_chat_notif_lock_v1';
  var NOTIF_THROTTLE_MS=30*60*1000;
  var META_POLL_MS=45000, MSG_POLL_MS=10000;
  var KONTEXT_ICON={offertanfrage:'📨',ausschreibung:'📋',bestellung:'🛒',objekt:'🏢',regierapport:'📝',abnahme:'✅',klasse:'🎓',frei:'💬'};
  var SENDER_COLORS=['#e11d48','#7c3aed','#0284c7','#d97706','#16a34a','#0891b2','#c026d3','#4f46e5'];

  // ── Pure Helpers (Node-testbar via GemaChat._pure) ──────────────────
  function _esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function _threadKey(userIds,refId){
    var ids=(userIds||[]).slice().map(String).sort();
    return ids.join(',')+'|'+(refId||'direkt');
  }
  function _fmtHM(ts){
    var t=new Date(ts);if(isNaN(t))return '';
    return ('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2);
  }
  function _dayKey(ts){var t=new Date(ts);return isNaN(t)?'':t.getFullYear()+'-'+('0'+(t.getMonth()+1)).slice(-2)+'-'+('0'+t.getDate()).slice(-2);}
  function _dayLabel(ts,now){
    var t=new Date(ts);if(isNaN(t))return '';
    now=now?new Date(now):new Date();
    var d0=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    var d1=new Date(t.getFullYear(),t.getMonth(),t.getDate());
    var diff=Math.round((d0-d1)/86400000);
    if(diff===0)return 'Heute';
    if(diff===1)return 'Gestern';
    return ('0'+t.getDate()).slice(-2)+'.'+('0'+(t.getMonth()+1)).slice(-2)+'.'+t.getFullYear();
  }
  function _listTime(ts,now){
    var t=new Date(ts);if(isNaN(t))return '';
    var lbl=_dayLabel(ts,now);
    if(lbl==='Heute')return _fmtHM(ts);
    if(lbl==='Gestern')return 'Gestern';
    return ('0'+t.getDate()).slice(-2)+'.'+('0'+(t.getMonth()+1)).slice(-2)+'.'+String(t.getFullYear()).slice(-2);
  }
  // Thread ungelesen? letzte Nachricht von jemand anderem + neuer als mein Lesestand
  function _threadUnread(thread,readTs,meId){
    if(!thread||!thread.letzte||!thread.letzte.ts)return false;
    if(thread.letzte.von===meId)return false;
    return !readTs||String(readTs)<String(thread.letzte.ts);
  }
  function _linkify(escapedText){
    return escapedText.replace(/(https?:\/\/[^\s<]+)/g,function(u){
      return '<a href="'+u+'" target="_blank" rel="noopener" style="color:#0369a1;text-decoration:underline">'+u+'</a>';
    });
  }
  function _senderColor(uid){
    var h=0;uid=String(uid||'');
    for(var i=0;i<uid.length;i++)h=((h<<5)-h+uid.charCodeAt(i))|0;
    return SENDER_COLORS[Math.abs(h)%SENDER_COLORS.length];
  }

  // ── State ────────────────────────────────────────────────────────────
  var ST={
    open:false, view:'list', threadId:'', search:'',
    threads:[], reads:[], msgs:{}, drafts:{},   // drafts: threadId → Thread-Objekt (noch nicht gespeichert)
    prefill:'', metaTimer:null, msgTimer:null, booted:false
  };
  var _btn=null,_badge=null,_panel=null;

  // Deep-Link ?chat=<threadId> SOFORT beim Script-Parse sichern: die
  // Rollen-Redirects von gema_auth (z.B. index → sys_workspace) verwerfen
  // die Query-Parameter, bevor der Chat bootet — der Stash in
  // sessionStorage überlebt die Umleitung (TTL 25 s). Kommt der Deep-Link
  // aus der URL, bleibt der Stash für die Zielseite des Redirects stehen
  // und wird erst DORT (bzw. beim Schliessen des Panels) konsumiert.
  var _deepLinkTid='',_deepFromStash=false;
  var DEEPLINK_TTL=25000;
  try{
    _deepLinkTid=new URLSearchParams(location.search).get('chat')||'';
    if(_deepLinkTid){
      sessionStorage.setItem('gema_chat_deeplink',JSON.stringify({tid:_deepLinkTid,ts:Date.now()}));
    }else{
      var stash=JSON.parse(sessionStorage.getItem('gema_chat_deeplink')||'null');
      if(stash&&stash.tid&&(Date.now()-(stash.ts||0))<DEEPLINK_TTL){_deepLinkTid=stash.tid;_deepFromStash=true;}
      else if(stash)sessionStorage.removeItem('gema_chat_deeplink');
    }
  }catch(e){}
  function _deepLinkClear(){try{sessionStorage.removeItem('gema_chat_deeplink');}catch(e){}}

  function _me(){try{return (w.GemaAuth&&GemaAuth.getCurrentUser&&GemaAuth.getCurrentUser())||null;}catch(e){return null;}}
  function _users(){try{return (w.GemaAuth&&GemaAuth.getUsers&&GemaAuth.getUsers())||[];}catch(e){return [];}}
  function _orgs(){try{return (w.GemaAuth&&GemaAuth.getOrgs&&GemaAuth.getOrgs())||[];}catch(e){return [];}}
  function _roles(){try{return (w.GemaAuth&&GemaAuth.getRoles&&GemaAuth.getRoles())||[];}catch(e){return [];}}
  function _userById(id){return _users().find(function(u){return u&&u.id===id;})||null;}
  function _userByEmail(email){
    var e=String(email||'').trim().toLowerCase();if(!e)return null;
    return _users().find(function(u){
      if(!u||u.active===false)return false;
      var m=(u.profile&&u.profile.email)||u.username||'';
      return String(m).toLowerCase()===e||String(u.username||'').toLowerCase()===e;
    })||null;
  }
  function _orgName(orgId){var o=_orgs().find(function(x){return x&&x.id===orgId;});return o?(o.name||''):'';}
  function _roleLabel(user){
    if(!user||!user.roleIds||!user.roleIds.length)return '';
    var r=_roles().find(function(x){return x&&x.id===user.roleIds[0];});
    return r?(r.name||''):'';
  }
  function _cached(key){
    try{
      if(w.GemaSync&&GemaSync.getCached){var a=GemaSync.getCached(key);if(Array.isArray(a))return a;}
      return JSON.parse(localStorage.getItem(key)||'[]');
    }catch(e){return [];}
  }
  function _now(){return new Date().toISOString();}
  function _id(p){return p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);}

  // ── Nachrichten-Cache (localStorage, LRU) ────────────────────────────
  function _msgCacheRead(){try{return JSON.parse(localStorage.getItem(MSG_CACHE)||'{}');}catch(e){return {};}}
  function _msgCacheWrite(tid,list){
    try{
      var all=_msgCacheRead();
      all[tid]=list.slice(-100);
      var keys=Object.keys(all);
      if(keys.length>30){ // LRU: älteste Threads (nach letzter Nachricht) raus
        keys.sort(function(a,b){
          var la=(all[a][all[a].length-1]||{}).ts||'', lb=(all[b][all[b].length-1]||{}).ts||'';
          return la<lb?-1:1;
        });
        while(keys.length>30){delete all[keys.shift()];}
      }
      localStorage.setItem(MSG_CACHE,JSON.stringify(all));
    }catch(e){}
  }
  function _msgsFor(tid){
    if(!ST.msgs[tid]){
      var c=_msgCacheRead();
      ST.msgs[tid]=Array.isArray(c[tid])?c[tid]:[];
    }
    return ST.msgs[tid];
  }
  function _mergeMsgs(tid,incoming){
    var cur=_msgsFor(tid),seen={},changed=false;
    cur.forEach(function(m){seen[m.id]=true;});
    (incoming||[]).forEach(function(m){
      if(!m||!m.id)return;
      if(seen[m.id]){ // ggf. _pending durch Server-Stand ersetzen
        var i=cur.findIndex(function(x){return x.id===m.id;});
        if(i>=0&&cur[i]._pending){cur[i]=m;changed=true;}
        return;
      }
      cur.push(m);seen[m.id]=true;changed=true;
    });
    if(changed){
      cur.sort(function(a,b){return String(a.ts).localeCompare(String(b.ts));});
      _msgCacheWrite(tid,cur);
    }
    return changed;
  }

  // ── Threads / Lesestand ──────────────────────────────────────────────
  function _myThreads(){
    var me=_me();if(!me)return [];
    var pool=_cached(TH_CACHE).filter(function(t){
      return t&&t.teilnehmerIds&&t.teilnehmerIds.indexOf(me.id)>=0;
    });
    Object.keys(ST.drafts).forEach(function(tid){
      if(!pool.some(function(t){return t.id===tid;}))pool.push(ST.drafts[tid]);
    });
    pool.sort(function(a,b){
      var ta=(a.letzte&&a.letzte.ts)||a.erstelltAm||'', tb=(b.letzte&&b.letzte.ts)||b.erstelltAm||'';
      return tb.localeCompare(ta);
    });
    return pool;
  }
  function _threadById(tid){
    return _cached(TH_CACHE).find(function(t){return t&&t.id===tid;})||ST.drafts[tid]||null;
  }
  function _myReadTs(tid){
    var me=_me();if(!me)return '';
    var r=_cached(RD_CACHE).find(function(x){return x&&x.threadId===tid&&x.userId===me.id;});
    return r?(r.ts||''):'';
  }
  function _readTsOf(tid,uid){
    var r=_cached(RD_CACHE).find(function(x){return x&&x.threadId===tid&&x.userId===uid;});
    return r?(r.ts||''):'';
  }
  function _unreadThreads(){
    var me=_me();if(!me)return [];
    return _myThreads().filter(function(t){return _threadUnread(t,_myReadTs(t.id),me.id);});
  }
  function _markRead(tid){
    var me=_me();if(!me)return;
    var rec={id:'cr_'+tid+'_'+me.id,threadId:tid,userId:me.id,ts:_now()};
    // lokalen Cache aktualisieren
    try{
      var arr=_cached(RD_CACHE).filter(function(x){return !(x&&x.id===rec.id);});
      arr.push(rec);
      localStorage.setItem(RD_CACHE,JSON.stringify(arr));
    }catch(e){}
    if(w.GemaSync)GemaSync.saveRecord(MK,RD_PREFIX+rec.id,rec).catch(function(){});
    _renderBadge();
  }
  function _saveThreadLocal(t){
    try{
      var arr=_cached(TH_CACHE).filter(function(x){return !(x&&x.id===t.id);});
      arr.push(t);
      localStorage.setItem(TH_CACHE,JSON.stringify(arr));
    }catch(e){}
  }

  // ── Teilnehmer-Snapshot ──────────────────────────────────────────────
  function _snap(user){
    return {userId:user.id,name:user.name||user.username||'?',firma:_orgName(user.orgId),rolle:_roleLabel(user)};
  }
  function _others(thread){
    var me=_me();var mid=me?me.id:'';
    return (thread.teilnehmer||[]).filter(function(p){return p.userId!==mid;});
  }
  function _threadTitle(thread){
    // Gruppen (z.B. Klassen-Chat) tragen einen festen Titel — die
    // Teilnehmerliste wäre bei 20 Studierenden unlesbar.
    if(thread&&thread.titel)return thread.titel;
    var o=_others(thread);
    if(!o.length)return 'Ich';
    if(o.length===1)return o[0].name;
    return o.map(function(p){return p.name.split(/\s+/)[0];}).slice(0,3).join(', ')+(o.length>3?' +'+(o.length-3):'');
  }
  function _avatarHtml(user,part,size){
    // user = voller GemaAuth-User (falls auffindbar) → Anzeigebild aus dem Profil
    if(w.GemaAvatar&&user)return GemaAvatar.render(user,size,{});
    var av=user&&(user.avatar||(user.profile&&user.profile.avatar));
    var name=(user&&(user.name||user.username))||(part&&part.name)||'?';
    var base='width:'+size+'px;height:'+size+'px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;';
    if(av)return '<span style="'+base+'background:#e2e7f0"><img src="'+_esc(av)+'" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></span>';
    var parts=String(name).trim().split(/\s+/).filter(Boolean);
    var ini=parts.length>1?(parts[0][0]+parts[parts.length-1][0]):String(name).slice(0,2);
    var col=_senderColor((part&&part.userId)||(user&&user.id)||name);
    return '<span style="'+base+'background:'+col+';color:#fff;font-size:'+Math.max(10,Math.round(size*0.4))+'px;font-weight:800">'+_esc(ini.toUpperCase())+'</span>';
  }
  function _threadAvatar(thread,size){
    // Gruppen-Avatar: fester Kreis mit dem Kontext-Symbol (🎓 Klasse …)
    // statt des Zwei-Personen-Stapels — die Gruppe ist EIN Gesprächsraum.
    if(thread&&thread.gruppe){
      var gic=KONTEXT_ICON[(thread.kontext&&thread.kontext.typ)||'']||'👥';
      return '<span style="width:'+size+'px;height:'+size+'px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;background:'+_senderColor(thread.id)+';font-size:'+Math.round(size*0.5)+'px">'+gic+'</span>';
    }
    var o=_others(thread);
    if(o.length===1)return _avatarHtml(_userById(o[0].userId),o[0],size);
    if(!o.length)return _avatarHtml(_me(),null,size);
    // Gruppe: Stapel aus zwei
    return '<span style="position:relative;width:'+size+'px;height:'+size+'px;flex-shrink:0;display:inline-block">'
      +'<span style="position:absolute;left:0;top:0;transform:scale(.72);transform-origin:top left">'+_avatarHtml(_userById(o[0].userId),o[0],size)+'</span>'
      +'<span style="position:absolute;right:0;bottom:0;transform:scale(.72);transform-origin:bottom right;box-shadow:0 0 0 2px #fff;border-radius:50%">'+_avatarHtml(_userById(o[1].userId),o[1],size)+'</span></span>';
  }
  function _kontextChip(thread,clickable){
    var k=thread&&thread.kontext;
    if(!k||!k.label)return '';
    var ic=KONTEXT_ICON[k.typ]||'🔗';
    var me=_me();
    var url=(me&&thread.erstelltVon===me.id)?(k.url||k.urlExtern||''):(k.urlExtern||k.url||'');
    var inner=ic+' '+_esc(k.label);
    if(clickable&&url)return '<a class="gc-ctx" href="'+_esc(url)+'" title="Zum Bezug wechseln">'+inner+' ↗</a>';
    return '<span class="gc-ctx">'+inner+'</span>';
  }

  // ── Cloud-Sync ───────────────────────────────────────────────────────
  function _pullMeta(){
    if(!w.GemaSync||!_me())return Promise.resolve();
    return Promise.all([
      GemaSync.bindCollection(MK,TH_CACHE,TH_PREFIX,'id').catch(function(){}),
      GemaSync.bindCollection(MK,RD_CACHE,RD_PREFIX,'id').catch(function(){})
    ]).then(function(){
      _renderBadge();
      if(ST.open&&ST.view==='list')_renderList();
    });
  }
  function _pullMsgs(tid){
    if(!w.GemaSync||!tid)return Promise.resolve(false);
    return GemaSync.loadCollection(MK,MSG_PREFIX+tid+'_').then(function(rows){
      var incoming=(rows||[]).map(function(r){return r&&r.data;}).filter(Boolean);
      var changed=_mergeMsgs(tid,incoming);
      if(changed&&ST.open&&ST.view==='thread'&&ST.threadId===tid){
        _renderThread();
        if(!d.hidden)_markRead(tid);
      }
      return changed;
    }).catch(function(){return false;});
  }

  // ── Senden ───────────────────────────────────────────────────────────
  function _send(tid,text){
    var me=_me();if(!me)return;
    text=String(text||'').trim();
    if(!text)return;
    var thread=_threadById(tid);
    if(!thread)return;
    var msg={id:_id('chm'),threadId:tid,von:me.id,vonName:me.name||me.username||'?',
      vonRolle:_roleLabel(me),text:text,ts:_now(),_pending:true};
    var list=_msgsFor(tid);
    list.push(msg);
    _msgCacheWrite(tid,list);
    // Thread aktualisieren (Draft → echter Record beim ersten Senden)
    delete ST.drafts[tid];
    thread.letzte={text:text.slice(0,140),von:me.id,vonName:msg.vonName,ts:msg.ts};
    thread.updatedAt=msg.ts;
    _saveThreadLocal(thread);
    if(w.GemaSync){
      var clean={};Object.keys(msg).forEach(function(k){if(k!=='_pending')clean[k]=msg[k];});
      GemaSync.saveRecord(MK,MSG_PREFIX+tid+'_'+msg.id,clean).then(function(){
        delete msg._pending;
        _msgCacheWrite(tid,list);
        if(ST.threadId===tid&&ST.view==='thread')_renderThread();
      }).catch(function(){});
      GemaSync.saveRecord(MK,TH_PREFIX+thread.id,thread).catch(function(){});
    }
    _markRead(tid);
    _notifyOthers(thread,msg);
    _renderThread();
  }
  function _notifyOthers(thread,msg){
    if(!w.GemaNotify)return;
    var me=_me();if(!me)return;
    var lock={};
    try{lock=JSON.parse(localStorage.getItem(NOTIF_LOCK)||'{}');}catch(e){}
    var nowMs=Date.now(),dirty=false;
    _others(thread).forEach(function(p){
      var key=thread.id+'|'+p.userId;
      if(lock[key]&&nowMs-lock[key]<NOTIF_THROTTLE_MS)return;
      lock[key]=nowMs;dirty=true;
      var url=(thread.kontext&&(thread.kontext.urlExtern||thread.kontext.url))||'index.html';
      url+=(url.indexOf('?')>=0?'&':'?')+'chat='+encodeURIComponent(thread.id);
      try{
        GemaNotify.push({
          eventKey:'chat_nachricht',empfaengerUserId:p.userId,modul:'chat',typ:'info',
          titel:'💬 Neue Nachricht von '+(msg.vonName||'?'),
          text:(thread.kontext&&thread.kontext.label?('['+thread.kontext.label+'] '):'')+msg.text.slice(0,120),
          link:url
        });
      }catch(e){}
    });
    if(dirty){try{localStorage.setItem(NOTIF_LOCK,JSON.stringify(lock));}catch(e){}}
  }

  // ── Start-API ────────────────────────────────────────────────────────
  function start(opts){
    opts=opts||{};
    var me=_me();
    if(!me){_alert('Bitte zuerst anmelden.');return false;}
    // Empfänger auflösen
    var targets=[];
    if(Array.isArray(opts.userIds))opts.userIds.forEach(function(id){var u=_userById(id);if(u)targets.push(u);});
    if(opts.userId){var u1=_userById(opts.userId);if(u1)targets.push(u1);}
    if(opts.email){var u2=_userByEmail(opts.email);if(u2)targets.push(u2);}
    if(opts.lieferantId){
      _users().forEach(function(u){
        if(u&&u.active!==false&&u.lieferantId===opts.lieferantId)targets.push(u);
      });
    }
    var seen={};targets=targets.filter(function(u){
      if(!u||u.id===me.id||u.active===false||seen[u.id])return false;
      seen[u.id]=true;return true;
    });
    if(!targets.length){
      _alert('Kein GEMA-Benutzer gefunden — der Kontakt hat (noch) kein GEMA-Login.');
      return false;
    }
    var ids=[me.id].concat(targets.map(function(u){return u.id;}));
    var key=_threadKey(ids,opts.kontext&&opts.kontext.refId);
    var thread=_cached(TH_CACHE).find(function(t){return t&&t.key===key;})
      ||Object.keys(ST.drafts).map(function(k){return ST.drafts[k];}).find(function(t){return t.key===key;});
    if(!thread){
      thread={id:_id('cht'),key:key,
        teilnehmerIds:ids.slice().sort(),
        teilnehmer:[_snap(me)].concat(targets.map(_snap)),
        kontext:opts.kontext?{
          typ:opts.kontext.typ||'frei',refId:opts.kontext.refId||'',
          label:String(opts.kontext.label||'').slice(0,120),
          url:opts.kontext.url||'',urlExtern:opts.kontext.urlExtern||''
        }:null,
        erstelltVon:me.id,erstelltAm:_now(),letzte:null,updatedAt:_now()};
      ST.drafts[thread.id]=thread;
    }
    ST.prefill=opts.text||'';
    _openPanel();
    _openThread(thread.id);
    return thread.id;
  }
  // ── Gruppen-Chat (z.B. Klassen-Chat Dozent + Studierende) ────────────
  // ensureGruppe legt einen Gruppen-Thread mit STABILER, deterministischer
  // ID an bzw. synct die Mitgliederliste nach. KRITISCH — warum nicht
  // start(): dessen Thread-Key hängt an den sortierten userIds; tritt ein
  // Studierender der Klasse bei, änderte sich der Key und es entstünde ein
  // NEUER Thread (alle bisherigen Nachrichten wären verwaist). Hier ist der
  // Key fix ('grp|<gruppeId>'), die Mitglieder wandern MIT dem Thread.
  // Die deterministische ID ('chtgrp_<gruppeId>') macht den Aufruf
  // idempotent — laufen die Clients mehrerer Mitglieder gleichzeitig,
  // upserted saveRecord immer denselben Record (kein Duplikat).
  // Läuft im Hintergrund (Boot ab_klassen/sys_workspace) und öffnet NIE
  // das Panel. Mitglieder-Änderungen (Beitritt/Entfernen) kommen beim
  // nächsten ensure-Lauf irgendeines Mitglieds an — eventual consistent.
  function ensureGruppe(opts){
    opts=opts||{};
    var me=_me();
    if(!me||!opts.gruppeId)return null;
    var ids={};ids[me.id]=1;
    (opts.userIds||[]).forEach(function(id){
      var u=_userById(id);
      if(id&&(!u||u.active!==false))ids[id]=1;   // unbekannte IDs behalten (User-Pool evtl. noch nicht geladen)
    });
    var soll=Object.keys(ids).sort();
    if(soll.length<2)return null;                 // Gruppe braucht mind. 2 Personen
    var tid='chtgrp_'+String(opts.gruppeId).replace(/[^a-zA-Z0-9_-]/g,'');
    var thread=_threadById(tid);
    var titel=String(opts.titel||'Gruppe').slice(0,80);
    if(!thread){
      thread={id:tid,key:'grp|'+opts.gruppeId,gruppe:true,titel:titel,
        teilnehmerIds:soll,
        teilnehmer:soll.map(function(id){var u=_userById(id);return u?_snap(u):{userId:id,name:'?',firma:'',rolle:''};}),
        kontext:opts.kontext?{
          typ:opts.kontext.typ||'frei',refId:opts.kontext.refId||'',
          label:String(opts.kontext.label||'').slice(0,120),
          url:opts.kontext.url||'',urlExtern:opts.kontext.urlExtern||opts.kontext.url||''
        }:null,
        erstelltVon:me.id,erstelltAm:_now(),letzte:null,updatedAt:_now()};
      _saveThreadLocal(thread);
      if(w.GemaSync)GemaSync.saveRecord(MK,TH_PREFIX+tid,thread).catch(function(){});
      _renderBadge();
      if(ST.open&&ST.view==='list')_renderList();
      return tid;
    }
    // Mitglieder-/Titel-Sync — NUR bei echter Änderung speichern (sonst
    // erzeugte jeder Boot jedes Mitglieds einen Cloud-Write). updatedAt
    // bleibt dabei unangetastet: ein reiner Mitglieder-Sync darf den
    // Thread in der Liste nicht nach oben schieben.
    var ist=(thread.teilnehmerIds||[]).slice().sort();
    var dirty=ist.join(',')!==soll.join(',')||(titel&&thread.titel!==titel);
    if(dirty){
      var alteSnaps={};(thread.teilnehmer||[]).forEach(function(p){alteSnaps[p.userId]=p;});
      thread.teilnehmerIds=soll;
      thread.teilnehmer=soll.map(function(id){
        var u=_userById(id);
        return u?_snap(u):(alteSnaps[id]||{userId:id,name:'?',firma:'',rolle:''});
      });
      thread.titel=titel;
      thread.gruppe=true;
      _saveThreadLocal(thread);
      if(w.GemaSync)GemaSync.saveRecord(MK,TH_PREFIX+tid,thread).catch(function(){});
      if(ST.open&&ST.view==='list')_renderList();
    }
    return tid;
  }

  function _alert(msg){
    if(w.GemaDialog&&GemaDialog.alert)GemaDialog.alert({title:'Chat',message:msg});
    else alert(msg);
  }

  // ── Styles ───────────────────────────────────────────────────────────
  function _injectStyle(){
    if(d.getElementById('gema-chat-style'))return;
    var css=''
      +'.gc-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:32px;padding:0;border-radius:8px;border:1px solid var(--brd2,#c8cfdf);background:#fff;color:var(--txt2,#334155);font-size:15px;cursor:pointer;transition:.15s;font-family:inherit}'
      +'.gc-btn:hover{background:var(--bg2,#f1f5f9)}'
      +'.gc-bdg{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#16a34a;color:#fff;font-size:10px;font-weight:800;display:none;align-items:center;justify-content:center;line-height:1;box-shadow:0 0 0 2px #fff}'
      +'.gc-bdg.has{display:flex}'
      +'.gc-panel{position:fixed;top:calc(72px + env(safe-area-inset-top,0px));right:0;bottom:0;width:410px;max-width:100vw;background:#fff;border-left:1.5px solid var(--brd,#e2e8f0);box-shadow:-14px 0 40px -18px rgba(15,23,42,.35);z-index:9800;display:none;flex-direction:column;overflow:hidden;font-family:var(--sans,"DM Sans",sans-serif)}'
      +'.gc-panel.open{display:flex}'
      +'.gc-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0f172a;color:#fff;flex-shrink:0;min-height:56px}'
      +'.gc-hd-t{font-size:14.5px;font-weight:800;flex:1;min-width:0}'
      +'.gc-hd-sub{font-size:10.5px;font-weight:600;color:#cbd5e1;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      +'.gc-ic{background:none;border:none;color:#e2e8f0;font-size:17px;cursor:pointer;padding:6px;border-radius:8px;line-height:1;font-family:inherit;flex-shrink:0}'
      +'.gc-ic:hover{background:rgba(255,255,255,.12)}'
      +'.gc-search{padding:8px 10px;border-bottom:1px solid var(--brd,#e2e8f0);background:#f8fafc;flex-shrink:0}'
      +'.gc-search input{width:100%;padding:8px 12px;border:1.5px solid var(--brd2,#cdd4e4);border-radius:999px;font-size:13px;font-family:inherit;background:#fff}'
      +'.gc-search input:focus{outline:none;border-color:#16a34a}'
      +'.gc-list{flex:1;overflow-y:auto;overscroll-behavior:contain}'
      +'.gc-row{display:flex;gap:11px;padding:11px 14px;cursor:pointer;border-bottom:1px solid #f1f5f9;align-items:center}'
      +'.gc-row:hover{background:#f8fafc}'
      +'.gc-row-b{flex:1;min-width:0}'
      +'.gc-row-top{display:flex;align-items:baseline;gap:8px}'
      +'.gc-row-n{font-size:13.5px;font-weight:700;color:#0f172a;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      +'.gc-row-t{font-size:10.5px;color:#94a3b8;flex-shrink:0}'
      +'.gc-row-t.unread{color:#16a34a;font-weight:800}'
      +'.gc-row-p{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}'
      +'.gc-row-p b{color:#334155;font-weight:600}'
      +'.gc-cnt{min-width:19px;height:19px;border-radius:10px;background:#16a34a;color:#fff;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px;flex-shrink:0}'
      +'.gc-ctx{display:inline-block;font-size:10px;font-weight:700;color:#0c4a2e;background:#dcfce7;border:1px solid #bbf7d0;border-radius:999px;padding:2px 8px;margin-top:3px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none}'
      +'a.gc-ctx:hover{background:#bbf7d0}'
      +'.gc-empty{padding:44px 20px;text-align:center;color:#94a3b8;font-size:12.5px;line-height:1.6}'
      +'.gc-msgs{flex:1;overflow-y:auto;overscroll-behavior:contain;background:#e9e2d6;background-image:radial-gradient(rgba(255,255,255,.35) 1px,transparent 1.2px);background-size:22px 22px;padding:12px 12px 6px}'
      +'.gc-day{text-align:center;margin:10px 0 12px}'
      +'.gc-day span{display:inline-block;background:#fff;color:#64748b;font-size:10.5px;font-weight:700;padding:4px 12px;border-radius:999px;box-shadow:0 1px 2px rgba(0,0,0,.08)}'
      +'.gc-m{display:flex;gap:7px;margin-bottom:6px;align-items:flex-end}'
      +'.gc-m.own{flex-direction:row-reverse}'
      +'.gc-bb{max-width:78%;background:#fff;border-radius:12px;border-top-left-radius:4px;padding:7px 10px 5px;box-shadow:0 1px 1.5px rgba(0,0,0,.10);position:relative}'
      +'.gc-m.own .gc-bb{background:#d9fdd3;border-radius:12px;border-top-right-radius:4px}'
      +'.gc-sn{font-size:11px;font-weight:800;margin-bottom:2px}'
      +'.gc-sn small{font-weight:600;color:#94a3b8;font-size:9.5px}'
      +'.gc-tx{font-size:13.5px;color:#111827;line-height:1.45;white-space:pre-wrap;word-break:break-word}'
      +'.gc-mt{display:flex;justify-content:flex-end;align-items:center;gap:3px;font-size:9.5px;color:#94a3b8;margin-top:2px;user-select:none}'
      +'.gc-tick{font-size:10px;letter-spacing:-2px}'
      +'.gc-tick.read{color:#38bdf8}'
      +'.gc-comp{display:flex;gap:8px;align-items:flex-end;padding:9px 10px calc(9px + env(safe-area-inset-bottom,0px));background:#f0f2f5;border-top:1px solid var(--brd,#e2e8f0);flex-shrink:0}'
      +'.gc-comp textarea{flex:1;resize:none;border:1.5px solid #e2e8f0;background:#fff;border-radius:18px;padding:9px 14px;font-size:14px;font-family:inherit;line-height:1.4;max-height:110px;min-height:38px}'
      +'.gc-comp textarea:focus{outline:none;border-color:#16a34a}'
      +'.gc-send{width:40px;height:40px;border-radius:50%;border:none;background:#0c4a2e;color:#fff;font-size:16px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:.15s}'
      +'.gc-send:hover{background:#16a34a}'
      +'.gc-send:disabled{opacity:.4;cursor:default}'
      +'.gc-ctxbar{padding:7px 12px;background:#f0fdf4;border-bottom:1px solid #bbf7d0;flex-shrink:0;display:flex;align-items:center;gap:6px;min-width:0}'
      +'.gc-ctxbar .gc-ctx{margin-top:0}'
      +'.gc-new-grp{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;padding:10px 14px 4px}'
      +'.gc-fab{font-size:12px;font-weight:700;color:#0c4a2e;background:#dcfce7;border:1px solid #bbf7d0;border-radius:999px;padding:5px 12px;cursor:pointer;font-family:inherit}'
      +'@media(max-width:640px){.gc-panel{top:calc(72px + env(safe-area-inset-top,0px));width:100vw;border-left:none}}'
      +'@media print{.gc-btn,.gc-panel{display:none!important}}';
    var st=d.createElement('style');st.id='gema-chat-style';st.textContent=css;d.head.appendChild(st);
  }

  // ── Nav-Button ───────────────────────────────────────────────────────
  function _injectButton(){
    var host=d.querySelector('.g-nav-actions')||d.querySelector('.g-nav-right');
    if(!host)return false;
    if(host.querySelector('.gc-btn'))return true;
    _btn=d.createElement('button');
    _btn.className='gc-btn no-print';
    _btn.setAttribute('aria-label','Chats');
    _btn.innerHTML='💬<span class="gc-bdg">0</span>';
    _btn.addEventListener('click',function(e){e.stopPropagation();toggle();});
    var bell=host.querySelector('.gn-btn');
    if(bell)host.insertBefore(_btn,bell);
    else{
      var fb=host.querySelector('#feedbackBtn');
      if(fb)host.insertBefore(_btn,fb);else host.appendChild(_btn);
    }
    _badge=_btn.querySelector('.gc-bdg');
    return true;
  }
  function _renderBadge(){
    if(!_badge)return;
    var n=_unreadThreads().length;
    _badge.textContent=n>99?'99+':String(n);
    _badge.classList.toggle('has',n>0);
  }

  // ── Panel ────────────────────────────────────────────────────────────
  function _ensurePanel(){
    if(_panel)return _panel;
    _panel=d.createElement('div');
    _panel.className='gc-panel no-print';
    d.body.appendChild(_panel);
    d.addEventListener('keydown',function(e){if(e.key==='Escape'&&ST.open)close();});
    return _panel;
  }
  function _openPanel(){
    _ensurePanel();
    ST.open=true;
    _panel.classList.add('open');
    _pullMeta();
    if(!ST.metaTimer)ST.metaTimer=setInterval(_pullMeta,META_POLL_MS);
  }
  function close(){
    ST.open=false;ST.view='list';ST.threadId='';
    if(_panel)_panel.classList.remove('open');
    if(ST.msgTimer){clearInterval(ST.msgTimer);ST.msgTimer=null;}
    _deepLinkClear(); // bewusst geschlossen → Deep-Link nicht erneut öffnen
  }
  function toggle(){
    if(ST.open){close();return;}
    ST.view='list';
    _openPanel();
    _renderList();
  }
  function open(tid){
    _openPanel();
    if(tid)_openThread(tid);
    else{ST.view='list';_renderList();}
  }
  function _openThread(tid){
    ST.view='thread';ST.threadId=tid;
    _renderThread();
    _markRead(tid);
    _pullMsgs(tid);
    if(ST.msgTimer)clearInterval(ST.msgTimer);
    ST.msgTimer=setInterval(function(){
      if(ST.open&&ST.view==='thread'&&ST.threadId)_pullMsgs(ST.threadId);
    },MSG_POLL_MS);
  }

  // ── Render: Liste ────────────────────────────────────────────────────
  function _renderList(){
    var p=_ensurePanel();
    var me=_me();
    var threads=_myThreads();
    var q=ST.search.toLowerCase();
    if(q)threads=threads.filter(function(t){
      return _threadTitle(t).toLowerCase().indexOf(q)>=0
        ||(t.kontext&&t.kontext.label||'').toLowerCase().indexOf(q)>=0
        ||(t.letzte&&t.letzte.text||'').toLowerCase().indexOf(q)>=0;
    });
    var h='<div class="gc-hd">'
      +'<div class="gc-hd-t">💬 Chats</div>'
      +'<button class="gc-ic" data-act="new" title="Neuer Chat">＋</button>'
      +'<button class="gc-ic" data-act="close" title="Schliessen">✕</button></div>'
      +'<div class="gc-search"><input type="text" id="gcSearch" placeholder="Suchen (Name, Bezug, Nachricht)…" value="'+_esc(ST.search)+'"></div>'
      +'<div class="gc-list" id="gcList">';
    if(!threads.length){
      h+='<div class="gc-empty">Noch keine Chats.<br>Starte einen Chat über ＋ oder direkt aus einem Modul<br>(Offertanfrage, Ausschreibung, Beteiligte …).</div>';
    }else{
      threads.forEach(function(t){
        var readTs=_myReadTs(t.id);
        var unread=me&&_threadUnread(t,readTs,me.id);
        var preview=t.letzte?((t.letzte.von===(me&&me.id)?'<b>Du:</b> ':(_others(t).length>1?'<b>'+_esc((t.letzte.vonName||'').split(/\s+/)[0])+':</b> ':''))+_esc(t.letzte.text)):'<span style="color:#94a3b8">Noch keine Nachrichten</span>';
        h+='<div class="gc-row" data-tid="'+_esc(t.id)+'">'
          +_threadAvatar(t,46)
          +'<div class="gc-row-b">'
          +'<div class="gc-row-top"><span class="gc-row-n">'+_esc(_threadTitle(t))+'</span>'
          +'<span class="gc-row-t'+(unread?' unread':'')+'">'+_esc(t.letzte?_listTime(t.letzte.ts):'')+'</span></div>'
          +'<div class="gc-row-p">'+preview+'</div>'
          +_kontextChip(t,false)
          +'</div>'
          +(unread?'<span class="gc-cnt">●</span>':'')
          +'</div>';
      });
    }
    h+='</div>';
    p.innerHTML=h;
    p.querySelector('[data-act=close]').onclick=close;
    p.querySelector('[data-act=new]').onclick=_renderNew;
    var si=p.querySelector('#gcSearch');
    si.oninput=function(){ST.search=this.value;_renderList();var el=p.querySelector('#gcSearch');el.focus();el.setSelectionRange(el.value.length,el.value.length);};
    Array.prototype.forEach.call(p.querySelectorAll('.gc-row[data-tid]'),function(row){
      row.onclick=function(){_openThread(row.getAttribute('data-tid'));};
    });
  }

  // ── Render: Neuer Chat (Kontakt-Picker) ─────────────────────────────
  function _renderNew(){
    var p=_ensurePanel();
    ST.view='new';
    var me=_me();if(!me)return;
    var q=(ST.search||'').toLowerCase();
    var list=_users().filter(function(u){
      return u&&u.id!==me.id&&u.active!==false;
    }).filter(function(u){
      if(!q)return true;
      var hay=((u.name||'')+' '+(u.username||'')+' '+_orgName(u.orgId)).toLowerCase();
      return hay.indexOf(q)>=0;
    });
    var mine=list.filter(function(u){return u.orgId===me.orgId;});
    var extern=list.filter(function(u){return u.orgId!==me.orgId;});
    function rows(arr){
      return arr.slice(0,60).map(function(u){
        return '<div class="gc-row" data-uid="'+_esc(u.id)+'">'
          +_avatarHtml(u,null,42)
          +'<div class="gc-row-b"><div class="gc-row-n">'+_esc(u.name||u.username||'?')+'</div>'
          +'<div class="gc-row-p">'+_esc([_roleLabel(u),_orgName(u.orgId)].filter(Boolean).join(' · '))+'</div></div></div>';
      }).join('');
    }
    var h='<div class="gc-hd">'
      +'<button class="gc-ic" data-act="back" title="Zurück">‹</button>'
      +'<div class="gc-hd-t">Neuer Chat</div>'
      +'<button class="gc-ic" data-act="close">✕</button></div>'
      +'<div class="gc-search"><input type="text" id="gcSearch" placeholder="Person suchen…" value="'+_esc(ST.search)+'"></div>'
      +'<div class="gc-list">'
      +(mine.length?'<div class="gc-new-grp">Meine Organisation</div>'+rows(mine):'')
      +(extern.length?'<div class="gc-new-grp">Extern (Partner)</div>'+rows(extern):'')
      +((!mine.length&&!extern.length)?'<div class="gc-empty">Keine Person gefunden.</div>':'')
      +'</div>';
    p.innerHTML=h;
    p.querySelector('[data-act=close]').onclick=close;
    p.querySelector('[data-act=back]').onclick=function(){ST.search='';ST.view='list';_renderList();};
    var si=p.querySelector('#gcSearch');
    si.oninput=function(){ST.search=this.value;_renderNew();var el=p.querySelector('#gcSearch');el.focus();el.setSelectionRange(el.value.length,el.value.length);};
    si.focus();
    Array.prototype.forEach.call(p.querySelectorAll('.gc-row[data-uid]'),function(row){
      row.onclick=function(){ST.search='';start({userId:row.getAttribute('data-uid')});};
    });
  }

  // ── Render: Thread (WhatsApp-Bubbles) ───────────────────────────────
  function _renderThread(){
    var p=_ensurePanel();
    var me=_me();
    var t=_threadById(ST.threadId);
    if(!t){ST.view='list';_renderList();return;}
    var others=_others(t);
    var group=others.length>1;
    var sub=others.map(function(x){return [x.rolle,x.firma].filter(Boolean).join(' · ');}).filter(Boolean)[0]||'';
    if(group)sub=others.map(function(x){return x.name.split(/\s+/)[0];}).join(', ');
    var msgs=_msgsFor(t.id);
    // Lesestand der Gegenseite (für ✓✓): jüngster fremder Lesestand ≥ msg.ts von ALLEN
    var otherReads=others.map(function(o){return _readTsOf(t.id,o.userId);});
    function readByAll(ts){
      if(!otherReads.length)return false;
      return otherReads.every(function(r){return r&&String(r)>=String(ts);});
    }
    var h='<div class="gc-hd">'
      +'<button class="gc-ic" data-act="back" title="Zurück">‹</button>'
      +_threadAvatar(t,38)
      +'<div style="flex:1;min-width:0"><div class="gc-hd-t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_esc(_threadTitle(t))+'</div>'
      +(sub?'<div class="gc-hd-sub">'+_esc(sub)+'</div>':'')+'</div>'
      +'<button class="gc-ic" data-act="close">✕</button></div>';
    if(t.kontext&&t.kontext.label)h+='<div class="gc-ctxbar">'+_kontextChip(t,true)+'</div>';
    h+='<div class="gc-msgs" id="gcMsgs">';
    var lastDay='',lastVon='';
    if(!msgs.length){
      h+='<div class="gc-day"><span>'+(t.kontext&&t.kontext.label?_esc('Bezug: '+t.kontext.label):'Neuer Chat')+'</span></div>'
        +'<div class="gc-empty" style="color:#7f8b99">Schreibe die erste Nachricht — '+_esc(_threadTitle(t))+' sieht den Bezug direkt im Chat.</div>';
    }
    msgs.forEach(function(m){
      var day=_dayKey(m.ts);
      if(day!==lastDay){h+='<div class="gc-day"><span>'+_esc(_dayLabel(m.ts))+'</span></div>';lastDay=day;lastVon='';}
      var own=me&&m.von===me.id;
      var showAvatar=!own&&m.von!==lastVon;
      var tick=own?(m._pending?'🕓':'<span class="gc-tick'+(readByAll(m.ts)?' read':'')+'">✓✓</span>'):'';
      h+='<div class="gc-m'+(own?' own':'')+'">'
        +(own?'':(showAvatar?_avatarHtml(_userById(m.von),{userId:m.von,name:m.vonName},28):'<span style="width:28px;flex-shrink:0"></span>'))
        +'<div class="gc-bb">'
        +((!own&&(group||showAvatar))?'<div class="gc-sn" style="color:'+_senderColor(m.von)+'">'+_esc(m.vonName||'?')+(m.vonRolle?' <small>· '+_esc(m.vonRolle)+'</small>':'')+'</div>':'')
        +'<div class="gc-tx">'+_linkify(_esc(m.text))+'</div>'
        +'<div class="gc-mt">'+_fmtHM(m.ts)+' '+tick+'</div>'
        +'</div></div>';
      lastVon=m.von;
    });
    h+='</div>'
      +'<div class="gc-comp">'
      +'<textarea id="gcInput" rows="1" placeholder="Nachricht schreiben…"></textarea>'
      +'<button class="gc-send" id="gcSend" title="Senden">➤</button></div>';
    p.innerHTML=h;
    p.querySelector('[data-act=close]').onclick=close;
    p.querySelector('[data-act=back]').onclick=function(){
      ST.view='list';ST.threadId='';
      if(ST.msgTimer){clearInterval(ST.msgTimer);ST.msgTimer=null;}
      _renderList();
    };
    var box=p.querySelector('#gcMsgs');box.scrollTop=box.scrollHeight;
    var inp=p.querySelector('#gcInput'),send=p.querySelector('#gcSend');
    if(ST.prefill){inp.value=ST.prefill;ST.prefill='';}
    function autosize(){inp.style.height='auto';inp.style.height=Math.min(110,inp.scrollHeight)+'px';}
    inp.addEventListener('input',autosize);
    autosize();
    function doSend(){
      var v=inp.value;
      if(!String(v).trim())return;
      inp.value='';autosize();
      _send(t.id,v);
    }
    send.onclick=doSend;
    inp.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend();}
    });
    inp.focus();
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  function _boot(){
    if(ST.booted)return;
    var me=_me();
    if(!me)return; // nicht eingeloggt (z.B. sys_login) → kein Chat
    if(!_injectButton())return;
    ST.booted=true;
    _injectStyle();
    _renderBadge();
    // Deep-Link ?chat=<threadId> — sofort aus dem lokalen Cache öffnen
    var deepTid=_deepLinkTid;
    if(deepTid&&_threadById(deepTid)){
      open(deepTid);
      if(_deepFromStash)_deepLinkClear(); // auf der Zielseite konsumiert
    }
    // Cloud-Pull leicht verzögert (Seite zuerst rendern lassen)
    setTimeout(function(){
      _pullMeta().then(function(){
        // Deep-Link-Fallback: Thread war lokal noch nicht bekannt (frisches Gerät)
        if(deepTid&&!ST.open&&_threadById(deepTid)){open(deepTid);if(_deepFromStash)_deepLinkClear();}
      });
    },2500);
    d.addEventListener('visibilitychange',function(){
      if(!d.hidden){_pullMeta();if(ST.open&&ST.view==='thread'&&ST.threadId)_pullMsgs(ST.threadId);}
    });
  }
  if(d&&d.addEventListener){
    if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',_boot);
    else setTimeout(_boot,0);
  }

  w.GemaChat={
    start:start, ensureGruppe:ensureGruppe, open:open, close:close, toggle:toggle,
    unreadCount:function(){return _unreadThreads().length;},
    _pure:{threadKey:_threadKey,fmtHM:_fmtHM,dayLabel:_dayLabel,listTime:_listTime,threadUnread:_threadUnread,linkify:_linkify,esc:_esc,senderColor:_senderColor},
    _debug:function(){return {booted:ST.booted,open:ST.open,view:ST.view,threadId:ST.threadId,threads:_myThreads().length,me:(_me()||{}).id||null};}
  };
})(typeof window!=='undefined'?window:this,typeof document!=='undefined'?document:null);
