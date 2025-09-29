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
  const addBtn = $("#add"), stage = $("#stage"), svg = $("#treeSvg");
  const leaves = $("#leaves"), branches = $$("#branches path"), counter = $("#counter");
  const list = document.querySelector("#list") || null;
  const clearAll = document.querySelector("#clearAll") || null;
  const emptyState = document.querySelector("#emptyState") || null;
  const tip = $("#tip"), themeToggle = $("#themeToggle");
  const modal = $("#modal"), helpModal = $("#helpModal"), helpBtn = $("#helpBtn");
  const modalText = $("#modalText"), modalAuthor = $("#modalAuthor");
  const closeModal = $("#closeModal"), closeHelpModal = $("#closeHelpModal");
  const editLeafBtn = $("#editLeaf"), deleteLeafBtn = $("#deleteLeaf");
  const addModal = $("#addModal"), addModalTitle = $("#addModalTitle"), addMessage = $("#addMessage");
  const addAuthor = $("#addAuthor"), isAnonymous = $("#isAnonymous"), saveLeaf = $("#saveLeaf");
  const cancelAdd = $("#cancelAdd"), closeAddModal = $("#closeAddModal");
  const leafShapeSel = $("#leafShape"), leafPaletteSel = $("#leafPalette");
  const leafScaleInp = $("#leafScale"), leafRotationInp = $("#leafRotation");
  const leafPreview = $("#leafPreview"), toggleMode = $("#toggleMode");
  const dragMode = $("#dragMode");
  const viewOnlyMode = $("#viewOnlyMode"), actionButtons = $("#actionButtons");

  const storeKey = "leaf-messages-v3";
  const SECRET_CODE = "caytinhthan2025";
  let currentEditingId = null, pendingPosition = null, dragging = null;
  let dragOffset = { x:0, y:0 }, clickToPlaceMode = false, dragModeEnabled = false, isAdminMode = false;

  // ========= Tối ưu hiệu suất =========
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

  // ========= Theme =========
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

  // ========= Help Modal =========
  if (helpBtn) helpBtn.addEventListener("click", ()=> showModal(helpModal));
  if (closeHelpModal) closeHelpModal.addEventListener("click", ()=> hideModal(helpModal));
  if (helpModal) helpModal.addEventListener("click", (e)=> { 
    if (e.target === helpModal) hideModal(helpModal); 
  });

  // ========= View Only Mode =========
  function updateViewOnlyMode() {
    const isViewOnly = viewOnlyMode && viewOnlyMode.checked;
    if (actionButtons) {
      actionButtons.classList.toggle("disabled", isViewOnly);
    }
    
    if (isViewOnly) {
      // Tắt tất cả chức năng khi bật view only
      clickToPlaceMode = false;
      dragModeEnabled = false;
      
      // Update UI cho click mode
      if (toggleMode) {
        const icon = toggleMode.querySelector(".btn-icon");
        const text = toggleMode.querySelector(".btn-text");
        if (icon) icon.textContent = "🖱️";
        if (text) text.textContent = "Click để đặt";
      }
      
      // Update UI cho drag mode
      if (dragMode) {
        const icon = dragMode.querySelector(".btn-icon");
        const text = dragMode.querySelector(".btn-text");
        if (icon) icon.textContent = "✋";
        if (text) text.textContent = "Kéo thả";
      }
      
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

  // ========= Shapes & colors =========
  function pickPalette(idx){
    const arr = [
      { fill:"#FFE5E5", stroke:"#FFB3B3", vein:"#FF8A80" }, // Pink pastel
      { fill:"#E5F3FF", stroke:"#B3D9FF", vein:"#80C7FF" }, // Blue pastel  
      { fill:"#E5FFE5", stroke:"#B3FFB3", vein:"#80FF80" }, // Green pastel
      { fill:"#FFFBE5", stroke:"#FFF4B3", vein:"#FFEB80" }, // Yellow pastel
      { fill:"#F0E5FF", stroke:"#D9B3FF", vein:"#C780FF" }, // Purple pastel
      { fill:"#FFE5F0", stroke:"#FFB3D9", vein:"#FF80C7" }, // Rose pastel
      { fill:"#E5FFF0", stroke:"#B3FFD9", vein:"#80FFC7" }, // Mint pastel
      { fill:"#FFF0E5", stroke:"#FFD9B3", vein:"#FFC780" }, // Peach pastel
      { fill:"#FFE5CC", stroke:"#FFCC99", vein:"#FF9966" }, // Orange coral
      { fill:"#F0F8E5", stroke:"#D4E8B3", vein:"#B8D480" }, // Light lime
      { fill:"#E5F8FF", stroke:"#B3E8FF", vein:"#80D4FF" }, // Sky blue
      { fill:"#FFE5F8", stroke:"#FFB3E8", vein:"#FF80D4" }, // Magenta pink
      { fill:"#F8E5FF", stroke:"#E8B3FF", vein:"#D480FF" }, // Lavender
      { fill:"#E5FFE8", stroke:"#B3FFB8", vein:"#80FF90" }, // Spring green
      { fill:"#FFF8E5", stroke:"#FFE8B3", vein:"#FFD480" }, // Cream yellow
      { fill:"#E8E5FF", stroke:"#C7B3FF", vein:"#A680FF" }  // Periwinkle
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

  // ========= Storage =========
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

  // ========= Geometry =========
  function svgPoint(evt){
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const m = svg.getScreenCTM().inverse();
    return pt.matrixTransform(m);
  }
  function randomPositionInTree(){
    if (!branches.length) return { x: 276 + rand(-60,60), y: 330 + rand(-120,40), rotation: rand(-15,15) };
    const options = branches.map((path, i)=>({
      path, range: i<2 ? [0.2,0.8] : i<6 ? [0.15,0.85] : [0.3,0.7]
    }));
    const sel = options[Math.floor(Math.random()*options.length)];
    const len = sel.path.getTotalLength();
    const t   = rand(len*sel.range[0], len*sel.range[1]);
    const p   = sel.path.getPointAtLength(t);
    return { x: p.x + rand(-3,3), y: p.y + rand(-2,2), rotation: rand(-15,15) };
  }

  // ========= UI bits =========
  function updateCounter(){
    const c = leaves.querySelectorAll(".leaf").length;
    if (counter) counter.textContent = `${c} lá`;
  }
  function updateEmptyState(){
    const has = leaves.querySelectorAll(".leaf").length > 0;
    if (emptyState) emptyState.style.display = has ? "none" : "block";
    if (clearAll)   clearAll.style.display   = has ? "block" : "none";
  }

  // ========= Add/Edit modal =========
  function renderPreview(){
    if (!leafPreview) return;
    const { d } = pickLeafShape(leafShapeSel?.value);
    const { palette } = pickPalette(Number(leafPaletteSel?.value));
    const s = Number(leafScaleInp?.value || 1);
    const rot = Number(leafRotationInp?.value || 0);
    leafPreview.innerHTML = `
      <svg viewBox="-40 -40 80 80" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${rot}) scale(${s})">
          <path d="${d}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="1.6"></path>
          <path d="${getVeinForShape(d)}" fill="none" stroke="${palette.vein}" stroke-width="1"></path>
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

  // ========= Render leaf =========
  function addLeafFromData(data, animate=false){
    const position = data.position || randomPositionInTree();
    const rotation = Number.isFinite(data.rotation) ? data.rotation : position.rotation;
    const scale    = Number.isFinite(data.scale)    ? data.scale    : rand(0.9,1.2);

    const { palette, idx: paletteIdx } = pickPalette(data.paletteIdx);
    const { d: leafShape, key: shapeKey } = pickLeafShape(data.shapeKey);

    const g = mk("g", { class: "leaf" });
    g.dataset.id        = data.id;
    g.dataset.msg       = data.text || "";
    g.dataset.author    = data.author || "";
    g.dataset.position  = JSON.stringify(position);
    g.dataset.rotation  = String(rotation);
    g.dataset.scale     = String(scale);
    g.dataset.shapeKey  = shapeKey;
    g.dataset.paletteIdx= String(paletteIdx);
    g.dataset.ts        = String(data.ts || Date.now());

    // Transform SVG CHUẨN
    const baseTransform = `translate(${position.x} ${position.y}) rotate(${rotation}) scale(${scale})`;
    g.setAttribute("transform", baseTransform);

    const body = mk("path", { d: leafShape, fill: palette.fill, stroke: palette.stroke, "stroke-width":"1.6" });
    const vein = mk("path", { d: getVeinForShape(leafShape), fill:"none", stroke: palette.vein, "stroke-width":"1" });
    g.append(body, vein);
    leaves.appendChild(g);

    // Tooltip
    let tipTimeout;
    g.addEventListener("mouseenter", ()=> { clearTimeout(tipTimeout); tipTimeout = setTimeout(()=> showTipForLeaf(g), 150); });
    g.addEventListener("mouseleave", ()=> { clearTimeout(tipTimeout); hideTip(); });

    // Click view
    g.addEventListener("click", ()=>{
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
    });

    // Drag & drop (tắt khi ở click mode)
    g.classList.add("grab");
    g.addEventListener("pointerdown", (e)=>{
      if (!dragModeEnabled) return;  // Chỉ kéo được khi drag mode bật
      if (clickToPlaceMode) return;  // Không kéo khi đang ở click mode
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

  // ========= List item =========
  function renderListItem(data){
    // Hàm này không còn cần thiết vì đã remove leaf list
    // Chỉ giữ lại để tránh lỗi khi được gọi
    return;
  }

  // ========= Delete =========
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

  // ========= Global pointer handlers for drag =========
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

  // ========= Click-to-place =========
  svg?.addEventListener("click", (e)=>{
    if (!clickToPlaceMode) return;
    if (viewOnlyMode && viewOnlyMode.checked) return;
    if (e.target.closest && e.target.closest(".leaf")) return;
    const p = svgPoint(e);
    pendingPosition = { x:p.x, y:p.y, rotation:0 };
    openAddModal("", "", false, null);
  });

  // ========= Wiring toggleMode và dragMode =========
  if (toggleMode) {
    toggleMode.addEventListener("click", ()=>{
      // Không cho toggle nếu đang ở view only mode
      if (viewOnlyMode && viewOnlyMode.checked) return;
      
      clickToPlaceMode = !clickToPlaceMode;
      const icon = toggleMode.querySelector(".btn-icon");
      const text = toggleMode.querySelector(".btn-text");
      
      if (clickToPlaceMode) {
        stage?.classList.add("click-mode");
        icon && (icon.textContent = "🎯");
        text && (text.textContent = "Đang click để đặt");
      } else {
        stage?.classList.remove("click-mode");
        icon && (icon.textContent = "🖱️");
        text && (text.textContent = "Click để đặt");
      }
    });
  }

  if (dragMode) {
    dragMode.addEventListener("click", ()=>{
      // Không cho toggle nếu đang ở view only mode
      if (viewOnlyMode && viewOnlyMode.checked) return;
      
      dragModeEnabled = !dragModeEnabled;
      const icon = dragMode.querySelector(".btn-icon");
      const text = dragMode.querySelector(".btn-text");
      
      if (dragModeEnabled) {
        stage?.classList.add("drag-mode");
        icon && (icon.textContent = "🤏");
        text && (text.textContent = "Đang kéo thả");
      } else {
        stage?.classList.remove("drag-mode");
        icon && (icon.textContent = "✋");
        text && (text.textContent = "Kéo thả");
      }
    });
  }

  // ========= Form wiring =========
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
    const scale      = leafScaleInp ? Number(leafScaleInp.value) : undefined;
    const rotation   = leafRotationInp ? Number(leafRotationInp.value) : undefined;

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
  addBtn?.addEventListener("click", ()=>{
    // Không cho add nếu đang ở view only mode
    if (viewOnlyMode && viewOnlyMode.checked) return;
    
    pendingPosition = randomPositionInTree();
    openAddModal("", "", false, null);
  });

  // Toggle click/place mode
  if (toggleMode) {
    // khởi tạo trạng thái nút
    toggleMode.querySelector(".btn-icon")?.replaceChildren(document.createTextNode("🎯"));
    toggleMode.querySelector(".btn-text")?.replaceChildren(document.createTextNode("Click để đặt"));
    stage?.classList.add("click-mode");
  }

  // ========= Clear all =========
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

  // ========= Initial load =========
  // Realtime attach: chạy ngay nếu có FB, và attach lại nếu module đến sau
  function attachRealtime(){
    if (!hasFB()) return;
    fb().onValue(leavesRef(), (snap)=>{
      const data = snap.val();
      leaves.innerHTML = "";
      if (list) list.innerHTML = "";
      if (data){
        Object.values(data)
          .sort((a,b)=> (a.ts||0) - (b.ts||0))
          .forEach(d => addLeafFromData(d, false));
      }
      updateCounter(); updateEmptyState();
      try { localStorage.setItem(storeKey, JSON.stringify(Object.values(data||{}))); } catch {}
    }, console.error);
  }

  initializeTheme();
  optimizeListScroll();
  
  // Không set mode mặc định nữa - chỉ khi user bật
  
  if (hasFB()) {
    attachRealtime();
  } else {
    const existing = loadFromStorage();
    let migrated = false;
    existing.forEach(d=>{
      if (!d.position){ d.position = randomPositionInTree(); migrated = true; }
      addLeafFromData(d, false);
    });
    if (migrated) try { localStorage.setItem(storeKey, JSON.stringify(existing)); } catch {}
    updateCounter(); updateEmptyState();
  }
  
  window.addEventListener("firebase-ready", attachRealtime, { once:true });
})();
