/* gema_avatar.js — Profilbild-Upload + zentraler Avatar-Renderer
 *
 * Speichert Avatare als Base64 unter user.avatar (oder user.profile.avatar).
 * Kompromiss: 256x256 JPEG q=0.8 — typisch ~15–30 KB pro Avatar.
 *
 * API:
 *   GemaAvatar.render(user, size, opts)
 *     → HTML-String mit <img> wenn user.avatar gesetzt, sonst gestyltes
 *       Initial-Div in der Rolle-Farbe.
 *     opts: { color, ring, className, extra }
 *
 *   GemaAvatar.getInitials(user)
 *     → max 2 Zeichen, z.B. "MM" fuer "Martina Mueller"
 *
 *   GemaAvatar.getColor(user, fallback)
 *     → Farb-Hex aus erster Rolle des Users, sonst fallback ('#6b7280')
 *
 *   GemaAvatar.compress(file)
 *     → Promise<dataUrl>  (resize 256x256, JPEG q=0.8)
 *     → reject bei nicht-Bildern oder >10 MB Quelle
 *
 *   GemaAvatar.attachUploader(buttonOrInput, { onChange, sizeBytes })
 *     → bindet ein <input type="file"> oder Button an Upload-Workflow
 *
 *   GemaAvatar.set(userId, dataUrl)   — speichert in GemaAuth users
 *   GemaAvatar.remove(userId)         — entfernt avatar
 */
(function(w){
  if(w.GemaAvatar) return;

  var MAX_DIM = 256;
  var JPEG_QUALITY = 0.82;
  var MAX_SOURCE_BYTES = 10 * 1024 * 1024; // 10 MB

  function _esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function _getUserName(user){
    if(!user) return '';
    if(user.profile){
      if(user.profile.person) return user.profile.person;
      if(user.profile.name) return user.profile.name;
    }
    return user.name || user.username || '';
  }

  function _getInitials(user){
    var n = _getUserName(user) || '?';
    var parts = n.trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return '?';
    if(parts.length === 1){
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  }

  function _getColor(user, fallback){
    fallback = fallback || '#6b7280';
    if(!user) return fallback;
    try {
      if(typeof GemaAuth === 'undefined') return fallback;
      var roles = GemaAuth.getRoles && GemaAuth.getRoles();
      if(!roles || !user.roleIds || !user.roleIds.length) return fallback;
      var firstRole = roles.find(function(r){ return r.id === user.roleIds[0]; });
      if(firstRole && firstRole.color) return firstRole.color;
    } catch(e){}
    return fallback;
  }

  function _avatar(user){
    if(!user) return null;
    return user.avatar || (user.profile && user.profile.avatar) || null;
  }

  /**
   * Liefert HTML-String fuer ein Avatar in der gewuenschten Groesse.
   * Wenn user.avatar gesetzt: <img>, sonst Initial-Div in der Rolle-Farbe.
   */
  function _render(user, size, opts){
    opts = opts || {};
    size = size || 36;
    var className = opts.className || '';
    var extra = opts.extra || '';
    var ring = opts.ring ? 'box-shadow:0 0 0 2px '+opts.ring+';' : '';
    var avatar = _avatar(user);
    var styleBase = 'width:'+size+'px;height:'+size+'px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;'+ring;
    if(avatar){
      return '<span class="'+className+'" style="'+styleBase+'background:#e2e7f0" '+extra+'>'
        + '<img src="'+_esc(avatar)+'" alt="" style="width:100%;height:100%;object-fit:cover;display:block">'
        + '</span>';
    }
    var color = opts.color || _getColor(user);
    var initials = _getInitials(user);
    var fontSize = Math.max(10, Math.round(size * 0.42));
    return '<span class="'+className+'" style="'+styleBase+'background:'+color+';color:#fff;font-size:'+fontSize+'px;font-weight:800;letter-spacing:.3px" '+extra+'>'
      + _esc(initials)
      + '</span>';
  }

  /**
   * Liest Datei als DataURL, dann resize auf MAX_DIM via Canvas und gibt
   * JPEG zurueck (kleiner als PNG bei Photos). Promise<dataUrl>.
   */
  function _compress(file){
    return new Promise(function(resolve, reject){
      if(!file){ reject(new Error('Keine Datei')); return; }
      if(!/^image\//.test(file.type)){ reject(new Error('Datei ist kein Bild')); return; }
      if(file.size > MAX_SOURCE_BYTES){ reject(new Error('Datei zu gross (max 10 MB)')); return; }
      var fr = new FileReader();
      fr.onload = function(){
        var img = new Image();
        img.onload = function(){
          // Square crop center, dann resize auf MAX_DIM
          var src = img;
          var sw = src.naturalWidth, sh = src.naturalHeight;
          var cropSize = Math.min(sw, sh);
          var sx = (sw - cropSize) / 2;
          var sy = (sh - cropSize) / 2;
          var canvas = document.createElement('canvas');
          var dim = Math.min(MAX_DIM, cropSize);
          canvas.width = dim; canvas.height = dim;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(src, sx, sy, cropSize, cropSize, 0, 0, dim, dim);
          try {
            resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
          } catch(e){
            reject(e);
          }
        };
        img.onerror = function(){ reject(new Error('Bild konnte nicht geladen werden')); };
        img.src = fr.result;
      };
      fr.onerror = function(){ reject(new Error('Datei konnte nicht gelesen werden')); };
      fr.readAsDataURL(file);
    });
  }

  function _attachUploader(target, opts){
    opts = opts || {};
    var input = target;
    if(target && target.tagName !== 'INPUT'){
      // Wrap a hidden file input
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      target.parentNode.insertBefore(input, target.nextSibling);
      target.addEventListener('click', function(e){
        e.preventDefault();
        input.click();
      });
    }
    if(!input || input.tagName !== 'INPUT') return;
    input.addEventListener('change', function(){
      var file = input.files && input.files[0];
      if(!file) return;
      _compress(file).then(function(dataUrl){
        if(typeof opts.onChange === 'function') opts.onChange(dataUrl);
      }).catch(function(err){
        if(typeof opts.onError === 'function') opts.onError(err);
        else alert('Profilbild-Upload: ' + (err && err.message ? err.message : err));
      }).then(function(){
        try { input.value = ''; } catch(e){}
      });
    });
    return input;
  }

  function _setForUser(userId, dataUrl){
    if(typeof GemaAuth === 'undefined') return false;
    var users = GemaAuth.getUsers() || [];
    var idx = users.findIndex(function(u){ return u.id === userId; });
    if(idx < 0) return false;
    if(dataUrl) users[idx].avatar = dataUrl;
    else delete users[idx].avatar;
    GemaAuth.saveUsers(users);
    return true;
  }

  w.GemaAvatar = {
    render: _render,
    getInitials: _getInitials,
    getColor: _getColor,
    getName: _getUserName,
    getAvatar: _avatar,
    compress: _compress,
    attachUploader: _attachUploader,
    set: function(userId, dataUrl){ return _setForUser(userId, dataUrl); },
    remove: function(userId){ return _setForUser(userId, null); }
  };
})(window);
