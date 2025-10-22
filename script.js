/* DailyEdge – all interactions (Home, Timer, Planner, Calculator)
   No HTML/CSS changes needed. Drop this file in and link it at the end of index.html.
*/

document.addEventListener('DOMContentLoaded', () => {
  // -----------------------------
  // Helpers
  // -----------------------------
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const todayKey = () => new Date().toISOString().slice(0,10);

  // -----------------------------
  // State (persist in localStorage)
  // -----------------------------
  const STORAGE_KEY = 'dailyedge:v1';
  const defaults = {
    date: todayKey(),
    studySeconds: 0,
    sessions: 0,
    tasks: [],     // {id, text, done}
    completed: 0
  };

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return {...defaults};
      const data = JSON.parse(raw);
      if (data.date !== todayKey()){
        data.date = todayKey();
        data.studySeconds = 0;
        data.sessions = 0;
      }
      return {...defaults, ...data};
    }catch{
      return {...defaults};
    }
  }
  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{}
  }
  const state = loadState();

  // -----------------------------
  // Home stats
  // -----------------------------
  function findStatCard(labelNeedle){
    return $$('.card.stat').find(card => {
      const t = card.querySelector('.label')?.textContent?.toLowerCase() || '';
      return t.includes(labelNeedle);
    });
  }
  const studyCard = findStatCard('study time') || $('.cards-2 .card.stat:nth-child(1)');
  const activeCard = findStatCard('active tasks') || $('.cards-2 .card.stat:nth-child(2)');

  const studyValueEl    = studyCard?.querySelector('.value');
  const studySessionsEl = studyCard?.querySelector('.muted');
  const activeValueEl   = activeCard?.querySelector('.value');
  const activeMutedEl   = activeCard?.querySelector('.muted');

  function renderHomeStats(){
    if (studyValueEl)    studyValueEl.textContent    = `${Math.floor(state.studySeconds/60)}m`;
    if (studySessionsEl) studySessionsEl.textContent = `${state.sessions} session${state.sessions===1?'':'s'}`;
    const activeCount = state.tasks.filter(t=>!t.done).length;
    if (activeValueEl)   activeValueEl.textContent   = String(activeCount);
    if (activeMutedEl)   activeMutedEl.textContent   = `${state.completed} completed`;
  }

  studyCard?.addEventListener('click', () => navigate('timer'));
  activeCard?.addEventListener('click', () => navigate('planner'));

  // -----------------------------
  // Panels + Tabs
  // -----------------------------
  const panels = {
    home: null,
    timer: $('#panel-timer'),
    planner: $('#panel-planner'),
    calculator: $('#panel-calculator')
  };
  const tabs = $$('.tabbar .tab');

  function hideAllPanels(){ Object.keys(panels).forEach(k => { if(panels[k]) panels[k].hidden = true; }); }
  function setActiveTab(name){ tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name)); }
  function navigate(name){
    setActiveTab(name);
    if (name === 'home'){ hideAllPanels(); window.scrollTo({top:0, behavior:'smooth'}); return; }
    hideAllPanels();
    const panel = panels[name]; if (!panel) return;
    panel.hidden = false; panel.scrollTop = 0;
  }

  $('.tabbar')?.addEventListener('click', e => {
    const tab = e.target.closest('.tab'); if (!tab) return;
    navigate(tab.dataset.tab);
  });

  const quickMap = { 'open-timer':'timer', 'open-planner':'planner', 'open-calculator':'calculator' };
  $('.action-list')?.addEventListener('click', e => {
    const item = e.target.closest('.action-item'); if (!item) return;
    const target = quickMap[item.dataset.action]; if (target) navigate(target);
  });

  // -----------------------------
  // TIMER (with target minutes)
  // -----------------------------
  const timerPanel   = panels.timer;
  const timerDisplay = $('#timerDisplay');

  function ensureTimerSettings(){
    if (!timerPanel || $('#timerSettings', timerPanel)) return;
    const box = document.createElement('div');
    box.className = 'timer-ui';
    box.id = 'timerSettings';
    box.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <label for="targetMins" style="font-weight:600;">Set study time (minutes)</label>
        <input id="targetMins" type="number" min="1" step="1" value="25"
               style="flex:0 0 100px; padding:10px 12px; border-radius:12px; border:1px solid #e6e9ef; background:#fff;" />
        <button class="btn primary" id="applyTarget" type="button">Apply</button>
        <span id="targetInfo" style="color:#6b7280;">Pomodoro tip: 25 min focus + short break</span>
      </div>
      <div id="timerProgress" style="height:8px; background:#eef2ff; border-radius:999px; margin-top:10px; overflow:hidden;">
        <div id="timerProgressBar" style="height:100%; width:0%; background:#2563eb; border-radius:999px;"></div>
      </div>
    `;
    timerPanel.querySelector('.panel-inner')?.insertBefore(box, timerPanel.querySelector('.timer-ui'));
    $('#applyTarget').addEventListener('click', () => {
      const mins = clamp(parseInt($('#targetMins').value,10) || 25, 1, 600);
      setTarget(mins*60);
    });
  }

  let raf = null, last = 0, running = false;
  let elapsedSec = 0;   // seconds in current session
  let targetSec  = 0;   // 0 = no target

  const fmt = (s) => {
    s = Math.floor(s);
    const h = String(Math.floor(s/3600)).padStart(2,'0');
    const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
    const sec = String(s%60).padStart(2,'0');
    return `${h}:${m}:${sec}`;
  };
  function renderTimer(){
    const left = targetSec ? Math.max(targetSec - elapsedSec, 0) : elapsedSec;
    if (timerDisplay) timerDisplay.textContent = fmt(left);
    const pct = targetSec ? clamp((elapsedSec/targetSec)*100, 0, 100) : 0;
    const bar = $('#timerProgressBar'); if (bar) bar.style.width = `${pct}%`;
  }
  function tick(now){
    if(!running) return;
    const dt = (now - last)/1000; last = now;
    elapsedSec += dt;
    if (targetSec && elapsedSec >= targetSec){ stopTimer(true); return; }
    renderTimer();
    raf = requestAnimationFrame(tick);
  }
  function startTimer(){ if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
  function pauseTimer(){ running = false; if (raf) cancelAnimationFrame(raf); raf = null; }
  function stopTimer(finished=false){
    pauseTimer();
    const add = Math.round(elapsedSec);
    state.studySeconds += add;
    if (finished) state.sessions += 1;
    saveState(); renderHomeStats();
    try{ navigator.vibrate?.(finished?[120,80,120]:80); }catch{}
    try{
      const C = window.AudioContext || window.webkitAudioContext;
      if (C){ const ctx = new C(); const o=ctx.createOscillator(), g=ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type='sine'; o.frequency.value = finished?880:440; g.gain.value=0.1;
        o.start(); setTimeout(()=>{o.stop(); ctx.close();}, finished?500:250);
      }
    }catch{}
    elapsedSec = 0; renderTimer();
  }
  function resetTimer(){ pauseTimer(); elapsedSec = 0; renderTimer(); }
  function setTarget(sec){
    targetSec = clamp(sec|0, 0, 24*3600);
    const info = $('#targetInfo');
    if (info) info.textContent = targetSec ? `Target set: ${Math.round(targetSec/60)} min` : 'No target set';
    renderTimer();
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-timer]'); if (!btn) return;
    const a = btn.dataset.timer;
    if (a==='start') startTimer();
    if (a==='pause') pauseTimer();
    if (a==='reset') resetTimer();
  });

  // -----------------------------
  // PLANNER
  // -----------------------------
  const taskForm  = $('#taskForm');
  const taskInput = $('#taskInput');
  const taskList  = $('#taskList');

  const escapeHTML = (s) => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  function renderTasks(){
    if (!taskList) return;
    taskList.innerHTML = '';
    state.tasks.forEach(t=>{
      const li = document.createElement('li'); li.dataset.id = t.id;
      li.innerHTML = `
        <span class="task-text" style="${t.done?'text-decoration:line-through; opacity:.7;':''}">${escapeHTML(t.text)}</span>
        <div>
          <button class="btn" data-task="done">${t.done?'Undo':'Done'}</button>
          <button class="btn danger" data-task="delete">Delete</button>
        </div>`;
      taskList.appendChild(li);
    });
    const activeCount = state.tasks.filter(x=>!x.done).length;
    const doneCount   = state.tasks.filter(x=> x.done).length;
    state.completed = doneCount; saveState(); renderHomeStats();
  }
  function addTask(text){
    state.tasks.unshift({ id: crypto.randomUUID?.() || String(Date.now()+Math.random()), text, done:false });
    saveState(); renderTasks();
  }
  function toggleTask(id){ const t = state.tasks.find(x=>x.id===id); if(!t) return; t.done=!t.done; saveState(); renderTasks(); }
  function deleteTask(id){ const i = state.tasks.findIndex(x=>x.id===id); if(i>=0) state.tasks.splice(i,1); saveState(); renderTasks(); }

  taskForm?.addEventListener('submit', e=>{
    e.preventDefault();
    const text = taskInput.value.trim(); if(!text) return;
    addTask(text); taskInput.value=''; taskInput.focus();
  });
  taskList?.addEventListener('click', e=>{
    const btn = e.target.closest('[data-task]'); if(!btn) return;
    const li = btn.closest('li'); if(!li) return;
    if (btn.dataset.task==='done') toggleTask(li.dataset.id);
    if (btn.dataset.task==='delete') deleteTask(li.dataset.id);
  });

  // -----------------------------
  // GRADE CALCULATOR (Points + Weighted)
  // -----------------------------
  const calcPanel = panels.calculator;

  function buildGradeCalculator(){
    if (!calcPanel) return;

    // Hide the old GPA demo form if present
    calcPanel.querySelector('.gpa-form')?.setAttribute('hidden','true');
    calcPanel.querySelector('#gpaResult')?.setAttribute('hidden','true');

    // Prevent duplicate build
    if ($('#gradeCalc', calcPanel)) return;

    const wrap = document.createElement('div');
    wrap.id = 'gradeCalc';
    wrap.className = 'card';
    wrap.style.padding = '16px';
    wrap.style.marginTop = '10px';
    wrap.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <button class="btn primary" type="button" data-mode="simple">Points</button>
        <button class="btn" type="button" data-mode="weighted">Weighted</button>
      </div>

      <!-- Simple Points Mode -->
      <div id="mode-simple">
        <form id="simpleForm" class="gpa-form">
          <div class="grid">
            <input id="sEarned"   type="number" inputmode="decimal" min="0" step="0.01" placeholder="Points earned" />
            <input id="sPossible" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Points possible" />
          </div>
          <button class="btn primary" type="submit">Calculate</button>
        </form>
        <div id="simpleOut" class="gpa-result" style="margin-top:8px;"></div>
      </div>

      <!-- Weighted Mode -->
      <div id="mode-weighted" hidden>
        <div id="rows"></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin:10px 0;">
          <button id="addRow" class="btn" type="button">Add category</button>
          <button id="calcWeighted" class="btn primary" type="button">Calculate Final</button>
        </div>
        <div style="color:#6b7280; margin-top:4px;">Weights should total 100%. If not, we’ll normalize automatically.</div>
        <div id="weightedOut" class="gpa-result" style="margin-top:8px;"></div>
      </div>
    `;
    calcPanel.querySelector('.panel-inner')?.appendChild(wrap);

    // Row builder for weighted mode
    const rowsBox = $('#rows', wrap);
    function addRow(prefill = {}){
      const row = document.createElement('div');
      row.className = 'wrow';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = 'minmax(120px,1.2fr) minmax(90px,1fr) minmax(90px,1fr) minmax(90px,1fr) auto';
      row.style.gap = '8px';
      row.style.marginTop = '8px';
      row.innerHTML = `
        <input type="text" placeholder="Category (e.g., Exams)" value="${prefill.name||''}" />
        <input type="number" inputmode="decimal" min="0" step="0.01" placeholder="Earned"  value="${prefill.earned??''}" />
        <input type="number" inputmode="decimal" min="0" step="0.01" placeholder="Possible" value="${prefill.possible??''}" />
        <input type="number" inputmode="decimal" min="0" step="0.01" placeholder="Weight %" value="${prefill.weight??''}" />
        <button class="btn danger" type="button" aria-label="Remove">✕</button>
      `;
      rowsBox.appendChild(row);
    }

    // Defaults (three rows like your screenshot)
    addRow({name:'Exams',    earned:'', possible:'', weight:40});
    addRow({name:'Quizzes',  earned:'', possible:'', weight:20});
    addRow({name:'Homework', earned:'', possible:'', weight:40});

    // Mode toggle
    const seg = wrap.querySelectorAll('[data-mode]');
    function switchMode(which){
      seg.forEach(b => b.classList.toggle('primary', b.dataset.mode===which));
      $('#mode-simple', wrap).hidden   = which !== 'simple';
      $('#mode-weighted', wrap).hidden = which !== 'weighted';
    }
    seg.forEach(b => b.addEventListener('click', () => switchMode(b.dataset.mode)));
    switchMode('simple');

    // Simple form calculation
    $('#simpleForm', wrap).addEventListener('submit', e => {
      e.preventDefault();
      const earned   = parseFloat($('#sEarned').value);
      const possible = parseFloat($('#sPossible').value);
      const out = $('#simpleOut');
      if (!(earned >= 0) || !(possible > 0)) {
        out.textContent = 'Enter valid numbers (possible must be > 0).';
        return;
      }
      const pct = (earned / possible) * 100;
      out.textContent = `Score: ${pct.toFixed(2)}%`;
    });

    // Weighted calculation
    $('#addRow', wrap).addEventListener('click', () => addRow());
    rowsBox.addEventListener('click', e => {
      if (e.target.matches('.btn.danger')) e.target.closest('.wrow')?.remove();
    });
    $('#calcWeighted', wrap).addEventListener('click', () => {
      const rows = $$('.wrow', wrap).map(row => {
        const [nameEl, eEl, pEl, wEl] = row.querySelectorAll('input');
        return {
          name: nameEl.value.trim() || 'Category',
          earned: parseFloat(eEl.value),
          possible: parseFloat(pEl.value),
          weight: parseFloat(wEl.value)
        };
      }).filter(r => (r.earned >= 0) && (r.possible > 0));

      const out = $('#weightedOut', wrap);
      if (!rows.length) { out.textContent = 'Add at least one valid category.'; return; }

      // If no weights provided, treat as equal weights
      let hasAnyWeight = rows.some(r => r.weight > 0);
      let totalW = hasAnyWeight ? rows.reduce((s,r) => s + (r.weight>0 ? r.weight : 0), 0) : rows.length;

      if (totalW <= 0) { out.textContent = 'Please set weights or leave all blank for equal weighting.'; return; }

      // Compute weighted sum (normalize weights automatically)
      let sum = 0;
      const breakdown = [];
      rows.forEach(r => {
        const pct = (r.earned / r.possible) * 100;                  // category percentage
        const w   = hasAnyWeight ? (r.weight / totalW) : (1 / rows.length); // normalized weight (0..1)
        sum += pct * w;
        breakdown.push({name:r.name, pct, w});
      });

      const lines = breakdown.map(b => `${b.name}: ${b.pct.toFixed(2)}% × ${(b.w*100).toFixed(1)}% = ${(b.pct*b.w).toFixed(2)}%`);
      out.innerHTML = `
        Final Grade: <strong>${sum.toFixed(2)}%</strong>
        <div style="color:#6b7280; margin-top:6px;">${lines.join('<br>')}</div>
      `;
    });
  }

  // -----------------------------
  // Optional: Ads placeholder (future)
  // -----------------------------
  const Ads = {
    injectBanner(){
      const premiumCard = $('.card.premium');
      if (!premiumCard || $('#adBanner')) return;
      const banner = document.createElement('div');
      banner.id = 'adBanner';
      banner.className = 'card';
      banner.style.cssText = 'margin:10px 0; padding:14px; border-radius:16px; border:1px solid #e6e9ef; background:#fff;';
      banner.innerHTML = '<div style="font-weight:700; margin-bottom:4px;">Sponsored</div><div style="color:#6b7280;">Your ad here (300×100). Replace later with your ad SDK.</div>';
      premiumCard.parentNode.insertBefore(banner, premiumCard);
    }
  };
  // To enable in future: Ads.injectBanner();

  // -----------------------------
  // Boot
  // -----------------------------
  ensureTimerSettings();
  buildGradeCalculator();
  renderHomeStats();
  renderTasks();
  navigate('home');
});