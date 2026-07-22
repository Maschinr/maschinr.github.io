// ===== Small DOM helpers, sheet/modal system, toast, scanner =====

/** Create an element. `el('div.foo#bar', {attrs}, [children])`. */
export function el(sel, props = {}, children = []) {
  const [tag, ...rest] = sel.split(/(?=[.#])/);
  const node = document.createElement(tag || 'div');
  for (const token of rest) {
    if (token[0] === '.') node.classList.add(token.slice(1));
    else if (token[0] === '#') node.id = token.slice(1);
  }
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'onclick' || k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && k !== 'list') { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const CHEVRON = '<span class="row-chevron"><svg viewBox="0 0 8 14"><path d="M1 1l6 6-6 6"/></svg></span>';

/** Build a chevron element (stroke-based). */
export function chevron() {
  const s = el('span.row-chevron');
  s.innerHTML = '<svg viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>';
  return s;
}

export function icon(name) {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    back: 'M15 19l-7-7 7-7',
    check: 'M4 12l5 5L20 6',
    x: 'M6 6l12 12M18 6L6 18',
  };
  const s = el('span');
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="${paths[name]}"/></svg>`;
  return s.firstChild;
}

export function section(header, group, footer) {
  return el('div.section', {}, [
    header ? el('h2.section-header', { text: header }) : null,
    group,
    footer ? el('div.section-footer', { text: footer }) : null,
  ]);
}

export function group(rows) {
  return el('div.group', {}, rows.filter(Boolean));
}

// ---- Sheet system ----
const host = () => document.getElementById('sheet-host');

export function openSheet({ title, body, onConfirm, confirmLabel, confirmEnabled = true, cancelLabel = 'Abbrechen', dismissable = true }) {
  const backdrop = el('div.sheet-backdrop');
  const confirmBtn = onConfirm
    ? el('button.btn', { text: confirmLabel || 'Fertig', disabled: !confirmEnabled })
    : null;

  const close = () => backdrop.remove();

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const ok = onConfirm();
      if (ok !== false) close();
    });
  }

  const cancelBtn = el('button.btn', { text: cancelLabel, onclick: close });

  const header = el('div.sheet-header', {}, [
    cancelBtn,
    el('h2', { text: title }),
    confirmBtn || el('span', { style: 'width:60px' }),
  ]);

  const sheet = el('div.sheet', {}, [header, el('div.sheet-body', {}, [body])]);
  backdrop.append(sheet);
  if (dismissable) {
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  }
  host().append(backdrop);
  // focus first input
  setTimeout(() => sheet.querySelector('input,textarea,select')?.focus(), 60);

  return { close, setConfirmEnabled: v => { if (confirmBtn) confirmBtn.disabled = !v; } };
}

export function confirmDialog({ title, message, confirmLabel = 'OK', destructive = false, onConfirm }) {
  const backdrop = el('div.sheet-backdrop');
  const close = () => backdrop.remove();
  const box = el('div.sheet', { style: 'max-width:340px;border-radius:16px;text-align:center;padding:20px 20px calc(20px + var(--safe-bottom))' }, [
    el('h2', { text: title, style: 'font-size:17px;margin:0 0 8px' }),
    message ? el('p.muted', { text: message, style: 'font-size:14px;margin:0 0 18px' }) : null,
    el('div', { style: 'display:flex;gap:10px' }, [
      el('button.btn', { text: 'Abbrechen', style: 'flex:1;background:color-mix(in srgb,var(--gray) 22%,transparent)', onclick: close }),
      el('button.btn', {
        text: confirmLabel,
        style: `flex:1;background:${destructive ? 'var(--danger)' : 'var(--tint)'};color:#fff`,
        onclick: () => { close(); onConfirm(); },
      }),
    ]),
  ]);
  backdrop.append(box);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  host().append(backdrop);
}

let toastTimer;
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const t = el('div.toast', { text: message });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

// ---- Date picker sheet ----
export function openDatePicker({ title, value, onPick, onClear }) {
  const input = el('input', { type: 'date', value: value ? value.slice(0, 10) : '' });
  const body = el('div.datepick', {}, [
    input,
    el('div', { style: 'margin-top:16px;text-align:center' },
      onClear ? [el('button.btn.destructive', { text: 'Datum entfernen', style: 'color:var(--danger)', onclick: () => { sheet.close(); onClear(); } })] : []),
  ]);
  const sheet = openSheet({
    title,
    body,
    confirmLabel: 'Fertig',
    onConfirm: () => { if (input.value) onPick(input.value); return true; },
  });
}

// ---- Camera barcode scanner ----
export async function openScanner({ title, initialValue = '', onResult }) {
  let stream = null;
  let raf = null;
  let detector = null;

  const manualInput = el('input', { type: 'text', value: initialValue, placeholder: 'Nummer eingeben', style: 'text-align:center;font-size:18px;padding:12px;background:var(--group-bg);border-radius:12px' });
  const videoWrap = el('div.scanner-wrap');
  const video = el('video', { autoplay: true, muted: true, playsInline: true });
  video.setAttribute('playsinline', '');
  videoWrap.append(video, el('div.scanner-frame'));
  const statusLine = el('p.muted.caption', { style: 'text-align:center;margin:10px 0 0' });

  const body = el('div.container', { style: 'padding-top:8px' }, [
    videoWrap,
    statusLine,
    el('div', { style: 'margin:20px 0 6px' }, [
      el('label.section-header', { text: 'Nummer' }),
      el('div.group', {}, [el('div.row', {}, [manualInput])]),
    ]),
  ]);

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(t => t.stop());
  };

  const finish = (value) => { stop(); onResult(value); };

  const sheet = openSheet({
    title,
    body,
    confirmLabel: 'Übernehmen',
    onConfirm: () => {
      const v = manualInput.value.trim();
      if (!v) return false;
      finish(v);
      return true;
    },
  });
  // Wrap close to also stop the camera on cancel/backdrop.
  const backdrop = document.querySelector('.sheet-backdrop:last-child');
  backdrop?.addEventListener('click', e => { if (e.target === backdrop) stop(); });
  backdrop?.querySelector('.sheet-header .btn')?.addEventListener('click', stop);

  // Try to start the camera + BarcodeDetector.
  if (!('BarcodeDetector' in window)) {
    statusLine.textContent = 'Barcode-Scanner wird von diesem Browser nicht unterstützt – bitte Nummer manuell eingeben.';
    videoWrap.classList.add('hidden');
    return;
  }
  try {
    detector = new window.BarcodeDetector();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    await video.play();
    statusLine.textContent = 'Code in den Rahmen halten …';
    const scan = async () => {
      if (!stream) return;
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length) {
          if (navigator.vibrate) navigator.vibrate(60);
          const value = codes[0].rawValue;
          sheet.close();
          finish(value);
          return;
        }
      } catch (e) { /* frame not ready */ }
      raf = requestAnimationFrame(scan);
    };
    raf = requestAnimationFrame(scan);
  } catch (e) {
    statusLine.textContent = 'Kein Kamerazugriff – bitte Nummer manuell eingeben.';
    videoWrap.classList.add('hidden');
  }
}
