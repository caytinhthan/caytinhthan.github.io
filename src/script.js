(() => {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (n,min,max)=> Math.max(min, Math.min(max, n));
  const rand  = (min,max)=> Math.random()*(max-min)+min;
  const uuid  = ()=> (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  
  // Remove module import - use inline fallback sanitization
  const sanitizeLeafMessage = (text) => String(text).replace(/[<>]/g, '').substring(0, 500);
  const sanitizeDisplayName = (name) => String(name).replace(/[<>]/g, '').substring(0, 50);
  const leafMessageLimiter = { check: () => true }; // Simple fallback
  const mk = (tag, attrs={}) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
    return el;
  };

  // DOM Elements
  const add = $("#add"), stage = $("#stage");
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
  let currentEditingId = null, pendingPosition = null, dragging = null;
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
    setTimeout(()=>{
      m.style.display = "none";
      document.body.style.overflow = "";
    }, 300);
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

  // Hình ảnh lá cây thật từ assets/leaves/
  function getLeafImagePath(shapeKey, paletteIdx) {
    // Mapping palette index to leaf image
    const leafImages = {
      0: 'leaf_money_gold_1.png',     // Tiền bạc → Lá vàng
      1: 'leaf_love_pink_1.png',      // Tình yêu → Lá hồng  
      2: 'leaf_study_green_1.png',    // Học tập → Lá xanh
      3: 'leaf_work_blue_1.png',      // Công việc → Lá xanh dương
      4: 'leaf_relation_purple_1.png', // Mối quan hệ → Lá tím
      5: 'leaf_other_red_1.png'       // Khác → Lá đỏ
    };
    
    // Fallback cho các shape keys mới
    const shapeToImage = {
      'money_gold': 'leaf_money_gold_1.png',
      'love_pink': 'leaf_love_pink_1.png', 
      'study_green': 'leaf_study_green_1.png',
      'work_blue': 'leaf_work_blue_1.png',
      'relation_purple': 'leaf_relation_purple_1.png',
      'other_red': 'leaf_other_red_1.png',
      'transition_yellow': 'leaf_transition_yellow.png',
      'dry_brown': 'leaf_dry_brown.png'
    };
    
    // Ưu tiên shape key, fallback về palette index
    let imageName = shapeToImage[shapeKey] || leafImages[paletteIdx] || 'leaf_money_gold_1.png';
    
    return `assets/leaves/${imageName}`;
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
    // Giữ lại để compatibility - bây giờ chỉ return key
    const validKeys = ['money_gold', 'love_pink', 'study_green', 'work_blue', 'relation_purple', 'other_red', 'transition_yellow', 'dry_brown'];
    const shapeKey = validKeys.includes(key) ? key : 'money_gold';
    return { key: shapeKey, d: '' }; // d không cần thiết nữa
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
      shapeKey: leaf?.dataset.shapeKey || "money_gold",
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
    // Fix: Sử dụng vùng tương đối với kích thước cây thay vì tìm branches không tồn tại
    const treeImg = document.getElementById('tree');
    if (!treeImg) {
      return { x: 400 + rand(-80,80), y: 300 + rand(-100,50), rotation: rand(-15,15) };
    }
    
    // Lấy kích thước thực của cây trên viewport
    const rect = treeImg.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    
    // Tính toán vị trí tương đối trong SVG (tỷ lệ với stage)
    const centerX = (rect.left + rect.width/2 - stageRect.left);
    const centerY = (rect.top + rect.height/2 - stageRect.top);
    
    // Tạo vùng đặt lá trong khu vực cây (70% chiều rộng, 60% chiều cao từ top)
    const leafZoneWidth = rect.width * 0.7;
    const leafZoneHeight = rect.height * 0.6;
    
    return { 
      x: centerX + rand(-leafZoneWidth/2, leafZoneWidth/2), 
      y: centerY - rect.height/4 + rand(-leafZoneHeight/2, leafZoneHeight/2), 
      rotation: rand(-15,15) 
    };
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
    if (previewImg && leafShapeSel?.value) {
      const paletteIdx = Number(leafPaletteSel?.value) || 0;
      const imagePath = getLeafImagePath(leafShapeSel.value, paletteIdx);
      if (imagePath) {
        previewImg.src = imagePath;
        previewImg.style.display = 'block';
      } else {
        previewImg.style.display = 'none';
      }
    }
    
    // Keep old SVG preview for compatibility if leafPreview element exists
    if (!leafPreview) return;
    const { d } = pickLeafShape(leafShapeSel?.value);
    const { palette } = pickPalette(Number(leafPaletteSel?.value));
    const s = clampScale(leafScaleInp?.value || 1);
    const rot = clampRot(leafRotationInp?.value || 0);
    
    // Use safe method to create SVG instead of innerHTML
    leafPreview.textContent = ''; // Clear content safely
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-40 -40 80 80');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `rotate(${rot}) scale(${s})`);
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', palette.fill);
    path.setAttribute('stroke', palette.stroke);
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    
    const veinPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    veinPath.setAttribute('d', getVeinForShape(d));
    veinPath.setAttribute('fill', 'none');
    veinPath.setAttribute('stroke', palette.vein);
    veinPath.setAttribute('stroke-width', '1');
    veinPath.setAttribute('vector-effect', 'non-scaling-stroke');
    
    g.appendChild(path);
    g.appendChild(veinPath);
    svg.appendChild(g);
    leafPreview.appendChild(svg);
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
    const { key: shapeKey } = pickLeafShape(data.shapeKey);

    // Tạo group container
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

    // Transform SVG với image
    const sc = clampScale(scale);
    const rot = clampRot(rotation);
    const baseTransform = `translate(${position.x} ${position.y}) rotate(${rot}) scale(${sc})`;
    g.setAttribute("transform", baseTransform);

    // Sử dụng ảnh thay vì SVG path
    const leafImagePath = getLeafImagePath(shapeKey, paletteIdx);
    const leafImage = mk("image", { 
      href: leafImagePath,
      x: "-25", // Center image
      y: "-25", 
      width: "50",
      height: "50",
      style: "filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));"
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
    const payload = getLeafDataFromDOM(id);
    dragging.classList.remove("grabbing");
    try { e && dragging.releasePointerCapture(e.pointerId); } catch {}
    dragging = null;
    
    if (hasFB()) fb().db.ref(`leaves/${id}`).set(payload).catch(console.error);
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
      if (hasFB()) fb().db.ref(`leaves/${currentEditingId}`).set(data).catch(console.error);
    } else {
      // Add new
      const pos = pendingPosition || randomPositionInTree();
      if (Number.isFinite(rotation)) pos.rotation = rotation;
      const data = { id: uuid(), text, author, ts: Date.now(), position: pos, shapeKey, paletteIdx, scale, rotation };
      addLeafFromData(data, true);
      if (hasFB()) {
        fb().db.ref(`leaves/${data.id}`).set(getLeafDataFromDOM(data.id)).catch(console.error);
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
      if (hasFB()) leavesRef().set(null).catch(console.error);
      updateCounter(); updateEmptyState();
    }, allLeaves.length*80 + 500);
  });

  // Khởi tạo ứng dụng

  
  // Realtime attach: chạy ngay nếu có FB, và attach lại nếu module đến sau
  function attachRealtime(){
    if (!hasFB()) {
      console.error("❌ Firebase not available in attachRealtime");
      return;
    }
    
    leavesRef().on('value', (snap)=>{
      const data = snap.val();
      
      // Clear existing leaves (SVG)
      if (leaves) leaves.innerHTML = "";
      allLeaves.length = 0;
      if (list) list.innerHTML = "";
      
      if (data && typeof data === 'object'){
        const leafData = Object.values(data);
        
        leafData
          .sort((a,b)=> (a.ts||0) - (b.ts||0))
          .forEach((d, index) => {
            addLeafFromData(d, false);
          });
          
      } else {
        console.warn("⚠️ No leaves data found in Firebase");
      }
      
      updateCounter(); 
      updateEmptyState();
      
      // Save to localStorage as backup
      try { 
        localStorage.setItem(storeKey, JSON.stringify(Object.values(data||{}))); 
      } catch (e) {
        console.error("💾 Failed to save to localStorage:", e);
      }
    }, (error) => {
      console.error("❌ Firebase realtime listener error:", error);
    });
  }

  // Theme initialization is handled in index.html
  optimizeListScroll();
  setupCanvas(); // Setup canvas for leaf rendering
  
  // khởi tạo mode
  setMode(Mode.VIEW);
  
  // Listen for firebase-ready event first
  window.addEventListener("firebase-ready", ()=>{
    if (hasFB()) {
      attachRealtime();
    }
  });
  
  // Always try Firebase first - no localStorage fallback
  if (hasFB()) {
    attachRealtime();
  } else {
    console.warn("⚠️ Firebase not available yet, waiting for firebase-ready event...");
  }
})();

// ===== STARS ANIMATION =====
// Remove debug logs and simplify