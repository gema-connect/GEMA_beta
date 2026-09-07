/* gema_qr_scanner.js — QR-Code Scanner via Browser-Kamera
   Nutzt html5-qrcode Bibliothek (CDN).
   Verwendung: GemaQR.scan(callback) — callback(code) wird mit dem QR-Inhalt aufgerufen.
   QR-Format: GEMA:WZ:12345 (Werkzeug-ID)

   ── Was die Scan-Reichweite bestimmt (Feedback 07.09.2026: «man muss enorm
      nahe ran, bis er erkennt») ──────────────────────────────────────────
   html5-qrcode dekodiert NICHT das Kamerabild, sondern schneidet die
   «qrbox» aus dem Video und zeichnet sie in ein Canvas, das genau so viele
   Pixel hat wie die qrbox CSS-PIXEL gross ist (foreverScan → drawImage mit
   dWidth = qrRegion.width). Ein QR-Code belegt im Dekodier-Canvas also
   exakt so viele Pixel, wie er auf dem Bildschirm CSS-Pixel gross ist.
   Der Sucher war 300×300 px und die qrbox 250 px — der Decoder bekam
   damit ein rund 300×225 grosses Bild, egal wie gut die Kamera ist. Bei
   einer Etikette mit ~0.5 mm Modulbreite reichte das erst auf Fingerbreite.

   Vier Stellschrauben, alle hier gesetzt:
     1. DEKODIER-AUFLÖSUNG ENTKOPPELT (grösster Hebel): der Sucher wird
        intern mit QR_BASIS px Breite aufgebaut und per CSS-transform auf
        die Bildschirmbreite herunterskaliert. `clientWidth` — und damit
        das Dekodier-Canvas — bleibt bei QR_BASIS, angezeigt wird
        unverändert bildschirmfüllend. CSS-Transformationen ändern
        clientWidth/clientHeight nicht, und die Bibliothek rechnet
        ausschliesslich damit (kein getBoundingClientRect im ganzen
        Paket) — die Ausschnitt-Mathematik bleibt also exakt.
        Ergebnis: ~650–1000 px Dekodier-Breite statt 300.
     2. Kamera-Auflösung anfordern (statt Browser-Default 640×480) und
        zwar im FORMAT DES SUCHERS — ein 16:9-Bild in einem hochkant
        Sucher wird oben/unten schwarz und verschenkt Bildhöhe.
     3. Nativer BarcodeDetector, wo vorhanden (Android Chrome): erkennt
        kleinere/unschärfere Codes als der JS-Decoder und braucht dafür
        einen Bruchteil der Rechenzeit (darum dort auch die grössere
        Dekodier-Basis).
     4. disableFlip — der gespiegelte Zweitversuch je Bild entfällt
        (QR-Etiketten sind nie gespiegelt) → doppelt so viele Versuche/s.
   Dazu Zoom und Licht als Bedienelemente, wo die Kamera sie meldet.
   Drift-Guard: scripts/qr_scan_reichweite_test.mjs
*/
(function(w){
  'use strict';
  var _scanner=null;
  var _overlay=null;
  var _caps=null;          // CameraCapabilities der laufenden Kamera
  var _fitTimer=null;
  var _ro=null;            // ResizeObserver auf Sucher + Buehne
  // Session-Zaehler: jede scan()-/stop()-Aktion entwertet die vorherige
  // Session. Schuetzt gegen (a) Mehrfach-Decodes derselben Kamera-Session
  // (html5-qrcode feuert bei fps 10 mehrfach, bevor stop() greift) und
  // (b) veraltete Callbacks, wenn scan() erneut aufgerufen wird, waehrend
  // eine alte Session noch laeuft (Koffer-Sammelscan: Scan landete sonst
  // im vorher gescannten Koffer).
  var _session=0;
  var ZOOM_KEY='gema_qr_zoom_v1';   // zuletzt gewaehlter Zoom, pro Geraet

  // Interne Sucher-Breite = Dekodier-Aufloesung (siehe Kopfkommentar).
  // Sie ist ein BUDGET, kein «je mehr desto besser»: der Code muss ganz in
  // die qrbox passen (sonst geht Nahbereich verloren) und jedes Bild will
  // in der Zeit zwischen zwei Versuchen dekodiert sein. Die qrbox ist
  // 0.9 × kurze Seite → bei hochkantem Kamerabild ist die kurze Seite die
  // Basis, das Dekodier-Quadrat also 648 px (nativ) bzw. 486 px (JS)
  // gegenueber frueher rund 225 px.
  // Der native BarcodeDetector vertraegt das groessere Bild; der
  // mitgelieferte JS-Decoder wuerde daran so lange rechnen, dass er
  // seltener hinschaut — mehr Pixel nuetzen nichts, wenn nur noch zweimal
  // pro Sekunde ein Versuch stattfindet.
  function _basisBreite(){ return _nativDetektor()?720:540; }
  function _nativDetektor(){ try{ return typeof w.BarcodeDetector!=='undefined'; }catch(e){ return false; } }

  function loadLib(cb){
    if(w.Html5Qrcode){cb();return;}
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';
    s.onload=cb;
    s.onerror=function(){alert('QR-Scanner Bibliothek konnte nicht geladen werden.');};
    document.head.appendChild(s);
  }

  function _zoomGespeichert(){
    try{ var v=parseFloat(localStorage.getItem(ZOOM_KEY)); return isFinite(v)&&v>0?v:null; }catch(e){ return null; }
  }
  function _zoomMerken(v){ try{ localStorage.setItem(ZOOM_KEY,String(v)); }catch(e){} }

  // Sucher in die Buehne einpassen. Der Sucher wird intern mit der
  // Basis-Breite aufgebaut und rein optisch heruntergeskaliert —
  // clientWidth/clientHeight bleiben bei der Basis, und genau daran haengt
  // die Dekodier-Aufloesung (siehe Kopfkommentar).
  // Eingepasst wird «contain»: das GANZE Kamerabild ist sichtbar, damit der
  // Zielrahmen zeigt, was der Decoder wirklich sieht.
  function _stageFit(){
    var stage=document.getElementById('gemaQrStage');
    var rd=document.getElementById('gemaQrReader');
    if(!stage||!rd)return;
    var sw=stage.clientWidth||320, sh=stage.clientHeight||320;
    var basis=Math.max(_basisBreite(),sw);      // nie hochskalieren
    if(rd.style.width!==basis+'px')rd.style.width=basis+'px';
    var h=rd.clientHeight||0;                   // Layout-Hoehe (unskaliert)
    var k=sw/basis;
    if(h>0)k=Math.min(k,sh/h);
    rd.style.transform='scale('+k+')';
    rd.style.left=Math.max(0,Math.round((sw-basis*k)/2))+'px';
    rd.style.top=Math.max(0,Math.round((sh-h*k)/2))+'px';
  }

  // Kamera-Wunsch im Format des Suchers: ein hochkant gehaltenes Handy
  // bekommt sonst ein 16:9-Querbild, das oben und unten schwarz bleibt —
  // die nutzbare Bildhoehe (und damit die Reichweite) halbiert sich.
  function _videoConstraints(){
    var iw=w.innerWidth||360, ih=w.innerHeight||640;
    var hoch=ih>=iw;
    return {
      facingMode:{ideal:'environment'},
      width:{ideal:hoch?1080:1920},
      height:{ideal:hoch?1920:1080},
      // Dauer-Autofokus: ohne das bleibt der Fokus dort, wo die Kamera
      // beim Start scharf gestellt hat. 'advanced' ist per Spec
      // best-effort — unbekannte Eintraege werden ignoriert, nicht
      // abgelehnt.
      advanced:[{focusMode:'continuous'}]
    };
  }

  function _scanConfig(){
    return {
      fps:20,
      // Quadrat ueber die KURZE Bildseite: ein QR-Code ist quadratisch,
      // zusaetzliche Hoehe im Ausschnitt kostet nur Rechenzeit und
      // vergroessert den maximal lesbaren Code nicht.
      qrbox:function(vw,vh){
        var s=Math.floor(Math.min(vw,vh)*0.9);
        if(s<50)s=Math.floor(Math.min(vw,vh)); // MIN_QR_BOX_SIZE der Bibliothek
        return {width:s,height:s};
      },
      disableFlip:true,
      videoConstraints:_videoConstraints()
    };
  }

  function _ui(){
    _overlay=document.createElement('div');
    _overlay.id='gemaQrOverlay';
    // z-index ueber den Modul-Modals (z.B. _wzShowModal: 10500) — der
    // Scanner wird auch aus offenen Dialogen heraus gestartet (Koffer-
    // Sammelscan) und muss dann zuoberst liegen.
    _overlay.style.cssText='position:fixed;inset:0;z-index:12000;background:#000;display:flex;flex-direction:column;'
      +'padding:calc(10px + env(safe-area-inset-top,0px)) 10px calc(10px + env(safe-area-inset-bottom,0px));'
      +'font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;-webkit-user-select:none;user-select:none';
    _overlay.innerHTML=
       '<div style="color:#fff;font-size:16px;font-weight:800;text-align:center;padding:4px 0 8px;flex:none">📷 QR-Code scannen</div>'
      +'<div id="gemaQrStage" style="flex:1 1 auto;position:relative;overflow:hidden;width:100%;max-width:640px;margin:0 auto;'
        +'min-height:180px;border-radius:14px;background:#111">'
        // Breite/Transform setzt _stageFit — die Bibliothek liest
        // parentElement.clientWidth beim Anlegen des <video>.
        +'<div id="gemaQrReader" style="position:absolute;top:0;left:0;transform-origin:top left"></div>'
      +'</div>'
      +'<div id="gemaQrHint" style="color:#cbd5e1;font-size:12px;text-align:center;padding:8px 4px 0;flex:none;line-height:1.4">'
        +'Etikette in den Rahmen halten.</div>'
      +'<div id="gemaQrCtrls" style="display:none;align-items:center;gap:10px;justify-content:center;flex-wrap:wrap;padding:8px 4px 0;flex:none"></div>'
      +'<button id="gemaQrCancel" style="margin:10px auto 0;padding:12px 26px;border-radius:12px;border:none;background:#dc2626;color:#fff;'
        +'font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;flex:none;min-height:48px">✕ Abbrechen</button>';
    document.body.appendChild(_overlay);
    var c=document.getElementById('gemaQrCancel');
    if(c)c.onclick=function(){stop();};
    _stageFit();
    // Die Einpassung braucht die Video-Hoehe — die steht erst, wenn die
    // Kamera laeuft. start() kann VOR dem 'playing'-Ereignis aufloesen
    // (html5-qrcode registriert den Listener erst danach), darum wird die
    // Groesse beobachtet statt einmalig gelesen. Zusaetzlich aendert das
    // Einblenden von Zoom/Licht die Buehnenhoehe.
    try{
      if(typeof ResizeObserver!=='undefined'){
        _ro=new ResizeObserver(_onResize);
        _ro.observe(document.getElementById('gemaQrReader'));
        _ro.observe(document.getElementById('gemaQrStage'));
      }
    }catch(e){ _ro=null; }
    // Fallback ohne ResizeObserver (und Sicherheitsnetz): ein paar
    // Nachmessungen, bis das Video steht.
    [150,400,900,1800].forEach(function(ms){ setTimeout(_stageFit,ms); });
    // Drehen des Geraets aendert die Buehne — Skalierung nachziehen.
    w.addEventListener('resize',_onResize);
    w.addEventListener('orientationchange',_onResize);
  }
  function _onResize(){
    clearTimeout(_fitTimer);
    _fitTimer=setTimeout(_stageFit,60);
  }

  // Zoom + Licht erscheinen NUR, wenn die laufende Kamera sie wirklich
  // meldet — nichts versprechen, was das Geraet nicht kann.
  function _steuerungAufbauen(){
    var box=document.getElementById('gemaQrCtrls');
    if(!box||!_scanner)return;
    try{ _caps=_scanner.getRunningTrackCameraCapabilities(); }catch(e){ _caps=null; }
    if(!_caps)return;
    var etwas=false;

    var zoom=null;
    try{ zoom=_caps.zoomFeature(); }catch(e){}
    if(zoom&&zoom.isSupported()){
      var zmin=zoom.min(),zmax=zoom.max(),zstep=zoom.step()||0.1;
      var start=_zoomGespeichert();
      if(start==null){ try{ start=zoom.value(); }catch(e){ start=zmin; } }
      if(!isFinite(start))start=zmin;
      if(start<zmin)start=zmin;
      if(start>zmax)start=zmax;
      var wrap=document.createElement('label');
      wrap.id='gemaQrZoom';
      wrap.style.cssText='display:flex;align-items:center;gap:8px;color:#fff;font-size:13px;font-weight:700;background:rgba(255,255,255,.12);padding:8px 12px;border-radius:11px';
      wrap.innerHTML='<span>🔍 Zoom</span>';
      var sl=document.createElement('input');
      sl.type='range'; sl.min=String(zmin); sl.max=String(zmax); sl.step=String(zstep); sl.value=String(start);
      sl.style.cssText='width:150px;accent-color:#22c55e';
      var lbl=document.createElement('span');
      lbl.style.cssText='min-width:38px;text-align:right;font-variant-numeric:tabular-nums';
      lbl.textContent=(Math.round(start*10)/10)+'×';
      sl.oninput=function(){
        var v=parseFloat(sl.value);
        lbl.textContent=(Math.round(v*10)/10)+'×';
        try{ zoom.apply(v); }catch(e){}
        _zoomMerken(v);
      };
      wrap.appendChild(sl); wrap.appendChild(lbl);
      box.appendChild(wrap);
      try{ if(zoom.value()!==start)zoom.apply(start); }catch(e){}
      etwas=true;
      var hint=document.getElementById('gemaQrHint');
      if(hint)hint.innerHTML='Etikette in den Rahmen halten.<br>Zu weit weg? Mit dem Zoom-Regler näher heranholen — die Einstellung bleibt gespeichert.';
    }

    var torch=null;
    try{ torch=_caps.torchFeature(); }catch(e){}
    if(torch&&torch.isSupported()){
      var tb=document.createElement('button');
      tb.type='button';
      tb.id='gemaQrTorch';
      tb.style.cssText='padding:9px 14px;border-radius:11px;border:none;background:rgba(255,255,255,.12);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;min-height:40px';
      var an=false;
      tb.textContent='🔦 Licht';
      tb.onclick=function(){
        an=!an;
        try{ torch.apply(an); }catch(e){ an=!an; return; }
        tb.textContent=an?'🔦 Licht aus':'🔦 Licht';
        tb.style.background=an?'#f59e0b':'rgba(255,255,255,.12)';
      };
      box.appendChild(tb);
      etwas=true;
    }

    if(etwas)box.style.display='flex';
  }

  function scan(callback){
    loadLib(function(){
      // Eine allenfalls noch offene Vorgaenger-Session IMMER abraeumen —
      // sonst bleiben zwei Overlays/Kamera-Instanzen uebrig und der alte
      // Callback faengt den naechsten Scan ab.
      stop();
      var mySession=++_session;
      _ui();

      _scanner=new Html5Qrcode('gemaQrReader',{
        useBarCodeDetectorIfSupported:true,
        experimentalFeatures:{useBarCodeDetectorIfSupported:true},
        verbose:false
      });

      function treffer(code){
        // Nur die aktuelle Session darf liefern — und nur EINMAL.
        if(mySession!==_session)return;
        _session++;
        // Vibration feedback
        if(navigator.vibrate)navigator.vibrate(100);
        stop();
        // Parse GEMA QR
        if(code.indexOf('GEMA:WZ:')===0){
          var wzId=code.replace('GEMA:WZ:','');
          if(callback)callback(wzId);
          else location.href='if_werkzeug.html?id='+encodeURIComponent(wzId);
        } else {
          if(callback)callback(code);
        }
      }
      function gestartet(){
        if(mySession!==_session)return;
        _stageFit();               // jetzt steht die Video-Hoehe → mittig setzen
        _steuerungAufbauen();
      }

      // Erst mit den vollen Wuenschen starten. Lehnt die Kamera sie ab
      // (exotische Geraete, Berechtigungs-Eigenheiten), NICHT aufgeben,
      // sondern schlicht starten — ein etwas schwaecherer Scanner ist
      // besser als eine Fehlermeldung.
      _scanner.start({facingMode:'environment'},_scanConfig(),treffer,function(){})
        .then(gestartet)
        .catch(function(err1){
          if(mySession!==_session)return;
          try{ _scanner.stop(); }catch(e){}
          _scanner.start({facingMode:'environment'},{fps:10,qrbox:undefined,disableFlip:true},treffer,function(){})
            .then(gestartet)
            .catch(function(err2){
              // Ehrliche Meldung: der ERSTE Fehler nennt meist den echten
              // Grund (Berechtigung, keine Kamera), der zweite nur die Folge.
              alert('Kamera-Zugriff fehlgeschlagen: '+(err1&&err1.message||err1||err2));
              stop();
            });
        });
    });
  }

  function stop(){
    _session++;
    _caps=null;
    clearTimeout(_fitTimer);
    if(_ro){try{_ro.disconnect();}catch(e){}_ro=null;}
    w.removeEventListener('resize',_onResize);
    w.removeEventListener('orientationchange',_onResize);
    if(_scanner){try{_scanner.stop();}catch(e){}_scanner=null;}
    if(_overlay){_overlay.remove();_overlay=null;}
  }

  w.GemaQR={scan:scan,stop:stop};
})(window);
