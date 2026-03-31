async function hub() {
  renderPage(`
    <div class="page-title">Team <span>Hub</span></div>
    <div class="tabs">
      <button class="tab active" id="tab-notes">Notes</button>
      <button class="tab" id="tab-new">+ New</button>
      <button class="tab" id="tab-checks">Checklists</button>
    </div>
    <div id="hub-content"></div>`);
  document.getElementById('tab-notes').addEventListener('click',  () => { setActiveTab('tab-notes');  renderHubNotes(); });
  document.getElementById('tab-new').addEventListener('click',    () => { setActiveTab('tab-new');    renderNewNote(); });
  document.getElementById('tab-checks').addEventListener('click', () => { setActiveTab('tab-checks'); renderChecklists(); });
  renderHubNotes();
}

async function renderHubNotes() {
  document.getElementById('hub-content').innerHTML = '<div class="loading">Loading</div>';
  let notes; try { notes = await API.getHubNotes(); } catch(e) { notes = []; }
  if (!notes.length) {
    document.getElementById('hub-content').innerHTML = `<div class="empty-state"><div class="empty-icon">⊞</div><div>No notes yet.</div><div style="margin-top:.5rem">Tap "+ New" to add one.</div></div>`;
    return;
  }
  document.getElementById('hub-content').innerHTML = notes.map(n=>`
    <div class="hub-note ${n.pinned?'pinned':''}">
      <div class="hub-note-header">
        <span class="hub-note-title">${n.pinned?'📌 ':''}${n.title}</span>
        <span class="hub-note-cat ${n.category}">${n.category}</span>
      </div>
      <div class="hub-note-content">${n.content}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.5rem">
        <span class="hub-note-meta">${n.author} · ${new Date(n.created_at).toLocaleDateString()}</span>
        <button class="btn btn-sm" style="color:var(--red);padding:0 .3rem" data-del="${n.id}">✕</button>
      </div>
    </div>`).join('');
  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => { await API.deleteHubNote(btn.dataset.del).catch(()=>{}); showToast('Deleted'); renderHubNotes(); });
  });
}

function renderNewNote() {
  document.getElementById('hub-content').innerHTML = `
    <div class="card">
      <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="hub-title" placeholder="Note title…"/></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Author</label><input class="form-input" id="hub-author" value="${localStorage.getItem('hub_author')||''}" placeholder="Your name…"/></div>
        <div class="form-group"><label class="form-label">Category</label>
          <select class="form-select" id="hub-cat">
            <option value="general">General</option>
            <option value="strategy">Strategy</option>
            <option value="checklist">Checklist</option>
            <option value="announcement">Announcement</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Content</label><textarea class="form-textarea" id="hub-body" style="min-height:140px" placeholder="Write your note here…"></textarea></div>
      <div class="form-group" style="display:flex;align-items:center;gap:.75rem">
        <input type="checkbox" id="hub-pin" style="width:18px;height:18px;cursor:pointer;accent-color:var(--accent)"/>
        <label for="hub-pin" class="form-label" style="margin:0;cursor:pointer">Pin to top</label>
      </div>
      <button class="btn btn-primary btn-block" id="hub-submit">Save Note</button>
    </div>`;
  document.getElementById('hub-submit').addEventListener('click', async () => {
    const title  = document.getElementById('hub-title').value.trim();
    const author = document.getElementById('hub-author').value.trim() || 'Anonymous';
    const body   = document.getElementById('hub-body').value.trim();
    if (!title||!body) { showToast('Fill in title and content'); return; }
    localStorage.setItem('hub_author', author);
    try {
      await API.addHubNote({ title, author, content:body, category:document.getElementById('hub-cat').value, pinned:document.getElementById('hub-pin').checked });
      showToast('Note saved! ✓');
      setActiveTab('tab-notes');
      renderHubNotes();
    } catch(e) { showToast('Failed to save'); }
  });
}

async function renderChecklists() {
  document.getElementById('hub-content').innerHTML = '<div class="loading">Loading</div>';
  let custom; try { custom = await API.getChecklists(); } catch(e) { custom = []; }

  const defaults = [
    { id:'pre-match', name:'Pre-Match Checklist', items:['Battery fully charged and secured','All cables zip-tied','Robot config set correctly','Phone connected, DS app running','All motors and servos move correctly','Autonomous program selected','Alliance station confirmed','Starting position confirmed'] },
    { id:'pit',       name:'Pit Checklist',       items:['Spare batteries on charger','Tools organized','Backup phone/tablet ready','Repair parts accessible','Match schedule visible','Team roles assigned'] },
    { id:'inspection',name:'Robot Inspection',    items:['Robot weight under 42 lbs','Fits in 18"×18"×18" cube','All motors are FTC-legal','Battery connector correct','REV Hub firmware updated','No sharp edges'] },
  ];

  const allLists = [...defaults, ...custom.map(c=>({...c, id:'db-'+c.id}))];

  const getChecked = id => { try { return JSON.parse(localStorage.getItem('cl_'+id)||'[]'); } catch { return []; } };
  const setChecked = (id,arr) => localStorage.setItem('cl_'+id, JSON.stringify(arr));

  function render() {
    const html = allLists.map(cl => {
      const checked  = getChecked(cl.id);
      const progress = cl.items.length ? Math.round(checked.length/cl.items.length*100) : 0;
      const items = cl.items.map((item,i)=>`
        <div style="display:flex;align-items:center;gap:.65rem;padding:.5rem 0;border-bottom:1px solid var(--border)">
          <input type="checkbox" class="cl-check" data-list="${cl.id}" data-idx="${i}"
            style="width:18px;height:18px;cursor:pointer;accent-color:var(--accent);flex-shrink:0" ${checked.includes(i)?'checked':''}/>
          <span style="font-size:.83rem;${checked.includes(i)?'color:var(--text3);text-decoration:line-through':''}">${item}</span>
        </div>`).join('');
      return `
        <div class="card">
          <div class="card-header">
            <span class="card-title">${cl.name}</span>
            <span style="font-size:.7rem;font-family:var(--mono);color:${progress===100?'var(--green)':'var(--text2)'}">${checked.length}/${cl.items.length}</span>
          </div>
          <div style="height:3px;background:var(--bg3);border-radius:2px;margin-bottom:.75rem">
            <div style="height:100%;width:${progress}%;background:var(--accent);border-radius:2px;transition:width .3s"></div>
          </div>
          ${items}
          <button class="btn btn-secondary btn-sm" style="margin-top:.75rem;width:100%" data-reset="${cl.id}">Reset</button>
        </div>`;
    }).join('') + `<button class="btn btn-secondary btn-block" id="add-cl-btn" style="margin-top:.5rem">+ Custom Checklist</button>`;

    document.getElementById('hub-content').innerHTML = html;

    document.querySelectorAll('.cl-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const id=cb.dataset.list, idx=parseInt(cb.dataset.idx);
        let arr=getChecked(id);
        if (cb.checked) { if(!arr.includes(idx)) arr.push(idx); } else { arr=arr.filter(i=>i!==idx); }
        setChecked(id,arr); render();
      });
    });
    document.querySelectorAll('[data-reset]').forEach(btn => {
      btn.addEventListener('click', () => { localStorage.removeItem('cl_'+btn.dataset.reset); render(); });
    });
    document.getElementById('add-cl-btn')?.addEventListener('click', showAddChecklist);
  }
  render();
}

function showAddChecklist() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop" id="cl-back"></div>
    <div class="modal-sheet">
      <div class="modal-header"><span class="modal-title">New Checklist</span><button class="modal-close" id="cl-close">✕</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="cl-name" placeholder="e.g. Post-Match Checklist"/></div>
        <div class="form-group"><label class="form-label">Category</label>
          <select class="form-select" id="cl-cat">
            <option value="pre-match">Pre-Match</option><option value="pit">Pit</option>
            <option value="inspection">Inspection</option><option value="general">General</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Items (one per line)</label><textarea class="form-textarea" id="cl-items" style="min-height:160px" placeholder="Check battery&#10;Check motors&#10;Check cables"></textarea></div>
        <button class="btn btn-primary btn-block" id="cl-save">Save Checklist</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('cl-back').addEventListener('click',  ()=>modal.remove());
  document.getElementById('cl-close').addEventListener('click', ()=>modal.remove());
  document.getElementById('cl-save').addEventListener('click', async () => {
    const name  = document.getElementById('cl-name').value.trim();
    const items = document.getElementById('cl-items').value.split('\n').map(l=>l.trim()).filter(Boolean);
    if (!name||!items.length) { showToast('Fill in name and items'); return; }
    await API.addChecklist({name, category:document.getElementById('cl-cat').value, items}).catch(()=>{});
    showToast('Checklist saved!');
    modal.remove();
    renderChecklists();
  });
}
