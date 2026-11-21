// Client-side content, shortcut, copy, and DevTools protection for deployed web sessions

const OVERLAY_ID = 'hls-security-lock-overlay';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'));
}

function showProtectionOverlay(active: boolean): void {
  if (typeof document === 'undefined') return;
  let overlay = document.getElementById(OVERLAY_ID);

  if (!active) {
    if (overlay) {
      overlay.remove();
    }
    if (document.body) {
      document.body.style.filter = '';
    }
    return;
  }

  if (overlay) return;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'alert');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'background:rgba(15,23,42,0.96)',
    'color:#f8fafc',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
    'text-align:center',
    'font-family:"Be Vietnam Pro",system-ui,sans-serif',
    'backdrop-filter:blur(12px)',
  ].join(';');

  const box = document.createElement('div');
  box.style.cssText = [
    'max-width:440px',
    'background:rgba(30,41,59,0.95)',
    'border:1px solid rgba(56,189,248,0.35)',
    'border-radius:20px',
    'padding:28px 24px',
    'box-shadow:0 25px 50px -12px rgba(0,0,0,0.6)',
  ].join(';');

  const title = document.createElement('h2');
  title.textContent = 'Nội dung trang web được bảo vệ';
  title.style.cssText = 'font-size:18px;font-weight:700;margin:0 0 10px;color:#38bdf8;';

  const desc = document.createElement('p');
  desc.textContent =
    'Trang web không cho phép mở công cụ kiểm tra (DevTools) hoặc sao chép mã nguồn. Vui lòng đóng công cụ kiểm tra để tiếp tục sử dụng.';
  desc.style.cssText = 'font-size:13px;line-height:1.6;margin:0;color:#cbd5e1;';

  box.appendChild(title);
  box.appendChild(desc);
  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);
}

export function initAntiCopyGuard(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const win = window as any;
  if (win.__hlsGuardInstalled) return;
  win.__hlsGuardInstalled = true;

  // 1. Block right-click context menu (View Source, Inspect, Save As)
  document.addEventListener(
    'contextmenu',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  // 2. Block text selection, copy, cut, and drag outside editable inputs
  document.addEventListener(
    'selectstart',
    (e) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
      }
    },
    true
  );

  document.addEventListener(
    'copy',
    (e) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.clipboardData) {
          e.clipboardData.setData('text/plain', '');
        }
      }
    },
    true
  );

  document.addEventListener(
    'cut',
    (e) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  document.addEventListener(
    'dragstart',
    (e) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
      }
    },
    true
  );

  // 3. Block DevTools, View Source, Save Page, Print, and Copy keyboard shortcuts
  document.addEventListener(
    'keydown',
    (e) => {
      const key = (e.key || '').toLowerCase();
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      const inEditable = isEditableTarget(e.target);

      // F12 (DevTools)
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Ctrl+Shift+I / J / C / K / E or Cmd+Option+I / J / C / U
      if (
        (ctrlOrMeta && e.shiftKey && ['i', 'j', 'c', 'k', 'e'].includes(key)) ||
        (e.metaKey && e.altKey && ['i', 'j', 'c', 'u', 's'].includes(key))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Ctrl/Cmd + U (View Source), Ctrl/Cmd + S (Save Page), Ctrl/Cmd + P (Print)
      if (ctrlOrMeta && ['u', 's', 'p'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Ctrl/Cmd + C / X / A outside editable inputs
      if (ctrlOrMeta && !inEditable && ['c', 'x', 'a'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  // 4. Production-only (Vercel) DevTools & Console hardening
  const isProductionBuild =
    typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.PROD);

  if (isProductionBuild) {
    // Silence console output to avoid leaking runtime state
    const noop = () => {};
    try {
      console.log = noop;
      console.info = noop;
      console.debug = noop;
      console.warn = noop;
    } catch {}

    // Detect docked or open DevTools via viewport/chrome size differential
    const checkDevTools = () => {
      try {
        const widthDiff = Math.abs(window.outerWidth - window.innerWidth);
        const heightDiff = Math.abs(window.outerHeight - window.innerHeight);
        // Only treat large non-mobile top-level viewport gaps as docked DevTools
        const isTopLevel = window.self === window.top;
        const isDesktop = window.screen?.width >= 768;
        const devToolsOpen =
          isTopLevel && isDesktop && (widthDiff > 220 || heightDiff > 220);
        showProtectionOverlay(devToolsOpen);
      } catch {}
    };

    window.addEventListener('resize', checkDevTools, { passive: true });
    window.setInterval(checkDevTools, 1200);
    checkDevTools();
  }
}
