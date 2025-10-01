(() => {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (n,min,max)=> Math.max(min, Math.min(max, n));
  const rand  = (min,max)=> Math.random()*(max-min)+min;
  const uuid  = ()=> (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const mk = (tag, attrs={}) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
    return el;
  };

  // DOM Elements
  const add = $("#add"), stage = $("#stage"), svg = $("#treeSvg");
  const leaves = $("#leaves"), branches = $$("#branches path"), counter = $("#counter");
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
  const MIN_SCALE = 0.7, MAX_SCALE = 1.8;
  const clampScale = v => clamp(Number(v)||1, MIN_SCALE, MAX_SCALE);
  const clampRot   = v => clamp(Number(v)||0, -45, 45);

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
  const SECRET_CODE = "caytinhthan2025";
  let currentEditingId = null, pendingPosition = null, dragging = null;
  let dragOffset = { x:0, y:0 }, clickToPlaceMode = false, dragModeEnabled = false, isAdminMode = false;

  // Debounce và throttle để tối ưu hiệu suất
  const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  const throttle = (fn, delay) => {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn.apply(this, args);
      }
    };
  };

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
  function leavesRef(){ return fb().ref(fb().db, "leaves"); }

  // Chuyển đổi theme sáng/tối
  function setTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch {}
    const icon = themeToggle?.querySelector(".theme-icon");
    if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  function initializeTheme(){
    const saved = (localStorage.getItem("theme") || "light");
    setTheme(saved);
  }
  if (themeToggle) themeToggle.addEventListener("click", ()=>{
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(cur === "dark" ? "light" : "dark");
  });

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
    requestAnimationFrame(()=> m.classList.add("show"));
  }
  function hideModal(m){
    m.classList.remove("show");
    setTimeout(()=>{
      m.style.display = "none";
      document.body.style.overflow = "";
    }, 300);
  }

  function checkSecretCode(text) {
    if (text.toLowerCase().includes(SECRET_CODE.toLowerCase())) {
      enableAdminMode();
      return true;
    } else if (isAdminMode && !text.toLowerCase().includes(SECRET_CODE.toLowerCase())) {
      disableAdminMode();
    }
    return false;
  }

  function enableAdminMode() {
    if (!isAdminMode) {
      isAdminMode = true;
      document.body.classList.add('admin-mode');
    }
  }

  function disableAdminMode() {
    if (isAdminMode) {
      isAdminMode = false;
      document.body.classList.remove('admin-mode');
    }
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

  // Hình dạng và màu sắc cho lá cây
  function pickPalette(idx){
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
    const map = {
      oval:     { key:"oval",     d:"M0,-18 C8,-16 14,-10 16,-2 C18,6 14,14 8,18 C3,20 -3,20 -8,18 C-14,14 -18,6 -16,-2 C-14,-10 -8,-16 0,-18 Z" },
      round:    { key:"round",    d:"M0,-16 C6,-15 11,-9 12,-2 C13,5 11,12 6,16 C2,18 -2,18 -6,16 C-11,12 -13,5 -12,-2 C-11,-9 -6,-15 0,-16 Z" },
      oak:      { key:"oak",      d:"M0,-17 C4,-16 7,-12 8,-6 C9,-2 8,2 6,5 C8,8 9,12 6,15 C3,17 0,18 -3,17 C-6,15 -8,12 -6,8 C-8,5 -9,2 -8,-6 C-7,-12 -4,-16 0,-17 Z" },
      maple:    { key:"maple",    d:"M0,-20 C4,-18 8,-14 10,-8 C12,-4 10,0 8,4 C12,6 16,8 14,12 C12,16 8,14 4,12 C2,16 0,20 -2,16 C-4,12 -8,14 -12,12 C-16,8 -12,6 -8,4 C-10,0 -12,-4 -10,-8 C-8,-14 -4,-18 0,-20 Z" },
      heart:    { key:"heart",    d:"M0,-16 C-6,-20 -14,-18 -16,-10 C-18,-2 -12,6 0,18 C12,6 18,-2 16,-10 C14,-18 6,-20 0,-16 Z" },
      willow:   { key:"willow",   d:"M0,-20 C2,-18 4,-14 5,-8 C6,-2 5,4 4,10 C3,16 1,20 0,18 C-1,20 -3,16 -4,10 C-5,4 -6,-2 -5,-8 C-4,-14 -2,-18 0,-20 Z" },
      birch:    { key:"birch",    d:"M0,-18 C3,-17 6,-14 8,-10 C10,-6 9,-2 8,2 C7,6 5,10 3,14 C1,17 -1,17 -3,14 C-5,10 -7,6 -8,2 C-9,-2 -10,-6 -8,-10 C-6,-14 -3,-17 0,-18 Z" },
      ginkgo:   { key:"ginkgo",   d:"M0,-16 C8,-16 14,-10 16,-2 C18,6 16,12 12,16 C8,18 4,18 0,16 C-4,18 -8,18 -12,16 C-16,12 -18,6 -16,-2 C-14,-10 -8,-16 0,-16 Z" },
      elm:      { key:"elm",      d:"M0,-18 C6,-17 10,-13 12,-8 C14,-3 13,2 11,6 C9,10 6,13 3,15 C1,17 -1,17 -3,15 C-6,13 -9,10 -11,6 C-13,2 -14,-3 -12,-8 C-10,-13 -6,-17 0,-18 Z" },
      bamboo:   { key:"bamboo",   d:"M0,-20 C1,-19 2,-16 3,-12 C4,-8 4,-4 3,0 C2,4 2,8 1,12 C0,16 0,18 0,20 C0,18 0,16 -1,12 C-2,8 -2,4 -3,0 C-4,-4 -4,-8 -3,-12 C-2,-16 -1,-19 0,-20 Z" },
      fern:     { key:"fern",     d:"M0,-18 C2,-16 4,-12 5,-8 C6,-4 5,0 4,4 C5,6 6,8 5,10 C4,12 2,13 0,14 C-2,13 -4,12 -5,10 C-6,8 -5,6 -4,4 C-5,0 -6,-4 -5,-8 C-4,-12 -2,-16 0,-18 Z" },
      cherry:   { key:"cherry",   d:"M0,-16 C4,-15 8,-12 10,-8 C12,-4 11,0 9,4 C7,8 4,11 1,13 C-1,14 -3,13 -5,11 C-7,9 -9,6 -10,3 C-11,-1 -10,-5 -8,-9 C-6,-13 -3,-15 0,-16 Z" }
    };
    if (key && map[key]) return map[key];
    const keys = Object.keys(map);
    return map[keys[Math.floor(Math.random()*keys.length)]];
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
      position,
      scale: Number(leaf?.dataset.scale || 1),
      rotation: Number(leaf?.dataset.rotation || 0),
      shapeKey: leaf?.dataset.shapeKey || "oval",
      paletteIdx: Number(leaf?.dataset.paletteIdx || 0),
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
  function randomPositionInTree(){
    const branchElements = document.querySelectorAll("#branches path");
    if (!branchElements.length) {
      console.warn("No branches found, using fallback position");
      return { x: 276 + rand(-60,60), y: 330 + rand(-120,40), rotation: rand(-15,15) };
    }
    const branches = [...branchElements];
    const options = branches.map((path, i)=>({
      path, range: i<2 ? [0.2,0.8] : i<6 ? [0.15,0.85] : [0.3,0.7]
    }));
    const sel = options[Math.floor(Math.random()*options.length)];
    const len = sel.path.getTotalLength();
    const t   = rand(len*sel.range[0], len*sel.range[1]);
    const p   = sel.path.getPointAtLength(t);
    return { x: p.x + rand(-3,3), y: p.y + rand(-2,2), rotation: rand(-15,15) };
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
    if (!leafPreview) return;
    const { d } = pickLeafShape(leafShapeSel?.value);
    const { palette } = pickPalette(Number(leafPaletteSel?.value));
    const s = clampScale(leafScaleInp?.value || 1);
    const rot = clampRot(leafRotationInp?.value || 0);
    leafPreview.innerHTML = `
      <svg viewBox="-40 -40 80 80" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${rot}) scale(${s})">
          <path d="${d}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="1.6" vector-effect="non-scaling-stroke"></path>
          <path d="${getVeinForShape(d)}" fill="none" stroke="${palette.vein}" stroke-width="1" vector-effect="non-scaling-stroke"></path>
        </g>
      </svg>`;
  }
  function openAddModal(message="", author="", isEdit=false, leafId=null){
    if (!addModal) return;
    addMessage.value = message || "";
    addAuthor.value  = author  || "";
    isAnonymous.checked = !author;
    addAuthor.disabled = isAnonymous.checked;
    addAuthor.style.opacity = isAnonymous.checked ? "0.5" : "1";
    currentEditingId = leafId;
    addModalTitle.textContent = isEdit ? "✏️ Sửa lá" : "🌿 Thêm lá mới";

    if (leafShapeSel && leafPaletteSel && leafScaleInp && leafRotationInp) {
      if (isEdit && leafId) {
        const leaf = leaves.querySelector(`.leaf[data-id="${leafId}"]`);
        leafShapeSel.value    = leaf?.dataset.shapeKey   || "oval";
        leafPaletteSel.value  = leaf?.dataset.paletteIdx || "0";
        leafScaleInp.value    = leaf?.dataset.scale      || "1";
        leafRotationInp.value = leaf?.dataset.rotation   || "0";
      } else {
        leafShapeSel.value = "oval";
        leafPaletteSel.value = "0";
        leafScaleInp.value = "1";
        leafRotationInp.value = "0";
      }
      renderPreview();
    }
    showModal(addModal);
  }

  // Render lá cây lên cây
  function addLeafFromData(data, animate=false){
    // Validate và fix corrupted data
    if (!data.position || typeof data.position !== 'object' || data.position.x === undefined) {
      console.warn("Invalid position data, generating new position", data);
      data.position = randomPositionInTree();
    }
    
    const position = data.position;
    const rotation = Number.isFinite(data.rotation) ? data.rotation : (position.rotation || 0);
    const scale    = Number.isFinite(data.scale)    ? data.scale    : rand(0.9,1.2);

    const { palette, idx: paletteIdx } = pickPalette(data.paletteIdx);
    const { d: leafShape, key: shapeKey } = pickLeafShape(data.shapeKey);

    const g = mk("g", { class: "leaf" });
    g.dataset.id        = data.id;
    g.dataset.msg       = data.text || "";
    g.dataset.author    = data.author || "";
    g.dataset.position  = JSON.stringify(position);
    g.dataset.rotation  = String(clampRot(rotation));
    g.dataset.scale     = String(clampScale(scale));
    g.dataset.shapeKey  = shapeKey;
    g.dataset.paletteIdx= String(paletteIdx);
    g.dataset.ts        = String(data.ts || Date.now());

    // Transform SVG CHUẨN với clamp
    const sc = clampScale(scale);
    const rot = clampRot(rotation);
    const baseTransform = `translate(${position.x} ${position.y}) rotate(${rot}) scale(${sc})`;
    g.setAttribute("transform", baseTransform);

    const body = mk("path", { 
      d: leafShape, fill: palette.fill, stroke: palette.stroke, 
      "stroke-width":"1.6", "vector-effect":"non-scaling-stroke"
    });
    const vein = mk("path", { 
      d: getVeinForShape(leafShape), fill:"none", stroke: palette.vein, 
      "stroke-width":"1", "vector-effect":"non-scaling-stroke"
    });
    g.append(body, vein);
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
      if (mode !== Mode.VIEW) return;
      modalText.textContent   = g.dataset.msg || "";
      modalAuthor.textContent = g.dataset.author ? `💝 Từ: ${g.dataset.author}` : "👤 Ẩn danh";
      editLeafBtn.onclick = ()=>{
        hideModal(modal);
        openAddModal(g.dataset.msg || "", g.dataset.author || "", true, g.dataset.id);
      };
      deleteLeafBtn.onclick = ()=>{
        if (confirm("Bạn có chắc muốn xóa lá này không?")) {
          deleteLeafById(g.dataset.id);
          hideModal(modal);
        }
      };
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
      fb().remove(fb().ref(fb().db, `leaves/${id}`)).catch(console.error);
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
    const payload = getLeafDataFromDOM(id);
    dragging.classList.remove("grabbing");
    try { e && dragging.releasePointerCapture(e.pointerId); } catch {}
    dragging = null;
    
    if (hasFB()) fb().set(fb().ref(fb().db, `leaves/${id}`), payload).catch(console.error);
    syncLocalStorage();
  }
  svg?.addEventListener("pointerup", endDrag);
  svg?.addEventListener("pointercancel", endDrag);
  svg?.addEventListener("pointerleave", endDrag);

  // Chế độ click để đặt lá - chỉ ở PLACE mode
  svg?.addEventListener("click", (e)=>{
    if (mode !== Mode.PLACE) return;
    if (viewOnlyMode && viewOnlyMode.checked) return;
    if (e.target.closest && e.target.closest(".leaf")) return;
    const p = svgPoint(e);
    pendingPosition = { x:p.x, y:p.y, rotation:0 };
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
  [leafShapeSel, leafPaletteSel, leafScaleInp, leafRotationInp].forEach(el=> el && el.addEventListener("input", renderPreview));


  addMessage?.addEventListener("input", (e) => {
    checkSecretCode(e.target.value);
  });

  saveLeaf?.addEventListener("click", ()=>{
    console.log("Save leaf clicked");
    let text = addMessage.value.trim();
    const author = isAnonymous.checked ? "" : addAuthor.value.trim();

    if (text.toLowerCase().includes(SECRET_CODE.toLowerCase())) {
      const regex = new RegExp(SECRET_CODE, 'gi');
      text = text.replace(regex, '').trim();
    }
    
    if (!text){ addMessage && (addMessage.focus(), addMessage.select()); return; }

    const shapeKey   = leafShapeSel ? leafShapeSel.value : undefined;
    const paletteIdx = leafPaletteSel ? Number(leafPaletteSel.value) : undefined;
    const scale      = leafScaleInp ? clampScale(leafScaleInp.value) : undefined;
    const rotation   = leafRotationInp ? clampRot(leafRotationInp.value) : undefined;

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
        // repaint
        const { palette } = pickPalette(Number(leafEl.dataset.paletteIdx || 0));
        const { d } = pickLeafShape(leafEl.dataset.shapeKey || "oval");
        const paths = leafEl.querySelectorAll("path");
        if (paths[0]) { paths[0].setAttribute("d", d); paths[0].setAttribute("fill", palette.fill); paths[0].setAttribute("stroke", palette.stroke); }
        if (paths[1]) { paths[1].setAttribute("d", getVeinForShape(d)); paths[1].setAttribute("stroke", palette.vein); }

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
      if (hasFB()) fb().set(fb().ref(fb().db, `leaves/${currentEditingId}`), data).catch(console.error);
    } else {
      // Add new
      const pos = pendingPosition || randomPositionInTree();
      if (Number.isFinite(rotation)) pos.rotation = rotation;
      const data = { id: uuid(), text, author, ts: Date.now(), position: pos, shapeKey, paletteIdx, scale, rotation };
      addLeafFromData(data, true);
      if (hasFB()) {
        fb().set(fb().ref(fb().db, `leaves/${data.id}`), getLeafDataFromDOM(data.id)).catch(console.error);
      }
    }

    pendingPosition = null;
    currentEditingId = null;
    console.log("Đóng modal sau khi save leaf");
    hideModal(addModal);              // ĐÓNG TRƯỚC
    syncLocalStorage();               // Lưu sau, có lỗi cũng không giữ modal
    // reset form
    addMessage.value = "";
    addAuthor.value = "";
    isAnonymous.checked = false;
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

  // Add button = mở modal, auto chọn vị trí random
  add?.addEventListener("click", ()=>{
    // Không cho add nếu đang ở view only mode
    if (viewOnlyMode && viewOnlyMode.checked) return;
    
    pendingPosition = randomPositionInTree();
    openAddModal("", "", false, null);
  });

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
      if (hasFB()) fb().set(leavesRef(), null).catch(console.error);
      updateCounter(); updateEmptyState();
    }, allLeaves.length*80 + 500);
  });

  // Khởi tạo ứng dụng
  console.log("=== App initialization starting ===");
  
  // Realtime attach: chạy ngay nếu có FB, và attach lại nếu module đến sau
  function attachRealtime(){
    if (!hasFB()) return;
    console.log("Attaching Firebase realtime listener");
    fb().onValue(leavesRef(), (snap)=>{
      const data = snap.val();
      console.log("Firebase data received:", data);
      leaves.innerHTML = "";
      if (list) list.innerHTML = "";
      if (data){
        const leafData = Object.values(data);
        console.log("Processing", leafData.length, "leaves");
        leafData
          .sort((a,b)=> (a.ts||0) - (b.ts||0))
          .forEach(d => {
            console.log("Adding leaf:", d);
            addLeafFromData(d, false);
          });
      }
      updateCounter(); updateEmptyState();
      try { localStorage.setItem(storeKey, JSON.stringify(Object.values(data||{}))); } catch {}
    }, console.error);
  }

  initializeTheme();
  optimizeListScroll();
  
  // khởi tạo mode
  setMode(Mode.VIEW);
  
  if (hasFB()) {
    console.log("Firebase available, attaching realtime");
    attachRealtime();
  } else {
    console.log("Firebase not available, loading from localStorage");
    const existing = loadFromStorage();
    console.log("Loaded from storage:", existing);
    let migrated = false;
    existing.forEach(d=>{
      if (!d.position){ d.position = randomPositionInTree(); migrated = true; }
      console.log("Adding leaf from storage:", d);
      addLeafFromData(d, false);
    });
    if (migrated) try { localStorage.setItem(storeKey, JSON.stringify(existing)); } catch {}
    updateCounter(); updateEmptyState();
  }
  
  window.addEventListener("firebase-ready", ()=>{
    console.log("Firebase ready event received");
    attachRealtime();
  }, { once:true });
})();