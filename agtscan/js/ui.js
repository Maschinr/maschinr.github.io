// Small DOM + formatting helpers.

/** Create an element from a tag, props and children. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== 'list') {
      try { node[key] = value; } catch { node.setAttribute(key, value); }
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Element with innerHTML (for icon strings). */
export function iconEl(svgString, className = '') {
  const span = document.createElement('span');
  span.className = className;
  span.style.display = 'inline-flex';
  span.innerHTML = svgString;
  return span;
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateFmtShort = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const dateFmtLong = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });

export function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return '';
  return dateFmt.format(d);
}
export function formatDateShort(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return '';
  return dateFmtShort.format(d);
}
export function formatDateLong(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return '';
  return dateFmtLong.format(d);
}

/** yyyy-mm-dd for <input type=date>, in local time. */
export function toDateInput(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
export function fromDateInput(str) {
  if (!str) return null;
  // Interpret as local midday to avoid TZ day-shifts.
  return new Date(str + 'T12:00:00').toISOString();
}

let toastRoot;
export function toast(message) {
  toastRoot = toastRoot || document.getElementById('toast-root');
  const t = el('div', { class: 'toast' }, message);
  toastRoot.append(t);
  setTimeout(() => t.remove(), 3400);
}

/**
 * Open a modal. `build(close)` returns the modal content node.
 * Returns a close() function.
 */
export function openModal(build, { onClose } = {}) {
  const root = document.getElementById('modal-root');
  const scrim = el('div', { class: 'scrim' });
  const close = () => {
    scrim.remove();
    document.removeEventListener('keydown', onKey);
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', onKey);
  const content = build(close);
  scrim.append(content);
  root.append(scrim);
  // Focus first input if present.
  setTimeout(() => {
    const inp = content.querySelector('input, textarea, button.btn--primary');
    inp && inp.focus && inp.focus();
  }, 60);
  return close;
}

/** Confirmation dialog. Resolves true/false. */
export function confirmDialog({ title, message, confirmLabel = 'Bestätigen', danger = false }) {
  return new Promise((resolve) => {
    openModal((close) => {
      const modal = el('div', { class: 'modal' });
      modal.append(
        el('div', { class: 'modal__head' }, el('div', { class: 'modal__title' }, title)),
        el('div', { class: 'modal__body' }, el('p', { style: 'color:var(--text-2);line-height:1.5' }, message)),
        el('div', { class: 'modal__foot' },
          el('button', { class: 'btn btn--ghost', onclick: () => { close(); resolve(false); } }, 'Abbrechen'),
          el('button', {
            class: 'btn ' + (danger ? 'btn--primary' : 'btn--primary'),
            style: danger ? 'background:var(--red)' : '',
            onclick: () => { close(); resolve(true); },
          }, confirmLabel),
        ),
      );
      return modal;
    }, { onClose: () => resolve(false) });
  });
}
