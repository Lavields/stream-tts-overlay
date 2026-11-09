export function matchesSearch(text, query) {
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  return normalize(text).includes(normalize(query));
}

// Keep the original select as the value source for existing form/save handlers.
export function searchableSelect(select, placeholder) {
  const wrapper = document.createElement('div');
  wrapper.className = 'searchable-select';
  const input = document.createElement('input');
  input.id = select.id + '-search';
  input.type = 'search';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  const help = document.createElement('small');
  help.id = select.id + '-search-help';
  help.className = 'searchable-help';
  help.textContent = 'Escribe parte del nombre para filtrar.';
  input.setAttribute('aria-describedby', help.id);
  const list = document.createElement('div');
  list.id = select.id + '-results';
  list.className = 'searchable-options';
  list.setAttribute('role', 'listbox');
  list.setAttribute('popover', 'manual');
  list.hidden = true;
  input.setAttribute('aria-controls', list.id);
  const label = document.querySelector(`label[for="${select.id}"]`);
  if (label) label.htmlFor = input.id;
  select.before(wrapper);
  wrapper.append(input, help, list, select);
  select.hidden = true;
  select.classList.add('searchable-native');
  let query = '', active = -1, filtered = [];
  const sync = () => { input.value = select.selectedOptions[0]?.textContent || ''; };
  function position() {
    if (list.hidden) return;
    const rect = input.getBoundingClientRect();
    const dialog = input.closest('dialog');
    const dialogRect = dialog?.getBoundingClientRect();
    const footer = dialog?.querySelector('.dialog-actions')?.getBoundingClientRect();
    const lowerEdge = Math.min(innerHeight, dialogRect?.bottom ?? innerHeight,
      footer && footer.top > rect.bottom ? footer.top : innerHeight);
    const below = lowerEdge - rect.bottom - 12;
    const above = rect.top - Math.max(0, dialogRect?.top ?? 0) - 12;
    const down = below >= Math.min(220, above);
    const available = Math.max(80, Math.min(260, down ? below : above));
    list.style.position = 'fixed';
    list.style.inset = 'auto';
    list.style.left = Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8)) + 'px';
    list.style.width = rect.width + 'px';
    list.style.maxHeight = available + 'px';
    list.style.top = (down ? rect.bottom + 4 : Math.max(8, rect.top - Math.min(list.scrollHeight + 2, available) - 4)) + 'px';
  }
  function close() {
    if (list.hidePopover && list.matches(':popover-open')) list.hidePopover();
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    query = ''; active = -1; sync();
  }
  function highlight() {
    [...list.querySelectorAll('[role=option]')].forEach((button, i) => {
      button.classList.toggle('active', i === active);
    });
    const button = list.children[active];
    if (active >= 0 && button) {
      input.setAttribute('aria-activedescendant', button.id);
      button.scrollIntoView({block: 'nearest'});
    } else input.removeAttribute('aria-activedescendant');
  }
  function choose(index) {
    const option = filtered[index];
    if (!option) return;
    select.value = option.value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
    close();
  }
  function render() {
    filtered = [...select.options].filter(option => !option.disabled && matchesSearch(option.textContent, query));
    list.replaceChildren();
    filtered.forEach((option, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.tabIndex = -1;
      button.id = list.id + '-' + i;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.value === select.value));
      button.textContent = option.textContent;
      if (select.id === 'user-avatar') {
        const thumbnail = document.createElement('img');
        thumbnail.className = 'option-thumbnail'; thumbnail.alt = '';
        thumbnail.src = '/assets/avatars/' + encodeURIComponent(option.value) + '-thumb.png';
        button.prepend(thumbnail);
      }
      button.onpointerdown = event => event.preventDefault();
      button.onclick = () => choose(i);
      list.append(button);
    });
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'search-empty'; empty.setAttribute('role', 'status');
      empty.textContent = 'Sin resultados'; list.append(empty);
    }
    active = -1;
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (list.showPopover && !list.matches(':popover-open')) list.showPopover();
    position();
    highlight();
  }
  input.onfocus = () => { query = ''; input.select(); render(); };
  input.onclick = () => { if (list.hidden) { query = ''; input.select(); render(); } };
  input.oninput = () => { query = input.value; render(); };
  input.onblur = close;
  input.onkeydown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) render();
      if (filtered.length) active = active < 0
        ? (event.key === 'ArrowDown' ? 0 : filtered.length - 1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
      highlight();
    } else if (event.key === 'Enter') {
      if (!list.hidden) { event.preventDefault(); choose(active < 0 ? 0 : active); }
    } else if (event.key === 'Escape') {
      if (!list.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
    }
  };
  select.addEventListener('change', sync);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', event => { if (!list.contains(event.target)) position(); }, true);
  new MutationObserver(() => {
    if (document.activeElement === input && !list.hidden) render();
    else sync();
  }).observe(select, {childList: true, subtree: true, characterData: true});
  sync();
  return {sync: close};
}
