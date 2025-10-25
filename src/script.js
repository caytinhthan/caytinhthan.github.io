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
  const editLeafBtn = $("#editLeaf"), deleteLeafBtn = $("#deleteLeaf");
  const addModal = $("#addModal"), addModalTitle = $("#addModalTitle"), addMessage = $("#addMessage");
  const addAuthor = $("#addAuthor"), isAnonymous = $("#isAnonymous"), saveLeaf = $("#saveLeaf");
  const isWitheredInp = $("#isWithered");
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

  // --- Withered option merging helper ---
  // We will append withered-specific options into the main shape select when
  // the user checks "Đăng lá héo" so the withered posting UI is unified with
  // the main picker. We keep the option values stable (e.g. 'dry_brown') so
  // existing storage logic continues to work.
  const witheredOptions = [
    { value: 'dry_brown', label: 'DẠNG 8' },
    { value: 'transition_yellow', label: 'DẠNG 9' }
  ];

  function addWitheredOptions() {
    if (!leafShapeSel) return;
    // don't duplicate if already present
    for (const opt of witheredOptions) {
      if (![...leafShapeSel.options].some(o => o.value === opt.value)) {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        leafShapeSel.appendChild(el);
      }
    }
  }

  function removeWitheredOptions() {
    if (!leafShapeSel) return;
    for (const opt of witheredOptions) {
      const existing = [...leafShapeSel.options].find(o => o.value === opt.value);
      if (existing) existing.remove();
    }
  }

  // When the user toggles 'Đăng lá héo' we append/remove the withered options
  isWitheredInp?.addEventListener('change', ()=>{
    const checked = !!isWitheredInp.checked;
    if (checked) addWitheredOptions(); else removeWitheredOptions();
    try { renderPreview(); } catch(e){}
  });

  // Hide/disable palette selector for shapes that don't support color (special withered types)
  const shapesWithoutPalette = new Set(['dry_brown', 'transition_yellow']);
  function updatePaletteUI(){
    try {
      if (!leafShapeSel || !leafPaletteSel) return;
      const selRow = leafPaletteSel.closest('.picker-row');
      const shape = (leafShapeSel.value || '').toString();
      if (shapesWithoutPalette.has(shape)){
        // hide and disable palette control
        leafPaletteSel.disabled = true;
        if (selRow) selRow.style.display = 'none';
      } else {
        leafPaletteSel.disabled = false;
        if (selRow) selRow.style.display = '';
      }
    } catch (e) { /* ignore UI errors */ }
  }

  // Update palette UI when shape changes
  leafShapeSel?.addEventListener('input', ()=>{ updatePaletteUI(); try{ renderPreview(); }catch(e){} });
  // Run once during init
  updatePaletteUI();

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

  // Chuyển đổi theme sáng/tối
  function setTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch {}
    // Icon update is handled in index.html
  }
  // Theme toggle handler is in index.html to avoid conflicts

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

      // create bucket element (tilting pouring can)
      const bucket = document.createElement('div');
      bucket.className = 'bucket-effect';
      bucket.textContent = '🪣';
      document.body.appendChild(bucket);

      const bw = 44;
      // position it above-left so tilt looks natural
      bucket.style.left = (centerX - bw - 12) + 'px';
      bucket.style.top = (topY - 90) + 'px';

      // helper to create a water drop that falls toward the leaf center
      const createDrop = (delay, idx) => {
        const drop = document.createElement('div');
        drop.className = 'water-drop';
        // start near bucket mouth with slight random offset
        const startX = centerX - bw/2 + rand(-8, 8);
        const startY = topY - 40 + rand(-6, 6);
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
          const impactY = rect.top + rect.height*0.45 + rand(-6,6);
          const impactX = centerX + rand(-12,12);
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
        // Increase density: one drop roughly every 300-400ms for a heavy pour
        const totalDrops = Math.max(12, Math.floor(durationMs / 350));
        for (let i=0;i<totalDrops;i++){
          const dly = 200 + i * (durationMs / totalDrops) + rand(-150, 150);
          createDrop(Math.max(40, Math.floor(dly)), i);
        }

        // a longer faint pool splash under the leaf to emphasize watering
        const pool = document.createElement('div');
        pool.className = 'water-pool';
        pool.style.left = (centerX - 28) + 'px';
        pool.style.top = (rect.top + rect.height*0.6) + 'px';
        document.body.appendChild(pool);
        requestAnimationFrame(()=> pool.classList.add('show'));

        // cleanup after durationMs
        setTimeout(()=>{
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

  // Hình ảnh lá cây thật từ assets/leaves/
  function getLeafImagePath(shapeKey, paletteIdx) {
    // Shape mapping to folder names
    const shapes = ['oval', 'round', 'pointed', 'heart', 'star', 'maple', 'willow'];
    
    // Color mapping from palette index
    const colors = ['yellow', 'pink', 'green', 'blue', 'purple', 'red'];
    
    // Special leaves
    if (shapeKey === 'dry_brown') {
      return 'assets/leaves/special/SPECIAL_leaf_dry.png';
    }
    if (shapeKey === 'transition_yellow') {
      return 'assets/leaves/special/SPECIAL_leaf_transition.png';
    }
    
    // Default shape if not provided or invalid
    let shape = shapes.includes(shapeKey) ? shapeKey : 'oval';
    
    // Default color based on palette index
    let color = colors[paletteIdx] || 'green';
    
    return `assets/leaves/${shape}/leaf_${shape}_${color}.png`;
  }

  // Cache for trimmed image data URLs to avoid repeated canvas work
  const trimmedImageCache = new Map();

  // Load an image, trim fully-transparent borders, and return a dataURL for the cropped image.
  // Uses a small 2px padding so leaves don't get clipped too tightly.
  async function getTrimmedImageDataURL(src) {
    if (!src) return src;
    if (trimmedImageCache.has(src)) return trimmedImageCache.get(src);

    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      });

      // create an offscreen canvas
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.clearRect(0,0,w,h);
      cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0,0,w,h).data;

      // find bounding box of non-transparent pixels
      let minX = w, minY = h, maxX = 0, maxY = 0;
      let found = false;
      for (let y = 0; y < h; y++){
        for (let x = 0; x < w; x++){
          const idx = (y*w + x) * 4 + 3; // alpha channel
          const a = data[idx];
          if (a > 8) { // threshold to ignore near-transparent pixels
            found = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }

        // Create a short-lived sparkle effect around a leaf's screen position.
        // duration in ms, count is number of sparkles
        function showLeafSparkles(leafId, duration = 2000, count = 12) {
          try {
            const g = leaves.querySelector(`.leaf[data-id="${leafId}"]`);
            if (!g) return;
            const rect = g.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const created = [];
            for (let i = 0; i < count; i++) {
              const s = document.createElement('div');
              s.className = 'leaf-sparkle';
              // random offset start near center
              const sx = centerX + rand(-12, 12);
              const sy = centerY + rand(-10, 6);
              s.style.left = sx + 'px';
              s.style.top = sy + 'px';
              // random color/goldish tint or light blue
              const hues = ['#fff9c4', '#fff2b8', '#ffd9a8', '#e8f8ff'];
              s.style.background = hues[Math.floor(Math.random() * hues.length)];
              s.style.opacity = '0';
              s.style.transform = `translate(-50%, -50%) scale(0.6) rotate(${rand(-40,40)}deg)`;
              document.body.appendChild(s);
              created.push(s);

              // animate to a random outward position
              const dx = rand(-48, 48);
              const dy = rand(-68, -18);
              const delay = rand(0, 160);
              setTimeout(() => {
                s.classList.add('show');
                s.style.transform = `translate(${dx}px, ${dy}px) scale(${rand(0.7,1.2)}) rotate(${rand(-40,40)}deg)`;
                s.style.opacity = '1';
              }, delay);

              // fade out
              setTimeout(() => {
                try { s.style.opacity = '0'; } catch(e){}
              }, duration - 300 + rand(-80, 80));

              // cleanup
              setTimeout(() => { try { s.remove(); } catch(e){} }, duration + 220 + i * 8);
            }
          } catch (e) { console.warn('showLeafSparkles failed', e); }
        }
      }

      if (!found) {
        // fallback: cache original src and return it
        trimmedImageCache.set(src, src);
        return src;
      }

      // add small padding but clamp to image bounds
      const pad = 2;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad);
      maxY = Math.min(h - 1, maxY + pad);
      const tw = maxX - minX + 1;
      const th = maxY - minY + 1;

      const tc = document.createElement('canvas');
      tc.width = tw; tc.height = th;
      const tcx = tc.getContext('2d');
      tcx.clearRect(0,0,tw,th);
      tcx.drawImage(c, minX, minY, tw, th, 0, 0, tw, th);

      const dataUrl = tc.toDataURL('image/png');
      trimmedImageCache.set(src, dataUrl);
      return dataUrl;
    } catch (e) {
      // on error return original src
      try { trimmedImageCache.set(src, src); } catch {}
      return src;
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
  
  function pickLeafShape(key){
    // New shape system with actual leaf shapes
    const validShapes = ['oval', 'round', 'pointed', 'heart', 'star', 'maple', 'willow'];
    
    // Legacy compatibility mapping
    const legacyMap = {
      'money_gold': 'oval',
      'love_pink': 'heart', 
      'study_green': 'pointed',
      'work_blue': 'round',
      'relation_purple': 'star',
      'other_red': 'maple',
      'transition_yellow': 'transition_yellow', // Special
      'dry_brown': 'dry_brown' // Special
    };
    
    // Use legacy mapping if old key, otherwise use key directly
    const shapeKey = legacyMap[key] || (validShapes.includes(key) ? key : 'oval');
    
    return { key: shapeKey, d: '' }; // d not needed anymore for images
  }
  function getVeinForShape(d){
    // Oak với gân phức tạp
    if (d.includes("C4,-16") || d.includes("8,8")) {
      return "M0,-14 C0,-7 0,0 0,14 M0,-5 L-3,-2 M0,-5 L3,-2 M0,3 L-2,6 M0,3 L2,6";
    }
    // Maple với gân tỏa ra
    if (d.includes("C4,-18") || d.includes("10,0")) {
      return "M0,-16 L0,16 M0,-8 L-6,-2 M0,-8 L6,-2 M0,0 L-8,6 M0,0 L8,6 M0,8 L-4,14 M0,8 L4,14";
    }
    // Heart với gân cong
    if (d.includes("C-6,-20")) {
      return "M0,-12 C0,-6 0,0 0,14 M0,-4 C-3,-2 -6,2 -4,6 M0,-4 C3,-2 6,2 4,6";
    }
    // Willow với gân thẳng đơn giản
    if (d.includes("C2,-18")) {
      return "M0,-16 C0,-8 0,0 0,16";
    }
    // Ginkgo với gân quạt
    if (d.includes("C8,-16")) {
      return "M0,-12 L0,12 M0,0 L-8,8 M0,0 L-4,12 M0,0 L4,12 M0,0 L8,8";
    }
    // Round với gân đơn giản
    if (d.includes("C6,-15")) {
      return "M0,-12 C0,-6 0,0 0,12";
    }
    // Bamboo với gân thẳng và nút
    if (d.includes("C1,-19")) {
      return "M0,-16 L0,16 M-2,-8 L2,-8 M-2,0 L2,0 M-2,8 L2,8";
    }
    // Fern với gân lông chim
    if (d.includes("C2,-16")) {
      return "M0,-14 L0,12 M0,-10 L-3,-8 M0,-6 L-4,-4 M0,-2 L-3,0 M0,2 L-4,4 M0,6 L-3,8 M0,-10 L3,-8 M0,-6 L4,-4 M0,-2 L3,0 M0,2 L4,4 M0,6 L3,8";
    }
    // Default oval
    return "M0,-14 C0,-7 0,0 0,14 M0,-4 L-4,-1 M0,-4 L4,-1";
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
      shapeKey: leaf?.dataset.shapeKey || "money_gold",
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
    // Update image preview in modal
    const previewImg = document.getElementById('previewLeafImage');
    const scaleValue = document.getElementById('scaleValue');
    const rotationValue = document.getElementById('rotationValue');
    
    if (previewImg && leafShapeSel?.value) {
      const paletteIdx = Number(leafPaletteSel?.value) || 0;
  // shapeKey is directly read from the merged leafShape select
  const shapeKey = leafShapeSel.value;
      const imagePath = getLeafImagePath(shapeKey, paletteIdx);
      // leafScale input removed from markup; use DEFAULT_SCALE when missing
      const scale = clampScale(leafScaleInp?.value || DEFAULT_SCALE);
      const rotation = clampRot(leafRotationInp?.value || 0);
      
      if (imagePath) {
        // use trimmed variant when available to remove transparent padding
        const wrap = document.querySelector('.preview-image-wrap');
        getTrimmedImageDataURL(imagePath).then((trimmed) => {
          previewImg.src = trimmed || imagePath;
          previewImg.style.display = 'block';
          previewImg.style.position = 'absolute';
          previewImg.style.left = '50%';
          previewImg.style.top = '50%';
          // keep image centered via translate; apply rotate/scale to wrapper for more robust behavior
          // Keep image centered via translate; compute a safe scale so the
          // transformed image fits within the preview wrapper and is not too large.
          try {
            // First reset any previous transforms so we can measure the raw rendered size
            previewImg.style.setProperty('transform', 'translate(-50%, -50%) scale(1)', 'important');
          } catch(e){ previewImg.style.transform = 'translate(-50%, -50%) scale(1)'; }
          // Force reflow/measuring
          previewImg.offsetWidth;
          const wrapRect = wrap ? wrap.getBoundingClientRect() : { width: 160, height: 160 };
          const imgRect = previewImg.getBoundingClientRect();
          // Compute maximum scale that keeps the image inside the wrapper (92% to allow padding)
          const maxScaleW = imgRect.width > 0 ? (wrapRect.width * 0.92) / imgRect.width : scale;
          const maxScaleH = imgRect.height > 0 ? (wrapRect.height * 0.92) / imgRect.height : scale;
          const maxAllowed = Math.max(MIN_SCALE, Math.min(maxScaleW, maxScaleH, MAX_SCALE));
          const finalScale = Math.max(MIN_SCALE, Math.min(scale, maxAllowed));
          const t = `translate(-50%, -50%) rotate(${rotation}deg) scale(${finalScale})`;
          try {
            previewImg.style.setProperty('transform', t, 'important');
          } catch (e) {
            previewImg.style.transform = t;
          }
          previewImg.style.transformOrigin = 'center center';
          // Clear wrapper transforms (we do transforms on the image)
          if (wrap) {
            try { wrap.style.setProperty('transform', '', 'important'); } catch(e){ wrap.style.transform = ''; }
            wrap.style.transformOrigin = 'center center';
          }
        }).catch(()=>{
          previewImg.src = imagePath;
          previewImg.style.display = 'block';
          previewImg.style.position = 'absolute';
          previewImg.style.left = '50%';
          previewImg.style.top = '50%';
          // Apply transform directly to the image even when trimmed image fallback used
          try {
            previewImg.style.setProperty('transform', 'translate(-50%, -50%) scale(1)', 'important');
          } catch(e){ previewImg.style.transform = 'translate(-50%, -50%) scale(1)'; }
          previewImg.offsetWidth;
          const wrapRect2 = wrap ? wrap.getBoundingClientRect() : { width: 160, height: 160 };
          const imgRect2 = previewImg.getBoundingClientRect();
          const maxScaleW2 = imgRect2.width > 0 ? (wrapRect2.width * 0.92) / imgRect2.width : scale;
          const maxScaleH2 = imgRect2.height > 0 ? (wrapRect2.height * 0.92) / imgRect2.height : scale;
          const maxAllowed2 = Math.max(MIN_SCALE, Math.min(maxScaleW2, maxScaleH2, MAX_SCALE));
          const finalScale2 = Math.max(MIN_SCALE, Math.min(scale, maxAllowed2));
          const t2 = `translate(-50%, -50%) rotate(${rotation}deg) scale(${finalScale2})`;
          try {
            previewImg.style.setProperty('transform', t2, 'important');
          } catch (e) {
            previewImg.style.transform = t2;
          }
          previewImg.style.transformOrigin = 'center center';
          const wrap = document.querySelector('.preview-image-wrap');
          if (wrap) {
            try { wrap.style.setProperty('transform', '', 'important'); } catch(e){ wrap.style.transform = ''; }
            wrap.style.transformOrigin = 'center center';
          }
        });
      } else {
        previewImg.style.display = 'none';
        const wrap = document.querySelector('.preview-image-wrap');
        if (wrap) {
          try { wrap.style.setProperty('transform', '', 'important'); } catch(e){ wrap.style.transform = ''; }
        }
        // Also ensure any inline transform on the preview image is cleared
        try { previewImg.style.setProperty('transform', '', 'important'); } catch(e){ previewImg.style.transform = ''; }
      }
      
      // Update value displays
      if (scaleValue) scaleValue.textContent = scale.toFixed(1) + 'x';
      if (rotationValue) rotationValue.textContent = rotation + '°';
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
    currentEditingId = leafId;
    addModalTitle.textContent = isEdit ? "✏️ Sửa lá" : "🌿 Thêm lá mới";

    if (leafShapeSel && leafPaletteSel && leafRotationInp) {
      if (isEdit && leafId) {
        const leaf = leaves.querySelector(`.leaf[data-id="${leafId}"]`);
        leafShapeSel.value    = leaf?.dataset.shapeKey   || "oval";
        leafPaletteSel.value  = leaf?.dataset.paletteIdx || "0";
        // There is no leafScale input in the UI anymore; we still read stored scale
        // and use it when present, otherwise default to DEFAULT_SCALE
        if (leaf?.dataset.scale) {
          // nothing to set in UI
        }
        leafRotationInp.value = leaf?.dataset.rotation   || "0";
      } else {
        leafShapeSel.value = "oval";
        leafPaletteSel.value = "0";
        // default scale removed from UI; use script default
        leafRotationInp.value = "0";
        // Default to non-withered when creating a new leaf
        if (isWitheredInp) {
          isWitheredInp.checked = false;
        }
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
    // Heuristic: if values look like screen/client coordinates (too large or negative), convert
    const looksLikeScreenCoords = (n) => !Number.isFinite(n) || n > window.innerWidth || n > window.innerHeight || n < -200;
    if (looksLikeScreenCoords(px) || looksLikeScreenCoords(py)) {
      try {
        // convert from client coords to svg coords
        const converted = screenToSVG(px, py);
        px = Number(converted.x || px);
        py = Number(converted.y || py);
        position.x = px; position.y = py;
        data.position = position;
      } catch (e) {
        position = randomPositionInTree();
        data.position = position;
        px = Number(position.x); py = Number(position.y);
      }
    }
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      position = randomPositionInTree();
      data.position = position;
      px = Number(position.x); py = Number(position.y);
    }
    const rotation = Number.isFinite(data.rotation) ? data.rotation : (position.rotation || 0);
    const scale    = Number.isFinite(data.scale)    ? data.scale    : rand(0.9,1.2);

  const { palette, idx: paletteIdx } = pickPalette(data.paletteIdx);
  // incomingKey is encoded in data.shapeKey (may be a withered value)
  const incomingKey = data.shapeKey;
  const { key: shapeKey } = pickLeafShape(incomingKey);

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
    // Base image size increased by ~20% (from 70 -> 84) to make initial leaves larger
    const leafImage = mk("image", { 
      href: leafImagePath,
      x: "-42", // Center for 84x84 image
      y: "-42", 
      width: "84",
      height: "84",
      style: "filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));"
    });

    if (data.isWithered) {
      // Visual cue: add withered class and reduce opacity slightly
      g.classList.add('withered');
      leafImage.style.filter = 'grayscale(60%) contrast(0.85) drop-shadow(1px 1px 3px rgba(0,0,0,0.25))';
      leafImage.style.opacity = '0.9';
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
      try { if (trimmed) leafImage.setAttribute('href', trimmed); } catch(e){}
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
      const leafIsWithered = !!g.dataset.isWithered || (shapesWithoutPalette && shapesWithoutPalette.has && shapesWithoutPalette.has(g.dataset.shapeKey));
      // If the viewer is not authenticated, hide all action controls inside the leaf modal
      if (!loggedIn) {
        try { if (encourageSection) encourageSection.style.display = 'none'; } catch(e){}
        try { if (ownerRecoverSection) ownerRecoverSection.style.display = 'none'; } catch(e){}
        try { if (editLeafBtn) editLeafBtn.style.display = 'none'; } catch(e){}
        try { if (deleteLeafBtn) deleteLeafBtn.style.display = 'none'; } catch(e){}
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
        try { if (deleteLeafBtn) deleteLeafBtn.style.display = isOwner ? '' : 'none'; } catch(e){}
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
            shapeKey: 'oval',
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

  // If current user is the owner, fetch and show list of encouragers
  const encouragersList = document.getElementById('encouragersList');
  const encouragersItems = document.getElementById('encouragersItems');
  if (isOwner && leafIsWithered && encouragersList && encouragersItems) {
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
              try { playWateringEffect(g.dataset.id, WATERING_DURATION_MS); } catch(e){}
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

            // Transition the leaf to a special 'transition_yellow' visual.
            // Update DOM dataset so future renders use the special shape.
            try {
              g.dataset.shapeKey = 'transition_yellow';
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
                      shapeKey: 'transition_yellow',
                      scale: newScale,
                      rotation: newRot,
                      isWithered: null
                    };
                    if (pctX !== undefined && pctY !== undefined) {
                      updateObj.percentX = pctX;
                      updateObj.percentY = pctY;
                    }
                    await fb().db.ref(`leaves/${g.dataset.id}`).update(updateObj);
                  } catch(e) {
                    console.error('Failed to persist recovered leaf state (update):', e);
                  }
                }
              } catch (e) { console.error('Failed to persist recovered leaf state:', e); }
              // swap the inner image src with a smooth crossfade
              if (img) {
                img.classList.add('transitioning-special');
                // pick same palette index or fallback
                const pal = Number(g.dataset.paletteIdx || 2);
                const specialPath = getLeafImagePath('transition_yellow', pal);
                // after brief fade, swap src and remove transition class
                setTimeout(()=>{
                  try { img.setAttribute('href', specialPath); } catch(e){ img.setAttribute('xlink:href', specialPath); }
                  // Ensure the swapped image uses the expected display size and aspect ratio
                  try {
                    // enforce consistent intrinsic display size (matches initial leaf image sizing)
                    img.setAttribute('width', '84');
                    img.setAttribute('height', '84');
                    img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                    // clear any inline sizing CSS that could have been added by trimming/fallbacks
                    img.style.width = '';
                    img.style.height = '';
                  } catch(e){}
                  // let the image settle then remove the transitioning class and clear temporary inline transforms
                  setTimeout(()=>{
                    try { img.classList.remove('transitioning-special'); } catch(e){}
                    try { img.style.transform = ''; img.style.transformOrigin = 'center center'; img.style.transition = ''; } catch(e){}
                    // Re-apply the group's transform using stored dataset values so scale is preserved
                    try {
                      const pos = JSON.parse(g.dataset.position || '{"x":0,"y":0}');
                      const sc = Number(g.dataset.scale || 1);
                      const rot = Number(g.dataset.rotation || 0);
                      g.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
                    } catch(e){}
                  }, 520);
                }, 220);
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
              try { if (deleteLeafBtn) deleteLeafBtn.style.display = ''; } catch(e){}

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
            try { playWateringEffect(g.dataset.id, WATERING_DURATION_MS); } catch(e){}
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
      deleteLeafBtn.onclick = ()=>{
        if (!isAuthenticated()) { promptLoginFlow(); return; }
        if (confirm("Bạn có chắc muốn xóa lá này không?")) {
          deleteLeafById(g.dataset.id);
          hideModal(modal);
        }
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
  function deleteLeafById(id){
    const leafEl = leaves.querySelector(`.leaf[data-id="${id}"]`);
    if (leafEl) animateLeafFall(leafEl);
    if (list) list.querySelectorAll(".chip").forEach(r=> { if (r.dataset.id === id) r.remove(); });

    if (hasFB()) {
      fb().db.ref(`leaves/${id}`).remove().catch(console.error);
    }
    syncLocalStorage();
    updateCounter();
    updateEmptyState();
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
    dragging = null;
    
    if (hasFB()) fb().db.ref(`leaves/${id}`).set(payload).catch(console.error);
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
  isWitheredInp?.addEventListener('change', () => { try { renderPreview(); } catch(e){} });
  [leafShapeSel, leafPaletteSel, leafRotationInp].forEach(el=> el && el.addEventListener("input", renderPreview));

  // Update value displays for scale and rotation
  leafRotationInp?.addEventListener("input", (e) => {
    const rotationValue = document.getElementById('rotationValue');
    if (rotationValue) rotationValue.textContent = e.target.value + '°';
  });


  addMessage?.addEventListener("input", (e) => {
    checkSecretCode(e.target.value);
  });

  saveLeaf?.addEventListener("click", ()=>{
    let text = addMessage.value.trim();
    let author = isAnonymous.checked ? "" : addAuthor.value.trim();
    
    // Security: Sanitize inputs
    if (sanitizeLeafMessage) {
      text = sanitizeLeafMessage(text);
    } else {
      text = text.replace(/[<>]/g, '').substring(0, 500);
    }
    
    if (sanitizeDisplayName) {
      author = sanitizeDisplayName(author);
    } else {
      author = author.replace(/[<>]/g, '').substring(0, 50);
    }
    
    // Rate limiting check
    if (leafMessageLimiter && !leafMessageLimiter.isAllowed('user')) {
      alert('Bạn đang thêm lá quá nhanh! Vui lòng chờ một chút.');
      return;
    }
    
    if (!text){ addMessage && (addMessage.focus(), addMessage.select()); return; }

    const shapeKey   = leafShapeSel ? leafShapeSel.value : undefined;
    const paletteIdx = leafPaletteSel ? Number(leafPaletteSel.value) : undefined;
  // leafScale input removed; use DEFAULT_SCALE unless editing an existing leaf
  const scale      = leafScaleInp ? clampScale(leafScaleInp.value) : DEFAULT_SCALE;
  const rotation   = leafRotationInp ? clampRot(leafRotationInp.value) : 0;

  if (currentEditingId){
      // Update existing
      const leafEl = leaves.querySelector(`.leaf[data-id="${currentEditingId}"]`);
      if (leafEl) {
        leafEl.dataset.msg = text;
        leafEl.dataset.author = author;
        if (shapeKey)  leafEl.dataset.shapeKey = shapeKey;
        if (Number.isFinite(paletteIdx)) leafEl.dataset.paletteIdx = String(paletteIdx);
        if (Number.isFinite(scale))      leafEl.dataset.scale = String(scale);
        if (Number.isFinite(rotation)) {
          const pos = JSON.parse(leafEl.dataset.position || '{"x":0,"y":0,"rotation":0}');
          pos.rotation = rotation;
          leafEl.dataset.position = JSON.stringify(pos);
          leafEl.dataset.rotation = String(rotation);
        }
        // update withered flag when editing
        if (isWitheredInp) {
          if (isWitheredInp.checked) leafEl.dataset.isWithered = '1'; else delete leafEl.dataset.isWithered;
          // withered type is stored via shapeKey (we merged withered options into leafShapeSel)
          // no separate witherType stored; subtype is encoded in shapeKey
        }
        // repaint with new image
        const leafImagePath = getLeafImagePath(shapeKey, Number(leafEl.dataset.paletteIdx || 0));
        const leafImage = leafEl.querySelector("image");
        if (leafImage) {
          leafImage.setAttribute("href", leafImagePath);
        }

        const pos = JSON.parse(leafEl.dataset.position || '{"x":0,"y":0,"rotation":0}');
        const sc  = Number(leafEl.dataset.scale || 1);
        const rot = Number(leafEl.dataset.rotation || 0);
        leafEl.setAttribute("transform", `translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${sc})`);
      }
      // list chip
      if (list) {
        const chip = list.querySelector(`.chip[data-id="${currentEditingId}"]`);
        if (chip){
          const t = chip.querySelector(".chip-text") || chip.querySelector("span");
          const a = chip.querySelector(".chip-author") || chip.querySelector("small");
          if (t) t.textContent = text;
          if (a) a.textContent = author || "Ẩn danh";
        }
      }
      const data = getLeafDataFromDOM(currentEditingId);
    // reflect isWithered on payload when editing
    const existingEl = leaves.querySelector(`.leaf[data-id="${currentEditingId}"]`);
    if (existingEl && existingEl.dataset.isWithered) data.isWithered = true;
    // Note: withered subtype encoded in shapeKey; no separate witherType field
      if (hasFB()) fb().db.ref(`leaves/${currentEditingId}`).set(data).catch(console.error);
    } else {
      // Add new
      const pos = pendingPosition || randomPositionInTree();
      if (Number.isFinite(rotation)) pos.rotation = rotation;
      
      // Get current user info for proper attribution
      const currentUser = window._firebase?.auth?.currentUser;
      const authorId = currentUser?.uid || null;
      const finalAuthor = author || (currentUser?.displayName || currentUser?.email?.split('@')[0] || "Ẩn danh");
      
      const data = { 
        id: uuid(), 
        text, 
        author: finalAuthor, 
        authorId: authorId, // MUST be authorId to match database rules
        ts: Date.now(), 
        position: pos, 
        shapeKey, 
        paletteIdx, 
        scale, 
        rotation 
      };
      // If we captured normalized percent coordinates at click time, persist them
      if (pos && pos.percentX !== undefined && pos.percentY !== undefined) {
        data.percentX = Number(pos.percentX);
        data.percentY = Number(pos.percentY);
      }
      // include withered flag (shapeKey already reflects chosen withered option)
      if (isWitheredInp && isWitheredInp.checked) {
        data.isWithered = true;
      }
      // debug log to assist testing rotation/shape
      try { console.debug('Saving leaf', { id: data.id, shapeKey: data.shapeKey, rotation: data.rotation, isWithered: data.isWithered }); } catch(e){}
      
      addLeafFromData(data, true);
      // Try to read the computed percent coords from the created DOM element so
      // we persist stable percentX/percentY to the database (helps across resizes)
      try {
        const created = leaves.querySelector(`.leaf[data-id="${data.id}"]`);
        if (created && created.dataset.percentX !== undefined) {
          data.percentX = Number(created.dataset.percentX);
          data.percentY = Number(created.dataset.percentY);
          try { console.debug('saveLeaf: computed percent from DOM', { id: data.id, percentX: data.percentX, percentY: data.percentY }); } catch(e){}
        } else {
          const pct = svgToTreePercent(pos.x, pos.y);
          data.percentX = pct.px; data.percentY = pct.py;
          try { console.debug('saveLeaf: fallback percent from svgToTreePercent', { id: data.id, percentX: data.percentX, percentY: data.percentY }); } catch(e){}
        }
      } catch (e) { /* ignore */ }

      if (hasFB()) {
        // Use the data object directly instead of getting from DOM
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
    if (isWitheredInp) isWitheredInp.checked = false;
    addAuthor.disabled = false;
    addAuthor.style.opacity = "1";
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
    
    // Realtime listener with reconciliation: update existing DOM nodes where possible
    // to avoid wholesale re-renders that conflict with user interactions (dragging).
    leavesRef().on('value', (snap)=>{
      const data = snap.val() || {};

      try {
        // Map incoming data by id for easy lookup
        const incomingById = new Map(Object.values(data).filter(Boolean).map(d => [String(d.id), d]));

        // Update existing elements and collect processed ids
        const existing = leaves ? [...leaves.querySelectorAll('.leaf')] : [];
        const processed = new Set();

        for (const g of existing) {
          const id = g.dataset.id;
          if (!id || !incomingById.has(id)) {
            // If server no longer has this leaf, remove it
            try { g.remove(); } catch(e){}
            continue;
          }

          const payload = incomingById.get(id);

          // If user is actively dragging this element, skip updating it to avoid jump.
          if (g.classList.contains('grabbing')) {
            processed.add(id);
            incomingById.delete(id);
            continue;
          }

          // Update dataset fields and attributes when different
          try {
            const pos = payload.position || payload;
            const rotation = Number.isFinite(payload.rotation) ? payload.rotation : Number(g.dataset.rotation || 0);
            const scale = Number.isFinite(payload.scale) ? payload.scale : Number(g.dataset.scale || 1);

            // Update stored dataset values
            g.dataset.msg = payload.text || g.dataset.msg || "";
            g.dataset.author = payload.author || g.dataset.author || "";
            g.dataset.authorId = payload.authorId || g.dataset.authorId || "";
            g.dataset.position = JSON.stringify(payload.position || JSON.parse(g.dataset.position || '{"x":0,"y":0}'));
            g.dataset.rotation = String(clampRot(rotation));
            g.dataset.scale = String(clampScale(scale));
            g.dataset.shapeKey = payload.shapeKey || g.dataset.shapeKey || "oval";
            g.dataset.paletteIdx = String(payload.paletteIdx || g.dataset.paletteIdx || 0);
            if (payload.isWithered) g.dataset.isWithered = '1'; else delete g.dataset.isWithered;

            // Recompute transform from payload position (prefer percent coords if provided)
            try {
              let tx = 0, ty = 0;
              if (payload.percentX !== undefined && payload.percentY !== undefined) {
                const pt = treePercentToSVG(Number(payload.percentX), Number(payload.percentY));
                tx = Number(pt.x); ty = Number(pt.y);
              } else if (payload.position && typeof payload.position === 'object') {
                tx = Number(payload.position.x || 0); ty = Number(payload.position.y || 0);
              } else {
                // keep previous
                const prev = JSON.parse(g.dataset.position || '{"x":0,"y":0}'); tx = Number(prev.x||0); ty = Number(prev.y||0);
              }
              const sc = clampScale(Number(g.dataset.scale || 1));
              const rot = clampRot(Number(g.dataset.rotation || 0));
              g.setAttribute('transform', `translate(${tx} ${ty}) rotate(${rot}) scale(${sc})`);
            } catch(e) { /* ignore transform errors */ }
          } catch (e) {
            console.warn('Failed to reconcile leaf', id, e);
          }

          processed.add(id);
          incomingById.delete(id);
        }

        // Any remaining in incomingById are new leaves to add
        if (incomingById.size > 0) {
          const toAdd = Array.from(incomingById.values()).sort((a,b)=> (a.ts||0) - (b.ts||0));
          for (const d of toAdd) addLeafFromData(d, false);
        }

        // After reconciliation, reproject to ensure percent-based positions are applied
        setTimeout(()=> reprojectAllLeaves(), 50);
        updateCounter(); updateEmptyState();

        // Save to localStorage as backup
        try { localStorage.setItem(storeKey, JSON.stringify(Object.values(data||{}))); } catch (e) { console.error('Failed to save to localStorage:', e); }
      } catch (err) {
        console.error('Realtime reconcile error:', err);
      }
    }, (error) => {
      console.error("Firebase realtime listener error:", error);
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
      try { flushEncouragementQueue(); } catch(e){}
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
})();

// ===== STARS ANIMATION =====
// Remove debug logs and simplify