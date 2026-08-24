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
   core: if true, cannot be disabled (keeps app usable)
   group: 'primary' (shown before "See more") or 'more' (collapsed by default)
   custom: true for user-created fields (only affects delete-ability in the editor) */
const DEFAULT_FIELDS = [
  { key: 'courseName',     label: 'Course Name',            type: 'text',     enabled: true, core: true,  group: 'primary' },
  { key: 'teacherName',    label: 'Teacher Name',           type: 'text',     enabled: true, core: false, group: 'primary' },
  { key: 'section',        label: 'Section',                type: 'text',     enabled: true, core: false, group: 'primary' },
  { key: 'sectionNote',    label: 'Section Note',           type: 'textarea', enabled: true, core: false, group: 'primary' },
  { key: 'courseCode',     label: 'Course Code',            type: 'text',     enabled: true, core: false, group: 'more' },
  { key: 'teacherShort',   label: 'Teacher Shortcode',      type: 'text',     enabled: true, core: false, group: 'more' },
  { key: 'teacherMobile',  label: 'Teacher Mobile Number',  type: 'tel',      enabled: true, core: false, group: 'more' },
  { key: 'crName',         label: 'CR Name',                type: 'text',     enabled: true, core: false, group: 'more' },
  { key: 'crMobile',       label: 'CR Phone Number',        type: 'tel',      enabled: true, core: false, group: 'more' },
  { key: 'defaultRoom',    label: 'Default Room Number',    type: 'text',     enabled: true, core: false, group: 'more' },
];

/* ---------- Default slot-field schema ---------- */
/* Per-placement fields (may differ each time a course is placed on the
   grid), e.g. room number for this specific slot, or a note for this
   specific slot. Same shape as course fields, minus 'group' (slot fields
   have no "see more" split — the list is short by design). */
const DEFAULT_SLOT_FIELDS = [
  { key: 'room', label: 'Room Number',        type: 'text',     enabled: true, core: false },
  { key: 'note', label: 'Note for this Slot',  type: 'textarea', enabled: true, core: false },
];

const DEFAULT_DAYS = ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'].map((d,i)=>({
  id: 'd'+i, label: d, enabled: true
}));

const DEFAULT_TIMES = [
  '10:50 - 11:40 AM','11:40 AM - 12:30 PM','12:30 - 01:10 PM',
  '01:10 - 01:50 PM (BREAK)',
  '01:50 - 02:40 PM','02:40 - 03:30 PM','03:30 - 04:20 PM'
].map((label,i)=>({ id:'t'+i, label }));

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
    slotFields: JSON.parse(JSON.stringify(DEFAULT_SLOT_FIELDS)),
    courses: [],        // {id, color, [fieldKey]: value, ...}
    placements: [],      // {id, courseId, dayId, timeId, [slotFieldKey]: value, ...}
    features: {
      rightClickDelete: true,
      confirmBeforeDelete: true,
      clickEmptyCellToAdd: false,
      bulkAddCourses: true,
      editFromGrid: true
    }
  };
}

/* ---------- State + persistence ---------- */
let state = loadState();

function mergeIntoDefaultState(parsed){
  const base = defaultState();
  // Time slots switched from separate {start,end} fields to a single
  // {label} field. Older saved/localStorage state with start/end is
  // normalized here (not "supported" as an import format, just kept from
  // crashing the app it's already living in).
  if(Array.isArray(parsed.times)){
    parsed.times = parsed.times.map(t=>
      (t && t.label === undefined && (t.start !== undefined || t.end !== undefined))
        ? { id: t.id, label: [t.start, t.end].filter(Boolean).join(' - ') }
        : t
    );
  }
  const merged = Object.assign(base, parsed);
  // features is a nested object — merge its keys individually so an
  // older/partial saved 'features' object doesn't drop newly-added flags
  merged.features = Object.assign({}, base.features, parsed.features || {});
  // fields is a list keyed by 'key' — merge by key so a saved/imported
  // routine from before a new field existed (e.g. defaultRoom) still picks
  // it up, instead of parsed.fields silently overwriting the whole array.
  // Order comes from the saved array when present (so drag-reordering
  // persists); any brand-new default fields not yet in the saved data are
  // appended at the end of their group.
  if(Array.isArray(parsed.fields)){
    merged.fields = mergeFieldList(base.fields, parsed.fields);
  }
  if(Array.isArray(parsed.slotFields)){
    merged.slotFields = mergeFieldList(base.slotFields, parsed.slotFields);
  }
  return merged;
}

/* Shared by course fields and slot fields: merges a saved field list with
   the current defaults by 'key', preserving the saved list's order (so
   drag-and-drop reordering persists across reloads) and any custom fields
   the user has added, while still picking up brand-new built-in fields
   that didn't exist yet when the routine was saved. */
function mergeFieldList(defaultList, savedList){
  const defaultByKey = new Map(defaultList.map(f=>[f.key, f]));
  const seen = new Set();
  const merged = savedList
    .filter(f=> f && f.key)
    .map(saved=>{
      seen.add(saved.key);
      const def = defaultByKey.get(saved.key);
      return def ? Object.assign({}, def, saved) : Object.assign({ group:'primary', custom:true }, saved);
    });
  // Any default field the saved list doesn't know about yet (e.g. added in
  // a later app version) gets appended so it isn't lost.
  defaultList.forEach(def=>{
    if(!seen.has(def.key)) merged.push(def);
  });
  return merged;
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return mergeIntoDefaultState(parsed);
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
    // Optional hook: if auth.js has loaded and the user is signed in, it
    // registers a listener here to mirror every local save up to Firestore.
    // app.js has no knowledge of Firebase/auth — this is a one-way, generic
    // notification so the two files stay decoupled.
    if(typeof window.__onRoutineStateSaved === 'function'){
      try{ window.__onRoutineStateSaved(state); }catch(e){ console.warn('Cloud sync hook failed', e); }
    }
  }, 150);
}

/* ---------- Cross-file bridge for auth.js (optional account/cloud-sync feature) ----------
   auth.js is a separate, optional module that knows nothing about the shape
   of app.js internals beyond this small surface:
     - window.getRoutineState()      -> current state object
     - window.replaceRoutineState(s) -> adopt a state object (e.g. loaded from
       the cloud), persist it locally, and re-render the whole UI
   Keeping this surface tiny means app.js works completely standalone even
   if auth.js is removed. */
window.getRoutineState = function(){ return state; };
window.replaceRoutineState = function(newState){
  try{
    state = mergeIntoDefaultState(newState || {});
    saveState();
    renderAll();
  }catch(e){
    console.error('Could not adopt routine state', e);
    showToast('Could not load that routine data.', 'error');
  }
};

/** Imports another routine into the current one. Used by the /import/<username>
    flow in auth.js.
      replace=true  -> same as window.replaceRoutineState (wholesale swap)
      replace=false -> "append": keep existing courses/placements, add the
        imported ones alongside. Imported courses are always added as new,
        separate entries (even if a course code matches one you already
        have) — simplest and avoids silently combining two people's course
        data under one card.
    replaceSettings applies independently of append/replace: when true,
    days/times/fields/appearance are swapped to the imported routine's
    values. This matters most in append mode — if the day/time structure
    is instead KEPT (replaceSettings=false) and the two routines don't
    share the same day/time IDs (they won't, since they're different
    accounts), imported placements are remapped onto the current grid by
    matching day/time LABEL (e.g. imported "Sun" placement -> whichever
    local day is labeled "Sun"). Any placement with no matching label is
    dropped rather than silently corrupting the grid, and the user is told
    how many were skipped. */
window.importRoutineState = function(importedState, { replace, replaceSettings }){
  try{
    const imported = mergeIntoDefaultState(importedState || {});

    if(replace){
      state = imported;
      saveState();
      renderAll();
      return { importedCourses: imported.courses.length, skippedPlacements: 0 };
    }

    if(replaceSettings){
      state.days = imported.days;
      state.times = imported.times;
      state.fields = imported.fields;
      state.accent = imported.accent;
      state.density = imported.density;
    }

    // Map imported course/day/time IDs -> new IDs in the current state, so
    // nothing collides with what's already here.
    const courseIdMap = new Map();
    imported.courses.forEach(c=>{
      const newId = uid('c');
      courseIdMap.set(c.id, newId);
      state.courses.push(Object.assign({}, c, { id: newId }));
    });

    // Build day/time label -> id lookups for the grid we're placing onto.
    const dayIdByLabel = new Map(state.days.map(d=>[d.label, d.id]));
    const timeIdByKey = new Map(state.times.map(t=>[t.label, t.id]));
    const importedDayById = new Map(imported.days.map(d=>[d.id, d]));
    const importedTimeById = new Map(imported.times.map(t=>[t.id, t]));

    let skipped = 0;
    imported.placements.forEach(p=>{
      const newCourseId = courseIdMap.get(p.courseId);
      if(!newCourseId) { skipped++; return; }

      let dayId = p.dayId, timeId = p.timeId;
      if(replaceSettings){
        // Structure was just replaced wholesale with the imported one, so
        // imported IDs are still valid as-is.
      } else {
        const importedDay = importedDayById.get(p.dayId);
        const importedTime = importedTimeById.get(p.timeId);
        dayId = importedDay ? dayIdByLabel.get(importedDay.label) : null;
        timeId = importedTime ? timeIdByKey.get(importedTime.label) : null;
        if(!dayId || !timeId){ skipped++; return; }
      }

      state.placements.push(Object.assign({}, p, {
        id: uid('p'),
        courseId: newCourseId,
        dayId, timeId
      }));
    });

    saveState();
    renderAll();
    return { importedCourses: imported.courses.length, skippedPlacements: skipped };
  }catch(e){
    console.error('Could not import routine', e);
    showToast('Could not import that routine.', 'error');
    return { importedCourses: 0, skippedPlacements: 0, error: true };
  }
};

/* ---------- Small helpers ---------- */
function fieldByKey(key){ return state.fields.find(f=>f.key===key); }
function enabledFields(){ return state.fields.filter(f=>f.enabled); }
function primaryFields(){ return enabledFields().filter(f=> (f.group||'primary') !== 'more'); }
function moreFields(){ return enabledFields().filter(f=> f.group === 'more'); }
function slotFieldByKey(key){ return state.slotFields.find(f=>f.key===key); }
function enabledSlotFields(){ return state.slotFields.filter(f=>f.enabled); }
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
  document.title = (state.routineName || 'MyRoutine Customizer') + ' - MyRoutine Customizer';
  document.body.classList.toggle('click-cell-enabled', !!state.features?.clickEmptyCellToAdd);
  const bulkEnabled = !!state.features?.bulkAddCourses;
  const bulkBtn = document.getElementById('btnBulkAddCourses');
  if(bulkBtn) bulkBtn.hidden = !bulkEnabled;
  // Both "New course" and "Bulk Courses" showing at once -> shrink to
  // icon-only so the bank header stays uncluttered. Only one showing ->
  // keep its label so it's clear what the button does.
  document.getElementById('bankHead')?.classList.toggle('bank__head--compact', bulkEnabled);
}

function activeDays(){ return state.days.filter(d=>d.enabled); }

/* Maps JS getDay() (0=Sun) to our default day-id short labels, used to
   guess which column is "today" even if the user has renamed/reordered
   days. We match on the 3-letter label prefix (Sat/Sun/Mon/...), which is
   locale-stable for the default schema and a reasonable heuristic for
   custom ones. */
const WEEKDAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function todaysDayId(){
  const now = new Date();
  const short = WEEKDAY_SHORT[now.getDay()];
  const match = state.days.find(d=> (d.label||'').trim().toLowerCase().startsWith(short.toLowerCase()));
  return match ? match.id : null;
}

function renderGrid(){
  const grid = document.getElementById('routineGrid');
  const days = activeDays();
  const times = state.times;
  const todayId = todaysDayId();

  grid.style.gridTemplateColumns = `var(--time-col-w) repeat(${days.length}, var(--day-col-w))`;
  grid.style.gridTemplateRows = `auto repeat(${times.length}, minmax(var(--row-h), auto))`;
  grid.innerHTML = '';

  // corner
  const corner = document.createElement('div');
  corner.className = 'g-cell g-corner';
  corner.innerHTML = '<i data-lucide="clock"></i>';
  grid.appendChild(corner);

  const editable = !!state.features?.editFromGrid;

  // day headers
  days.forEach(day=>{
    const h = document.createElement('div');
    h.className = 'g-cell g-day-head' + (day.id===todayId ? ' is-today' : '') + (editable ? ' is-grid-editable' : '');
    h.innerHTML = `${escapeHtml(day.label)}`;
    if(editable){
      h.title = 'Click to rename this day';
      h.addEventListener('click', ()=> startGridDayEdit(h, day));
    }
    grid.appendChild(h);
  });

  // rows
  times.forEach(time=>{
    const th = document.createElement('div');
    th.className = 'g-cell g-time-head' + (editable ? ' is-grid-editable' : '');
    th.textContent = time.label;
    if(editable){
      th.title = 'Click to edit this time slot';
      th.addEventListener('click', ()=> startGridTimeEdit(th, time));
    }
    grid.appendChild(th);

    days.forEach(day=>{
      const slot = document.createElement('div');
      slot.className = 'g-cell g-slot' + (day.id===todayId ? ' is-today-col' : '');
      slot.dataset.dayId = day.id;
      slot.dataset.timeId = time.id;
      attachSlotDnD(slot);

      const placements = state.placements.filter(p=>p.dayId===day.id && p.timeId===time.id);
      placements.forEach(p=>{
        const course = courseById(p.courseId);
        if(!course) return;
        slot.appendChild(buildCourseCard(course, p));
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'g-slot__add';
      addBtn.type = 'button';
      addBtn.title = 'Add a course here';
      addBtn.setAttribute('aria-label', 'Add a course to this slot');
      addBtn.innerHTML = '<i data-lucide="plus"></i>';
      addBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        openCellPicker(day.id, time.id, addBtn);
      });
      slot.appendChild(addBtn);

      // Clicking empty space in the cell (not a card, not the add button)
      // also opens the picker — gated behind a Settings > Features toggle
      // (off by default) since it changes what a plain click on the grid
      // does.
      slot.addEventListener('click', (e)=>{
        if(!state.features?.clickEmptyCellToAdd) return;
        if(e.target.closest('.course-card') || e.target.closest('.g-slot__add')) return;
        openCellPicker(day.id, time.id, slot);
      });

      grid.appendChild(slot);
    });
  });

  if(window.lucide) lucide.createIcons();
}

/* =========================================================================
   EDIT FROM GRID — click a day header or time-slot header on the grid
   itself to rename/edit it inline, without opening Settings. Gated behind
   Settings > Features > "Edit from grid" (on by default).
   ========================================================================= */

function startGridDayEdit(headEl, day){
  if(headEl.querySelector('input')) return; // already editing
  const original = day.label;
  headEl.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'g-head-edit';
  input.value = original;
  headEl.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const commit = ()=>{
    if(done) return; done = true;
    const val = input.value.trim();
    day.label = val || original;
    saveState();
    renderGrid();
  };
  const cancel = ()=>{
    if(done) return; done = true;
    renderGrid();
  };
  input.addEventListener('click', e=> e.stopPropagation());
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); input.blur(); }
    else if(e.key === 'Escape'){ e.preventDefault(); cancel(); }
  });
}

function startGridTimeEdit(headEl, time){
  if(headEl.querySelector('input')) return; // already editing
  const original = time.label;
  headEl.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'g-head-edit';
  input.value = original;
  headEl.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const commit = ()=>{
    if(done) return; done = true;
    const val = input.value.trim();
    time.label = val || original;
    saveState();
    renderGrid();
  };
  const cancel = ()=>{
    if(done) return; done = true;
    renderGrid();
  };
  input.addEventListener('click', e=> e.stopPropagation());
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); input.blur(); }
    else if(e.key === 'Escape'){ e.preventDefault(); cancel(); }
  });
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
    <button class="course-card__duplicate" type="button" title="Duplicate this class" aria-label="Duplicate this class"><i data-lucide="copy-plus"></i></button>
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
  card.querySelector('.course-card__duplicate').addEventListener('click', (e)=>{
    e.stopPropagation();
    duplicatePlacement(placement.id);
  });

  return card;
}

/* Duplicates a placed class into the same day/time cell (stacks below the
   original, since a cell can already hold multiple course cards). Copies
   every slot-field value (room, note, and any custom ones) along with it. */
function duplicatePlacement(placementId){
  const p = state.placements.find(pl=>pl.id===placementId);
  if(!p) return;
  const copy = { id: uid('pl'), courseId: p.courseId, dayId: p.dayId, timeId: p.timeId };
  state.slotFields.forEach(f=>{ copy[f.key] = p[f.key] || ''; });
  state.placements.push(copy);
  saveState();
  renderGrid();
  showToast('Class duplicated.');
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
      state.placements.push(makeNewPlacement(payload.courseId, dayId, timeId));
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
   CELL COURSE PICKER (click '+' or an empty cell to choose instead of drag)
   ========================================================================= */

let cellPickerTarget = null; // { dayId, timeId }
let cellPickerAnchorEl = null;

function openCellPicker(dayId, timeId, anchorEl){
  cellPickerTarget = { dayId, timeId };
  cellPickerAnchorEl = anchorEl;
  const searchInput = document.getElementById('cellPickerSearchInput');
  if(searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('btnCellPickerSearchClear');
  if(clearBtn) clearBtn.hidden = true;

  renderCellPickerList();

  // Position near the anchor (falls back to centered if it doesn't fit)
  const picker = document.getElementById('cellPicker');
  picker.hidden = false;
  positionCellPicker(picker, anchorEl);
  if(window.lucide) lucide.createIcons();
  if(searchInput) searchInput.focus();
}

function renderCellPickerList(){
  const list = document.getElementById('cellPickerList');
  const searchInput = document.getElementById('cellPickerSearchInput');
  const query = searchInput ? searchInput.value : '';
  list.innerHTML = '';

  const courses = state.courses.filter(c=>courseMatchesSearch(c, query));

  if(state.courses.length === 0){
    const empty = document.createElement('div');
    empty.className = 'cell-picker__empty';
    empty.textContent = 'No courses in your bank yet — create one below.';
    list.appendChild(empty);
  } else if(courses.length === 0){
    const empty = document.createElement('div');
    empty.className = 'cell-picker__empty';
    empty.textContent = 'No courses match your search.';
    list.appendChild(empty);
  } else {
    courses.forEach(course=>{
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'cell-picker__item';
      item.style.borderLeftColor = course.color;
      const sub = [course.courseCode, course.teacherName].filter(Boolean).join(' · ');
      item.innerHTML = `
        <span class="cell-picker__item-name">${escapeHtml(courseTitle(course))}</span>
        ${sub ? `<span class="cell-picker__item-sub">${escapeHtml(sub)}</span>` : ''}
      `;
      const target = cellPickerTarget;
      item.addEventListener('click', ()=>{
        if(!target) return;
        addCourseToSlot(course.id, target.dayId, target.timeId);
        closeCellPicker();
      });
      list.appendChild(item);
    });
  }

  const picker = document.getElementById('cellPicker');
  if(!picker.hidden && cellPickerAnchorEl) positionCellPicker(picker, cellPickerAnchorEl);
}

function positionCellPicker(picker, anchorEl){
  const rect = anchorEl.getBoundingClientRect();
  const pickerW = 260, pickerH = Math.min(picker.scrollHeight || 320, 360);
  let left = rect.left;
  let top = rect.bottom + 6;
  if(left + pickerW > window.innerWidth - 10) left = window.innerWidth - pickerW - 10;
  if(top + pickerH > window.innerHeight - 10) top = rect.top - pickerH - 6;
  if(top < 10) top = 10;
  if(left < 10) left = 10;
  picker.style.left = left + 'px';
  picker.style.top = top + 'px';
}

function closeCellPicker(){
  document.getElementById('cellPicker').hidden = true;
  cellPickerTarget = null;
  cellPickerAnchorEl = null;
}

function openCourseEditorForCell(){
  if(!cellPickerTarget) return;
  const target = cellPickerTarget;
  closeCellPicker();
  openCourseEditor(null, target);
}

/* =========================================================================
   COURSE BANK
   ========================================================================= */

/* Matches a course against a free-text search query across Course Code,
   Course Name, Teacher Name, and Teacher Shortcode. Case-insensitive,
   matches if the query appears anywhere in any of those fields. */
function courseMatchesSearch(course, query){
  if(!query) return true;
  const q = query.trim().toLowerCase();
  if(!q) return true;
  const haystack = [course.courseCode, course.courseName, course.teacherName, course.teacherShort]
    .filter(Boolean).join(' \u0000 ').toLowerCase();
  return haystack.includes(q);
}

function renderBank(){
  const list = document.getElementById('bankList');
  const searchInput = document.getElementById('bankSearchInput');
  const query = searchInput ? searchInput.value : '';
  list.innerHTML = '';
  const courses = state.courses.filter(c=>courseMatchesSearch(c, query));
  list.classList.toggle('is-search-empty', state.courses.length > 0 && courses.length === 0);
  courses.forEach(course=>{
    const chip = document.createElement('div');
    chip.className = 'course-chip';
    chip.style.borderLeftColor = course.color;
    chip.draggable = true;
    chip.dataset.courseId = course.id;

    const metaBits = [];
    if(course.teacherName || course.teacherShort) metaBits.push(course.teacherShort || course.teacherName);
    if(course.section && fieldByKey('section')?.enabled) metaBits.push('Sec ' + course.section);

    chip.innerHTML = `
      <div class="course-chip__actions">
        <button class="course-chip__duplicate" title="Duplicate course" aria-label="Duplicate course"><i data-lucide="copy-plus"></i></button>
        <button class="course-chip__edit" title="Edit course" aria-label="Edit course"><i data-lucide="pencil"></i></button>
      </div>
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
    chip.querySelector('.course-chip__duplicate').addEventListener('click', (e)=>{
      e.stopPropagation();
      duplicateCourse(course.id);
    });
    chip.addEventListener('click', ()=> openCourseEditor(course.id));

    list.appendChild(chip);
  });
  if(window.lucide) lucide.createIcons();
}

/* Duplicate a course in the bank (used by the chip's duplicate icon).
   The copy is a plain bank entry — not yet placed on the grid — so the
   user can drag/click it into whichever cell they want. */
function duplicateCourse(courseId){
  const course = courseById(courseId);
  if(!course) return;
  const copy = Object.assign({}, course, { id: uid('c') });
  copy.courseName = (copy.courseName ? copy.courseName + ' (copy)' : 'Untitled course (copy)');
  state.courses.push(copy);
  saveState();
  renderBank();
  showToast('Course duplicated.');
}

/* Removes every course in the bank that has no placement on the grid.
   Placements themselves are untouched (a course with at least one
   placement is kept, regardless of search/filter state). */
function removeUnusedCourses(){
  const usedCourseIds = new Set(state.placements.map(p=>p.courseId));
  const unused = state.courses.filter(c=>!usedCourseIds.has(c.id));
  if(unused.length === 0){ showToast('No unused courses to remove.'); return; }
  if(!confirm(`Remove ${unused.length} unused course${unused.length===1?'':'s'} from the bank? This can't be undone.`)) return;
  state.courses = state.courses.filter(c=>usedCourseIds.has(c.id));
  saveState();
  renderBank();
  showToast(`Removed ${unused.length} unused course${unused.length===1?'':'s'}.`);
}

/* Builds a new placement object, blank slot-field values except 'room'
   which is seeded from the course's default room number if set. Shared by
   drag-drop, the '+' icon popover, and clicking an empty cell. */
function makeNewPlacement(courseId, dayId, timeId){
  const course = courseById(courseId);
  const p = { id: uid('pl'), courseId, dayId, timeId };
  state.slotFields.forEach(f=>{
    p[f.key] = (f.key === 'room' && course?.defaultRoom) ? course.defaultRoom : '';
  });
  return p;
}

/* Places a course into a specific day/time slot. Shared by drag-drop, the
   '+' icon popover, and clicking an empty cell. */
function addCourseToSlot(courseId, dayId, timeId){
  const course = courseById(courseId);
  if(!course) return;
  state.placements.push(makeNewPlacement(courseId, dayId, timeId));
  saveState();
  renderGrid();
  showToast('Added to grid.');
}

/* =========================================================================
   COURSE EDITOR MODAL (create / edit a course in the bank)
   ========================================================================= */

let editingCourseId = null;
let pendingPlacementTarget = null; // { dayId, timeId } — set when created via the '+' cell picker

function openCourseEditor(courseId, placeIntoSlot){
  editingCourseId = courseId || null;
  pendingPlacementTarget = placeIntoSlot || null;
  const course = courseId ? courseById(courseId) : null;
  document.getElementById('courseModalTitle').innerHTML = `<i data-lucide="book-open"></i> ${course ? 'Edit course' : 'New course'}`;
  document.getElementById('btnDeleteCourse').style.display = course ? 'inline-flex' : 'none';

  const body = document.getElementById('courseFormBody');
  const primary = primaryFields();
  const more = moreFields();
  const colorVal = course?.color || COURSE_PALETTE[state.courses.length % COURSE_PALETTE.length];

  const fieldHtml = (f)=>`
    <div class="form-field">
      <label for="cf_${f.key}">${escapeHtml(f.label)}</label>
      ${f.type === 'textarea'
        ? `<textarea id="cf_${f.key}" data-key="${f.key}">${escapeHtml(course?.[f.key] || '')}</textarea>`
        : `<input type="${f.type==='tel'?'tel':'text'}" id="cf_${f.key}" data-key="${f.key}" value="${escapeHtml(course?.[f.key] || '')}">`
      }
    </div>
  `;

  body.innerHTML = `
    <div class="form-grid">
      ${primary.map(fieldHtml).join('')}
      <div class="form-field">
        <label>Color</label>
        <div class="color-swatches" id="colorSwatches"></div>
      </div>
      ${more.length ? `
        <button type="button" class="see-more-toggle" id="btnSeeMoreFields" aria-expanded="false">
          <i data-lucide="chevron-down"></i> <span>See more fields</span>
        </button>
        <div class="form-grid form-grid--more" id="moreFieldsGrid" hidden>
          ${more.map(fieldHtml).join('')}
        </div>
      ` : ''}
    </div>
  `;

  const seeMoreBtn = document.getElementById('btnSeeMoreFields');
  if(seeMoreBtn){
    const moreGrid = document.getElementById('moreFieldsGrid');
    // Auto-expand if any "more" field already has a value, so editing an
    // existing course never hides data the user needs to see/change.
    const hasMoreValue = more.some(f=> course?.[f.key]);
    if(hasMoreValue){
      moreGrid.hidden = false;
      seeMoreBtn.setAttribute('aria-expanded', 'true');
      seeMoreBtn.querySelector('span').textContent = 'See fewer fields';
    }
    seeMoreBtn.addEventListener('click', ()=>{
      const expanded = seeMoreBtn.getAttribute('aria-expanded') === 'true';
      moreGrid.hidden = expanded;
      seeMoreBtn.setAttribute('aria-expanded', String(!expanded));
      seeMoreBtn.querySelector('span').textContent = expanded ? 'See more fields' : 'See fewer fields';
    });
  }

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
  if(window.lucide) lucide.createIcons();
}

function closeCourseEditor(){
  document.getElementById('courseOverlay').hidden = true;
  editingCourseId = null;
  pendingPlacementTarget = null;
}

function saveCourseFromForm(){
  const body = document.getElementById('courseFormBody');
  const inputs = body.querySelectorAll('[data-key]');
  const data = {};
  inputs.forEach(inp => data[inp.dataset.key] = inp.value.trim());
  const selectedSwatch = body.querySelector('.swatch.is-selected');
  const color = selectedSwatch ? selectedSwatch.dataset.hex : COURSE_PALETTE[0];

  let savedCourseId;
  if(editingCourseId){
    const course = courseById(editingCourseId);
    Object.assign(course, data, { color });
    savedCourseId = course.id;
  } else {
    const newCourse = Object.assign({ id: uid('c'), color }, data);
    state.courses.push(newCourse);
    savedCourseId = newCourse.id;
  }
  saveState();
  renderBank();
  renderGrid();

  const target = pendingPlacementTarget;
  closeCourseEditor();

  if(target){
    addCourseToSlot(savedCourseId, target.dayId, target.timeId);
  } else {
    showToast('Course saved.');
  }
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
   BULK ADD COURSES (Settings > Features toggle) — paste many courses at
   once, one per line, in any mix of these formats:
     "CSE-1121: Computer Programming I"   (code + name)
     "CSE 1122"                            (code only)
     "Computer Programming I"              (name only)
   Parsed course code detection is a heuristic (short, contains a digit,
   at most one space/dash separator) since there's no strict standard for
   course code formats across institutions.
   ========================================================================= */

function looksLikeCourseCode(s){
  if(!s || s.length > 15) return false;
  if(!/\d/.test(s)) return false; // course codes always carry a number
  // letters + digits with at most one separator (a single space or dash),
  // e.g. "CSE-1121", "CSE 1122", "101", "CS5"
  return /^[A-Za-z]+[\s-][A-Za-z0-9]+$/.test(s) || /^[A-Za-z]*\d[A-Za-z0-9]*$/.test(s);
}

/* Parses one pasted line into {courseCode, courseName}. Returns null for
   blank lines. Strips common list bullets/numbering so pasted lists from
   docs/PDFs (e.g. "1) CSE-1121: ...") still parse cleanly. */
function parseBulkCourseLine(rawLine){
  let line = rawLine.trim();
  if(!line) return null;
  line = line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
  if(!line) return null;

  const colonIdx = line.indexOf(':');
  if(colonIdx > -1){
    const left = line.slice(0, colonIdx).trim();
    const right = line.slice(colonIdx + 1).trim();
    if(left && right && looksLikeCourseCode(left)){
      return { courseCode: left, courseName: right };
    }
    // Colon present but the left side doesn't look like a code (e.g. a
    // sentence) — treat the whole line as a course name instead.
    return { courseCode: '', courseName: line };
  }

  if(looksLikeCourseCode(line)){
    return { courseCode: line, courseName: '' };
  }
  return { courseCode: '', courseName: line };
}

let bulkAddParsedRows = []; // [{ id, courseCode, courseName, included }]

function openBulkAddModal(){
  document.getElementById('bulkAddTextarea').value = '';
  bulkAddParsedRows = [];
  renderBulkAddPreview();
  document.getElementById('bulkAddOverlay').hidden = false;
  document.getElementById('bulkAddTextarea').focus();
  if(window.lucide) lucide.createIcons();
}

function closeBulkAddModal(){
  document.getElementById('bulkAddOverlay').hidden = true;
  bulkAddParsedRows = [];
}

function reparseBulkAddTextarea(){
  const text = document.getElementById('bulkAddTextarea').value;
  bulkAddParsedRows = text.split(/\r?\n/)
    .map(parseBulkCourseLine)
    .filter(Boolean)
    .map(row=>({ id: uid('bulk'), courseCode: row.courseCode, courseName: row.courseName, included: true }));
  renderBulkAddPreview();
}

function renderBulkAddPreview(){
  const head = document.getElementById('bulkAddPreviewHead');
  const countEl = document.getElementById('bulkAddPreviewCount');
  const list = document.getElementById('bulkAddPreview');
  const confirmBtn = document.getElementById('btnConfirmBulkAdd');
  list.innerHTML = '';

  if(bulkAddParsedRows.length === 0){
    head.hidden = true;
    confirmBtn.disabled = true;
    return;
  }
  head.hidden = false;

  bulkAddParsedRows.forEach(row=>{
    const unmatched = !row.courseCode && !row.courseName;
    const el = document.createElement('div');
    el.className = 'bulk-add__row' + (unmatched ? ' is-unmatched' : '');
    el.innerHTML = `
      <input type="checkbox" ${row.included ? 'checked' : ''} data-role="include">
      <div class="bulk-add__row-fields">
        <input type="text" class="bulk-add__row-code" data-role="code" value="${escapeHtml(row.courseCode)}" placeholder="Code">
        <input type="text" class="bulk-add__row-name" data-role="name" value="${escapeHtml(row.courseName)}" placeholder="Course name">
      </div>
    `;
    el.querySelector('[data-role="include"]').addEventListener('change', (e)=>{
      row.included = e.target.checked;
      updateBulkAddConfirmState();
    });
    el.querySelector('[data-role="code"]').addEventListener('input', (e)=>{ row.courseCode = e.target.value; });
    el.querySelector('[data-role="name"]').addEventListener('input', (e)=>{ row.courseName = e.target.value; });
    list.appendChild(el);
  });

  updateBulkAddConfirmState();
}

function updateBulkAddConfirmState(){
  const included = bulkAddParsedRows.filter(r=>r.included && (r.courseCode || r.courseName));
  const countEl = document.getElementById('bulkAddPreviewCount');
  countEl.textContent = `${included.length} of ${bulkAddParsedRows.length} course${bulkAddParsedRows.length===1?'':'s'} will be added`;
  document.getElementById('btnConfirmBulkAdd').disabled = included.length === 0;
}

function confirmBulkAdd(){
  const rows = bulkAddParsedRows.filter(r=>r.included && (r.courseCode || r.courseName));
  if(rows.length === 0) return;
  rows.forEach(row=>{
    const color = COURSE_PALETTE[state.courses.length % COURSE_PALETTE.length];
    state.courses.push({
      id: uid('c'),
      color,
      courseName: row.courseName || '',
      courseCode: row.courseCode || ''
    });
  });
  saveState();
  renderBank();
  closeBulkAddModal();
  showToast(`Added ${rows.length} course${rows.length===1?'':'s'} to the bank.`);
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

let currentDetailCourseId = null;

function openCardDetail(course, placement){
  currentDetailPlacementId = placement.id;
  currentDetailCourseId = course.id;
  document.getElementById('cardDetailTitle').textContent = courseTitle(course);

  const day = dayById(placement.dayId), time = timeById(placement.timeId);
  const body = document.getElementById('cardDetailBody');

  const infoFields = enabledFields().filter(f=> f.key!=='courseName' && f.key!=='defaultRoom' && course[f.key]);
  const iconFor = (key)=>({
    courseCode:'hash', teacherName:'user', teacherShort:'user-check', teacherMobile:'phone',
    section:'users', sectionNote:'sticky-note', crName:'shield-user', crMobile:'phone-call'
  }[key] || 'info');
  const slotIconFor = (key)=>({ room:'map-pin', note:'calendar-clock' }[key] || 'edit-3');

  body.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <i data-lucide="calendar-days"></i>
        <div>
          <div class="detail-label">When</div>
          <div class="detail-value">${escapeHtml(day?.label||'')} · ${escapeHtml(time?.label||'')}</div>
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
      ${enabledSlotFields().map(f=>`
        <div class="detail-item detail-editable">
          <i data-lucide="${slotIconFor(f.key)}"></i>
          <div style="flex:1">
            <div class="detail-label">${escapeHtml(f.label)}</div>
            ${f.type==='textarea'
              ? `<textarea data-slot-key="${f.key}" placeholder="e.g. Class moved this week, bring calculator...">${escapeHtml(placement[f.key]||'')}</textarea>`
              : `<input type="${f.type==='tel'?'tel':'text'}" data-slot-key="${f.key}" value="${escapeHtml(placement[f.key]||'')}" placeholder="e.g. Room 402">`
            }
          </div>
        </div>
      `).join('')}
      <div class="detail-divider"></div>
      <div class="detail-item">
        <i data-lucide="palette"></i>
        <div style="flex:1">
          <div class="detail-label">Chip color</div>
          <div class="color-swatches" id="detailColorSwatches" style="margin-top:6px"></div>
        </div>
      </div>
    </div>
  `;

  const swatchWrap = document.getElementById('detailColorSwatches');
  COURSE_PALETTE.forEach(hex=>{
    const sw = document.createElement('div');
    sw.className = 'swatch' + (hex.toLowerCase()===(course.color||'').toLowerCase() ? ' is-selected' : '');
    sw.style.background = hex;
    sw.dataset.hex = hex;
    sw.addEventListener('click', ()=>{
      swatchWrap.querySelectorAll('.swatch').forEach(s=>s.classList.remove('is-selected'));
      sw.classList.add('is-selected');
      course.color = hex;
      saveState();
      renderGrid();
      renderBank();
    });
    swatchWrap.appendChild(sw);
  });

  document.getElementById('cardDetailOverlay').hidden = false;
  if(window.lucide) lucide.createIcons();

  body.querySelectorAll('input[data-slot-key]').forEach(el=>{
    el.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter') closeCardDetail();
    });
  });
}

function saveCardDetailEdits(){
  if(!currentDetailPlacementId) return;
  const p = state.placements.find(pl=>pl.id===currentDetailPlacementId);
  if(!p) return;
  document.querySelectorAll('#cardDetailBody [data-slot-key]').forEach(el=>{
    p[el.dataset.slotKey] = el.value.trim();
  });
  saveState();
  renderGrid();
}

function closeCardDetail(){
  saveCardDetailEdits();
  document.getElementById('cardDetailOverlay').hidden = true;
  currentDetailPlacementId = null;
  currentDetailCourseId = null;
}

function editCourseFromDetail(){
  if(!currentDetailCourseId) return;
  const courseId = currentDetailCourseId;
  saveCardDetailEdits();
  document.getElementById('cardDetailOverlay').hidden = true;
  currentDetailPlacementId = null;
  currentDetailCourseId = null;
  openCourseEditor(courseId);
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
      <input type="text" class="time-label" value="${escapeHtml(time.label)}" data-role="label" placeholder="10:40am - 11:30am">
      <span style="flex:1"></span>
      <button class="row-del" title="Remove time slot" data-role="delete"><i data-lucide="trash-2"></i></button>
    `;
    row.querySelector('[data-role="label"]').addEventListener('input', (e)=>{ time.label = e.target.value; saveState(); renderGrid(); });
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
  state.times.push({ id: uid('t'), label: 'New time slot' });
  saveState(); renderTimeEditor(); renderGrid();
}

/* =========================================================================
   BULK ADD TIME SLOTS — inline panel (no partitioning; one line = one slot)
   ========================================================================= */

function openBulkTimesPanel(){
  document.getElementById('bulkTimesTextarea').value = '';
  document.getElementById('bulkTimesPanel').hidden = false;
  updateBulkTimesCount();
  document.getElementById('bulkTimesTextarea').focus();
}

function closeBulkTimesPanel(){
  document.getElementById('bulkTimesPanel').hidden = true;
  document.getElementById('bulkTimesTextarea').value = '';
  updateBulkTimesCount();
}

function parseBulkTimesLines(){
  const text = document.getElementById('bulkTimesTextarea').value;
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

function updateBulkTimesCount(){
  const lines = parseBulkTimesLines();
  const countEl = document.getElementById('bulkTimesCount');
  const confirmBtn = document.getElementById('btnConfirmBulkTimes');
  countEl.textContent = lines.length === 0 ? '' : `${lines.length} time slot${lines.length===1?'':'s'} will be added`;
  confirmBtn.disabled = lines.length === 0;
}

function confirmBulkTimes(){
  const lines = parseBulkTimesLines();
  if(lines.length === 0) return;
  lines.forEach(label=>{
    state.times.push({ id: uid('t'), label });
  });
  saveState(); renderTimeEditor(); renderGrid();
  closeBulkTimesPanel();
  showToast(`Added ${lines.length} time slot${lines.length===1?'':'s'}.`, 'ok');
}

/* =========================================================================
   SETTINGS — Course fields
   Fields are shown in one draggable list. A "See more" divider row marks
   where the primary/collapsed split happens in the course editor — drag
   any field above or below it to change its group. Fields dropped below
   the divider go in the 'more' (collapsed) group; above it, 'primary'.
   ========================================================================= */

const SEE_MORE_DIVIDER = { __divider: true };

function renderFieldEditor(){
  renderFieldListEditor({
    wrapId: 'fieldEditor',
    list: state.fields,
    withGroups: true,
    onChange: ()=>{ saveState(); renderBank(); renderGrid(); }
  });
  wireAddFieldForm({
    inputId: 'newFieldLabel',
    typeSelectId: 'newFieldType',
    btnId: 'btnAddField',
    list: state.fields,
    defaultGroup: 'more',
    onAdd: ()=>{ saveState(); renderFieldEditor(); renderBank(); renderGrid(); }
  });
}

function renderSlotFieldEditor(){
  renderFieldListEditor({
    wrapId: 'slotFieldEditor',
    list: state.slotFields,
    withGroups: false,
    onChange: ()=>{ saveState(); renderGrid(); }
  });
  wireAddFieldForm({
    inputId: 'newSlotFieldLabel',
    typeSelectId: 'newSlotFieldType',
    btnId: 'btnAddSlotField',
    list: state.slotFields,
    defaultGroup: null,
    onAdd: ()=>{ saveState(); renderSlotFieldEditor(); renderGrid(); }
  });
}

/* Shared renderer for both the Course fields and Slot fields lists.
   When withGroups is true, a draggable "See more" divider row is inserted
   between the 'primary' and 'more' groups; dragging a field row (or the
   divider itself) across that line updates each field's group. */
function renderFieldListEditor({ wrapId, list, withGroups, onChange }){
  const wrap = document.getElementById(wrapId);
  wrap.innerHTML = '';

  const items = withGroups
    ? [...list.filter(f=>(f.group||'primary')!=='more'), SEE_MORE_DIVIDER, ...list.filter(f=>f.group==='more')]
    : [...list];

  const reorderAndRegroup = (fromIdx, toIdx)=>{
    const [moved] = items.splice(fromIdx,1);
    items.splice(toIdx,0,moved);
    // Rebuild list order + group from the new item order (dropping the divider marker)
    let group = 'primary';
    const next = [];
    items.forEach(it=>{
      if(it===SEE_MORE_DIVIDER){ group = 'more'; return; }
      if(withGroups) it.group = group;
      next.push(it);
    });
    list.length = 0;
    list.push(...next);
    onChange();
    renderFieldListEditor({ wrapId, list, withGroups, onChange });
  };

  items.forEach((f, idx)=>{
    let row;
    if(f === SEE_MORE_DIVIDER){
      row = document.createElement('div');
      row.className = 'field-divider-row';
      row.innerHTML = `<span class="row-drag" title="Drag to move the split"><i data-lucide="grip-vertical"></i></span><i data-lucide="chevron-down"></i> See more (collapsed by default)`;
    } else {
      row = document.createElement('div');
      row.className = 'field-toggle-row';
      row.innerHTML = `
        <span class="row-drag" title="Drag to reorder"><i data-lucide="grip-vertical"></i></span>
        <input type="checkbox" ${f.enabled?'checked':''} ${f.core?'disabled title="Always on"':''} data-role="enabled">
        <input type="text" value="${escapeHtml(f.label)}" data-role="label">
        <span class="field-key">${f.type}</span>
        ${f.custom ? `<button class="row-del" title="Delete field" data-role="delete"><i data-lucide="trash-2"></i></button>` : ''}
      `;
      row.querySelector('[data-role="enabled"]').addEventListener('change', (e)=>{
        f.enabled = e.target.checked; onChange();
      });
      row.querySelector('[data-role="label"]').addEventListener('input', (e)=>{
        f.label = e.target.value; onChange();
      });
      const delBtn = row.querySelector('[data-role="delete"]');
      if(delBtn){
        delBtn.addEventListener('click', ()=>{
          if(!confirm(`Delete the "${f.label}" field? Any values already entered for it will be lost.`)) return;
          const i = list.indexOf(f);
          if(i>-1) list.splice(i,1);
          onChange();
          renderFieldListEditor({ wrapId, list, withGroups, onChange });
        });
      }
    }
    row.draggable = true;
    row.dataset.index = idx;
    wrap.appendChild(row);
  });

  // Self-contained drag-reorder (not the generic attachRowReorder helper,
  // since regrouping across the divider needs the drop target's index).
  let dragFromIdx = null;
  wrap.querySelectorAll('[draggable="true"]').forEach(row=>{
    row.addEventListener('dragstart', ()=>{ dragFromIdx = parseInt(row.dataset.index,10); row.classList.add('dragging'); });
    row.addEventListener('dragend', ()=> row.classList.remove('dragging'));
    row.addEventListener('dragover', (e)=> e.preventDefault());
    row.addEventListener('drop', (e)=>{
      e.preventDefault();
      const toIdx = parseInt(row.dataset.index,10);
      if(dragFromIdx===null || isNaN(toIdx) || dragFromIdx===toIdx) return;
      reorderAndRegroup(dragFromIdx, toIdx);
    });
  });

  if(window.lucide) lucide.createIcons();
}

/* Wires the small "add a field" form shared by Course fields and Slot
   fields tabs. Uses a data-wired guard so repeated renderFieldEditor()/
   renderSlotFieldEditor() calls (e.g. every time Settings is opened) don't
   stack duplicate click listeners on the same button. Generates a unique
   key from the label (e.g. "Building" -> "f_building", "f_building_2" if
   taken) so it never collides with existing field keys. */
function wireAddFieldForm({ inputId, typeSelectId, btnId, list, defaultGroup, onAdd }){
  const btn = document.getElementById(btnId);
  if(!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  const doAdd = ()=>{
    const input = document.getElementById(inputId);
    const typeSelect = document.getElementById(typeSelectId);
    const label = input.value.trim();
    if(!label){ showToast('Enter a field name first.', 'error'); return; }
    const baseKey = 'f_' + (label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,30) || 'field');
    let key = baseKey, n = 2;
    while(list.some(f=>f.key===key)){ key = `${baseKey}_${n++}`; }
    const newField = { key, label, type: typeSelect.value, enabled: true, core: false, custom: true };
    if(defaultGroup) newField.group = defaultGroup;
    list.push(newField);
    input.value = '';
    onAdd();
  };
  btn.addEventListener('click', doAdd);
  const input = document.getElementById(inputId);
  if(input){
    input.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){ e.preventDefault(); doAdd(); }
    });
  }
}

/* =========================================================================
   SETTINGS — general wiring
   ========================================================================= */

function openSettings(){
  renderDayEditor();
  renderTimeEditor();
  renderFieldEditor();
  renderSlotFieldEditor();
  document.getElementById('setRoutineName').value = state.routineName;
  document.getElementById('setAccentColor').value = state.accent;
  document.getElementById('setDensity').value = state.density;
  document.getElementById('setRightClickDelete').checked = !!state.features?.rightClickDelete;
  document.getElementById('setConfirmBeforeDelete').checked = !!state.features?.confirmBeforeDelete;
  document.getElementById('setClickEmptyCellToAdd').checked = !!state.features?.clickEmptyCellToAdd;
  document.getElementById('setBulkAddCourses').checked = !!state.features?.bulkAddCourses;
  document.getElementById('setEditFromGrid').checked = !!state.features?.editFromGrid;
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
  lines.push('# MyRoutine Customizer Export');
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
  lines.push('id\tlabel');
  state.times.forEach(t=> lines.push([t.id, tsvEscape(t.label)].join('\t')));
  lines.push('');

  lines.push('[FIELDS]');
  lines.push('key\tlabel\ttype\tenabled\tcore\tgroup');
  state.fields.forEach(f=> lines.push([f.key, tsvEscape(f.label), f.type, f.enabled, f.core, f.group||'primary'].join('\t')));
  lines.push('');

  lines.push('[SLOTFIELDS]');
  lines.push('key\tlabel\ttype\tenabled\tcore');
  state.slotFields.forEach(f=> lines.push([f.key, tsvEscape(f.label), f.type, f.enabled, f.core].join('\t')));
  lines.push('');

  const fieldKeys = state.fields.map(f=>f.key);
  lines.push('[COURSES]');
  lines.push(['id','color', ...fieldKeys].join('\t'));
  state.courses.forEach(c=>{
    lines.push([c.id, c.color, ...fieldKeys.map(k=> tsvEscape(c[k]||''))].join('\t'));
  });
  lines.push('');

  const slotFieldKeys = state.slotFields.map(f=>f.key);
  lines.push('[PLACEMENTS]');
  lines.push(['id','courseId','dayId','timeId', ...slotFieldKeys].join('\t'));
  state.placements.forEach(p=>{
    lines.push([p.id, p.courseId, p.dayId, p.timeId, ...slotFieldKeys.map(k=> tsvEscape(p[k]||''))].join('\t'));
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
    state = mergeIntoDefaultState(parsed);
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
      const text = reader.result;
      if(/^\[TIMES\]\s*[\r\n]+id\tstart\tend/m.test(text) || !/^\[SLOTFIELDS\]/m.test(text)){
        showToast('That .txt file is from an older, unsupported version — please re-export or use JSON.', 'error');
        return;
      }
      const parsed = parseTxtExport(text);
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
  s.days = []; s.times = []; s.fields = []; s.slotFields = []; s.courses = []; s.placements = [];

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
      if(row.start !== undefined || row.end !== undefined){
        // Older export format (separate start/end columns) is no longer
        // supported — skip these rows rather than importing bad data.
        continue;
      }
      s.times.push({ id: row.id, label: tsvUnescape(row.label) });
    } else if(section === 'FIELDS'){
      s.fields.push({ key: row.key, label: tsvUnescape(row.label), type: row.type, enabled: row.enabled==='true', core: row.core==='true', group: row.group || 'primary' });
    } else if(section === 'SLOTFIELDS'){
      s.slotFields.push({ key: row.key, label: tsvUnescape(row.label), type: row.type, enabled: row.enabled==='true', core: row.core==='true' });
    } else if(section === 'COURSES'){
      const course = { id: row.id, color: row.color };
      header.slice(2).forEach(k=> course[k] = tsvUnescape(row[k]));
      s.courses.push(course);
    } else if(section === 'PLACEMENTS'){
      const p = { id: row.id, courseId: row.courseId, dayId: row.dayId, timeId: row.timeId };
      header.slice(4).forEach(k=> p[k] = tsvUnescape(row[k]));
      s.placements.push(p);
    }
  }

  if(s.days.length===0) s.days = defaultState().days;
  if(s.times.length===0) s.times = defaultState().times;
  if(s.fields.length===0) s.fields = defaultState().fields;
  if(s.slotFields.length===0) s.slotFields = defaultState().slotFields;
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
  // Today's column uses a color-mix() background/box-shadow for its tint
  // and side borders. html2canvas (the export library) predates color-mix
  // support and can't parse it, which throws and fails the ENTIRE export
  // (both PNG and PDF go through this same clone). It's just a visual
  // highlight, not meaningful in a static export, so strip it here.
  clone.querySelectorAll('.is-today-col').forEach(el=>{ el.classList.remove('is-today-col'); });
  clone.querySelectorAll('.g-day-head.is-today').forEach(el=>{ el.classList.remove('is-today'); });
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
  document.getElementById('btnBulkAddTimes').addEventListener('click', ()=>{
    const panel = document.getElementById('bulkTimesPanel');
    if(panel.hidden) openBulkTimesPanel(); else closeBulkTimesPanel();
  });
  document.getElementById('btnCancelBulkTimes').addEventListener('click', closeBulkTimesPanel);
  document.getElementById('btnConfirmBulkTimes').addEventListener('click', confirmBulkTimes);
  document.getElementById('bulkTimesTextarea').addEventListener('input', updateBulkTimesCount);

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
  document.getElementById('setClickEmptyCellToAdd').addEventListener('change', (e)=>{
    state.features.clickEmptyCellToAdd = e.target.checked; saveState(); applyAppearance();
  });
  document.getElementById('setBulkAddCourses').addEventListener('change', (e)=>{
    state.features.bulkAddCourses = e.target.checked; saveState(); applyAppearance();
  });
  document.getElementById('setEditFromGrid').addEventListener('change', (e)=>{
    state.features.editFromGrid = e.target.checked; saveState(); renderGrid();
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

  // Course bank search
  const bankSearchInput = document.getElementById('bankSearchInput');
  const btnBankSearchClear = document.getElementById('btnBankSearchClear');
  bankSearchInput.addEventListener('input', ()=>{
    btnBankSearchClear.hidden = bankSearchInput.value.length === 0;
    renderBank();
  });
  btnBankSearchClear.addEventListener('click', ()=>{
    bankSearchInput.value = '';
    btnBankSearchClear.hidden = true;
    renderBank();
    bankSearchInput.focus();
  });
  document.getElementById('btnRemoveUnusedCourses').addEventListener('click', removeUnusedCourses);

  // Course editor modal
  document.getElementById('btnAddCourse').addEventListener('click', ()=> openCourseEditor(null));
  document.getElementById('btnCloseCourse').addEventListener('click', closeCourseEditor);
  document.getElementById('btnCancelCourse').addEventListener('click', closeCourseEditor);
  document.getElementById('courseOverlay').addEventListener('click', (e)=>{ if(e.target.id==='courseOverlay') closeCourseEditor(); });
  document.getElementById('btnSaveCourse').addEventListener('click', saveCourseFromForm);
  document.getElementById('btnDeleteCourse').addEventListener('click', deleteCourseFromEditor);

  // Bulk add courses modal (Settings > Features toggle controls button visibility)
  document.getElementById('btnBulkAddCourses').addEventListener('click', openBulkAddModal);
  document.getElementById('btnCloseBulkAdd').addEventListener('click', closeBulkAddModal);
  document.getElementById('btnCancelBulkAdd').addEventListener('click', closeBulkAddModal);
  document.getElementById('bulkAddOverlay').addEventListener('click', (e)=>{ if(e.target.id==='bulkAddOverlay') closeBulkAddModal(); });
  document.getElementById('btnConfirmBulkAdd').addEventListener('click', confirmBulkAdd);
  let bulkAddDebounce = null;
  document.getElementById('bulkAddTextarea').addEventListener('input', ()=>{
    clearTimeout(bulkAddDebounce);
    bulkAddDebounce = setTimeout(reparseBulkAddTextarea, 200);
  });
  document.getElementById('btnBulkAddSelectAll').addEventListener('click', ()=>{
    bulkAddParsedRows.forEach(r=> r.included = true); renderBulkAddPreview();
  });
  document.getElementById('btnBulkAddSelectNone').addEventListener('click', ()=>{
    bulkAddParsedRows.forEach(r=> r.included = false); renderBulkAddPreview();
  });

  // Card detail modal
  document.getElementById('btnCloseCardDetail').addEventListener('click', closeCardDetail);
  document.getElementById('btnCloseCardDetail2').addEventListener('click', closeCardDetail);
  document.getElementById('cardDetailOverlay').addEventListener('click', (e)=>{ if(e.target.id==='cardDetailOverlay') closeCardDetail(); });
  document.getElementById('btnRemoveFromGrid').addEventListener('click', removeCurrentPlacement);
  document.getElementById('btnEditCourseFromDetail').addEventListener('click', editCourseFromDetail);

  // Cell course picker (the '+' icon / empty-cell click popover)
  document.getElementById('btnCloseCellPicker').addEventListener('click', closeCellPicker);
  document.getElementById('btnCellPickerNew').addEventListener('click', openCourseEditorForCell);
  const cellPickerSearchInput = document.getElementById('cellPickerSearchInput');
  const btnCellPickerSearchClear = document.getElementById('btnCellPickerSearchClear');
  cellPickerSearchInput.addEventListener('input', ()=>{
    btnCellPickerSearchClear.hidden = cellPickerSearchInput.value.length === 0;
    renderCellPickerList();
  });
  cellPickerSearchInput.addEventListener('click', (e)=> e.stopPropagation());
  cellPickerSearchInput.addEventListener('keydown', (e)=> e.stopPropagation());
  btnCellPickerSearchClear.addEventListener('click', ()=>{
    cellPickerSearchInput.value = '';
    btnCellPickerSearchClear.hidden = true;
    renderCellPickerList();
    cellPickerSearchInput.focus();
  });
  document.addEventListener('click', (e)=>{
    const picker = document.getElementById('cellPicker');
    if(picker.hidden) return;
    if(e.target.closest('#cellPicker') || e.target.closest('.g-slot')) return;
    closeCellPicker();
  });
  window.addEventListener('resize', ()=>{ if(!document.getElementById('cellPicker').hidden) closeCellPicker(); });

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
    if(!document.getElementById('cellPicker').hidden) closeCellPicker();
    else if(!document.getElementById('cardDetailOverlay').hidden) closeCardDetail();
    else if(!document.getElementById('courseOverlay').hidden) closeCourseEditor();
    else if(!document.getElementById('bulkAddOverlay').hidden) closeBulkAddModal();
    else if(!document.getElementById('jsonOverlay').hidden) closeJsonModal();
    else if(!document.getElementById('settingsOverlay').hidden) closeSettings();
  });

  // Enter submits the primary action of whichever modal is open — mirrors
  // native form behavior. Skipped inside a <textarea> (where Enter should
  // insert a newline) and while a <select> is focused (native browser
  // handling already covers Enter there). accountOverlay is excluded since
  // auth.js wires its own Enter handling (it needs to disable the button and
  // manage its own loading state around the async login/register call).
  const ENTER_SUBMIT_MAP = [
    { overlay: 'courseOverlay', button: 'btnSaveCourse' },
    { overlay: 'jsonOverlay',   button: 'btnImportJson' },
  ];
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Enter') return;
    if(e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
    for(const {overlay, button} of ENTER_SUBMIT_MAP){
      const overlayEl = document.getElementById(overlay);
      if(overlayEl && !overlayEl.hidden && overlayEl.contains(e.target)){
        e.preventDefault();
        document.getElementById(button)?.click();
        return;
      }
    }
  });
}

/* =========================================================================
   LIVE CLOCK — "August 23 (Sun), 2026; 12:03:03 PM"
   ========================================================================= */

function formatLiveClock(now){
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const datePart = `${months[now.getMonth()]} ${now.getDate()} (${weekdays[now.getDay()]}), ${now.getFullYear()}`;
  let h = now.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if(h === 0) h = 12;
  const pad = (n)=> String(n).padStart(2,'0');
  const timePart = `${h}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`;
  return `${datePart}; ${timePart}`;
}

let liveClockTimer = null;
function startLiveClock(){
  const el = document.getElementById('liveClock');
  if(!el) return;
  const tick = ()=>{ el.textContent = formatLiveClock(new Date()); };
  tick();
  clearInterval(liveClockTimer);
  liveClockTimer = setInterval(tick, 1000);
}

/* =========================================================================
   OFFLINE INDICATOR
   ========================================================================= */

function updateOfflineBadge(){
  const badge = document.getElementById('offlineBadge');
  if(!badge) return;
  badge.hidden = navigator.onLine;
  if(window.lucide) lucide.createIcons();
}

/* =========================================================================
   CLICK-AND-DRAG SCROLL (grid area) — lets a mouse-down + move scroll the
   grid, so users on desktop can pan without a trackpad/scrollbar, and so
   an in-progress card drag is easier to steer toward off-screen cells.
   Only engages for plain left-button presses on empty grid chrome (not on
   cards, buttons, or draggable chips) so native HTML5 drag still works.
   ========================================================================= */

function attachClickDragScroll(container){
  let isPanning = false;
  let startX, startY, scrollLeft, scrollTop;

  container.addEventListener('mousedown', (e)=>{
    if(e.button !== 0) return;
    if(e.target.closest('.course-card, .g-slot__add, button, a, input, textarea, [draggable="true"]')) return;
    isPanning = true;
    container.classList.add('is-panning');
    startX = e.pageX; startY = e.pageY;
    scrollLeft = container.scrollLeft; scrollTop = container.scrollTop;
  });
  window.addEventListener('mousemove', (e)=>{
    if(!isPanning) return;
    e.preventDefault();
    container.scrollLeft = scrollLeft - (e.pageX - startX);
    container.scrollTop = scrollTop - (e.pageY - startY);
  });
  window.addEventListener('mouseup', ()=>{
    if(!isPanning) return;
    isPanning = false;
    container.classList.remove('is-panning');
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
  startLiveClock();
  updateOfflineBadge();
  window.addEventListener('online', updateOfflineBadge);
  window.addEventListener('offline', updateOfflineBadge);
  attachClickDragScroll(document.getElementById('gridScroll'));
  if(window.lucide) lucide.createIcons();
})();