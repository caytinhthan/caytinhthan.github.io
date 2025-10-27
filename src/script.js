(() => {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (n,min,max)=> Math.max(min, Math.min(max, n));
  const rand  = (min,max)=> Math.random()*(max-min)+min;
  const uuid  = ()=> (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  
  // Remove module import - use inline fallback sanitization
  const sanitizeLeafMessage = (text) => String(text).replace(/[<>]/g, '').substring(0, 500);
  const sanitizeDisplayName = (name) => String(name).replace(/[<>]/g, '').substring(0, 50);
  // Backwards-compatible rate limiter shim.
  // Older code expects leafMessageLimiter.isAllowed(namespace) to exist.
  // Provide a small in-memory per-session limiter: allow up to N messages per MINUTES window.
  const leafMessageLimiter = (function(){
    const MAX_PER_WINDOW = 5; // allow 5 messages
    const WINDOW_MINUTES = 1; // per 1 minute

    // store counts by key in memory for the session
    const store = new Map();

    function _nowWindowKey() {
      const now = Date.now();
      // round down to WINDOW_MINUTES
      const windowMs = WINDOW_MINUTES * 60 * 1000;
      return Math.floor(now / windowMs) * windowMs;
    }

    function isAllowed(key = 'global') {
      try {
        const winKey = _nowWindowKey();
        const mapKey = `${key}:${winKey}`;
        const entry = store.get(mapKey) || 0;
        if (entry >= MAX_PER_WINDOW) return false;
        store.set(mapKey, entry + 1);

        // cleanup older keys occasionally
        if (store.size > 200) {
          const cutoff = winKey - WINDOW_MINUTES * 2 * 60 * 1000; // keep recent
          for (const k of store.keys()) {
            const parts = k.split(':');
            const wk = Number(parts[1]) || 0;
            if (wk < cutoff) store.delete(k);
          }
        }
        return true;
      } catch (e) {
        // On any error, be permissive to avoid blocking UX
        return true;
      }
    }

    // expose a legacy method name check() too for compatibility
    function check() { return true; }

    return { isAllowed, check };
  })();
  const mk = (tag, attrs={}) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
    return el;
  };

  // DOM Elements
  const stage = $("#stage");
  const svg = $("#leafSvg");
  const leaves = $("#leaves");
  const canvas = document.getElementById('leafCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const tree = document.getElementById('tree');
  const counter = $("#counter");
  const list = document.querySelector("#list") || null;
  const clearAll = document.querySelector("#clearAll") || null;
  const emptyState = document.querySelector("#emptyState") || null;
  const tip = $("#tip"), themeToggle = $("#themeToggle");
  const modal = $("#modal"), helpModal = $("#helpModal"), helpBtn = $("#helpBtn");
  const projectInfoModal = $("#projectInfoModal"), projectInfoBtn = $("#projectInfoBtn");
  const modalText = $("#modalText"), modalAuthor = $("#modalAuthor");
  const closeModal = $("#closeModal"), closeHelpModal = $("#closeHelpModal");
  const closeProjectInfoModal = $("#closeProjectInfoModal");
  const editLeafBtn = $("#editLeaf");
  const addModal = $("#addModal"), addModalTitle = $("#addModalTitle"), addMessage = $("#addMessage");
  const addAuthor = $("#addAuthor"), isAnonymous = $("#isAnonymous"), saveLeaf = $("#saveLeaf");
  const cancelAdd = $("#cancelAdd"), closeAddModal = $("#closeAddModal");
  const leafShapeSel = $("#leafShape"), leafPaletteSel = $("#leafPalette");
  const leafScaleInp = $("#leafScale"), leafRotationInp = $("#leafRotation");
  const leafPreview = $("#leafPreview"), toggleMode = $("#toggleMode");
  const dragMode = $("#dragMode");
  const viewOnlyMode = $("#viewOnlyMode"), actionButtons = $("#actionButtons");

  // ===== 3-mode controller (giữ 2 nút có sẵn) =====
  const btnPlace = document.querySelector("#toggleMode");   // 🎯 Đặt lá
  const btnDrag  = document.querySelector("#dragMode");     // 🤏 Kéo thả

  const Mode = Object.freeze({ VIEW:"view", PLACE:"place", DRAG:"drag" });
  let mode = Mode.VIEW;

  // hard limits để lá to không phá UX
  const MIN_SCALE = 0.85, MAX_SCALE = 2.0;
  // default scale used when no explicit control is present
  const DEFAULT_SCALE = 1.15;
  const clampScale = v => clamp(Number(v) || DEFAULT_SCALE, MIN_SCALE, MAX_SCALE);
  // rotation now supports full 0-360 range; normalize input into [0,360)
  const clampRot   = v => {
    let n = Number(v);
    if (!Number.isFinite(n)) n = 0;
    n = ((n % 360) + 360) % 360; // normalize
    return n;
  };

  // cập nhật UI + flags cho toàn app
  function setMode(next){
    if (!next || mode === next) { 
      // bấm lại nút đang bật thì về VIEW cho dễ hiểu
      if (mode !== Mode.VIEW) next = Mode.VIEW; else return;
    }
    mode = next;

    document.documentElement.dataset.mode = mode;
    stage?.classList.toggle("click-mode", mode === Mode.PLACE);
    stage?.classList.toggle("drag-mode",  mode === Mode.DRAG);

    // style nút active như radio-group + cập nhật text
    [btnPlace, btnDrag].forEach(b=>{
      if (!b) return;
      const isActive = (b===btnPlace && mode===Mode.PLACE) ||
                      (b===btnDrag  && mode===Mode.DRAG);
      
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", isActive);
      
      // Cập nhật text và icon cho từng nút
      const icon = b.querySelector(".btn-icon");
      const text = b.querySelector(".btn-text");
      
      if (b === btnPlace) {
        if (icon) icon.textContent = mode === Mode.PLACE ? "🎯" : "🖱️";
        if (text) text.textContent = mode === Mode.PLACE ? "🔥 Đang đặt lá" : "Click để đặt";
      }
      else if (b === btnDrag) {
        if (icon) icon.textContent = mode === Mode.DRAG ? "🤏" : "✋";
        if (text) text.textContent = mode === Mode.DRAG ? "🔥 Đang kéo thả" : "Kéo thả";
      }
    });
  }

  // gắn handler cho 2 nút, click lại để về VIEW
  btnPlace?.addEventListener("click", ()=> setMode(mode === Mode.PLACE ? Mode.VIEW : Mode.PLACE));
  btnDrag ?.addEventListener("click", ()=> setMode(mode === Mode.DRAG ? Mode.VIEW : Mode.DRAG));

  const storeKey = "leaf-messages-v3";
  let currentEditingId = null, pendingPosition = null, dragging = null;
  // Rotation mode state
  let rotateModeActive = false;
  let rotateTarget = null;
  let rotateHistory = [];
  let rotateOverlay = null;
  let _rotatePointerActive = false;
  let _rotatePointerStartAngle = 0;
  let _rotatePointerStartRotation = 0;
  let currentEncListener = null;
  let dragOffset = { x:0, y:0 }, clickToPlaceMode = false, dragModeEnabled = false;

  // Debounce và throttle để tối ưu hiệu suất
  const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  const throttle = (fn, delay) => {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        fn.apply(this, args);
      }
    };
  };

  // Night tint for canvas
  function nightTint() {
    if (!canvas || !ctx) return;
    if (!document.documentElement.classList.contains('theme-night')) return;
    
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(30,45,120,0.22)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Setup canvas
  function setupCanvas() {
    if (!canvas || !tree) return;
    
    const updateCanvasSize = () => {
      const rect = tree.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
      redrawAllLeaves();
    };
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
  }

  // Ensure we reproject leaves once the tree image finishes loading (layout ready)
  if (tree) {
    if (tree.complete) {
      // already loaded
      setTimeout(()=> reprojectAllLeaves(), 80);
    } else {
      tree.addEventListener('load', ()=> setTimeout(()=> reprojectAllLeaves(), 80));
    }
  }

  // Redraw all leaves on canvas
  function redrawAllLeaves() {
    if (!canvas || !ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all leaves here (implement based on your leaf rendering logic)
    // This is where you'd call your leaf sprite rendering
    
    // Apply night tint after drawing all leaves
    nightTint();
  }


  // Virtual scrolling cho danh sách lớn
  let listScrollOptimized = false;
  const optimizeListScroll = () => {
    if (listScrollOptimized || !list) return;
    listScrollOptimized = true;
    
    // Tối ưu scroll performance
    const handleScroll = throttle(() => {
      // Lazy load nếu cần thiết
      const scrollTop = list.scrollTop;
      const scrollHeight = list.scrollHeight;
      const clientHeight = list.clientHeight;
      
      // Nếu gần cuối danh sách, có thể load thêm
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        // Hook cho future pagination
      }
    }, 16); // ~60fps
    
    list.addEventListener('scroll', handleScroll, { passive: true });
    
    // Smooth scroll khi click vào item
    const smoothScrollToItem = (itemId) => {
      const item = list.querySelector(`[data-id="${itemId}"]`);
      if (item) {
        item.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest' 
        });
      }
    };
    
    // Export function để sử dụng
    window.smoothScrollToItem = smoothScrollToItem;
  };

  // Firebase - function động thay vì const cứng
  function hasFB(){ return !!(window._firebase && window._firebase.db); }
  function fb(){ return window._firebase; }
  function leavesRef(){ return fb().db.ref("leaves"); }

  // Auth helper: returns truthy when a user is currently signed in
  function isAuthenticated() {
    try {
      return !!(window._firebase?.auth?.currentUser || window.AuthHelpers?.currentUser);
    } catch (e) { return false; }
  }

  function promptLoginFlow(){
    try {
      // Prefer a nicer in-page modal if available
      const modal = document.getElementById('loginPromptModal');
      if (modal) {
        modal.style.display = 'grid';
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        const closeModal = () => {
          modal.classList.remove('show');
          setTimeout(()=> { modal.style.display = 'none'; document.body.style.overflow = 'auto'; }, 220);
        };

        const loginBtn = modal.querySelector('.login-now');
        const cancelBtn = modal.querySelector('.login-cancel');
        const closeBtn = modal.querySelector('.x');

        if (loginBtn) loginBtn.onclick = () => { try { navigateToPage('login.html'); } catch(e){ window.location.href = 'login.html'; } };
        if (cancelBtn) cancelBtn.onclick = closeModal;
        if (closeBtn) closeBtn.onclick = closeModal;

        // Close when clicking outside sheet
        modal.addEventListener('click', (ev)=> { if (ev.target === modal) closeModal(); });
        return;
      }

      // Fallback to confirm if modal not present
      if (confirm('Bạn cần đăng nhập để thực hiện hành động này. Chuyển đến trang đăng nhập?')) {
        try { navigateToPage('login.html'); } catch(e){ window.location.href = 'login.html'; }
      }
    } catch(e) { /* ignore */ }
  }

  // Modal hướng dẫn sử dụng
  if (helpBtn) helpBtn.addEventListener("click", ()=> showModal(helpModal));
  if (closeHelpModal) closeHelpModal.addEventListener("click", ()=> hideModal(helpModal));
  if (helpModal) helpModal.addEventListener("click", (e)=> { 
    if (e.target === helpModal) hideModal(helpModal); 
  });

  // Modal thông tin dự án
  if (projectInfoBtn) projectInfoBtn.addEventListener("click", ()=> showModal(projectInfoModal));
  if (closeProjectInfoModal) closeProjectInfoModal.addEventListener("click", ()=> hideModal(projectInfoModal));
  if (projectInfoModal) projectInfoModal.addEventListener("click", (e)=> { 
    if (e.target === projectInfoModal) hideModal(projectInfoModal); 
  });

  // Chế độ chỉ xem (view-only)
  function updateViewOnlyMode() {
    const isViewOnly = viewOnlyMode && viewOnlyMode.checked;
    if (actionButtons) {
      actionButtons.classList.toggle("disabled", isViewOnly);
    }
    
    if (isViewOnly) {
      // Tắt tất cả chức năng khi bật view only - chuyển về VIEW mode
      setMode(Mode.VIEW);
      
      // Remove tất cả CSS classes
      stage?.classList.remove("click-mode", "drag-mode");
    }
  }
  
  if (viewOnlyMode) {
    viewOnlyMode.addEventListener("change", updateViewOnlyMode);
    updateViewOnlyMode(); // init
  }


  function showModal(m){
    document.body.style.overflow = "hidden";
    m.style.display = "grid";
    requestAnimationFrame(()=> {
      m.classList.add("show");
      // Initialize preview when add modal is opened
      if (m === addModal) {
        renderPreview();
      }
    });
  }
  function hideModal(m){
    m.classList.remove("show");
    // cleanup encouragement listeners when closing the view modal
    try { if (m === modal) removeEncouragementListeners(); } catch(e){}
    setTimeout(()=>{
      m.style.display = "none";
      document.body.style.overflow = "";
    }, 300);
  }

  function removeEncouragementListeners(){
    try {
      if (currentEncListener && hasFB() && currentEncListener.ref) {
        try { currentEncListener.ref.off(); } catch(e){}
      }
    } finally { currentEncListener = null; }
  }


  function showTipForLeaf(g){
    const authorText = g.dataset.author ? ` - ${g.dataset.author}` : " - Ẩn danh";
    const full = (g.dataset.msg || "") + authorText;
    tip.textContent = full.length > 120 ? full.slice(0,117) + "…" : full;

    const rect = g.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const centerX = rect.left + rect.width/2 - stageRect.left;
    const topY = rect.top - stageRect.top - 10;
    const tipWidth = 220;
    const left = clamp(centerX - tipWidth/2, 8, stageRect.width - tipWidth - 8);
    const top  = Math.max(8, topY - 40);

    tip.style.left = left + "px";
    tip.style.top  = top + "px";
    tip.style.display = "block";
  }
  function hideTip(){ tip.style.display = "none"; }

  // Play watering effect on a leaf (tilting bucket pours multiple drops + leaf pulse)
  // durationMs: how long the effect should remain visible (ms). Defaults to 5000ms for the longer pour effect.
  // Centralized default watering duration (ms) so it's easy to change in one place
  const WATERING_DURATION_MS = 5000;

  function playWateringEffect(leafId, durationMs = WATERING_DURATION_MS){
    try {
      const g = leaves.querySelector(`.leaf[data-id="${leafId}"]`);
      if (!g) return;

      // leaf pulse — apply to inner image so we don't override the group's SVG transform
      const innerImg = g.querySelector('image');
      if (innerImg) {
        innerImg.classList.add('watering');
        // remove pulse after duration
        setTimeout(()=> innerImg.classList.remove('watering'), durationMs);
      }

      // compute screen position for effect
      const rect = g.getBoundingClientRect();
      const centerX = rect.left + rect.width/2;
      const topY = rect.top + rect.height/2;

  // create bucket element (tilting pouring can) using the watering_can asset
  const bucket = document.createElement('div');
  bucket.className = 'bucket-effect';
  const bucketImg = document.createElement('img');
  bucketImg.src = 'assets/leaves/special/watering_can.png';
  bucketImg.alt = 'watering can';
  bucketImg.className = 'bucket-img';
  // intrinsic width used for positioning (match CSS / layout)
  // Increase size so the bucket is clearly visible
  // make the watering can noticeably larger so the effect reads clearly
  const bw = 120; // bucket width in px (was 84)
  bucketImg.style.width = bw + 'px';
  bucketImg.style.height = 'auto';
  bucket.appendChild(bucketImg);
  document.body.appendChild(bucket);
  // position the bucket relative to the leaf rect so it stays aligned even when the page
  // is scrolled or the stage is transformed. Place the can slightly above and to the left
  // of the leaf center so the mouth naturally pours toward the leaf.
  const updateBucketPosition = () => {
    try {
      const r = g.getBoundingClientRect();
      const left = r.left + r.width * 0.5 - bw * 0.25;
      const top = r.top - bw * 0.6 - 10;
      bucket.style.left = left + 'px';
      bucket.style.top = top + 'px';
    } catch (e) {
      // if anything goes wrong, keep previous position
    }
  };

  // initialize position immediately and keep it updated during the effect
  updateBucketPosition();
  const bucketPosInterval = setInterval(updateBucketPosition, 80);

      // helper to create a water drop that falls toward the leaf center
        const createDrop = (delay, idx) => {
        const drop = document.createElement('div');
        drop.className = 'water-drop';
        // compute bucket mouth position so drops originate from the can, not the leaf
        let mouthX = centerX - bw/2; // fallback
        let mouthY = topY - 40;
        try {
          const brect = bucketImg.getBoundingClientRect();
          // mouth is roughly toward the front-right of the can image
          mouthX = brect.left + brect.width * 0.72;
          mouthY = brect.top + brect.height * 0.48;
        } catch(e) {
          /* ignore and use fallback above */
        }
        // start slightly offset from the mouth
        const startX = mouthX + rand(-6, 10);
        const startY = mouthY + rand(-4, 6);
        // position offscreen-looking but invisible until animated to avoid round dot artifact
        drop.style.left = startX + 'px';
        drop.style.top = startY + 'px';
        drop.style.opacity = '0';
        drop.style.transform = 'translateZ(0) scaleY(0.6)';
        // small width/height set via CSS; we also set transition here to ensure consistent timing
        drop.style.transition = 'transform 800ms cubic-bezier(.2,.8,.2,1), opacity 240ms ease-out';
        document.body.appendChild(drop);
        // schedule the fall
        setTimeout(()=>{
          // compute target y (leaf top area)
          const impactY = rect.top + rect.height*0.45 + rand(-8,8);
          const impactX = rect.left + rect.width*0.5 + rand(-18,18);
          // trigger CSS transition by applying transform and opacity
          requestAnimationFrame(()=>{
            drop.style.opacity = '1';
            drop.style.transform = `translate(${impactX - startX}px, ${impactY - startY}px) scaleY(1)`;
          });
          // small splash on impact
          setTimeout(()=>{
            const s = document.createElement('div');
            s.className = 'water-splash small';
            s.style.left = (impactX - 18) + 'px';
            s.style.top = (impactY - 8) + 'px';
            document.body.appendChild(s);
            setTimeout(()=> s.classList.add('show'), 10);
            setTimeout(()=> { try { s.remove(); } catch(e){} }, 700);
          }, 420 + rand(0,160));
        }, delay);
        // cleanup drop
        setTimeout(()=>{ try { drop.remove(); } catch(e){} }, durationMs + 500 + (idx*40));
      };

      // play animation: tilt bucket and start pouring drops intermittently
      requestAnimationFrame(()=> {
        bucket.classList.add('play');
        bucket.classList.add('pour');
        // create multiple drops over the duration
        // Increase density: more drops for a lush, satisfying pour
        const totalDrops = Math.max(18, Math.floor(durationMs / 260));
        for (let i=0;i<totalDrops;i++){
          const dly = 120 + i * (durationMs / totalDrops) + rand(-120, 120);
          createDrop(Math.max(40, Math.floor(dly)), i);
        }

        // a longer faint pool splash under the leaf to emphasize watering
        const pool = document.createElement('div');
        pool.className = 'water-pool';
        pool.style.left = (centerX - 28) + 'px';
        pool.style.top = (rect.top + rect.height*0.6) + 'px';
        document.body.appendChild(pool);
        requestAnimationFrame(()=> pool.classList.add('show'));

        // cleanup after durationMs: remove bucket/pool and clear interval
        setTimeout(()=>{
          try { clearInterval(bucketPosInterval); } catch(e){}
          try { bucket.remove(); } catch(e){}
          try { pool.remove(); } catch(e){}
        }, durationMs + 220);
      });
    } catch (e) { console.warn('playWateringEffect failed', e); }
  }

  // Show a transient floating encouragement visual (e.g., heart) near a leaf.
  // This avoids creating a persistent leaf when users post encouragements.
  function showTransientEncouragementVisual(leafId, opts = {}){
    try {
      const g = leaves.querySelector(`.leaf[data-id="${leafId}"]`);
      if (!g) return;
      const emoji = opts.emoji || '💖';
      const duration = Number.isFinite(opts.duration) ? opts.duration : 1400;

      const rect = g.getBoundingClientRect();
      const centerX = rect.left + rect.width/2;
      const topY = rect.top;

      const el = document.createElement('div');
      el.className = 'encouragement-fly';
      el.textContent = emoji;
      Object.assign(el.style, {
        position: 'absolute',
        left: (centerX - 12) + 'px',
        top: (topY - 12) + 'px',
        pointerEvents: 'none',
        fontSize: '20px',
        transform: 'translateY(6px) scale(0.9)',
        opacity: '0',
        transition: 'transform 420ms cubic-bezier(.2,.9,.2,1), opacity 420ms ease'
      });
      document.body.appendChild(el);

      // show
      requestAnimationFrame(()=>{
        el.style.opacity = '1';
        el.style.transform = 'translateY(-28px) scale(1.05)';
      });

      // float up and fade out
      setTimeout(()=>{
        el.style.transition = `transform ${Math.max(300, duration-300)}ms linear, opacity ${Math.max(300, duration-300)}ms linear`;
        el.style.transform = 'translateY(-72px) scale(1.0)';
        el.style.opacity = '0';
      }, Math.max(320, duration/3));

      setTimeout(()=>{ try { el.remove(); } catch(e){} }, duration + 120);
    } catch (e){ console.warn('showTransientEncouragementVisual failed', e); }
  }

  // Rotation mode: hide modal and allow interactive 360° rotation of a leaf.
  // Provides three floating action buttons: Cancel (revert & exit), Undo (step back), Done (persist & exit).
  function applyRotationToGroup(g, rotation){
    try {
      const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0,"rotation":0}');
      const sc = Number(g.dataset.scale || 1);
      const rot = clampRot(rotation);
      g.dataset.rotation = String(rot);
      g.setAttribute('transform', `translate(${Number(pos.x)} ${Number(pos.y)}) rotate(${rot}) scale(${sc})`);
      try { console.debug('applyRotationToGroup: applied rotation', { id: g.dataset.id, rot }); } catch(e){}
      // also update any preview image inside modal when visible
      try {
        const modalImg = document.getElementById('modalLeafImage');
        if (modalImg && rotateTarget && rotateTarget.dataset.id === g.dataset.id) {
          modalImg.style.transform = `rotate(${rot}deg)`;
        }
      } catch(e){}
    } catch (e) { console.warn('applyRotationToGroup failed', e); }
  }

  function ensureRotateOverlay(){
    if (rotateOverlay) return rotateOverlay;
    const o = document.createElement('div');
    o.className = 'rotate-overlay';
    o.innerHTML = `
      <div class="rotate-fabs">
        <button id="rotateCancelBtn" class="btn red">HỦY</button>
        <button id="rotateUndoBtn" class="btn tertiary">HOÀN TÁC</button>
        <button id="rotateDoneBtn" class="btn primary">XONG</button>
      </div>
      <div class="rotate-hint">Kéo quanh lá để xoay. Vuốt/di chuột để thay đổi góc.</div>
    `;
  // Prefer attaching the overlay to the stage (canvas) so it appears inside the tree
  try { (stage || document.body).appendChild(o); } catch(e) { document.body.appendChild(o); }
  // If we attached to the document body, use fixed positioning so it remains visible
  if ((o.parentElement === document.body) && getComputedStyle(stage || document.body).position === 'static') {
    o.style.position = 'fixed';
    o.style.top = '12px';
    o.style.left = '50%';
    o.style.transform = 'translateX(-50%)';
  }
  // bump z-index to ensure overlay appears above other elements (modals are ~3000)
  try { o.style.zIndex = '99999'; } catch(e){}
  o.classList.add('in-stage');
  rotateOverlay = o;

    // wire buttons (ensure they exist; fallback-create if DOM query fails)
    let cancel = o.querySelector('#rotateCancelBtn');
    let undo = o.querySelector('#rotateUndoBtn');
    let done = o.querySelector('#rotateDoneBtn');
    if (!cancel) {
      cancel = document.createElement('button');
      cancel.id = 'rotateCancelBtn';
      cancel.className = 'btn red';
      cancel.textContent = 'HỦY';
      o.querySelector('.rotate-fabs')?.insertBefore(cancel, o.querySelector('.rotate-fabs')?.firstChild || null);
    }
    if (!undo) {
      undo = document.createElement('button');
      undo.id = 'rotateUndoBtn';
      undo.className = 'btn tertiary';
      undo.textContent = 'HOÀN TÁC';
      o.querySelector('.rotate-fabs')?.appendChild(undo);
    }
    if (!done) {
      done = document.createElement('button');
      done.id = 'rotateDoneBtn';
      done.className = 'btn primary';
      done.textContent = 'XONG';
      o.querySelector('.rotate-fabs')?.appendChild(done);
    }
    // accessibility
    [cancel, undo, done].forEach(b=>{ try{ b.setAttribute('aria-pressed', 'false'); b.setAttribute('role','button'); } catch(e){} });

    // keyboard: Escape cancels; Enter on focused overlay triggers Done
    function _overlayKeyHandler(ev){
      if (!rotateOverlay || !rotateOverlay.classList.contains('show')) return;
      if (ev.key === 'Escape') {
        try { console.debug('rotate-overlay: Escape pressed -> cancel'); } catch(e){}
        cancel.click();
      } else if (ev.key === 'Enter') {
        try { console.debug('rotate-overlay: Enter pressed -> done'); } catch(e){}
        done.click();
      }
    }
    document.removeEventListener('keydown', _overlayKeyHandler);
    document.addEventListener('keydown', _overlayKeyHandler);

    cancel.addEventListener('click', ()=>{
      console.debug('rotate-overlay: cancel clicked');
      // revert
      if (rotateHistory && rotateHistory.length) {
        const orig = rotateHistory[0];
        if (rotateTarget) applyRotationToGroup(rotateTarget, orig);
      }
      exitRotateMode(false);
    });
    undo.addEventListener('click', ()=>{
      console.debug('rotate-overlay: undo clicked, history=', rotateHistory);
      try {
        if (!rotateTarget) return;

        // Ensure rotateHistory exists and has at least the starting value
        if (!rotateHistory || rotateHistory.length === 0) {
          // initialize from current dataset so we have a base to compare
          rotateHistory = [Number(rotateTarget.dataset.rotation || 0)];
          return;
        }

        // If there's only the original value recorded, but the current rotation
        // differs (e.g. user dragged but pointerup didn't record), apply the
        // original to revert; otherwise there's nothing to undo.
        if (rotateHistory.length === 1) {
          const orig = Number(rotateHistory[0]);
          const cur = Number(rotateTarget.dataset.rotation || 0);
          if (cur !== orig) {
            applyRotationToGroup(rotateTarget, orig);
          }
          return;
        }

        // Normal case: discard last recorded rotation and apply the previous one
        rotateHistory.pop();
        const last = Number(rotateHistory[rotateHistory.length - 1]);
        applyRotationToGroup(rotateTarget, last);
        // update button enabled state after undo
        try { setRotateUndoEnabled(); } catch(e){}
      } catch(e){ console.warn('undo rotate failed', e); }
    });
    done.addEventListener('click', async ()=>{
      console.debug('rotate-overlay: done clicked');
      if (!rotateTarget) { exitRotateMode(false); return; }
      // persist rotation to DB similar to edit flow
      try {
        const id = rotateTarget.dataset.id;
        const payload = getLeafDataFromDOM(id);
        payload.rotation = Number(rotateTarget.dataset.rotation || 0);
        // ensure stable percent coords
        try {
          const pos = JSON.parse(rotateTarget.dataset.position || '{"x":0,"y":0}');
          const pct = svgToTreePercent(Number(pos.x||0), Number(pos.y||0));
          payload.percentX = Number(pct.px);
          payload.percentY = Number(pct.py);
        } catch(e){}
        if (hasFB()) await fb().db.ref(`leaves/${id}`).set(payload);
      } catch(e){ console.error('Failed to persist rotation', e); }
      exitRotateMode(true);
    });

    return rotateOverlay;
  }

  // Helper to enable/disable the Undo button based on current history
  function setRotateUndoEnabled(){
    try {
      const b = document.getElementById('rotateUndoBtn');
      if (!b) return;
      // Enabled when there are at least two history entries (we can step back)
      // or when there's a single recorded base but the current rotation differs.
      let enabled = false;
      if (rotateHistory && rotateHistory.length > 1) enabled = true;
      else if (rotateHistory && rotateHistory.length === 1 && rotateTarget) {
        const orig = Number(rotateHistory[0]);
        const cur = Number(rotateTarget.dataset.rotation || 0);
        enabled = (cur !== orig);
      }
      b.disabled = !enabled;
      b.setAttribute('aria-disabled', b.disabled ? 'true' : 'false');
    } catch(e){ /* ignore */ }
  }

  function enterRotateMode(g){
    try {
      if (rotateModeActive) return;
      rotateModeActive = true;
      rotateTarget = g;
      rotateHistory = [];
      const start = Number(g.dataset.rotation || 0);
  rotateHistory.push(start);
  try { console.debug('enterRotateMode: start rotation', start); } catch(e){}
  try { setRotateUndoEnabled(); } catch(e){}
      _rotatePointerActive = false;
      // hide modal as requested
      try { hideModal(modal); } catch(e){}
      ensureRotateOverlay();
      rotateOverlay.classList.add('show');
      // focus target to make pointer events obvious
      requestAnimationFrame(()=> {
        // apply a subtle highlight
        try { g.classList.add('rotating'); } catch(e){}
      });
    } catch(e){ console.warn('enterRotateMode failed', e); }
  }

  function exitRotateMode(commit){
    try {
      rotateModeActive = false;
      _rotatePointerActive = false;
      if (rotateTarget) try { rotateTarget.classList.remove('rotating'); } catch(e){}
      if (rotateOverlay) rotateOverlay.classList.remove('show');
      // restore modal so user can continue editing/viewing
      try { showModal(modal); } catch(e){}
      // clear state after a tick to avoid accidental reuse
      setTimeout(()=> { rotateTarget = null; rotateHistory = []; try { setRotateUndoEnabled(); } catch(e){} }, 240);
    } catch(e){ console.warn('exitRotateMode failed', e); }
  }

  // Pointer handlers for rotation when active
  document.addEventListener('pointerdown', (e)=>{
    if (!rotateModeActive || !rotateTarget) return;
    // only start if pointer on the target leaf or anywhere (we allow anywhere)
    e.preventDefault();
    _rotatePointerActive = true;
    const rect = rotateTarget.getBoundingClientRect();
    const cx = rect.left + rect.width/2; const cy = rect.top + rect.height/2;
    _rotatePointerStartAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    _rotatePointerStartRotation = Number(rotateTarget.dataset.rotation || 0);
    // push starting rotation to history so Undo has a base
    rotateHistory.push(_rotatePointerStartRotation);
    try { console.debug('pointerdown: pushed start rotation', _rotatePointerStartRotation, 'history=', rotateHistory); } catch(e){}
    try { setRotateUndoEnabled(); } catch(e){}
  });
  document.addEventListener('pointermove', (e)=>{
    if (!rotateModeActive || !rotateTarget || !_rotatePointerActive) return;
    try {
      const rect = rotateTarget.getBoundingClientRect();
      const cx = rect.left + rect.width/2; const cy = rect.top + rect.height/2;
      const ang = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      const delta = ang - _rotatePointerStartAngle;
      const newRot = _rotatePointerStartRotation + delta;
      applyRotationToGroup(rotateTarget, newRot);
    } catch(e){ /* ignore */ }
  });
  document.addEventListener('pointerup', (e)=>{
    if (!rotateModeActive || !rotateTarget) return;
    if (_rotatePointerActive) {
      // finalize
      _rotatePointerActive = false;
      const final = Number(rotateTarget.dataset.rotation || 0);
      // record final rotation so Undo can step back
      rotateHistory.push(final);
      try { console.debug('pointerup: pushed final rotation', final, 'history=', rotateHistory); } catch(e){}
      try { setRotateUndoEnabled(); } catch(e){}
    }
  });

  // Hình ảnh lá cây
  // script.js (Sửa LẠI getLeafImagePath - Kiểm tra index kỹ hơn)
function getLeafImagePath(shapeKey, paletteIdx = 0) {
  try {
    const normalizedIdx = Number.isFinite(paletteIdx) ? Math.floor(paletteIdx) : 0;
    // Log giá trị nhận vào để debug
    console.log(`DEBUG: getLeafImagePath received shapeKey=${shapeKey}, paletteIdx=${paletteIdx}, normalizedIdx=${normalizedIdx}`);

    // Ưu tiên xử lý 'fine' trước
    if (shapeKey === 'fine') {
        console.log("DEBUG: Returning 'fine' leaf path.");
        return 'assets/leaves/special/leaf_fine.png';
    }

    const newColorMap = [
        /* 0 */ 'green',
        /* 1 */ 'yellow',
        /* 2 */ 'red',
        /* 3 */ 'pink',
        /* 4 */ 'purple',
        /* 5 */ 'blue',
        /* 6 */ 'withered' // Index 6
    ];

    let color = 'green'; // Mặc định là xanh lá

    // Kiểm tra index có nằm trong phạm vi mảng không
    if (normalizedIdx >= 0 && normalizedIdx < newColorMap.length) {
        color = newColorMap[normalizedIdx];
        console.log(`DEBUG: Index ${normalizedIdx} is valid, selected color: ${color}`);
    } else {
        // Nếu index không hợp lệ, log cảnh báo và dùng màu mặc định
        console.warn(`DEBUG: Invalid paletteIdx ${normalizedIdx}, defaulting to green.`);
        color = 'green';
    }

    const basePath = 'assets/leaves/normal/';
    const fileName = `leaf_normal_${color}.png`;
    const finalPath = basePath + fileName;

    // Log đường dẫn cuối cùng trả về
    console.log(`DEBUG: getLeafImagePath returning: ${finalPath}`);
    return finalPath;

  } catch (e) {
    console.error("Error in getLeafImagePath:", e);
    return 'assets/leaves/normal/leaf_normal_green.png'; // Fallback an toàn
  }
}

  // Load an image, trim fully-transparent borders, and return a dataURL for the cropped image.
  // Uses a small 2px padding so leaves don't get clipped too tightly.
  async function getTrimmedImageDataURL(src) {
    if (!src) return src;
    // COMMENT OUT CHECK CACHE:
    // if (trimmedImageCache.has(src)) return trimmedImageCache.get(src);

    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        // **IMPORTANT:** Add crossorigin attribute if images are from a different origin
        // i.crossOrigin = "Anonymous";
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      });

      // create an offscreen canvas
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w === 0 || h === 0) { // Handle cases where image dimensions are zero
        console.warn('getTrimmedImageDataURL: Image dimensions are zero for src:', src);
        return src; // Return original src if dimensions are invalid
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      if (!cx) { // Handle cases where canvas context cannot be obtained
         console.warn('getTrimmedImageDataURL: Could not get 2D context for src:', src);
         return src;
      }
      cx.clearRect(0,0,w,h);
      cx.drawImage(img, 0, 0);

      // Get image data, handle potential security errors (e.g., CORS)
      let imageData;
      try {
        imageData = cx.getImageData(0,0,w,h);
      } catch (e) {
        console.warn('getTrimmedImageDataURL: Failed to getImageData (possibly CORS issue) for src:', src, e);
        // try { trimmedImageCache.set(src, src); } catch {} // Commented out
        return src; // Return original src if getImageData fails
      }
      const data = imageData.data;

      // find bounding box of non-transparent pixels
      let minX = w, minY = h, maxX = -1, maxY = -1; // Initialize maxX/maxY to -1
      let found = false;
      const alphaThreshold = 8; // Pixels with alpha <= 8 are considered transparent

      for (let y = 0; y < h; y++){
        for (let x = 0; x < w; x++){
          const idx = (y*w + x) * 4 + 3; // alpha channel index
          const a = data[idx];
          if (a > alphaThreshold) {
            found = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!found) {
        // Image is fully transparent or empty
        console.warn('getTrimmedImageDataURL: No non-transparent pixels found for src:', src);
        // try { trimmedImageCache.set(src, src); } catch {} // Commented out
        return src; // Return original src
      }

      // add small padding but clamp to image bounds
      const pad = 2;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      // Ensure maxX/maxY are at least minX/minY + 1 pixel wide/tall after padding
      maxX = Math.min(w - 1, Math.max(minX, maxX + pad));
      maxY = Math.min(h - 1, Math.max(minY, maxY + pad));

      const tw = maxX - minX + 1;
      const th = maxY - minY + 1;

      // Ensure trimmed dimensions are valid
       if (tw <= 0 || th <= 0) {
          console.warn('getTrimmedImageDataURL: Invalid trimmed dimensions for src:', src, {tw, th});
          // try { trimmedImageCache.set(src, src); } catch {} // Commented out
          return src;
       }


      const tc = document.createElement('canvas');
      tc.width = tw; tc.height = th;
      const tcx = tc.getContext('2d');
       if (!tcx) { // Handle cases where trimmed canvas context cannot be obtained
          console.warn('getTrimmedImageDataURL: Could not get trimmed 2D context for src:', src);
          return src;
       }
      tcx.clearRect(0,0,tw,th);
      tcx.drawImage(c, minX, minY, tw, th, 0, 0, tw, th);

      const dataUrl = tc.toDataURL('image/png');
      // COMMENT OUT SET CACHE:
      // trimmedImageCache.set(src, dataUrl);
      return dataUrl; // Trả về data URL mới xử lý
    } catch (e) {
      console.error('Error in getTrimmedImageDataURL for src:', src, e);
      // on error return original src
      // COMMENT OUT SET CACHE KHI LỖI:
      // try { trimmedImageCache.set(src, src); } catch {}
      return src; // Trả về src gốc nếu lỗi
    }
  }
  
  function pickPalette(idx){
    // Giữ lại để compatibility, nhưng không dùng cho rendering
    const arr = [
      { fill:"#E8F5E8", stroke:"#A8D8A8", vein:"#7BC97B" }, // Tiền bạc → Xanh pastel
      { fill:"#FFE5F0", stroke:"#FFB3D9", vein:"#FF80C7" }, // Tình yêu → Hồng pastel  
      { fill:"#FFFBE5", stroke:"#FFF4B3", vein:"#FFEB80" }, // Học tập → Vàng pastel
      { fill:"#E5F3FF", stroke:"#B3D9FF", vein:"#80C7FF" }, // Công việc → Xanh dương pastel
      { fill:"#F0E5FF", stroke:"#D9B3FF", vein:"#C780FF" }, // Mối quan hệ → Tím pastel
      { fill:"#F0FFF0", stroke:"#C8E6C8", vein:"#9ACD9A" }  // Khác → Xanh lá pastel nhạt
    ];
    const i = Number.isFinite(idx) ? clamp(idx,0,arr.length-1) : Math.floor(Math.random()*arr.length);
    return { palette: arr[i], idx: i };
  }
 
  // Lưu trữ dữ liệu với Firebase
  function loadFromStorage(){
    try {
      const data = JSON.parse(localStorage.getItem(storeKey) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      localStorage.removeItem(storeKey);
      return [];
    }
  }
  function getLeafDataFromDOM(id){
    const leaf = leaves.querySelector(`.leaf[data-id="${id}"]`);
    const position = leaf ? JSON.parse(leaf.dataset.position || '{"x":0,"y":0,"rotation":0}') : {x:0,y:0,rotation:0};
    return {
      id,
      text: leaf?.dataset.msg || "",
      author: leaf?.dataset.author || "",
      authorId: leaf?.dataset.authorId || "", // Include authorId to match database rules
      position,
      // normalized percent position relative to tree image (optional)
      percentX: leaf && leaf.dataset.percentX ? Number(leaf.dataset.percentX) : undefined,
      percentY: leaf && leaf.dataset.percentY ? Number(leaf.dataset.percentY) : undefined,
      scale: Number(leaf?.dataset.scale || 1),
      rotation: Number(leaf?.dataset.rotation || 0),
      shapeKey: leaf?.dataset.shapeKey || "normal",
      paletteIdx: Number(leaf?.dataset.paletteIdx || 0),
      isWithered: !!leaf?.dataset.isWithered,
      ts: Number(leaf?.dataset.ts || Date.now())
    };
  }
  function syncLocalStorage(){
    try {
      const data = [...leaves.querySelectorAll(".leaf")].map(el => getLeafDataFromDOM(el.dataset.id));
      localStorage.setItem(storeKey, JSON.stringify(data));
    } catch(e){
      console.error("Error saving to localStorage:", e);
    }
  }

  // Tính toán hình học và khoảng cách
  function svgPoint(evt){
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const m = svg.getScreenCTM().inverse();
    return pt.matrixTransform(m);
  }
  // Convert window/client coordinates to SVG user coordinates
  function screenToSVG(clientX, clientY){
    try {
      const pt = svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      const m = svg.getScreenCTM().inverse();
      return pt.matrixTransform(m);
    } catch (e) {
      // Fallback: return raw values if conversion fails
      return { x: clientX, y: clientY };
    }
  }
  // Convert an SVG point to a percent position relative to the tree image box
  function svgToTreePercent(svgX, svgY){
    const treeImg = document.getElementById('tree');
    if (!treeImg) return { px: svgX, py: svgY };
    const rect = treeImg.getBoundingClientRect();
    // Convert SVG point back to client coords using CTM
    try {
      const pt = svg.createSVGPoint(); pt.x = svgX; pt.y = svgY;
      const screen = pt.matrixTransform(svg.getScreenCTM());
      const relX = screen.x - rect.left;
      const relY = screen.y - rect.top;
      return { px: relX / rect.width, py: relY / rect.height };
    } catch (e) {
      return { px: 0.5, py: 0.5 };
    }
  }
  // Convert percent relative to tree image back to SVG coords
  function treePercentToSVG(px, py){
    const treeImg = document.getElementById('tree');
    if (!treeImg) return { x: px, y: py };
    const rect = treeImg.getBoundingClientRect();
    const clientX = rect.left + (Number(px||0) * rect.width);
    const clientY = rect.top  + (Number(py||0) * rect.height);
    return screenToSVG(clientX, clientY);
  }
  function randomPositionInTree(){
    // Fix: Sử dụng vùng tương đối với kích thước cây thay vì tìm branches không tồn tại
    const treeImg = document.getElementById('tree');
    if (!treeImg) {
      return { x: 400 + rand(-80,80), y: 300 + rand(-100,50), rotation: rand(-15,15) };
    }
    
    // Lấy kích thước thực của cây trên viewport
    const rect = treeImg.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    
    // Tính toán vị trí tương đối trong SVG (tỷ lệ với stage)
    // Compute an absolute client coordinate (window space) for a random point over the tree
    const relX = rect.width/2 + rand(-rect.width*0.35, rect.width*0.35);
    const relY = rect.height/4 + rand(-rect.height*0.3, rect.height*0.3);
    const clientX = rect.left + relX;
    const clientY = rect.top + relY;

    // Convert to SVG user coordinates so stored positions are stable across resizes
    const pt = screenToSVG(clientX, clientY);
    return { x: pt.x, y: pt.y, rotation: rand(-15,15) };
  }

  // Các utility function cho UI
  function updateCounter(){
    const c = leaves.querySelectorAll(".leaf").length;
    if (counter) counter.textContent = `${c} lá`;
  }
  function updateEmptyState(){
    const has = leaves.querySelectorAll(".leaf").length > 0;
    if (emptyState) emptyState.style.display = has ? "none" : "block";
    if (clearAll)   clearAll.style.display   = has ? "block" : "none";
  }

  // Modal thêm/sửa thông điệp
  function renderPreview(){
    const previewImg = document.getElementById('previewLeafImage');
    const rotationValue = document.getElementById('rotationValue');
    const wrap = document.querySelector('.preview-image-wrap');

    // FIX: Dời khai báo shapeKey lên ĐẦU HÀM
    const shapeKey = 'normal'; // Luôn là 'normal'

    if (!previewImg || !wrap) {
      console.error("renderPreview: Missing previewImg or wrap element!");
      return;
    }

    const paletteIdx = Number(leafPaletteSel?.value) || 0;
    // BỎ LOG NÀY ĐI CHO ĐỠ RỐI: console.log(`addLeafFromData: Using paletteIdx=${paletteIdx} `); // Sai context
    console.log(`[DEBUG RENDER] renderPreview: Using paletteIdx=${paletteIdx}`); // Log mới

    // BỎ KHAI BÁO shapeKey Ở ĐÂY: const shapeKey = 'normal';
    const rotation = clampRot(leafRotationInp?.value || 0);
    const scale = DEFAULT_SCALE; // Luôn dùng default scale

    // Gọi hàm getLeafImagePath bình thường
    const imagePath = getLeafImagePath(shapeKey, paletteIdx);
    const imagePathWithCacheBust = imagePath ? `${imagePath}?t=${Date.now()}` : '';

    // Cập nhật src nếu khác
    if (imagePathWithCacheBust && previewImg.src !== imagePathWithCacheBust) {
        previewImg.src = imagePathWithCacheBust;
    }
    previewImg.style.setProperty('display', 'block', 'important');

    const finalScale = clampScale(scale);
    const transformString = `translate(-50%, -50%) rotate(${rotation}deg) scale(${finalScale})`;

    // Ép style bằng JS với !important
    try {
        previewImg.style.setProperty('position', 'absolute', 'important');
        previewImg.style.setProperty('left', '50%', 'important');
        previewImg.style.setProperty('top', '50%', 'important');
        previewImg.style.setProperty('transform-origin', 'center center', 'important');
        previewImg.style.setProperty('transform', transformString, 'important');
        previewImg.style.setProperty('transition', 'none', 'important');
    } catch(e) {
        console.error("Failed to set preview image style with !important:", e);
        // Fallback không có !important
        Object.assign(previewImg.style, {
            position: 'absolute', left: '50%', top: '50%',
            transformOrigin: 'center center', transform: transformString,
            transition: 'none'
        });
    }

    // Reset transform của wrapper để chắc chắn nó không phá đám
    wrap.style.transform = '';
    wrap.style.transformOrigin = '';

    // Cập nhật hiển thị giá trị rotation
    if (rotationValue) {
        rotationValue.textContent = rotation + '°';
    }
  }
  function openAddModal(message="", author="", isEdit=false, leafId=null){
    if (!addModal) return;
    // Require authentication for creating a new leaf. Editing existing leaves
    // is allowed to continue (isEdit === true). If the user is not signed in,
    // prompt the login flow and abort opening the modal.
    if (!isEdit && !isAuthenticated()) {
      promptLoginFlow();
      return;
    }
    addMessage.value = message || "";
      // If author explicitly provided (edit mode), use it. Otherwise,
      // try to auto-fill from the current logged-in user.
      const currentUser = window._firebase?.auth?.currentUser || window.AuthHelpers?.currentUser || null;
      if (isEdit && author) {
        addAuthor.value = author;
        isAnonymous.checked = false;
      } else if (!author && currentUser) {
        // auto-fill with displayName or email local-part
        addAuthor.value = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : "");
        isAnonymous.checked = false;
      } else {
        // fallback: if no user and no provided author, default to anonymous
        addAuthor.value = author || "";
        isAnonymous.checked = !addAuthor.value;
      }
      addAuthor.disabled = isAnonymous.checked;
      addAuthor.style.opacity = isAnonymous.checked ? "0.5" : "1";

      if (leafShapeSel) {
        leafShapeSel.value = 'normal';
    }
    currentEditingId = leafId;
    addModalTitle.textContent = isEdit ? "✏️ Sửa lá" : "🌿 Thêm lá mới";

    if (leafShapeSel && leafPaletteSel && leafRotationInp) {
      if (isEdit && leafId) {
        const leaf = leaves.querySelector(`.leaf[data-id="${leafId}"]`);
        const oldShape = leaf?.dataset.shapeKey || 'normal';
        leafPaletteSel.value  = leaf?.dataset.paletteIdx || "0";
        // There is no leafScale input in the UI anymore; we still read stored scale
        // and use it when present, otherwise default to DEFAULT_SCALE
        if (leaf?.dataset.scale) {
          // nothing to set in UI
        }
        leafRotationInp.value = leaf?.dataset.rotation   || "0";
      } else {
        leafPaletteSel.value = "0";
        // default scale removed from UI; use script default
        leafRotationInp.value = "0";
      }
      renderPreview();
    }
  // witherTypeRow removed (merged into leafShape select)
    showModal(addModal);
  }

  // Render lá cây lên cây
  function addLeafFromData(data, animate=false){
    // Validate và fix corrupted data
    if (!data.position || typeof data.position !== 'object') {
      data.position = randomPositionInTree();
    }

    // Ensure position.x/y are finite numbers; fallback to random when corrupted
    let position = data.position || { x:0, y:0 };
    let px = Number(position && position.x);
    let py = Number(position && position.y);

    // If the backend provided normalized percent coordinates relative to the tree,
    // prefer those and re-project into current SVG coordinates so placement is stable
    if (data.percentX !== undefined && data.percentY !== undefined) {
      try {
        const pt = treePercentToSVG(Number(data.percentX), Number(data.percentY));
        px = Number(pt.x);
        py = Number(pt.y);
        position.x = px; position.y = py;
        try { console.debug('addLeafFromData: using percent coords ->', { id: data.id, percentX: data.percentX, percentY: data.percentY, svgX: px, svgY: py }); } catch(e){}
      } catch (e) {
        // fallback to provided position
      }
    }
    // NOTE: Removed an earlier heuristic that attempted to treat large numbers as
    // client/screen coordinates and convert them to SVG coords. That heuristic
    // interfered with percent-based positioning and caused leaves to "jump"
    // or detach on resize. We now rely on provided percentX/percentY and the
    // downstream finite-check below to ensure safe placement.
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      position = randomPositionInTree();
      data.position = position;
      px = Number(position.x); py = Number(position.y);
    }
    const rotation = Number.isFinite(data.rotation) ? data.rotation : (position.rotation || 0);
    const scale    = Number.isFinite(data.scale)    ? data.scale    : rand(0.9,1.2);

const incomingPaletteIdx = Number.isFinite(data.paletteIdx) ? Number(data.paletteIdx) : 0;
  // paletteIdx used for storing and selecting image; keep 6 as-is to represent 'withered'
  let paletteIdx = incomingPaletteIdx;
  // pickPalette only knows colors 0..5 — use a safe fallback for UI palette info when index === 6
  const paletteInfo = (incomingPaletteIdx === 6) ? pickPalette(5) : pickPalette(incomingPaletteIdx);
  const palette = paletteInfo.palette;

  // Determine shapeKey: honor explicit 'fine', or mark 'withered' when incomingPaletteIdx === 6 or data.isWithered true
  const incomingKey = data.shapeKey;
  const shapeKey = (incomingKey === 'fine') ? 'fine' : ((incomingPaletteIdx === 6 || data.isWithered) ? 'withered' : 'normal');
  // ...existing code...

    // Tạo group container
    const g = mk("g", { class: "leaf" });
    g.dataset.id        = data.id;
    g.dataset.msg       = data.text || "";
    g.dataset.author    = data.author || "";
    g.dataset.authorId  = data.authorId || ""; // Store authorId for proper tracking
    g.dataset.position  = JSON.stringify(position);
    g.dataset.rotation  = String(clampRot(rotation));
    g.dataset.scale     = String(clampScale(scale));
    g.dataset.shapeKey  = shapeKey;
    g.dataset.paletteIdx= String(paletteIdx);
  // withered flag
  if (data.isWithered) g.dataset.isWithered = '1';
    g.dataset.ts        = String(data.ts || Date.now());

    // Transform SVG với image
  const sc = clampScale(scale);
  const rot = clampRot(rotation);
  const tx = Number(position.x) || 0;
  const ty = Number(position.y) || 0;
  const baseTransform = `translate(${tx} ${ty}) rotate(${rot}) scale(${sc})`;
    g.setAttribute("transform", baseTransform);
  try { console.debug('addLeafFromData: placing leaf', { id: data.id, tx, ty, percentX: g.dataset.percentX, percentY: g.dataset.percentY }); } catch(e){}

    // Sử dụng ảnh thay vì SVG path
  const leafImagePath = getLeafImagePath(shapeKey, paletteIdx);
  console.log(`addLeafFromData: Using leafImagePath=${leafImagePath} for leaf ID=${data.id}`);
    // Base image intrinsic size: 67x67 (≈20% smaller than previous 84x84) to slightly reduce default leaf footprint
    const leafImage = mk("image", { 
      href: leafImagePath,
      x: "-42", // Center for 67x67 image
      y: "-42", 
      width: "84",
      height: "84",
      style: "filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));"
    });

    if (data.isWithered) {
      // Visual cue: add withered class and reduce opacity slightly
      g.classList.add('withered');
    }

    // If data contains percent coords, store them on dataset so future renders use them
    if (data.percentX !== undefined && data.percentY !== undefined) {
      g.dataset.percentX = String(data.percentX);
      g.dataset.percentY = String(data.percentY);
    } else {
      // compute percent and store it for future stability
      const pct = svgToTreePercent(tx, ty);
      g.dataset.percentX = String(pct.px);
      g.dataset.percentY = String(pct.py);
    }

    // Ensure the inner image does not swallow pointer events that the group relies on for dragging.
    // Keep pointer-events enabled but forward pointerdown to the parent group if necessary.
    leafImage.style.pointerEvents = 'auto';
    // Replace href with trimmed dataURL asynchronously to remove any transparent margins
    getTrimmedImageDataURL(leafImagePath).then((trimmed) => {
      try { 
        // if (trimmed) leafImage.setAttribute('href', trimmed); 
      } catch(e){}
    }).catch(()=>{});
    leafImage.addEventListener('pointerdown', (ev) => {
      // If a pointerdown happens on the image, re-dispatch it on the group so group-level handlers run.
      // This keeps dragging behavior consistent for both normal and withered leaves.
      try {
        const evt = new PointerEvent('pointerdown', ev);
        g.dispatchEvent(evt);
      } catch (e) {
        // Fallback: stopPropagation so group handler can still receive the event in many browsers
        ev.stopPropagation();
      }
    });

    g.appendChild(leafImage);
    try {
    console.log(`addLeafFromData: Final image href set to=${leafImage.getAttribute('href')}`);
} catch(e){}
    leaves.appendChild(g);

    // Tooltip - chỉ ở VIEW mode
    let tipTimeout;
    g.addEventListener("mouseenter", ()=> { 
      if (mode !== Mode.VIEW) return;
      clearTimeout(tipTimeout); 
      tipTimeout = setTimeout(()=> showTipForLeaf(g), 150); 
    });
    g.addEventListener("mouseleave", ()=> { clearTimeout(tipTimeout); hideTip(); });

    // Click view - chỉ ở VIEW mode
    g.addEventListener("click", ()=>{
      // If we're actively in rotate mode, don't open the leaf modal on clicks
      if (rotateModeActive) return;
      if (mode !== Mode.VIEW) return;
      modalText.textContent   = g.dataset.msg || "";
      modalAuthor.textContent = g.dataset.author ? `💝 Từ: ${g.dataset.author}` : "👤 Ẩn danh";
      // Set modal preview image based on this leaf's data
      try {
        const modalImg = document.getElementById('modalLeafImage');
        if (modalImg) {
          const paletteIdx = Number(g.dataset.paletteIdx || 0);
          const shapeKey = g.dataset.shapeKey;
          const path = getLeafImagePath(shapeKey, paletteIdx);
          modalImg.src = path || '';
        }
      } catch (e) { /* ignore */ }
      // Configure encourage / owner recover UI
      const encourageSection = document.getElementById('encourageSection');
      const ownerRecoverSection = document.getElementById('ownerRecoverSection');
      const dropLoveBtn = document.getElementById('dropLoveBtn');
      const encourageInput = document.getElementById('encourageInput');
      const ownerRecoverBtn = document.getElementById('ownerRecoverBtn');

      // reset
      if (encourageSection) encourageSection.style.display = 'none';
      if (ownerRecoverSection) ownerRecoverSection.style.display = 'none';

  const currentUser = window._firebase?.auth?.currentUser || window.AuthHelpers?.currentUser || null;
  const loggedIn = !!currentUser;
  const isOwner = loggedIn && g.dataset.authorId && currentUser.uid === g.dataset.authorId;

      // Determine withered status: some older leaves use shapeKey (dry_brown)
      const leafIsWithered = !!g.dataset.isWithered || g.dataset.shapeKey === 'withered';
      // If the viewer is not authenticated, hide all action controls inside the leaf modal
      if (!loggedIn) {
        try { if (encourageSection) encourageSection.style.display = 'none'; } catch(e){}
        try { if (ownerRecoverSection) ownerRecoverSection.style.display = 'none'; } catch(e){}
        try { if (editLeafBtn) editLeafBtn.style.display = 'none'; } catch(e){}
        // rotate button (maybe appended) should also be hidden
        try { const rb = document.getElementById('rotateLeafBtn'); if (rb) rb.style.display = 'none'; } catch(e){}
      } else {
        // authenticated: show/hide based on ownership and leaf state
        if (leafIsWithered) {
          if (!isOwner && encourageSection) encourageSection.style.display = 'flex';
          if (isOwner && ownerRecoverSection) ownerRecoverSection.style.display = 'block';
        }
        // edit/delete visible only to owner
        try { if (editLeafBtn) editLeafBtn.style.display = isOwner ? '' : 'none'; } catch(e){}
        try { const rb = document.getElementById('rotateLeafBtn'); if (rb) rb.style.display = isOwner ? '' : 'none'; } catch(e){}
      }

      if (dropLoveBtn) {
        dropLoveBtn.onclick = async () => {
          // Require authentication to post encouragements
          if (!isAuthenticated()) { promptLoginFlow(); return; }
          const msg = encourageInput ? encourageInput.value.trim() : '';
          if (!msg) { alert('Vui lòng nhập lời động viên.'); return; }
          // Use a temporary small healthy leaf as encouragement near the target
          const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
          const smallPos = { x: Number(pos.x||0) + (Math.random()*30-15), y: Number(pos.y||0) + (Math.random()*30-15), rotation: rand(-20,20) };
          const current = window._firebase?.auth?.currentUser || window.AuthHelpers?.currentUser || null;
          const encourager = current?.displayName || (current?.email ? current.email.split('@')[0] : 'Người lạ');

          const encouragement = {
            id: uuid(),
            text: msg,
            author: encourager,
            authorId: current?.uid || null,
            ts: Date.now(),
            position: smallPos,
            shapeKey: 'normal',
            paletteIdx: 2,
            scale: 0.7,
            rotation: smallPos.rotation
          };

          // Show a transient local visual (floating heart) instead of creating
          // a persistent encouragement leaf overlaying the withered leaf.
          try { showTransientEncouragementVisual(g.dataset.id, { emoji: '💚', duration: 1400 }); } catch(e){}

          // Persist encouragement as a child node under the leaf for traceability
          let _saved = false;
          try {
            if (hasFB()) {
              await fb().db.ref(`encouragements/${g.dataset.id}/${encouragement.id}`).set(encouragement);
              _saved = true;
            }
          } catch (e) { console.error('Failed to save encouragement:', e); }
          // If saving to Firebase failed but the user is authenticated, enqueue locally for later sync
          if (!_saved && loggedIn) {
            try {
              // include leaf id for later flush
              encouragement.leafId = g.dataset.id;
              enqueueEncouragement(encouragement);
              console.info('Encouragement queued locally for sync');
            } catch (qe) { console.error('Failed to queue encouragement locally:', qe); }
          }
          // Always close the modal for the poster (don't keep them stuck if FB is unavailable)
          try { hideModal(modal); } catch(e){}
          // Play watering effect on the target leaf for WATERING_DURATION_MS regardless of save outcome
          try { playWateringEffect(g.dataset.id, WATERING_DURATION_MS); } catch(e){}

          if (encourageInput) encourageInput.value = '';
        };
      }

      // Watering button: allow authenticated users to water a withered leaf using the watering_can visual
      try {
        // let waterLeafBtn = document.getElementById('waterLeafBtn');
        // if (!waterLeafBtn) {
        //   waterLeafBtn = document.createElement('button');
        //   waterLeafBtn.id = 'waterLeafBtn';
        //   waterLeafBtn.className = 'btn cyan';
        //   waterLeafBtn.textContent = '💧 Tưới nước';
        //   // Place near encourageSection if possible, otherwise append to actions container
        //   const targetContainer = encourageSection || document.querySelector('.leaf-actions') || document.querySelector('.sheet');
        //   if (targetContainer) targetContainer.appendChild(waterLeafBtn);
        // }

        // show only to logged-in users and only for withered leaves
        try { waterLeafBtn.style.display = (loggedIn && leafIsWithered) ? '' : 'none'; } catch(e){}

        waterLeafBtn.onclick = async () => {
          if (!isAuthenticated()) { promptLoginFlow(); return; }
          try {
            // Play watering animation (uses assets/leaves/special/watering_can.png)
            playWateringEffect(g.dataset.id, WATERING_DURATION_MS);

            // Update DOM: mark recovered visual (transition to 'leaf_fine')
            try {
              delete g.dataset.isWithered;
              g.classList.remove('withered');
              g.dataset.shapeKey = 'fine';
              const img = g.querySelector('image');
              if (img) {
                img.classList.add('transitioning-special');
                const pal = Number(g.dataset.paletteIdx || 2);
                const specialPath = getLeafImagePath('fine ', pal);
                // Preload image before swapping into the SVG to avoid transient tiny render
                try {
                  const p = new Image();
                  let swapped = false;
                  p.onload = () => {
                    try {
                      if (swapped) return;
                      swapped = true;
                      // Swap the image after preload but do NOT alter width/height/x/y attributes.
                      // Keeping attributes stable avoids reflow/jump issues on hover/unhover.
                      try { img.setAttribute('href', specialPath); } catch(e){ try { img.setAttribute('xlink:href', specialPath); } catch(err){} }
                    } catch(e){ console.warn('Failed to swap watered image after preload', e); }
                    // remove transitioning visual state and reset transforms after a short settle
                    setTimeout(()=>{
                      try { img.classList.remove('transitioning-special'); } catch(e){}
                      // ===== RESET INLINE TRANSFORMS + GROUP TRANSFORM =====
                      try { img.style.transform = ''; img.style.transformOrigin = 'center center'; img.style.transition = ''; } catch(e){}
                      try {
                        const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                        const sc = Number(g.dataset.scale || 1);
                        const rot = Number(g.dataset.rotation || 0);
                        g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
                      } catch(e){}
                      // ===== END RESET =====
                    }, 520);
                  };
                  p.onerror = () => {
                    // Fallback: swap anyway after a short delay. Do not change sizing attributes.
                    setTimeout(()=>{
                      try {
                        if (!swapped) {
                          try { img.setAttribute('href', specialPath); } catch(e){ try { img.setAttribute('xlink:href', specialPath); } catch(err){} }
                          // ensure we clear the transitioning visual state and reset any inline transforms
                          try { img.classList.remove('transitioning-special'); } catch(e){}
                          try { img.style.transform = ''; img.style.transformOrigin = 'center center'; img.style.transition = ''; } catch(e){}
                          try {
                            const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                            const sc = Number(g.dataset.scale || 1);
                            const rot = Number(g.dataset.rotation || 0);
                            g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
                          } catch(e){}
                        }
                      } catch(e){}
                    }, 260);
                  };
                  p.src = specialPath;
                  // safety: also set a timeout to ensure class removal even if load hangs
                  setTimeout(()=>{
                    try {
                      if (!swapped) {
                        try { img.classList.remove('transitioning-special'); } catch(e){}
                        try { img.style.transform = ''; img.style.transformOrigin = 'center center'; img.style.transition = ''; } catch(e){}
                        try {
                          const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                          const sc = Number(g.dataset.scale || 1);
                          const rot = Number(g.dataset.rotation || 0);
                          g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
                        } catch(e){}
                      }
                    } catch(e){}
                  }, 1200);
                  } catch(e){
                    try {
                      // fallback swap: simply set href without mutating sizing attributes
                      try { img.setAttribute('href', specialPath); } catch(err){ try { img.setAttribute('xlink:href', specialPath); } catch(err2){} }
                    } catch(e){}
                    try { img.classList.remove('transitioning-special'); } catch(e){}
                    try { img.style.transform = ''; img.style.transformOrigin = 'center center'; img.style.transition = ''; } catch(e){}
                    try {
                      const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                      const sc = Number(g.dataset.scale || 1);
                      const rot = Number(g.dataset.rotation || 0);
                      g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
                    } catch(e){}
                  }
              }
            } catch(e){ console.warn('Failed to update DOM for watered leaf', e); }

            // Persist the recovered state to backend (patch/update)
            try {
                if (hasFB()) {
                const payload = getLeafDataFromDOM(g.dataset.id);
                // remove isWithered flag
                delete payload.isWithered;
                payload.shapeKey = 'fine';
                // ensure stable percent coords
                try {
                  const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                  const pct = svgToTreePercent(Number(pos.x||0), Number(pos.y||0));
                  payload.percentX = Number(pct.px); payload.percentY = Number(pct.py);
                } catch(e){}
                try {
                  await fb().db.ref(`leaves/${g.dataset.id}`).update(payload);
                  console.info('Persisted watered leaf to Firebase', { id: g.dataset.id, payload });
                } catch (err) {
                  console.warn('Failed to persist watered leaf to Firebase', { id: g.dataset.id, err, payload });
                }
              }
            } catch(e){ console.warn('Failed to persist watered leaf state', e); }

            // Close modal so user returns to tree view
            try { hideModal(modal); } catch(e){}
          } catch(e){ console.warn('waterLeafBtn action failed', e); }
        };
      } catch(e){ /* ignore button creation errors */ }

  // If current user is the owner, fetch and show list of encouragers
  const encouragersList = document.getElementById('encouragersList');
  const encouragersItems = document.getElementById('encouragersItems');
  const wasOrIsWithered = leafIsWithered || g.dataset.shapeKey === 'fine'; // Check cả trạng thái 'fine'
  if (wasOrIsWithered && encouragersList && encouragersItems) {
        encouragersItems.innerHTML = '';
        if (hasFB()) {
          const ref = fb().db.ref(`encouragements/${g.dataset.id}`);
          // load initial snapshot
          ref.once('value').then(snap=>{
            const val = snap.val() || {};
            const arr = Object.values(val).filter(Boolean).sort((a,b)=> (a.ts||0)-(b.ts||0));
            if (arr.length === 0) {
              encouragersList.style.display = 'none';
            } else {
              encouragersList.style.display = 'block';
              arr.forEach(it=>{
                const row = document.createElement('div');
                row.dataset.encId = it.id || '';
                row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems='center'; row.style.gap='8px';
                const left = document.createElement('div');
                left.style.fontSize = '13px'; left.style.color = 'var(--ink)'; left.textContent = `${it.author || 'Người lạ'}: ${it.text}`;
                const when = document.createElement('small');
                when.style.color = 'var(--muted)'; when.style.fontSize = '11px';
                const d = new Date(it.ts || Date.now());
                when.textContent = d.toLocaleString();
                row.appendChild(left); row.appendChild(when);
                encouragersItems.appendChild(row);
              });
            }
          }).catch(e=>{ console.warn('Failed to load encouragers', e); encouragersList.style.display='none'; });

          // attach live child_added listener while owner views modal
          try {
            removeEncouragementListeners();
            currentEncListener = { ref };
            ref.on('child_added', (snap) => {
              const it = snap.val();
              if (!it) return;
              // avoid duplicate entries
              if (encouragersItems.querySelector(`[data-enc-id="${it.id}"]`)) return;
              const row = document.createElement('div');
              row.dataset.encId = it.id || '';
              row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems='center'; row.style.gap='8px';
              const left = document.createElement('div');
              left.style.fontSize = '13px'; left.style.color = 'var(--ink)'; left.textContent = `${it.author || 'Người lạ'}: ${it.text}`;
              const when = document.createElement('small');
              when.style.color = 'var(--muted)'; when.style.fontSize = '11px';
              const d = new Date(it.ts || Date.now());
              when.textContent = d.toLocaleString();
              row.appendChild(left); row.appendChild(when);
              encouragersItems.appendChild(row);
              encouragersList.style.display = 'block';
              // play watering effect for owner when a new encouragement arrives
              // try { 
              //   // playWateringEffect(g.dataset.id, WATERING_DURATION_MS); 
              // } catch(e){}
            });
          } catch(e) { console.warn('Failed to attach encouragers listener', e); }
        } else {
          // No backend: hide list
          encouragersList.style.display = 'none';
        }
      } else if (encouragersList) {
        encouragersList.style.display = 'none';
      }

      if (ownerRecoverBtn) {
        ownerRecoverBtn.onclick = async () => {
          if (!confirm('Bạn xác nhận đã ổn và muốn chuyển lá về trạng thái khỏe mạnh?')) return;
          // Update dataset and DB
          // remove the isWithered dataset key entirely to avoid ambiguous empty-string values
          try { delete g.dataset.isWithered; } catch(e) { g.dataset.isWithered = ''; }
          g.classList.remove('withered');
          const img = g.querySelector('image');
          if (img) {
            img.style.filter = 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))';
            img.style.opacity = '1';
          }
          try {
            if (hasFB()) {
              const payload = getLeafDataFromDOM(g.dataset.id);
              // remove isWithered flag from payload
              delete payload.isWithered;
              // Ensure stable percent coordinates are set so realtime reconciliation
              // reprojects the leaf correctly instead of using raw client pixels.
              try {
                const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                const pct = svgToTreePercent(Number(pos.x||0), Number(pos.y||0));
                payload.percentX = Number(pct.px);
                payload.percentY = Number(pct.py);
              } catch(e) { /* ignore percent calc errors */ }
              await fb().db.ref(`leaves/${g.dataset.id}`).set(payload);
            }
          } catch (e) { console.error('Failed to update leaf state:', e); }

          // Visual celebration: animate the inner image (no group transform to avoid jumping)
          try {
            // Apply a recovered highlight to the inner image
            if (img) {
              img.classList.add('recovered-highlight');
              setTimeout(()=> img.classList.remove('recovered-highlight'), 1400);
            }

            // Transition the leaf to a special 'fine' visual.
            // Update DOM dataset so future renders use the special shape.
            try {
              g.dataset.shapeKey = 'fine';
              // Persist the new shapeKey immediately so other viewers see the leaf as healthy
              try {
                if (hasFB()) {
                  try {
                    // compute stable percent coords
                    let pctX, pctY;
                    try {
                      const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                      const pct = svgToTreePercent(Number(pos.x||0), Number(pos.y||0));
                      pctX = Number(pct.px); pctY = Number(pct.py);
                    } catch(e){ pctX = undefined; pctY = undefined; }

                    // Ensure scale/rotation are preserved from the DOM
                    const newScale = Number(g.dataset.scale || 1);
                    const newRot = Number(g.dataset.rotation || 0);

                    // Use update() to patch only changed fields and remove isWithered by setting null
                    const updateObj = {
                      shapeKey: 'fine',
                      scale: newScale,
                      rotation: newRot,
                      isWithered: null
                    };
                    if (pctX !== undefined && pctY !== undefined) {
                      updateObj.percentX = pctX;
                      updateObj.percentY = pctY;
                    }
                    try {
                      await fb().db.ref(`leaves/${g.dataset.id}`).update(updateObj);
                      console.info('Persisted recovered leaf state to Firebase', { id: g.dataset.id, updateObj });
                    } catch (err) {
                      console.error('Failed to persist recovered leaf state (update):', err, { id: g.dataset.id, updateObj });
                    }
                  } catch(e) { console.error('Failed to persist recovered leaf state:', e); }
                }
              } catch (e) { console.error('Failed to persist recovered leaf state:', e); }
              // swap the inner image src with a smooth crossfade
              if (img) {
                img.classList.add('transitioning-special');
                // pick same palette index or fallback
                const pal = Number(g.dataset.paletteIdx || 2);
                const specialPath = getLeafImagePath('fine', pal);
                // Preload then swap to avoid transient tiny image rendering
                try {
                  const p = new Image();
                  let swapped = false;
                  p.onload = () => {
                    try {
                      if (swapped) return;
                      swapped = true;
                      // Swap the image after preload but DO NOT mutate the image's width/height/x/y.
                      try { img.setAttribute('href', specialPath); } catch(e){ try { img.setAttribute('xlink:href', specialPath); } catch(err){} }
                    } catch(e){ console.warn('Failed to swap recovered image after preload', e); }
                    // remove transition state after a short settle
                    setTimeout(()=>{
                      try { img.classList.remove('transitioning-special'); } catch(e){}
                      try { img.style.transform = ''; img.style.transformOrigin = 'center center'; img.style.transition = ''; } catch(e){}
                      try {
                        const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                        const sc = Number(g.dataset.scale || 1);
                        const rot = Number(g.dataset.rotation || 0);
                        g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
                      } catch(e){}
                    }, 520);
                  };
                  p.onerror = () => {
                    setTimeout(()=>{
                      try {
                        if (!swapped) {
                          try { img.setAttribute('href', specialPath); } catch(e){ try { img.setAttribute('xlink:href', specialPath); } catch(err){} }
                          try { img.classList.remove('transitioning-special'); } catch(e){}
                          try { img.style.transform = ''; img.style.transformOrigin = 'center center'; img.style.transition = ''; } catch(e){}
                          try {
                            const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                            const sc = Number(g.dataset.scale || 1);
                            const rot = Number(g.dataset.rotation || 0);
                            g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
                          } catch(e){}
                        }
                      } catch(e){}
                    }, 260);
                  };
                  p.src = specialPath;
                  setTimeout(()=>{
                    try {
                      if (!swapped) {
                        try { img.classList.remove('transitioning-special'); } catch(e){}
                        try { img.style.transform = ''; img.style.transformOrigin = 'center center'; img.style.transition = ''; } catch(e){}
                        try {
                          const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                          const sc = Number(g.dataset.scale || 1);
                          const rot = Number(g.dataset.rotation || 0);
                          g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
                        } catch(e){}
                      }
                    } catch(e){}
                  }, 1200);
                } catch(e){
                  try {
                    // final fallback: set href without mutating sizing attributes
                    try { img.setAttribute('href', specialPath); } catch(err){ try { img.setAttribute('xlink:href', specialPath); } catch(err2){} }
                  } catch(e){}
                  try { img.classList.remove('transitioning-special'); } catch(e){}
                  try { img.style.transform = ''; img.style.transformOrigin = 'center center'; img.style.transition = ''; } catch(e){}
                  try {
                    const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                    const sc = Number(g.dataset.scale || 1);
                    const rot = Number(g.dataset.rotation || 0);
                    g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
                  } catch(e){}
                }
              }
            } catch(e) { /* ignore shape swap errors */ }

            // Close the modal for the owner so they return to the tree
            try { hideModal(modal); } catch(e){}

            // Defensive UI updates: hide owner controls and normalize action area so the "Tôi ổn rồi" button disappears
            try {
              try { if (ownerRecoverSection) ownerRecoverSection.style.display = 'none'; } catch(e){}
              try { const ownerBtn = document.getElementById('ownerRecoverBtn'); if (ownerBtn) ownerBtn.style.display = 'none'; } catch(e){}
              try { const rb = document.getElementById('rotateLeafBtn'); if (rb) rb.style.display = ''; } catch(e){}
              try { if (editLeafBtn) editLeafBtn.style.display = ''; } catch(e){}

              // Re-run the same normalization logic used when opening the modal
              try {
                const actionsContainer = (modal && modal.querySelector) ? modal.querySelector('.leaf-actions') : document.querySelector('.leaf-actions');
                if (actionsContainer) {
                  const children = Array.from(actionsContainer.children || []);
                  let anyVisible = false;
                  for (const ch of children) {
                    try {
                      const cs = window.getComputedStyle(ch);
                      if (cs && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0) { anyVisible = true; break; }
                    } catch(e){}
                  }
                  actionsContainer.style.display = anyVisible ? 'flex' : 'none';
                  const sheet = modal ? modal.querySelector('.sheet') : document.querySelector('.sheet');
                  if (sheet) { if (!anyVisible) sheet.classList.add('no-actions'); else sheet.classList.remove('no-actions'); }
                }
              } catch(e){}
            } catch(e){}

            // Play the watering + sparkle effects so the leaf visibly becomes healthy
            try { 
              playWateringEffect(g.dataset.id, WATERING_DURATION_MS); 
            } catch(e){}
            try { showLeafSparkles(g.dataset.id, 2200, 14); } catch(e){}
          } catch(e){/* ignore visual errors */}

          if (ownerRecoverSection) ownerRecoverSection.style.display = 'none';
        };
      }
      editLeafBtn.onclick = ()=>{
        if (!isAuthenticated()) { promptLoginFlow(); return; }
        hideModal(modal);
        openAddModal(g.dataset.msg || "", g.dataset.author || "", true, g.dataset.id);
      };
      // Create or attach rotate button in modal if not present
      try {
        let rotateBtn = document.getElementById('rotateLeafBtn');
        if (!rotateBtn) {
          rotateBtn = document.createElement('button');
          rotateBtn.id = 'rotateLeafBtn';
          rotateBtn.className = 'btn info';
          rotateBtn.textContent = 'Xoay lá';
          // append near existing action buttons if available
          const container = document.querySelector('.leaf-actions') || document.querySelector('.action-buttons') || document.querySelector('.header-buttons');
          if (container) container.appendChild(rotateBtn);
          else document.getElementById('modal')?.querySelector('.sheet')?.appendChild(rotateBtn);
        }
        // Ensure rotate button visibility matches auth/ownership and guard clicks
        try {
          const _currentUser = window._firebase?.auth?.currentUser || window.AuthHelpers?.currentUser || null;
          const _loggedIn = !!_currentUser;
          const _isOwner = _loggedIn && g.dataset.authorId && _currentUser.uid === g.dataset.authorId;
          rotateBtn.style.display = _isOwner ? '' : 'none';
        } catch(e){}
        rotateBtn.onclick = (ev)=>{
          ev.preventDefault(); ev.stopPropagation();
          if (!isAuthenticated()) { promptLoginFlow(); return; }
          // only owners may rotate (UI enforces this already); double-check
          const cur = window._firebase?.auth?.currentUser || window.AuthHelpers?.currentUser || null;
          if (!cur || !(cur.uid && g.dataset.authorId && cur.uid === g.dataset.authorId)) { alert('Chỉ chủ lá mới có thể xoay.'); return; }
          enterRotateMode(g);
        };
      } catch(e) { console.warn('Failed to attach rotate button', e); }
      // Normalize leaf-actions layout: if all action controls are hidden, collapse the container
      try {
        const actionsContainer = (modal && modal.querySelector) ? modal.querySelector('.leaf-actions') : document.querySelector('.leaf-actions');
        if (actionsContainer) {
          const children = Array.from(actionsContainer.children || []);
          let anyVisible = false;
          for (const ch of children) {
            try {
              const cs = window.getComputedStyle(ch);
              if (cs && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0) {
                anyVisible = true; break;
              }
            } catch (e) { /* ignore computed style errors */ }
          }
          actionsContainer.style.display = anyVisible ? 'flex' : 'none';

          // Also toggle a helper class on the sheet so CSS can override sticky/footer spacing
          try {
            const sheet = modal ? modal.querySelector('.sheet') : document.querySelector('.sheet');
            if (sheet) {
              if (!anyVisible) sheet.classList.add('no-actions'); else sheet.classList.remove('no-actions');
            }
          } catch(e) { /* ignore sheet adjustments */ }
        }
      } catch (e) { /* ignore layout normalization errors */ }

      // Force-remove any leftover sticky/footer spacing programmatically when
      // there are no visible actions. Some browsers or cached CSS can leave
      // the sheet with negative margins/padding even when children are hidden,
      // so explicitly reset inline styles to guarantee collapse.
      try {
        const sheet = modal ? modal.querySelector('.sheet') : document.querySelector('.sheet');
        if (sheet) {
          if (!sheet.classList.contains('no-actions')) {
            // Nothing to do when actions present
          } else {
            // Reset common sticky/footer adjustments on direct children
            Array.from(sheet.children || []).forEach(ch => {
              try {
                // If child was styled as a sticky footer via inline styles or CSS,
                // clear the most likely properties that create the gap.
                ch.style.position = ch.style.position || 'static';
                ch.style.bottom = '';
                ch.style.left = '';
                ch.style.right = '';
                ch.style.margin = '';
                ch.style.padding = '';
                ch.style.borderTop = '';
              } catch(e){}
            });
            // Also ensure the sheet itself doesn't preserve extra bottom padding
            sheet.style.paddingBottom = '';
            sheet.style.marginBottom = '';
            // Force a reflow so the browser recomputes layout immediately
            void sheet.offsetHeight;
          }
        }
      } catch(e) { /* ignore forced-reset errors */ }

      showModal(modal);
      requestAnimationFrame(()=> editLeafBtn?.focus());
    });

    // Drag & drop (chỉ ở DRAG mode)
    g.classList.add("grab");
    g.addEventListener("pointerdown", (e)=>{
      if (mode !== Mode.DRAG) return;
      dragging = g;
      g.setPointerCapture(e.pointerId);
      g.classList.add("grabbing");
      const p = svgPoint(e);
      const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0,"rotation":0}');
      dragOffset.x = pos.x - p.x;
      dragOffset.y = pos.y - p.y;
      e.stopPropagation();
      // Disable inner-image transitions while dragging to avoid CSS hover/transition flicker
      try {
        const imgEl = g.querySelector('image');
        if (imgEl) {
          imgEl.style.transition = 'none';
          imgEl.style.willChange = 'transform';
        }
      } catch (e) {}
    });

    // Appear animation: chỉ opacity để không đánh nhau với attribute transform
    if (animate){
      g.style.opacity = "0";
      g.offsetHeight;
      requestAnimationFrame(()=>{
        g.style.transition = "opacity .6s ease";
        g.style.opacity = "1";
        setTimeout(()=> g.style.transition = "", 600);
      });
    }

    renderListItem(data);
    updateCounter();
    updateEmptyState();
  }

  // Tạo item trong danh sách
  function renderListItem(data){
    // Hàm này không còn cần thiết vì đã remove leaf list
    // Chỉ giữ lại để tránh lỗi khi được gọi
    return;
  }

  // Xóa thông điệp
  function animateLeafFall(el){
    el.style.transition = "transform 1.2s cubic-bezier(.55,.085,.68,.53), opacity 1.2s";
    el.style.transform  = "translate(0, 120px) rotate(180deg)";
    el.style.opacity    = "0";
    setTimeout(()=> el.remove(), 1200);
  }

  // Xử lý sự kiện kéo thả toàn cục
  svg?.addEventListener("pointermove", (e)=>{
    if (!dragging) return;
    const p = svgPoint(e);
    const x = p.x + dragOffset.x;
    const y = p.y + dragOffset.y;
    const scale = Number(dragging.dataset.scale || 1);
    const rotation = Number(dragging.dataset.rotation || 0);
    dragging.dataset.position = JSON.stringify({ x, y, rotation });
    dragging.setAttribute("transform", `translate(${x} ${y}) rotate(${rotation}) scale(${scale})`);
  });
  function endDrag(e){
    if (!dragging) return;
    const id = dragging.dataset.id;
    // Update normalized percent coords before persisting
    try {
      const pos = JSON.parse(dragging.dataset.position || '{"x":0,"y":0}');
      const pct = svgToTreePercent(pos.x, pos.y);
      dragging.dataset.percentX = String(pct.px);
      dragging.dataset.percentY = String(pct.py);
    } catch (err) {}
    const payload = getLeafDataFromDOM(id);
    // Restore inner-image transition so hover effects return to normal
    try {
      const imgEl = dragging.querySelector('image');
      if (imgEl) imgEl.style.transition = '';
    } catch (err) {}
    dragging.classList.remove("grabbing");
    try { e && dragging.releasePointerCapture(e.pointerId); } catch {}

    // FIX: Ép lại transform cuối cùng cho thẻ <g> SAU KHI xóa class grabbing
  try {
    const finalPos = JSON.parse(dragging.dataset.position || '{"x":0,"y":0,"rotation":0}');
    const finalScale = Number(dragging.dataset.scale || DEFAULT_SCALE); // Dùng DEFAULT_SCALE nếu ko có
    const finalRotation = Number(dragging.dataset.rotation || 0);
    const finalX = Number(finalPos.x || 0);
    const finalY = Number(finalPos.y || 0);
    // Set lại transform cuối cùng
    dragging.setAttribute("transform", `translate(${finalX} ${finalY}) rotate(${finalRotation}) scale(${finalScale})`);
    console.log("Re-applied final transform after drop:", `translate(${finalX} ${finalY}) rotate(${finalRotation}) scale(${finalScale})`); // Log để kiểm tra
  } catch (err) {
      console.error("Error re-applying final transform:", err);
  }
  // ----- HẾT PHẦN SỬA -----

    const elementBeingDragged = dragging;
    dragging = null;
    
    if (hasFB()) {
    fb().db.ref(`leaves/${id}`).set(payload).catch(err => {
        console.error("Firebase set failed after drag:", err);
        // Nếu lỗi, thử enqueue move (nếu cần)
        // enqueuePendingLeafMove({ id: id, updateObj: payload });
    });
  }
  syncLocalStorage();
  }
  svg?.addEventListener("pointerup", endDrag);
  svg?.addEventListener("pointercancel", endDrag);
  svg?.addEventListener("pointerleave", endDrag);

  // Recompute all leaf SVG transforms from stored percent coords (stable across resizes)
  function reprojectAllLeaves(){
    const all = [...(leaves ? leaves.querySelectorAll('.leaf') : [])];
    if (!all.length) return;
    all.forEach(g => {
      try {
        if (g.dataset.percentX !== undefined && g.dataset.percentY !== undefined) {
          const px = Number(g.dataset.percentX);
          const py = Number(g.dataset.percentY);
          const pt = treePercentToSVG(px, py);
          const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
          pos.x = pt.x; pos.y = pt.y;
          g.dataset.position = JSON.stringify(pos);
          const sc = Number(g.dataset.scale || 1);
          const rot = Number(g.dataset.rotation || 0);
          g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
        }
      } catch (e) {
        // ignore
      }
    });
  }

  // Debounced resize handler
  const debouncedReproject = debounce(()=>{
    reprojectAllLeaves();
  }, 120);

  window.addEventListener('resize', debouncedReproject);
  window.addEventListener('orientationchange', debouncedReproject);

  // Chế độ click để đặt lá - chỉ ở PLACE mode
  svg?.addEventListener("click", (e)=>{
    if (mode !== Mode.PLACE) return;
    if (viewOnlyMode && viewOnlyMode.checked) return;
    if (e.target.closest && e.target.closest(".leaf")) return;
    // Require authentication before starting a place/add flow
    if (!isAuthenticated()) { promptLoginFlow(); return; }

    const p = svgPoint(e);
    // Capture both SVG coords and normalized percent relative to the tree
    // so placement remains stable across layout changes and resizes.
    const pct = svgToTreePercent(p.x, p.y);
    pendingPosition = { x: p.x, y: p.y, rotation: 0, percentX: pct.px, percentY: pct.py };
    try { console.debug('place-click', { svgX: p.x, svgY: p.y, percentX: pct.px, percentY: pct.py }); } catch(e){}
    openAddModal("", "", false, null);
  });

  // Kết nối form với sự kiện
  isAnonymous?.addEventListener("change", ()=>{
    if (isAnonymous.checked) {
      addAuthor.value = "";
      addAuthor.disabled = true;
      addAuthor.style.opacity = "0.5";
    } else {
      addAuthor.disabled = false;
      addAuthor.style.opacity = "1";
    }
  });
  // No separate wither type row (options merged into leafShape). Keep preview updated when checkbox toggles.
  [leafShapeSel, leafPaletteSel, leafRotationInp].forEach(el=> el && el.addEventListener("input", renderPreview));

  // Update value displays for scale and rotation
  leafRotationInp?.addEventListener("input", (e) => {
    const rotationValue = document.getElementById('rotationValue');
    if (rotationValue) rotationValue.textContent = e.target.value + '°';
  });

  saveLeaf?.addEventListener("click", ()=>{
    let text = addMessage.value.trim();
    let author = isAnonymous.checked ? "" : addAuthor.value.trim();
    
    // Security: Sanitize inputs
    text = sanitizeLeafMessage ? sanitizeLeafMessage(text) : text.replace(/[<>]/g, '').substring(0, 500);
    author = sanitizeDisplayName ? sanitizeDisplayName(author) : author.replace(/[<>]/g, '').substring(0, 50);
    
    // Rate limiting check
    if (leafMessageLimiter && !leafMessageLimiter.isAllowed('user')) {
      alert('Bạn đang thêm lá quá nhanh! Vui lòng chờ một chút.');
      return;
    }
    
    if (!text){ addMessage?.focus(); addMessage?.select(); return; }

    const shapeKey   = 'normal'; // Ép giá trị vì select bị disable
    
    // Thêm dòng check này để xem có tìm thấy select không (chỉ để debug)
    if (!leafShapeSel) {
        console.warn("Lỗi: Không tìm thấy element #leafShape");
    } else if (leafShapeSel.value !== 'normal') {
        console.warn("Lỗi: Giá trị #leafShape không phải 'normal', là:", leafShapeSel.value);
    }
    const paletteIdx = leafPaletteSel ? Number(leafPaletteSel.value) : 0;
    const scale      = DEFAULT_SCALE; // Scale không còn input, dùng default
    const rotation   = leafRotationInp ? clampRot(leafRotationInp.value) : 0;
    const isWithered = (paletteIdx === 6); // Xác định "héo"

    if (currentEditingId){
        // ========================
        // LOGIC SỬA LÁ (UPDATE)
        // ========================
        const leafEl = leaves.querySelector(`.leaf[data-id="${currentEditingId}"]`);
        if (leafEl) {
          leafEl.dataset.msg = text;
          leafEl.dataset.author = author;
          leafEl.dataset.shapeKey = shapeKey;
          leafEl.dataset.paletteIdx = String(paletteIdx);
          leafEl.dataset.scale = String(scale); // Luôn set scale về default khi sửa? Hoặc giữ scale cũ nếu muốn
          
          const pos = JSON.parse(leafEl.dataset.position || '{"x":0,"y":0,"rotation":0}');
          pos.rotation = rotation; // Cập nhật rotation từ input
          leafEl.dataset.position = JSON.stringify(pos);
          leafEl.dataset.rotation = String(rotation);

          // Cập nhật isWithered dataset dựa trên paletteIdx mới
          if (isWithered) {
              leafEl.dataset.isWithered = '1';
          } else {
              delete leafEl.dataset.isWithered; // Xóa flag nếu không còn héo
          }

          // Repaint hình ảnh và transform
          const leafImagePath = getLeafImagePath(shapeKey, paletteIdx);
          const leafImage = leafEl.querySelector("image");
          if (leafImage) {
            getTrimmedImageDataURL(leafImagePath).then((trimmed) => {
                //leafImage.setAttribute("href", trimmed || leafImagePath);
            }).catch(()=>{ leafImage.setAttribute("href", leafImagePath); });
          }
          leafEl.setAttribute("transform", `translate(${pos.x} ${pos.y}) rotate(${rotation}) scale(${scale})`); // Dùng scale mới
        }
        
        // Tạo payload để gửi lên Firebase
        const dataToUpdate = getLeafDataFromDOM(currentEditingId); // Lấy data hiện tại từ DOM
        // Cập nhật các trường thay đổi
        dataToUpdate.text = text;
        dataToUpdate.author = author;
        dataToUpdate.shapeKey = shapeKey;
        dataToUpdate.paletteIdx = paletteIdx;
        dataToUpdate.scale = scale; // Cập nhật scale
        dataToUpdate.rotation = rotation; // Cập nhật rotation
        dataToUpdate.isWithered = isWithered; // Cập nhật isWithered
        
        // FIX: Thêm wasWithered khi sửa (Rule validate yêu cầu)
        // Giữ nguyên giá trị wasWithered cũ nếu có, nếu không thì set dựa trên isWithered hiện tại
        dataToUpdate.wasWithered = leafEl?.dataset.wasWithered === '1' || isWithered; 

        // Gửi lên Firebase
        if (hasFB()) {
          console.log('--- DATA SENT TO FIREBASE ---:', JSON.stringify(dataToUpdate, null, 2)); 
            fb().db.ref(`leaves/${currentEditingId}`).set(dataToUpdate).catch(console.error);
        }

    } else {
        // ========================
        // LOGIC TẠO LÁ MỚI (ADD NEW)
        // ========================
        const pos = pendingPosition || randomPositionInTree();
        pos.rotation = rotation; // Gán rotation từ input
        
        const currentUser = window._firebase?.auth?.currentUser;
        const authorId = currentUser?.uid || null;
        const finalAuthor = author || (currentUser?.displayName || currentUser?.email?.split('@')[0] || "Ẩn danh");
      
        const data = { 
            id: uuid(), 
            text, 
            author: finalAuthor, 
            authorId: authorId, 
            ts: Date.now(), 
            position: pos, 
            shapeKey, 
            paletteIdx, 
            scale, // Dùng scale default
            rotation, // Dùng rotation từ input
            
            // FIX: Gửi đủ 4 trường này
            isWithered: isWithered,
            wasWithered: isWithered, 
            percentX: (pos && pos.percentX !== undefined) ? Number(pos.percentX) : null,
            percentY: (pos && pos.percentY !== undefined) ? Number(pos.percentY) : null
        };
        
        addLeafFromData(data, true); // Render lá mới lên cây
        
        // Cập nhật lại percentX/Y từ DOM sau khi render (để đảm bảo ổn định)
        try {
            const created = leaves.querySelector(`.leaf[data-id="${data.id}"]`);
            if (created && created.dataset.percentX !== undefined) {
              data.percentX = Number(created.dataset.percentX);
              data.percentY = Number(created.dataset.percentY);
            } else {
              const pct = svgToTreePercent(pos.x, pos.y);
              data.percentX = pct.px; data.percentY = pct.py;
            }
        } catch (e) { /* ignore */ }

        // Gửi lên Firebase
        if (hasFB()) {
          console.log('--- DATA SENT TO FIREBASE ---:', JSON.stringify(data, null, 2)); // Hoặc dataToUpdate nếu là trong if()
            fb().db.ref(`leaves/${data.id}`).set(data).catch(console.error);
        }
    }

    pendingPosition = null;
    currentEditingId = null;
    hideModal(addModal);              // ĐÓNG TRƯỚC
    syncLocalStorage();               // Lưu sau, có lỗi cũng không giữ modal

    // reset form
    addMessage.value = "";
    addAuthor.value = "";
    isAnonymous.checked = false;
    addAuthor.disabled = false;
    addAuthor.style.opacity = "1";
    leafRotationInp.value = "0"; // Reset rotation input
    if (document.getElementById('rotationValue')) {
        document.getElementById('rotationValue').textContent = '0°'; // Reset hiển thị rotation
    }
  });

  closeAddModal?.addEventListener("click", ()=> hideModal(addModal));
  cancelAdd?.addEventListener("click", ()=> hideModal(addModal));
  addModal?.addEventListener("click", (e)=> { if (e.target === addModal) hideModal(addModal); });

  closeModal?.addEventListener("click", ()=> hideModal(modal));
  modal?.addEventListener("click", (e)=> { if (e.target === modal) hideModal(modal); });

  document.addEventListener("keydown", (e)=>{
    if (e.key === "Escape") {
      if (modal?.classList.contains("show")) hideModal(modal);
      if (addModal?.classList.contains("show")) hideModal(addModal);
    }
  });

  // Auto-add was removed: keep openAddModal usage through PLACE mode (click on tree)
  // If you want a programmatic add in future, call openAddModal after setting pendingPosition explicitly.

  // Toggle click/place mode
  if (toggleMode) {
    // khởi tạo trạng thái nút (mặc định tắt)
    toggleMode.querySelector(".btn-icon")?.replaceChildren(document.createTextNode("🖱️"));
    toggleMode.querySelector(".btn-text")?.replaceChildren(document.createTextNode("Click để đặt"));
    // Không add click-mode class - để mặc định tắt
  }

  // Xóa tất cả thông điệp
  clearAll?.addEventListener("click", ()=>{
    if (!confirm("Bạn có chắc muốn xóa tất cả lá không? Hành động này không thể hoàn tác!")) return;
    const allLeaves = [...leaves.querySelectorAll(".leaf")];
    allLeaves.forEach((leaf, i)=> setTimeout(()=> animateLeafFall(leaf), i*80));
    setTimeout(()=>{
      list.innerHTML = '<div class="empty-state" id="emptyState"><div class="empty-icon">🌱</div><p>Chưa có lá nào trên cây</p><small>Hãy thêm lá đầu tiên!</small></div>';
      try { localStorage.removeItem(storeKey); } catch {}
      if (hasFB()) leavesRef().set(null).catch(console.error);
      updateCounter(); updateEmptyState();
    }, allLeaves.length*80 + 500);
  });

  // Khởi tạo ứng dụng

  
  // Realtime attach: chạy ngay nếu có FB, và attach lại nếu module đến sau
  function attachRealtime(){
    if (!hasFB()) return;
    
    // Realtime listeners using child events to avoid downloading the whole tree on every change.
    // This scales: child_added/child_changed/child_removed only deliver the delta for a single leaf.
    const ref = leavesRef();

    // child_added: only add if not present in DOM
    ref.on('child_added', (snap) => {
      try {
        const d = snap.val();
        if (!d || !d.id) return;
        if (leaves.querySelector(`.leaf[data-id="${d.id}"]`)) return;
        addLeafFromData(d, true);
        updateCounter(); updateEmptyState();
        syncLocalStorage();
      } catch (e) { console.error('child_added handler error:', e); }
    });

    // child_changed: update only the affected leaf element
    ref.on('child_changed', (snap) => {
      try {
        const payload = snap.val();
        if (!payload || !payload.id) return;
        const g = leaves.querySelector(`.leaf[data-id="${payload.id}"]`);
        if (!g) return; // not rendered yet on this client

        // If user is actively dragging this element, skip updating it to avoid jump.
        if (g.classList.contains('grabbing')) return;

        // Update dataset values
        try {
          g.dataset.msg = payload.text || g.dataset.msg || "";
          g.dataset.author = payload.author || g.dataset.author || "";
          g.dataset.authorId = payload.authorId || g.dataset.authorId || "";
          g.dataset.position = JSON.stringify(payload.position || JSON.parse(g.dataset.position || '{"x":0,"y":0}'));
          g.dataset.rotation = String(clampRot(Number.isFinite(payload.rotation) ? payload.rotation : Number(g.dataset.rotation || 0)));
          g.dataset.scale = String(clampScale(Number.isFinite(payload.scale) ? payload.scale : Number(g.dataset.scale || 1)));
          g.dataset.shapeKey = payload.shapeKey || g.dataset.shapeKey || "normal";
          g.dataset.paletteIdx = String(payload.paletteIdx || g.dataset.paletteIdx || 0);
          if (payload.isWithered) g.dataset.isWithered = '1'; else delete g.dataset.isWithered;
        } catch (e) { console.warn('Failed to update datasets for changed leaf', payload.id, e); }

        // Recompute transform from payload position (prefer percent coords if provided)
        try {
          let tx = 0, ty = 0;
          if (payload.percentX !== undefined && payload.percentY !== undefined) {
            const pt = treePercentToSVG(Number(payload.percentX), Number(payload.percentY));
            tx = Number(pt.x); ty = Number(pt.y);
          } else if (payload.position && typeof payload.position === 'object') {
            tx = Number(payload.position.x || 0); ty = Number(payload.position.y || 0);
          } else {
            const prev = JSON.parse(g.dataset.position || '{"x":0,"y":0}'); tx = Number(prev.x||0); ty = Number(prev.y||0);
          }
          const sc = clampScale(Number(g.dataset.scale || 1));
          const rot = clampRot(Number(g.dataset.rotation || 0));
          g.setAttribute('transform', `translate(${tx} ${ty}) rotate(${rot}) scale(${sc})`);
        } catch(e) { console.warn('Failed to set transform for changed leaf', payload.id, e); }

        // If shapeKey/palette changed, attempt to swap inner image href safely
        try {
          const img = g.querySelector('image');
          if (img) {
            const newPath = getLeafImagePath(g.dataset.shapeKey, Number(g.dataset.paletteIdx || 0));
            if (newPath) {
              const p = new Image();
              let swapped = false;
              p.onload = () => { try { if (!swapped) { swapped = true; img.setAttribute('href', newPath); } } catch(e){} };
              p.onerror = () => {};
              p.src = newPath;
            }
          }
        } catch(e) { /* non-fatal */ }

        syncLocalStorage();
      } catch (e) { console.error('child_changed handler error:', e); }
    });

    // child_removed: remove the DOM element and animate fall
    ref.on('child_removed', (snap) => {
      try {
        const payload = snap.val();
        if (!payload || !payload.id) return;
        const g = leaves.querySelector(`.leaf[data-id="${payload.id}"]`);
        if (!g) return;
        try { animateLeafFall(g); } catch(e){ try { if (g.parentNode) g.parentNode.removeChild(g); } catch(e){} }
        // cleanup localStorage backup if present
        try {
          const raw = localStorage.getItem(storeKey);
          if (raw) {
            const arr = JSON.parse(raw || '[]');
            const filtered = (arr || []).filter(item => !(item && item.id === payload.id));
            localStorage.setItem(storeKey, JSON.stringify(filtered));
          }
        } catch(e){}
        updateCounter(); updateEmptyState();
      } catch (e) { console.error('child_removed handler error:', e); }
    });
  }

  // Theme initialization is handled in index.html
  optimizeListScroll();
  setupCanvas(); // Setup canvas for leaf rendering
  
  // khởi tạo mode
  setMode(Mode.VIEW);

  // Normalize any locally-stored leaf positions from client/screen coords to SVG coords
  (function normalizeLocalPositions(){
    try {
      const raw = localStorage.getItem(storeKey);
      if (!raw) return;
      const arr = JSON.parse(raw || "[]");
      if (!Array.isArray(arr) || arr.length === 0) return;
      let changed = false;
      arr.forEach(item => {
        if (!item || !item.position) return;
        const x = Number(item.position.x);
        const y = Number(item.position.y);
        // If these look like client coords, convert and mark changed
        if (Number.isFinite(x) && Number.isFinite(y) && (x > window.innerWidth || y > window.innerHeight || x < -200 || y < -200)) {
          const conv = screenToSVG(x,y);
          item.position.x = conv.x; item.position.y = conv.y;
          changed = true;
        }
      });
      if (changed) {
        try { localStorage.setItem(storeKey, JSON.stringify(arr)); } catch(e){}
      }
    } catch(e){ /* ignore */ }
  })();
  
  // Listen for firebase-ready event first
  window.addEventListener("firebase-ready", ()=>{
    if (hasFB()) {
      attachRealtime();
      try { setupEncouragementsCountListener(); } catch(e){ console.error("Error calling setupEncouragementsCountListener after firebase-ready:", e); }
      try { flushEncouragementQueue(); } catch(e){}
      try { flushPendingLeafMoves(); } catch(e){}
    }
  });
  
  // Always try Firebase first - no localStorage fallback
  if (hasFB()) {
    attachRealtime();
  }

  // --- Encouragement local queue (fallback when Firebase is unavailable) ---
  const ENCOURAGE_QUEUE_KEY = 'encourage_queue_v1';

  function enqueueEncouragement(enc) {
    try {
      const raw = localStorage.getItem(ENCOURAGE_QUEUE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(enc);
      localStorage.setItem(ENCOURAGE_QUEUE_KEY, JSON.stringify(arr));
      try { updateHealedCounterFromQueue(); } catch(e){}
    } catch (e) { console.error('enqueueEncouragement error', e); }
  }

  async function flushEncouragementQueue() {
    if (!hasFB()) return;
    try {
      const raw = localStorage.getItem(ENCOURAGE_QUEUE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr) || arr.length === 0) return;
      // iterate over a shallow copy since we'll modify arr
      for (const item of arr.slice()) {
        try {
          // each queued item should include leafId and id
          const leafId = item.leafId || item.targetLeafId || '';
          if (!leafId) {
            // skip malformed entry
            const idx = arr.findIndex(x=>x.id === item.id);
            if (idx !== -1) arr.splice(idx,1);
            continue;
          }
          await fb().db.ref(`encouragements/${leafId}/${item.id}`).set(item);
          const idx = arr.findIndex(x=>x.id === item.id);
          if (idx !== -1) arr.splice(idx,1);
          // small pause so we don't hammer the DB
          await new Promise(r => setTimeout(r, 120));
        } catch (err) {
          console.warn('Failed to flush queued encouragement', item && item.id, err);
        }
      }
      if (arr.length) localStorage.setItem(ENCOURAGE_QUEUE_KEY, JSON.stringify(arr)); else localStorage.removeItem(ENCOURAGE_QUEUE_KEY);
    } catch (e) { console.error('flushEncouragementQueue error', e); }
  }

  // Try flush on interval when FB is available
  setInterval(()=>{ try { flushEncouragementQueue(); } catch(e){} }, 30000);

  // Pending leaf move queue (retry when offline or auth unavailable)
  const PENDING_LEAF_MOVES_KEY = 'pending_leaf_moves_v1';

  function enqueuePendingLeafMove(item){
    try {
      const raw = localStorage.getItem(PENDING_LEAF_MOVES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(item);
      localStorage.setItem(PENDING_LEAF_MOVES_KEY, JSON.stringify(arr));
    } catch (e) { console.error('enqueuePendingLeafMove error', e); }
  }

  async function flushPendingLeafMoves(){
    if (!hasFB()) return;
    try {
      const raw = localStorage.getItem(PENDING_LEAF_MOVES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr) || arr.length === 0) return;
      for (const item of arr.slice()) {
        try {
          if (!item || !item.id || !item.updateObj) {
            const idx = arr.findIndex(x=>x === item);
            if (idx !== -1) arr.splice(idx,1);
            continue;
          }
          await fb().db.ref(`leaves/${item.id}`).update(item.updateObj);
          const idx = arr.findIndex(x=>x === item);
          if (idx !== -1) arr.splice(idx,1);
          await new Promise(r=>setTimeout(r,120));
        } catch (err) {
          console.warn('Failed to flush pending leaf move for', item && item.id, err);
        }
      }
      if (arr.length) localStorage.setItem(PENDING_LEAF_MOVES_KEY, JSON.stringify(arr)); else localStorage.removeItem(PENDING_LEAF_MOVES_KEY);
    } catch (e) { console.error('flushPendingLeafMoves error', e); }
  }

  // Try to flush pending moves on interval
  setInterval(()=>{ try { flushPendingLeafMoves(); } catch(e){} }, 25000);

  // ------------------ Healed / Encouragements counter ------------------
  function updateHealedCounterUI(n){
  try {
    // THÊM LOG
    console.log(`[DEBUG HEALED COUNT] updateHealedCounterUI called with n = ${n}`);
    const el = document.getElementById('healedCounter');
    if (!el) {
        console.error("[DEBUG HEALED COUNT] Element #healedCounter not found!");
        return;
    }
    el.textContent = String(Number(n) || 0);
  } catch(e){ console.error("[DEBUG HEALED COUNT] Error updating UI:", e); }
}

  function countUniqueLeafEncouragements(snapshotVal){
  try {
    if (!snapshotVal) return 0;
    // snapshotVal is { leafId: {encId: {...}, ...}, ... }
    // Đếm số leafId có chứa ít nhất một encouragement
    return Object.keys(snapshotVal).filter(leafId => {
      try {
        const leafEncouragements = snapshotVal[leafId];
        // Chỉ đếm nếu leafId có object chứa ít nhất một key (encId)
        return leafEncouragements && typeof leafEncouragements === 'object' && Object.keys(leafEncouragements).length > 0;
      } catch(e){ return false; }
    }).length; // Trả về số lượng leafId hợp lệ
  } catch(e){
    console.error("Error counting unique leaf encouragements:", e);
    return 0; // Trả về 0 nếu có lỗi
  }
}

  function updateHealedCounterFromQueue(){
    try {
      // Count unique leafIds in the local queue as a fallback
      const raw = localStorage.getItem(ENCOURAGE_QUEUE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const set = new Set();
      for (const it of (arr||[])) if (it && (it.leafId || it.targetLeafId)) set.add(it.leafId || it.targetLeafId);
      updateHealedCounterUI(set.size);
    } catch(e){ updateHealedCounterUI(0); }
  }

  function setupEncouragementsCountListener(){
  try {
    if (hasFB()){
      try {
        const ref = fb().db.ref('encouragements');
        // Dùng Set để lưu các leafId đã được chữa lành (có ít nhất 1 encouragement)
        const healedLeafIds = new Set();

        // Hàm cập nhật UI từ Set
        const updateUIFromSet = () => {
          const count = healedLeafIds.size;
          console.log(`[DEBUG HEALED COUNT] Updating UI from Set. Count = ${count}`);
          updateHealedCounterUI(count);
        };

        // 1. Lấy trạng thái ban đầu
        ref.once('value', initialSnap => {
          try {
            const initialVal = initialSnap.val() || {};
            // Xóa Set cũ và thêm các leafId hợp lệ ban đầu
            healedLeafIds.clear();
            Object.keys(initialVal).forEach(leafId => {
              const encouragements = initialVal[leafId];
              if (encouragements && typeof encouragements === 'object' && Object.keys(encouragements).length > 0) {
                healedLeafIds.add(leafId);
              }
            });
            console.log("[DEBUG HEALED COUNT] Initial load complete. Healed leaves:", Array.from(healedLeafIds));
            updateUIFromSet(); // Cập nhật UI lần đầu

            // 2. Lắng nghe lá MỚI được chữa lành
            ref.on('child_added', addedSnap => {
              try {
                const leafId = addedSnap.key;
                const encouragements = addedSnap.val();
                // Chỉ thêm vào Set nếu nó thực sự có encouragement và chưa có trong Set
                if (leafId && encouragements && typeof encouragements === 'object' && Object.keys(encouragements).length > 0 && !healedLeafIds.has(leafId)) {
                  console.log(`[DEBUG HEALED COUNT] child_added: New healed leaf ${leafId}`);
                  healedLeafIds.add(leafId);
                  updateUIFromSet(); // Cập nhật UI
                }
              } catch(e) { console.error("[DEBUG HEALED COUNT] Error in child_added:", e); }
            });

            // 3. Lắng nghe lá bị XÓA khỏi /encouragements (không còn lời động viên nào)
            ref.on('child_removed', removedSnap => {
              try {
                const leafId = removedSnap.key;
                if (leafId && healedLeafIds.has(leafId)) {
                  console.log(`[DEBUG HEALED COUNT] child_removed: Leaf ${leafId} no longer has encouragements.`);
                  healedLeafIds.delete(leafId);
                  updateUIFromSet(); // Cập nhật UI
                }
              } catch(e) { console.error("[DEBUG HEALED COUNT] Error in child_removed:", e); }
            });

            // 4. Lắng nghe THAY ĐỔI bên trong một lá (quan trọng để bắt trường hợp lời động viên cuối cùng bị xóa)
             ref.on('child_changed', changedSnap => {
                try {
                    const leafId = changedSnap.key;
                    const encouragements = changedSnap.val();
                    const hadEncouragement = healedLeafIds.has(leafId);
                    const hasEncouragementNow = encouragements && typeof encouragements === 'object' && Object.keys(encouragements).length > 0;

                    if (hadEncouragement && !hasEncouragementNow) {
                        // Lá này vừa bị xóa hết lời động viên
                        console.log(`[DEBUG HEALED COUNT] child_changed: Leaf ${leafId} lost its last encouragement.`);
                        healedLeafIds.delete(leafId);
                        updateUIFromSet();
                    } else if (!hadEncouragement && hasEncouragementNow) {
                        // Lá này vừa nhận lời động viên đầu tiên (dù hiếm khi xảy ra qua child_changed)
                        console.log(`[DEBUG HEALED COUNT] child_changed: Leaf ${leafId} received its first encouragement.`);
                        healedLeafIds.add(leafId);
                        updateUIFromSet();
                    }
                    // Không làm gì nếu số lượng > 0 thay đổi thành > 0
                } catch(e) { console.error("[DEBUG HEALED COUNT] Error in child_changed:", e); }
             });

          } catch(e){
             console.error("[DEBUG HEALED COUNT] Error processing initial snapshot:", e);
             updateHealedCounterUI(0);
          }
        }).catch(initialErr => { // Thêm catch cho once()
            console.error("[DEBUG HEALED COUNT] Error fetching initial data:", initialErr);
            updateHealedCounterUI(0);
        });

        return; // Đã setup listener Firebase
      } catch(e){
          console.error("[DEBUG HEALED COUNT] Error setting up Firebase listeners, falling back to local queue.", e);
          /* fall through to local fallback */
      }
    }

    // Fallback (giữ nguyên)
    console.log("Firebase not available, using local queue for healed counter.");
    updateHealedCounterFromQueue();
    setInterval(()=>{ try { updateHealedCounterFromQueue(); } catch(e){} }, 15000);

  } catch(e){ console.error("Error in setupEncouragementsCountListener:", e); }
}

  // Initialize healed counter listener now (will use FB if available)
  // try { setupEncouragementsCountListener(); } catch(e){}
})();

// ===== STARS ANIMATION =====
// Remove debug logs and simplify