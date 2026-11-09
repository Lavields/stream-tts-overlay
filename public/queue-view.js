// Reuse rows and their DOM state. Message IDs identify immutable chat entries.
export function createQueueView(container, createRow, emptyHTML) {
  const rows = new Map();
  return messages => {
    const wanted = new Set(messages.map(m => m.id));
    for (const [id, row] of rows) if (!wanted.has(id)) { row.remove(); rows.delete(id); }
    if (!messages.length) {
      if (!container.querySelector('.empty-state')) container.innerHTML = emptyHTML;
      return;
    }
    container.querySelector('.empty-state')?.remove();
    let cursor = container.firstElementChild;
    for (const message of messages) {
      let row = rows.get(message.id);
      if (!row) { row = createRow(message); rows.set(message.id, row); }
      if (row === cursor) cursor = cursor.nextElementSibling;
      else container.insertBefore(row, cursor);
    }
  };
}
