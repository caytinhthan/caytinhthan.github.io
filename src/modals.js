// Shared modal injector and wiring for terms/privacy modals
(function(){
  function openModal(id){
    const m = document.getElementById(id);
    if (!m) return;
    m.style.display = 'flex';
    m.classList.add('show');
    try { document.body.style.overflow = 'hidden'; } catch(e){}
  }

  function closeModal(id){
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('show');
    setTimeout(()=>{
      try{ m.style.display = 'none'; document.body.style.overflow = 'auto'; }catch(e){}
    }, 200);
  }

  function createIfMissing(id, html){
    if (document.getElementById(id)) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    // append children to body
    while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);
  }

  function ensureSharedModals(){
    // Terms modal (lightweight copy)
    createIfMissing('termsModal', `
      <div class="modal" id="termsModal" role="dialog" aria-modal="true" aria-labelledby="termsModalHeading" style="display:none">
        <div class="sheet" style="max-width:820px; width:96%; max-height:84vh; overflow:auto; padding:18px; box-sizing:border-box;">
          <button class="x" id="closeTermsModal" aria-label="Đóng điều khoản">✕</button>
          <h3 id="termsModalHeading">📜 Điều Khoản Sử Dụng — Cây Tinh Thần</h3>
          <div class="help-content" style="line-height:1.55; color:var(--ink);">
            <section style="margin-top:8px;"><h4>Lời Mở Đầu</h4><p>Chào mừng bạn đến với Cây Tinh Thần — một không gian để chia sẻ lời động viên và lan tỏa yêu thương. Việc sử dụng dịch vụ đồng nghĩa bạn đã đọc và đồng ý với điều khoản.</p></section>
            <section style="margin-top:12px;"><h4>Chuẩn mực cộng đồng</h4><p>Gieo hạt tích cực, tôn trọng sự khác biệt và không đăng tải thông tin cá nhân của người khác.</p></section>
            <section style="margin-top:12px;font-size:13px;color:var(--muted);"><p>Phiên bản điều khoản: v1 • Ngày hiệu lực: 2025-10-25</p></section>
          </div>
        </div>
      </div>
    `);

    // Privacy modal (short placeholder)
    createIfMissing('privacyModal', `
      <div class="modal" id="privacyModal" role="dialog" aria-modal="true" style="display:none">
        <div class="sheet" style="max-width:640px; width:92%; max-height:80vh; overflow:auto; padding:18px; box-sizing:border-box;">
          <button class="x" id="closePrivacyModal" aria-label="Đóng chính sách">✕</button>
          <h3>🔒 Chính Sách Bảo Mật</h3>
          <div style="line-height:1.5;color:var(--text-secondary);">
            <p>Chúng tôi chỉ thu thập những thông tin cần thiết để vận hành dịch vụ. Nội dung bạn gửi lên Cây Tinh Thần sẽ được hiển thị công khai; chúng tôi không chia sẻ dữ liệu cá nhân cho bên thứ ba mà không có sự đồng ý của bạn.</p>
            <p>Phiên bản đầy đủ sẽ được cập nhật sớm.</p>
          </div>
        </div>
      </div>
    `);

    // Wire open links if present (by id or data attribute)
    document.querySelectorAll('#openTermsLink, [data-open-terms]').forEach(el=>{
      if (el._sharedModalsBound) return; el._sharedModalsBound = true;
      el.addEventListener('click', (e)=>{ e.preventDefault(); openModal('termsModal'); });
    });
    document.querySelectorAll('#openPrivacyLink, [data-open-privacy]').forEach(el=>{
      if (el._sharedModalsBound) return; el._sharedModalsBound = true;
      el.addEventListener('click', (e)=>{ e.preventDefault(); openModal('privacyModal'); });
    });

    // Also expose data-open-* attributes for other triggers

    // Close handlers: buttons and backdrop clicks
    document.addEventListener('click', function(ev){
      // close buttons
      if (ev.target && ev.target.id === 'closeTermsModal') closeModal('termsModal');
      if (ev.target && ev.target.id === 'closePrivacyModal') closeModal('privacyModal');

      // backdrop click
      if (ev.target && ev.target.id === 'termsModal') closeModal('termsModal');
      if (ev.target && ev.target.id === 'privacyModal') closeModal('privacyModal');
    });
  }

  // Export globally
  window.ensureSharedModals = ensureSharedModals;
})();