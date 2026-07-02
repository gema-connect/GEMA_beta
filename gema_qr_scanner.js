/* gema_qr_scanner.js — QR-Code Scanner via Browser-Kamera
   Nutzt html5-qrcode Bibliothek (CDN).
   Verwendung: GemaQR.scan(callback) — callback(code) wird mit dem QR-Inhalt aufgerufen.
   QR-Format: GEMA:WZ:12345 (Werkzeug-ID)
*/
(function(w){
  'use strict';
  var _scanner=null;
  var _overlay=null;

  function loadLib(cb){
    if(w.Html5Qrcode){cb();return;}
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';
    s.onload=cb;
    s.onerror=function(){alert('QR-Scanner Bibliothek konnte nicht geladen werden.');};
    document.head.appendChild(s);
  }

  function scan(callback){
    loadLib(function(){
      // Overlay
      _overlay=document.createElement('div');
      _overlay.id='gemaQrOverlay';
      // z-index ueber den Modul-Modals (z.B. _wzShowModal: 10500) — der
      // Scanner wird auch aus offenen Dialogen heraus gestartet (Koffer-
      // Sammelscan) und muss dann zuoberst liegen.
      _overlay.style.cssText='position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.9);display:flex;flex-direction:column;align-items:center;justify-content:center';
      _overlay.innerHTML='<div style="color:#fff;font-size:18px;font-weight:800;margin-bottom:16px">📷 QR-Code scannen</div>'
        +'<div id="gemaQrReader" style="width:300px;height:300px;border-radius:16px;overflow:hidden"></div>'
        +'<button onclick="GemaQR.stop()" style="margin-top:16px;padding:10px 24px;border-radius:10px;border:none;background:#dc2626;color:#fff;font-size:14px;font-weight:700;cursor:pointer">✕ Abbrechen</button>';
      document.body.appendChild(_overlay);

      _scanner=new Html5Qrcode('gemaQrReader');
      _scanner.start(
        {facingMode:'environment'},
        {fps:10,qrbox:{width:250,height:250}},
        function(code){
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
        },
        function(){}
      ).catch(function(err){
        alert('Kamera-Zugriff fehlgeschlagen: '+err);
        stop();
      });
    });
  }

  function stop(){
    if(_scanner){try{_scanner.stop();}catch(e){}_scanner=null;}
    if(_overlay){_overlay.remove();_overlay=null;}
  }

  w.GemaQR={scan:scan,stop:stop};
})(window);
