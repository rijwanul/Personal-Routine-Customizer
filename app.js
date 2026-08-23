/* =========================================================================
   Personal Routine Customizer — app.js
   All data lives in localStorage (offline-first). No backend, no accounts.
   ========================================================================= */

const STORAGE_KEY = 'routineCustomizer.v1';

/* ---------- Default field schema ---------- */
/* key: internal id (do not rename after data exists)
   label: user-visible label (editable)
   type: 'text' | 'tel' | 'textarea'
   enabled: whether shown in course editor / bank / cards
   core: if true, cannot be disabled (keeps app usable) */
const DEFAULT_FIELDS = [
  { key: 'courseName',     label: 'Course Name',            type: 'text',     enabled: true, core: true  },
  { key: 'courseCode',     label: 'Course Code',            type: 'text',     enabled: true, core: false },
  { key: 'teacherName',    label: 'Teacher Name',           type: 'text',     enabled: true, core: false },
  { key: 'teacherShort',   label: 'Teacher Shortcode',      type: 'text',     enabled: true, core: false },
  { key: 'teacherMobile',  label: 'Teacher Mobile Number',  type: 'tel',      enabled: true, core: false },
  { key: 'section',        label: 'Section',                type: 'text',     enabled: true, core: false },
  { key: 'sectionNote',    label: 'Section Note',           type: 'textarea', enabled: false, core: false },
  { key: 'crName',         label: 'CR Name',                type: 'text',     enabled: true, core: false },
  { key: 'crMobile',       label: 'CR Phone Number',        type: 'tel',      enabled: true, core: false },
  { key: 'courseNote',     label: 'Note',                   type: 'textarea', enabled: true, core: false },
];

const DEFAULT_DAYS = ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'].map((d,i)=>({
  id: 'd'+i, label: d, enabled: true
}));

const DEFAULT_TIMES = [
  ['8:00am','8:50am'],['8:50am','9:40am'],['9:40am','10:30am'],
  ['10:40am','11:30am'],['11:30am','12:20pm'],['12:20pm','1:10pm'],
  ['2:00pm','2:50pm'],['2:50pm','3:40pm']
].map((t,i)=>({ id:'t'+i, start:t[0], end:t[1] }));

const COURSE_PALETTE = [
  '#4C5FD5','#D9A441','#7CA982','#C4593F','#8B6BC7',
  '#3E8C9E','#B5548C','#5E8B4C','#C77B3C','#4A6FA5'
];

function uid(prefix='id'){
  return prefix + '_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
}

function defaultState(){
  return {
    version: 1,
    routineName: 'Untitled routine',
    accent: '#4C5FD5',
    density: 'comfortable',
    days: JSON.parse(JSON.stringify(DEFAULT_DAYS)),
    times: JSON.parse(JSON.stringify(DEFAULT_TIMES)),
    fields: JSON.parse(JSON.stringify(DEFAULT_FIELDS)),
    courses: [],        // {id, color, [fieldKey]: value, ...}
    placements: [],      // {id, courseId, dayId, timeId, room, note}
    features: {
      rightClickDelete: true,
      confirmBeforeDelete: true
    }
  };
}

/* ---------- State + persistence ---------- */
let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // shallow-merge with defaults to survive schema additions
    const base = defaultState();
    const merged = Object.assign(base, parsed);
    // features is a nested object — merge its keys individually so an
    // older/partial saved 'features' object doesn't drop newly-added flags
    merged.features = Object.assign({}, base.features, parsed.features || {});
    return merged;
  }catch(e){
    console.warn('Failed to load saved routine, starting fresh.', e);
    return defaultState();
  }
}

let saveTimer = null;
function saveState(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){
      console.error('Save failed', e);
      showToast('Could not save — storage may be full.', 'error');
    }
  }, 150);
}

/* ---------- Small helpers ---------- */
function fieldByKey(key){ return state.fields.find(f=>f.key===key); }
function enabledFields(){ return state.fields.filter(f=>f.enabled); }
function courseById(id){ return state.courses.find(c=>c.id===id); }
function dayById(id){ return state.days.find(d=>d.id===id); }
function timeById(id){ return state.times.find(t=>t.id===id); }

function escapeHtml(str){
  if(str===undefined || str===null) return '';
  return String(str).replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function showToast(msg, kind='ok'){
  const t = document.getElementById('toast');
  t.innerHTML = `<i data-lucide="${kind==='error'?'alert-circle':'check-circle'}"></i> ${escapeHtml(msg)}`;
  t.hidden = false;
  if(window.lucide) lucide.createIcons();
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>{ t.hidden = true; }, 2600);
}

function courseTitle(course){
  const nameField = 'courseName';
  return (course[nameField] && course[nameField].trim()) || course.courseCode || 'Untitled course';
}

/* =========================================================================
   GRID RENDERING
   ========================================================================= */

function applyAppearance(){
  document.documentElement.style.setProperty('--accent', state.accent || '#4C5FD5');
  document.body.dataset.density = state.density || 'comfortable';
  document.getElementById('routineSubtitle').textContent = state.routineName || 'Untitled routine';
  const titleEl = document.getElementById('gridTitleInline');
  if(document.activeElement !== titleEl) titleEl.textContent = state.routineName || 'Untitled routine';
  document.title = (state.routineName || 'Personal Routine Customizer') + ' — Routine Customizer';
}

function activeDays(){ return state.days.filter(d=>d.enabled); }

function renderGrid(){
  const grid = document.getElementById('routineGrid');
  const days = activeDays();
  const times = state.times;

  grid.style.gridTemplateColumns = `var(--time-col-w) repeat(${days.length}, var(--day-col-w))`;
  grid.style.gridTemplateRows = `auto repeat(${times.length}, minmax(var(--row-h), auto))`;
  grid.innerHTML = '';

  // corner
  const corner = document.createElement('div');
  corner.className = 'g-cell g-corner';
  corner.innerHTML = '<i data-lucide="clock"></i>';
  grid.appendChild(corner);

  // day headers
  days.forEach(day=>{
    const h = document.createElement('div');
    h.className = 'g-cell g-day-head';
    h.innerHTML = `${escapeHtml(day.label)}`;
    grid.appendChild(h);
  });

  // rows
  times.forEach(time=>{
    const th = document.createElement('div');
    th.className = 'g-cell g-time-head';
    th.textContent = `${time.start} – ${time.end}`;
    grid.appendChild(th);

    days.forEach(day=>{
      const slot = document.createElement('div');
      slot.className = 'g-cell g-slot';
      slot.dataset.dayId = day.id;
      slot.dataset.timeId = time.id;
      attachSlotDnD(slot);

      const placements = state.placements.filter(p=>p.dayId===day.id && p.timeId===time.id);
      placements.forEach(p=>{
        const course = courseById(p.courseId);
        if(!course) return;
        slot.appendChild(buildCourseCard(course, p));
      });

      grid.appendChild(slot);
    });
  });

  if(window.lucide) lucide.createIcons();
}

function buildCourseCard(course, placement){
  // Use a <div> (not <button>) as the drag source: some Chromium-based
  // browsers (including Edge) do not reliably initiate native HTML5 drag
  // gestures on <button draggable> elements, because the button's built-in
  // press/active-state handling can swallow the drag before it starts.
  // role="button" + tabindex + keydown below preserve click/keyboard behavior.
  const card = document.createElement('div');
  card.className = 'course-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.style.background = hexToSoft(course.color);
  card.style.borderColor = course.color;
  card.style.color = shadeForText(course.color);
  card.draggable = true;
  card.dataset.placementId = placement.id;

  const name = courseTitle(course);
  const sub = [course.courseCode, course.teacherShort || course.teacherName].filter(Boolean).join(' · ');

  let rowsHtml = '';
  if(placement.room){
    rowsHtml += `<div class="course-card__row"><i data-lucide="map-pin"></i><span>${escapeHtml(placement.room)}</span></div>`;
  }
  if(course.section && fieldByKey('section')?.enabled){
    // shown as badge instead of row
  }

  card.innerHTML = `
    ${course.section && fieldByKey('section')?.enabled ? `<span class="course-card__section">${escapeHtml(course.section)}</span>` : ''}
    <div class="course-card__name">${escapeHtml(name)}</div>
    ${sub ? `<div class="course-card__sub">${escapeHtml(sub)}</div>` : ''}
    ${rowsHtml}
  `;

  card.addEventListener('click', ()=> openCardDetail(course, placement));
  card.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openCardDetail(course, placement); }
  });
  card.addEventListener('contextmenu', (e)=>{
    e.preventDefault();
    if(!state.features?.rightClickDelete) return;
    if(state.features?.confirmBeforeDelete && !confirm(`Remove ${courseTitle(course)} from this slot?`)) return;
    removePlacementById(placement.id);
  });
  card.addEventListener('dragstart', (e)=>{
    e.dataTransfer.setData('text/plain', JSON.stringify({ type:'move-placement', placementId: placement.id }));
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', ()=> card.classList.remove('dragging'));

  return card;
}

function hexToSoft(hex){
  // lighten a hex color for card background
  try{
    const {r,g,b} = hexToRgb(hex);
    const mix = (c)=> Math.round(c + (255-c)*0.82);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  }catch(e){ return '#EEE'; }
}
function shadeForText(hex){
  try{
    const {r,g,b} = hexToRgb(hex);
    const mix = (c)=> Math.round(c*0.55);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  }catch(e){ return '#1F2937'; }
}
function hexToRgb(hex){
  hex = hex.replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const num = parseInt(hex,16);
  return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
}

/* ---------- Drag & drop: dropping a course from the bank, or moving an existing card ---------- */
function attachSlotDnD(slot){
  // Use e.target.closest('.g-slot') throughout so the handlers still fire
  // correctly when the drag hovers/drops over a child (e.g. an existing
  // course-card sitting inside the slot) instead of the slot div itself.
  slot.addEventListener('dragover', (e)=>{
    const target = e.target.closest('.g-slot');
    if(!target) return;
    e.preventDefault();
    // Match dropEffect to whatever effectAllowed was set at dragstart
    // ('move' for repositioning an existing card, 'copy' for a bank course).
    // Chromium/Edge can silently reject the drop if dropEffect doesn't fit
    // within effectAllowed, even though dragover/hover feedback still shows.
    e.dataTransfer.dropEffect = (e.dataTransfer.effectAllowed === 'move') ? 'move' : 'copy';
    target.classList.add('is-dragover');
  });
  slot.addEventListener('dragleave', (e)=>{
    const target = e.target.closest('.g-slot');
    if(!target) return;
    // Only clear the highlight once the pointer has actually left the slot
    // (not just moved onto a child element inside it).
    if(e.relatedTarget && target.contains(e.relatedTarget)) return;
    target.classList.remove('is-dragover');
  });
  slot.addEventListener('drop', (e)=>{
    const target = e.target.closest('.g-slot');
    if(!target) return;
    e.preventDefault();
    target.classList.remove('is-dragover');
    let payload;
    try{ payload = JSON.parse(e.dataTransfer.getData('text/plain')); }catch(err){ return; }
    if(!payload) return;

    const dayId = target.dataset.dayId, timeId = target.dataset.timeId;

    if(payload.type === 'bank-course'){
      state.placements.push({ id: uid('pl'), courseId: payload.courseId, dayId, timeId, room:'', note:'' });
      saveState();
      renderGrid();
      showToast('Added to grid.');
    } else if(payload.type === 'move-placement'){
      const p = state.placements.find(pl=>pl.id===payload.placementId);
      if(p){ p.dayId = dayId; p.timeId = timeId; saveState(); renderGrid(); }
    }
  });
}

/* =========================================================================
   COURSE BANK
   ========================================================================= */

function renderBank(){
  const list = document.getElementById('bankList');
  list.innerHTML = '';
  state.courses.forEach(course=>{
    const chip = document.createElement('div');
    chip.className = 'course-chip';
    chip.style.borderLeftColor = course.color;
    chip.draggable = true;
    chip.dataset.courseId = course.id;

    const metaBits = [];
    if(course.teacherName || course.teacherShort) metaBits.push(course.teacherShort || course.teacherName);
    if(course.section && fieldByKey('section')?.enabled) metaBits.push('Sec ' + course.section);

    chip.innerHTML = `
      <button class="course-chip__edit" title="Edit course" aria-label="Edit course"><i data-lucide="pencil"></i></button>
      <div class="course-chip__name">${escapeHtml(courseTitle(course))}</div>
      ${course.courseCode ? `<div class="course-chip__code">${escapeHtml(course.courseCode)}</div>` : ''}
      ${metaBits.length ? `<div class="course-chip__meta"><span>${metaBits.map(escapeHtml).join(' · ')}</span></div>` : ''}
    `;

    chip.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', JSON.stringify({ type:'bank-course', courseId: course.id }));
      e.dataTransfer.effectAllowed = 'copy';
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', ()=> chip.classList.remove('dragging'));
    chip.querySelector('.course-chip__edit').addEventListener('click', (e)=>{
      e.stopPropagation();
      openCourseEditor(course.id);
    });
    chip.addEventListener('click', ()=> openCourseEditor(course.id));

    list.appendChild(chip);
  });
  if(window.lucide) lucide.createIcons();
}

/* =========================================================================
   COURSE EDITOR MODAL (create / edit a course in the bank)
   ========================================================================= */

let editingCourseId = null;

function openCourseEditor(courseId){
  editingCourseId = courseId || null;
  const course = courseId ? courseById(courseId) : null;
  document.getElementById('courseModalTitle').innerHTML = `<i data-lucide="book-open"></i> ${course ? 'Edit course' : 'New course'}`;
  document.getElementById('btnDeleteCourse').style.display = course ? 'inline-flex' : 'none';

  const body = document.getElementById('courseFormBody');
  const fields = enabledFields();
  const colorVal = course?.color || COURSE_PALETTE[state.courses.length % COURSE_PALETTE.length];

  body.innerHTML = `
    <div class="form-grid">
      ${fields.map(f=>`
        <div class="form-field">
          <label for="cf_${f.key}">${escapeHtml(f.label)}</label>
          ${f.type === 'textarea'
            ? `<textarea id="cf_${f.key}" data-key="${f.key}">${escapeHtml(course?.[f.key] || '')}</textarea>`
            : `<input type="${f.type==='tel'?'tel':'text'}" id="cf_${f.key}" data-key="${f.key}" value="${escapeHtml(course?.[f.key] || '')}">`
          }
        </div>
      `).join('')}
      <div class="form-field">
        <label>Color</label>
        <div class="color-swatches" id="colorSwatches"></div>
      </div>
    </div>
  `;

  const swatchWrap = document.getElementById('colorSwatches');
  COURSE_PALETTE.forEach(hex=>{
    const sw = document.createElement('div');
    sw.className = 'swatch' + (hex.toLowerCase()===colorVal.toLowerCase() ? ' is-selected' : '');
    sw.style.background = hex;
    sw.dataset.hex = hex;
    sw.addEventListener('click', ()=>{
      swatchWrap.querySelectorAll('.swatch').forEach(s=>s.classList.remove('is-selected'));
      sw.classList.add('is-selected');
    });
    swatchWrap.appendChild(sw);
  });

  document.getElementById('courseOverlay').hidden = false;
}

function closeCourseEditor(){
  document.getElementById('courseOverlay').hidden = true;
  editingCourseId = null;
}

function saveCourseFromForm(){
  const body = document.getElementById('courseFormBody');
  const inputs = body.querySelectorAll('[data-key]');
  const data = {};
  inputs.forEach(inp => data[inp.dataset.key] = inp.value.trim());
  const selectedSwatch = body.querySelector('.swatch.is-selected');
  const color = selectedSwatch ? selectedSwatch.dataset.hex : COURSE_PALETTE[0];

  if(editingCourseId){
    const course = courseById(editingCourseId);
    Object.assign(course, data, { color });
  } else {
    state.courses.push(Object.assign({ id: uid('c'), color }, data));
  }
  saveState();
  renderBank();
  renderGrid();
  closeCourseEditor();
  showToast('Course saved.');
}

function deleteCourseFromEditor(){
  if(!editingCourseId) return;
  if(!confirm('Delete this course? It will also be removed from the grid.')) return;
  state.courses = state.courses.filter(c=>c.id!==editingCourseId);
  state.placements = state.placements.filter(p=>p.courseId!==editingCourseId);
  saveState();
  renderBank();
  renderGrid();
  closeCourseEditor();
  showToast('Course deleted.');
}

/* =========================================================================
   CARD DETAIL MODAL (click a placed card: view details, edit room/note)
   ========================================================================= */

let currentDetailPlacementId = null;

function phoneActionsHtml(rawNumber){
  const digits = String(rawNumber||'').replace(/[^\d+]/g,'');
  if(!digits) return '';
  // wa.me requires digits only, no leading +
  const waDigits = digits.replace(/^\+/,'');
  return `
    <div class="detail-phone-actions">
      <a class="btn btn--icon btn--sm" href="tel:${digits}" title="Call" aria-label="Call"><i data-lucide="phone-call"></i></a>
      <a class="btn btn--icon btn--sm" href="https://wa.me/${waDigits}" target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp"><i data-lucide="message-circle"></i></a>
    </div>
  `;
}

function openCardDetail(course, placement){
  currentDetailPlacementId = placement.id;
  document.getElementById('cardDetailTitle').textContent = courseTitle(course);

  const day = dayById(placement.dayId), time = timeById(placement.timeId);
  const body = document.getElementById('cardDetailBody');

  const infoFields = enabledFields().filter(f=> f.key!=='courseName' && course[f.key]);
  const iconFor = (key)=>({
    courseCode:'hash', teacherName:'user', teacherShort:'user-check', teacherMobile:'phone',
    section:'users', sectionNote:'sticky-note', crName:'shield-user', crMobile:'phone-call',
    courseNote:'notebook-pen'
  }[key] || 'info');

  body.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <i data-lucide="calendar-days"></i>
        <div>
          <div class="detail-label">When</div>
          <div class="detail-value">${escapeHtml(day?.label||'')} · ${escapeHtml(time?.start||'')} – ${escapeHtml(time?.end||'')}</div>
        </div>
      </div>
      <div class="detail-divider"></div>
      ${infoFields.map(f=>`
        <div class="detail-item">
          <i data-lucide="${iconFor(f.key)}"></i>
          <div style="flex:1">
            <div class="detail-label">${escapeHtml(f.label)}</div>
            <div class="detail-value">${escapeHtml(course[f.key])}</div>
          </div>
          ${f.type==='tel' ? phoneActionsHtml(course[f.key]) : ''}
        </div>
      `).join('')}
      <div class="detail-divider"></div>
      <div class="detail-item detail-editable">
        <i data-lucide="map-pin"></i>
        <div style="flex:1">
          <div class="detail-label">Room number</div>
          <input type="text" id="detailRoom" value="${escapeHtml(placement.room||'')}" placeholder="e.g. Room 402">
        </div>
      </div>
      <div class="detail-item detail-editable">
        <i data-lucide="calendar-clock"></i>
        <div style="flex:1">
          <div class="detail-label">Note for this slot</div>
          <textarea id="detailNote" placeholder="e.g. Class moved this week, bring calculator...">${escapeHtml(placement.note||'')}</textarea>
        </div>
      </div>
    </div>
  `;

  document.getElementById('cardDetailOverlay').hidden = false;
  if(window.lucide) lucide.createIcons();
}

function saveCardDetailEdits(){
  if(!currentDetailPlacementId) return;
  const p = state.placements.find(pl=>pl.id===currentDetailPlacementId);
  if(!p) return;
  const roomEl = document.getElementById('detailRoom');
  const noteEl = document.getElementById('detailNote');
  if(roomEl) p.room = roomEl.value.trim();
  if(noteEl) p.note = noteEl.value.trim();
  saveState();
  renderGrid();
}

function closeCardDetail(){
  saveCardDetailEdits();
  document.getElementById('cardDetailOverlay').hidden = true;
  currentDetailPlacementId = null;
}

function removeCurrentPlacement(){
  if(!currentDetailPlacementId) return;
  removePlacementById(currentDetailPlacementId);
  document.getElementById('cardDetailOverlay').hidden = true;
  currentDetailPlacementId = null;
}

function removePlacementById(placementId){
  const existed = state.placements.some(p=>p.id===placementId);
  if(!existed) return;
  state.placements = state.placements.filter(p=>p.id!==placementId);
  saveState();
  renderGrid();
  showToast('Removed from grid.');
}

/* =========================================================================
   SETTINGS — Days
   ========================================================================= */

function renderDayEditor(){
  const wrap = document.getElementById('dayEditor');
  wrap.innerHTML = '';
  state.days.forEach((day, idx)=>{
    const row = document.createElement('div');
    row.className = 'day-row';
    row.draggable = true;
    row.dataset.index = idx;
    row.innerHTML = `
      <span class="row-drag" title="Drag to reorder"><i data-lucide="grip-vertical"></i></span>
      <input type="checkbox" ${day.enabled ? 'checked':''} data-role="enabled" title="Show this day">
      <input type="text" value="${escapeHtml(day.label)}" data-role="label">
      <button class="row-del" title="Remove day" data-role="delete"><i data-lucide="trash-2"></i></button>
    `;
    row.querySelector('[data-role="enabled"]').addEventListener('change', (e)=>{
      day.enabled = e.target.checked; saveState(); renderGrid();
    });
    row.querySelector('[data-role="label"]').addEventListener('input', (e)=>{
      day.label = e.target.value; saveState(); renderGrid();
    });
    row.querySelector('[data-role="delete"]').addEventListener('click', ()=>{
      if(state.days.length<=1){ showToast('Keep at least one day.', 'error'); return; }
      if(!confirm(`Remove "${day.label}"? Classes placed on this day will be removed too.`)) return;
      state.placements = state.placements.filter(p=>p.dayId!==day.id);
      state.days.splice(idx,1);
      saveState(); renderDayEditor(); renderGrid();
    });
    attachRowReorder(row, wrap, state.days, ()=>{ saveState(); renderGrid(); renderDayEditor(); });
    wrap.appendChild(row);
  });
  if(window.lucide) lucide.createIcons();
}

function addDay(){
  state.days.push({ id: uid('d'), label: 'New day', enabled: true });
  saveState(); renderDayEditor(); renderGrid();
}

/* generic drag-reorder for settings rows */
function attachRowReorder(row, container, arr, onDrop){
  row.addEventListener('dragstart', (e)=>{
    e.dataTransfer.setData('text/plain', row.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', ()=> row.classList.remove('dragging'));
  row.addEventListener('dragover', (e)=>{ e.preventDefault(); });
  row.addEventListener('drop', (e)=>{
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const toIdx = parseInt(row.dataset.index, 10);
    if(isNaN(fromIdx) || isNaN(toIdx) || fromIdx===toIdx) return;
    const [moved] = arr.splice(fromIdx,1);
    arr.splice(toIdx,0,moved);
    onDrop();
  });
}

/* =========================================================================
   SETTINGS — Time slots
   ========================================================================= */

function renderTimeEditor(){
  const wrap = document.getElementById('timeEditor');
  wrap.innerHTML = '';
  state.times.forEach((time, idx)=>{
    const row = document.createElement('div');
    row.className = 'time-row';
    row.draggable = true;
    row.dataset.index = idx;
    row.innerHTML = `
      <span class="row-drag" title="Drag to reorder"><i data-lucide="grip-vertical"></i></span>
      <input type="text" class="time-start" value="${escapeHtml(time.start)}" data-role="start" placeholder="10:40am">
      <span class="time-sep">–</span>
      <input type="text" class="time-end" value="${escapeHtml(time.end)}" data-role="end" placeholder="11:30am">
      <span style="flex:1"></span>
      <button class="row-del" title="Remove time slot" data-role="delete"><i data-lucide="trash-2"></i></button>
    `;
    row.querySelector('[data-role="start"]').addEventListener('input', (e)=>{ time.start = e.target.value; saveState(); renderGrid(); });
    row.querySelector('[data-role="end"]').addEventListener('input', (e)=>{ time.end = e.target.value; saveState(); renderGrid(); });
    row.querySelector('[data-role="delete"]').addEventListener('click', ()=>{
      if(state.times.length<=1){ showToast('Keep at least one time slot.', 'error'); return; }
      if(!confirm('Remove this time slot? Classes placed here will be removed too.')) return;
      state.placements = state.placements.filter(p=>p.timeId!==time.id);
      state.times.splice(idx,1);
      saveState(); renderTimeEditor(); renderGrid();
    });
    attachRowReorder(row, wrap, state.times, ()=>{ saveState(); renderGrid(); renderTimeEditor(); });
    wrap.appendChild(row);
  });
  if(window.lucide) lucide.createIcons();
}

function addTimeSlot(){
  const last = state.times[state.times.length-1];
  state.times.push({ id: uid('t'), start: last ? last.end : '9:00am', end: '9:50am' });
  saveState(); renderTimeEditor(); renderGrid();
}

/* =========================================================================
   SETTINGS — Course fields
   ========================================================================= */

function renderFieldEditor(){
  const wrap = document.getElementById('fieldEditor');
  wrap.innerHTML = '';
  state.fields.forEach(f=>{
    const row = document.createElement('div');
    row.className = 'field-toggle-row';
    row.innerHTML = `
      <input type="checkbox" ${f.enabled?'checked':''} ${f.core?'disabled title="Always on"':''} data-role="enabled">
      <input type="text" value="${escapeHtml(f.label)}" data-role="label">
      <span class="field-key">${f.type}</span>
    `;
    row.querySelector('[data-role="enabled"]').addEventListener('change', (e)=>{
      f.enabled = e.target.checked; saveState(); renderBank(); renderGrid();
    });
    row.querySelector('[data-role="label"]').addEventListener('input', (e)=>{
      f.label = e.target.value; saveState(); renderBank(); renderGrid();
    });
    wrap.appendChild(row);
  });
}

/* =========================================================================
   SETTINGS — general wiring
   ========================================================================= */

function openSettings(){
  renderDayEditor();
  renderTimeEditor();
  renderFieldEditor();
  document.getElementById('setRoutineName').value = state.routineName;
  document.getElementById('setAccentColor').value = state.accent;
  document.getElementById('setDensity').value = state.density;
  document.getElementById('setRightClickDelete').checked = !!state.features?.rightClickDelete;
  document.getElementById('setConfirmBeforeDelete').checked = !!state.features?.confirmBeforeDelete;
  document.getElementById('settingsOverlay').hidden = false;
}
function closeSettings(){ document.getElementById('settingsOverlay').hidden = true; }

function switchTab(tabName){
  document.querySelectorAll('.tab').forEach(t=> t.classList.toggle('is-active', t.dataset.tab===tabName));
  document.querySelectorAll('.tab-panel').forEach(p=> p.classList.toggle('is-active', p.id==='panel-'+tabName));
}

/* =========================================================================
   IMPORT / EXPORT — .txt (full state as readable structured text)
   ========================================================================= */

function exportTxt(){
  const lines = [];
  lines.push('# Personal Routine Customizer Export');
  lines.push('# Format: v1 — this file can be re-imported.');
  lines.push('');
  lines.push('[META]');
  lines.push('routineName=' + tsvEscape(state.routineName));
  lines.push('accent=' + state.accent);
  lines.push('density=' + state.density);
  lines.push('rightClickDelete=' + !!state.features?.rightClickDelete);
  lines.push('confirmBeforeDelete=' + !!state.features?.confirmBeforeDelete);
  lines.push('');

  lines.push('[DAYS]');
  lines.push('id\tlabel\tenabled');
  state.days.forEach(d=> lines.push([d.id, tsvEscape(d.label), d.enabled].join('\t')));
  lines.push('');

  lines.push('[TIMES]');
  lines.push('id\tstart\tend');
  state.times.forEach(t=> lines.push([t.id, tsvEscape(t.start), tsvEscape(t.end)].join('\t')));
  lines.push('');

  lines.push('[FIELDS]');
  lines.push('key\tlabel\ttype\tenabled\tcore');
  state.fields.forEach(f=> lines.push([f.key, tsvEscape(f.label), f.type, f.enabled, f.core].join('\t')));
  lines.push('');

  const fieldKeys = state.fields.map(f=>f.key);
  lines.push('[COURSES]');
  lines.push(['id','color', ...fieldKeys].join('\t'));
  state.courses.forEach(c=>{
    lines.push([c.id, c.color, ...fieldKeys.map(k=> tsvEscape(c[k]||''))].join('\t'));
  });
  lines.push('');

  lines.push('[PLACEMENTS]');
  lines.push('id\tcourseId\tdayId\ttimeId\troom\tnote');
  state.placements.forEach(p=>{
    lines.push([p.id, p.courseId, p.dayId, p.timeId, tsvEscape(p.room||''), tsvEscape(p.note||'')].join('\t'));
  });

  const blob = new Blob([lines.join('\n')], { type:'text/plain' });
  downloadBlob(blob, sanitizeFilename(state.routineName || 'routine') + '.txt');
  showToast('Exported .txt file.');
}

function tsvEscape(v){
  return String(v ?? '').replace(/\t/g,' ').replace(/\r?\n/g,'\\n');
}
function tsvUnescape(v){
  return String(v ?? '').replace(/\\n/g,'\n');
}
function sanitizeFilename(name){
  return name.replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').slice(0,60) || 'routine';
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}

/* ---------- Import/Export — JSON copy/paste ---------- */
function openJsonModal(){
  const textarea = document.getElementById('jsonTextarea');
  textarea.value = JSON.stringify(state, null, 2);
  document.getElementById('jsonOverlay').hidden = false;
  textarea.focus();
  textarea.select();
}

function closeJsonModal(){
  document.getElementById('jsonOverlay').hidden = true;
}

async function copyJsonToClipboard(){
  const textarea = document.getElementById('jsonTextarea');
  try{
    await navigator.clipboard.writeText(textarea.value);
    showToast('JSON copied to clipboard.');
  }catch(e){
    // Fallback for browsers/contexts without clipboard API permission
    textarea.focus();
    textarea.select();
    try{
      document.execCommand('copy');
      showToast('JSON copied to clipboard.');
    }catch(err){
      showToast('Could not copy — select the text and copy manually.', 'error');
    }
  }
}

function importJsonFromTextarea(){
  const textarea = document.getElementById('jsonTextarea');
  const text = textarea.value.trim();
  if(!text){ showToast('Paste JSON before importing.', 'error'); return; }
  let parsed;
  try{
    parsed = JSON.parse(text);
  }catch(e){
    showToast('That is not valid JSON.', 'error');
    return;
  }
  if(!confirm('Import this routine? It will replace your current routine (copy/export a backup first if unsure).')) return;
  try{
    const base = defaultState();
    state = Object.assign(base, parsed);
    state.features = Object.assign({}, base.features, parsed.features || {});
    saveState();
    renderAll();
    closeJsonModal();
    showToast('Routine imported.');
  }catch(e){
    console.error(e);
    showToast('Could not import — unexpected JSON shape.', 'error');
  }
}

function importTxt(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = parseTxtExport(reader.result);
      if(!confirm('Import this routine? It will replace your current routine (export a backup first if unsure).')) return;
      state = parsed;
      saveState();
      renderAll();
      showToast('Routine imported.');
    }catch(e){
      console.error(e);
      showToast('Could not read that file — is it a valid export?', 'error');
    }
  };
  reader.readAsText(file);
}

function parseTxtExport(text){
  const s = defaultState();
  s.days = []; s.times = []; s.fields = []; s.courses = []; s.placements = [];

  const lines = text.split(/\r?\n/);
  let section = null;
  let header = null;

  for(const raw of lines){
    const line = raw;
    if(!line.trim() || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if(sectionMatch){ section = sectionMatch[1]; header = null; continue; }
    if(!section) continue;

    if(section === 'META'){
      const eq = line.indexOf('=');
      if(eq<0) continue;
      const key = line.slice(0,eq), val = line.slice(eq+1);
      if(key==='routineName') s.routineName = tsvUnescape(val);
      else if(key==='accent') s.accent = val;
      else if(key==='density') s.density = val;
      else if(key==='rightClickDelete') s.features.rightClickDelete = val === 'true';
      else if(key==='confirmBeforeDelete') s.features.confirmBeforeDelete = val === 'true';
      continue;
    }

    const cols = line.split('\t');
    if(!header){ header = cols; continue; }

    const row = {};
    header.forEach((h,i)=> row[h] = cols[i]);

    if(section === 'DAYS'){
      s.days.push({ id: row.id, label: tsvUnescape(row.label), enabled: row.enabled === 'true' });
    } else if(section === 'TIMES'){
      s.times.push({ id: row.id, start: tsvUnescape(row.start), end: tsvUnescape(row.end) });
    } else if(section === 'FIELDS'){
      s.fields.push({ key: row.key, label: tsvUnescape(row.label), type: row.type, enabled: row.enabled==='true', core: row.core==='true' });
    } else if(section === 'COURSES'){
      const course = { id: row.id, color: row.color };
      header.slice(2).forEach(k=> course[k] = tsvUnescape(row[k]));
      s.courses.push(course);
    } else if(section === 'PLACEMENTS'){
      s.placements.push({ id: row.id, courseId: row.courseId, dayId: row.dayId, timeId: row.timeId, room: tsvUnescape(row.room), note: tsvUnescape(row.note) });
    }
  }

  if(s.days.length===0) s.days = defaultState().days;
  if(s.times.length===0) s.times = defaultState().times;
  if(s.fields.length===0) s.fields = defaultState().fields;
  return s;
}

/* =========================================================================
   EXPORT — PNG / PDF (clean grid only, via offscreen clone + canvas)
   ========================================================================= */

async function buildExportCanvas(){
  // Build a clean, fully-expanded (no scroll clipping) clone of the grid.
  const root = document.getElementById('exportRoot');
  root.innerHTML = '';
  root.style.padding = '28px';
  root.style.fontFamily = getComputedStyle(document.body).fontFamily;

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:20px;margin-bottom:14px;color:#1F2937;';
  title.textContent = state.routineName || 'Untitled routine';
  root.appendChild(title);

  const clone = document.getElementById('routineGrid').cloneNode(true);
  clone.style.width = 'max-content';
  clone.style.position = 'static';
  // Remove sticky positioning artifacts for a flat export
  clone.querySelectorAll('.g-day-head, .g-time-head, .g-corner').forEach(el=>{ el.style.position='static'; });
  root.appendChild(clone);

  root.style.left = '0px';
  root.style.top = '-99999px';
  root.style.zIndex = '-1';

  await new Promise(r=>setTimeout(r, 60)); // allow layout/fonts

  const canvas = await html2canvasFallback(root);
  root.innerHTML = '';
  root.style.left = '-99999px';
  return canvas;
}

/* Loads html2canvas from CDN lazily (kept out of the main bundle) */
let _html2canvasLoading = null;
function ensureHtml2Canvas(){
  if(window.html2canvas) return Promise.resolve();
  if(_html2canvasLoading) return _html2canvasLoading;
  _html2canvasLoading = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = resolve;
    s.onerror = ()=> reject(new Error('Could not load export library. Check your connection.'));
    document.head.appendChild(s);
  });
  return _html2canvasLoading;
}

async function html2canvasFallback(el){
  await ensureHtml2Canvas();
  return await window.html2canvas(el, { backgroundColor:'#FFFFFF', scale: 2 });
}

async function exportPng(){
  showToast('Preparing PNG…');
  try{
    const canvas = await buildExportCanvas();
    canvas.toBlob(blob=>{
      downloadBlob(blob, sanitizeFilename(state.routineName || 'routine') + '.png');
      showToast('Exported PNG.');
    });
  }catch(e){
    console.error(e);
    showToast('PNG export failed. ' + (e.message||''), 'error');
  }
}

async function exportPdf(){
  showToast('Preparing PDF…');
  try{
    await ensureJsPdf();
    const canvas = await buildExportCanvas();
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit:'px', format:[canvas.width, canvas.height] });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(sanitizeFilename(state.routineName || 'routine') + '.pdf');
    showToast('Exported PDF.');
  }catch(e){
    console.error(e);
    showToast('PDF export failed. ' + (e.message||''), 'error');
  }
}

let _jsPdfLoading = null;
function ensureJsPdf(){
  if(window.jspdf) return Promise.resolve();
  if(_jsPdfLoading) return _jsPdfLoading;
  _jsPdfLoading = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = resolve;
    s.onerror = ()=> reject(new Error('Could not load PDF library. Check your connection.'));
    document.head.appendChild(s);
  });
  return _jsPdfLoading;
}

/* =========================================================================
   INIT + EVENT WIRING
   ========================================================================= */

function renderAll(){
  applyAppearance();
  renderBank();
  renderGrid();
}

function wireEvents(){
  // Bank toggle
  document.getElementById('btnBank').addEventListener('click', ()=>{
    document.getElementById('bankPanel').classList.toggle('is-collapsed');
    document.getElementById('bankPanel').classList.toggle('is-open');
  });

  // Settings
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('btnCloseSettings').addEventListener('click', closeSettings);
  document.getElementById('settingsOverlay').addEventListener('click', (e)=>{ if(e.target.id==='settingsOverlay') closeSettings(); });
  document.querySelectorAll('.tab').forEach(t=> t.addEventListener('click', ()=> switchTab(t.dataset.tab)));

  document.getElementById('btnAddDay').addEventListener('click', addDay);
  document.getElementById('btnAddTime').addEventListener('click', addTimeSlot);

  document.getElementById('setRoutineName').addEventListener('input', (e)=>{
    state.routineName = e.target.value; saveState(); applyAppearance();
  });
  document.getElementById('setAccentColor').addEventListener('input', (e)=>{
    state.accent = e.target.value; saveState(); applyAppearance(); renderGrid();
  });
  document.getElementById('setDensity').addEventListener('change', (e)=>{
    state.density = e.target.value; saveState(); applyAppearance();
  });
  document.getElementById('setRightClickDelete').addEventListener('change', (e)=>{
    state.features.rightClickDelete = e.target.checked; saveState();
  });
  document.getElementById('setConfirmBeforeDelete').addEventListener('change', (e)=>{
    state.features.confirmBeforeDelete = e.target.checked; saveState();
  });

  document.getElementById('btnClearGrid').addEventListener('click', ()=>{
    if(!confirm('Remove all courses placed on the grid? Your course bank stays intact.')) return;
    state.placements = []; saveState(); renderGrid(); showToast('Grid cleared.');
  });
  document.getElementById('btnResetAll').addEventListener('click', ()=>{
    if(!confirm('Reset everything — days, times, fields, courses, and placements — back to defaults? This cannot be undone.')) return;
    state = defaultState(); saveState(); renderAll(); closeSettings(); showToast('Everything reset.');
  });

  // Inline grid title (kept in sync with settings field)
  const gridTitle = document.getElementById('gridTitleInline');
  gridTitle.addEventListener('blur', ()=>{
    state.routineName = gridTitle.textContent.trim() || 'Untitled routine';
    saveState(); applyAppearance();
  });
  gridTitle.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); gridTitle.blur(); } });

  // Course editor modal
  document.getElementById('btnAddCourse').addEventListener('click', ()=> openCourseEditor(null));
  document.getElementById('btnCloseCourse').addEventListener('click', closeCourseEditor);
  document.getElementById('btnCancelCourse').addEventListener('click', closeCourseEditor);
  document.getElementById('courseOverlay').addEventListener('click', (e)=>{ if(e.target.id==='courseOverlay') closeCourseEditor(); });
  document.getElementById('btnSaveCourse').addEventListener('click', saveCourseFromForm);
  document.getElementById('btnDeleteCourse').addEventListener('click', deleteCourseFromEditor);

  // Card detail modal
  document.getElementById('btnCloseCardDetail').addEventListener('click', closeCardDetail);
  document.getElementById('btnCloseCardDetail2').addEventListener('click', closeCardDetail);
  document.getElementById('cardDetailOverlay').addEventListener('click', (e)=>{ if(e.target.id==='cardDetailOverlay') closeCardDetail(); });
  document.getElementById('btnRemoveFromGrid').addEventListener('click', removeCurrentPlacement);

  // Export menu
  const exportMenu = document.getElementById('exportMenu');
  document.getElementById('btnExport').addEventListener('click', (e)=>{
    e.stopPropagation();
    exportMenu.hidden = !exportMenu.hidden;
  });
  document.addEventListener('click', ()=>{ exportMenu.hidden = true; });
  exportMenu.addEventListener('click', (e)=> e.stopPropagation());

  exportMenu.querySelector('[data-action="export-txt"]').addEventListener('click', ()=>{ exportMenu.hidden=true; exportTxt(); });
  exportMenu.querySelector('[data-action="export-png"]').addEventListener('click', ()=>{ exportMenu.hidden=true; exportPng(); });
  exportMenu.querySelector('[data-action="export-pdf"]').addEventListener('click', ()=>{ exportMenu.hidden=true; exportPdf(); });
  exportMenu.querySelector('[data-action="export-json-copy"]').addEventListener('click', ()=>{ exportMenu.hidden=true; openJsonModal(); });

  // JSON copy/paste modal
  document.getElementById('btnCloseJson').addEventListener('click', closeJsonModal);
  document.getElementById('btnCancelJson').addEventListener('click', closeJsonModal);
  document.getElementById('jsonOverlay').addEventListener('click', (e)=>{ if(e.target.id==='jsonOverlay') closeJsonModal(); });
  document.getElementById('btnCopyJson').addEventListener('click', copyJsonToClipboard);
  document.getElementById('btnImportJson').addEventListener('click', importJsonFromTextarea);

  const importInput = document.getElementById('importFileInput');
  exportMenu.querySelector('[data-action="import-txt"]').addEventListener('click', ()=>{
    exportMenu.hidden = true; importInput.click();
  });
  importInput.addEventListener('change', ()=>{
    if(importInput.files[0]) importTxt(importInput.files[0]);
    importInput.value = '';
  });

  // Escape closes topmost modal
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    if(!document.getElementById('cardDetailOverlay').hidden) closeCardDetail();
    else if(!document.getElementById('courseOverlay').hidden) closeCourseEditor();
    else if(!document.getElementById('jsonOverlay').hidden) closeJsonModal();
    else if(!document.getElementById('settingsOverlay').hidden) closeSettings();
  });
}

function registerServiceWorker(){
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('sw.js').catch(err=>{
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

(function init(){
  wireEvents();
  renderAll();
  registerServiceWorker();
  if(window.lucide) lucide.createIcons();
})();