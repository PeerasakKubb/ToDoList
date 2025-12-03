(() => {
	const LS_KEY = 'slo_data_v1';
	let state = { classes: [], tasks: [] };

	// Utilities
	const $ = sel => document.querySelector(sel);
	const save = () => localStorage.setItem(LS_KEY, JSON.stringify(state));
	const load = () => {
		const raw = localStorage.getItem(LS_KEY);
		if (raw) state = JSON.parse(raw);
		renderAll();
		// notify UI
		notifyDataUpdated();
	};
	const now = () => new Date();
	const clamp = (v,min,max) => Math.min(max, Math.max(min, v));

	// helper: notify UI about new state (UI may render in its own way)
	function notifyDataUpdated() {
		try {
			const free = computeFreeSlots();
			const totalFreeHours = free.reduce((s,slot) => s + (slot.end - slot.start) / 3600000, 0);
			if (window.onDataUpdated) window.onDataUpdated({
				classes: state.classes,
				tasks: state.tasks,
				freeSlotsSummaryHours: totalFreeHours
			});
			// update hero stats if available
			if (window.updateHeroStats) window.updateHeroStats(state.tasks.length, totalFreeHours);
		} catch (e) {
			console.warn('notifyDataUpdated err', e);
		}
	}

	// parse day string to weekday index (support Thai/Eng short)
	const dayToIndex = d => {
		if (!d) return null;
		const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6,
			อา:0, อ:0, จ:1, อจ:1, จันทร์:1, อ:1, อ1:1, อาา:0, อท:4,
			จ:1, อาา:0, ศ:5, ส:6, พ:3, พฤ:4, ศุบ:5 };
		// try english first (prefix)
		const en = d.slice(0,3);
		if (map[en] !== undefined) return map[en];
		// trim and use first two chars
		const t = d.trim().slice(0,2);
		for (const k in map) if (k === d || k === t) return map[k];
		// fallback: try parse as number or today
		return (new Date()).getDay();
	};

	// CRUD handlers
	const classForm = $('#classForm');
	if (classForm) {
		classForm.addEventListener('submit', e => {
			e.preventDefault();
			const f = e.target;
			const obj = {
				id: 'c_' + Date.now(),
				name: f.name.value.trim(),
				day: f.day.value.trim(),
				start: f.start.value,
				end: f.end.value
			};
			state.classes.push(obj);
			save();
			renderAll();
			notifyDataUpdated();
			f.reset();
		});
	}

	const taskForm = $('#taskForm');
	if (taskForm) {
		taskForm.addEventListener('submit', e => {
			e.preventDefault();
			const f = e.target;
			const obj = {
				id: 't_' + Date.now(),
				title: f.title.value.trim(),
				est: parseFloat(f.est.value) || 0,
				deadline: f.deadline.value,
				createdAt: new Date().toISOString()
			};
			state.tasks.push(obj);
			save();
			renderAll();
			notifyDataUpdated();
			f.reset();
		});
	}

	// Render
	function renderAll() {
		renderClasses();
		renderTasks();
		renderFreeSlotsShort();
	}

	function renderClasses() {
		const container = $('#classList');
		if (!container) return;
		container.innerHTML = '';
		state.classes.slice().reverse().forEach(c => {
			const d = document.createElement('div');
			d.className = 'list-item';
			d.innerHTML = `<div style="display:flex;gap:12px;align-items:center">
				<div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.02);display:grid;place-items:center">${escapeHtml((c.name||'')[0]||'C')}</div>
				<div>
					<div style="font-weight:600;color:#fff">${escapeHtml(c.name)}</div>
					<div class="item-meta">${escapeHtml(c.day)} ${escapeHtml(c.start)} - ${escapeHtml(c.end)}</div>
				</div>
			</div>
			<div style="display:flex;gap:8px;align-items:center">
				<button class="btn ghost delClass" data-id="${c.id}">ลบ</button>
			</div>`;
			container.appendChild(d);
		});
		// delete handlers
		container.querySelectorAll('.delClass').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = btn.dataset.id;
				state.classes = state.classes.filter(x => x.id !== id);
				save(); renderAll(); notifyDataUpdated();
			});
		});
	}

	function renderTasks() {
		const container = $('#taskList');
		if (!container) return;
		// sort by priority descending
		const tasks = state.tasks.slice().sort((a,b) => priority(b) - priority(a));
		// If page provides renderTaskRow, use it (modern UI)
		if (window.renderTaskRow) {
			container.innerHTML = '';
			tasks.forEach(t => {
				const p = priority(t);
				const obj = Object.assign({}, t, { priority: p });
				window.renderTaskRow(obj);
			});
			// add delete buttons next to suggest buttons
			setTimeout(() => {
				container.querySelectorAll('button[data-id]').forEach(btn => {
					const id = btn.dataset.id;
					// avoid adding duplicate delete buttons
					if (btn.nextElementSibling && btn.nextElementSibling.classList.contains('del')) return;
					const del = document.createElement('button');
					del.className = 'btn ghost del';
					del.textContent = 'ลบ';
					del.style.marginLeft = '6px';
					del.addEventListener('click', () => {
						state.tasks = state.tasks.filter(x => x.id !== id);
						save(); renderAll(); notifyDataUpdated();
					});
					btn.insertAdjacentElement('afterend', del);
				});
			}, 50);
			return;
		}
		// fallback rendering (older UI)
		container.innerHTML = '';
		tasks.forEach(t => {
			const li = document.createElement('li');
			li.innerHTML = `<div>
				<strong>${escapeHtml(t.title)}</strong> <small>est:${t.est}h deadline:${(new Date(t.deadline)).toLocaleString()}</small>
				</div>
				<div>
				<button data-id="${t.id}" class="suggest">แนะนำเวลา</button>
				<button data-id="${t.id}" class="del">ลบ</button>
				</div>`;
			container.appendChild(li);
		});
		container.querySelectorAll('.del').forEach(b => {
			b.addEventListener('click', () => {
				state.tasks = state.tasks.filter(x => x.id !== b.dataset.id);
				save(); renderAll(); notifyDataUpdated();
			});
		});
		container.querySelectorAll('.suggest').forEach(b => {
			b.addEventListener('click', () => {
				const task = state.tasks.find(x => x.id === b.dataset.id);
				$('#realtimeSuggestion').textContent = computeStartSuggestion(task);
				startLiveUpdate(task.id);
			});
		});
	}

	// Priority heuristic
	function priority(task) {
		const nowMs = Date.now();
		const dl = new Date(task.deadline).getTime();
		const hoursLeft = Math.max((dl - nowMs) / (3600*1000), 0.01);
		const urgency = (task.est || 0) / hoursLeft + 0.01 * (1 / (1 + ((nowMs - new Date(task.createdAt))/3600/1000)));
		return urgency;
	}

	// Compute free slots for next 7 days
	function computeFreeSlots() {
		const start = new Date();
		const endWindow = new Date(start); endWindow.setDate(start.getDate() + 7);
		let busy = [];
		state.classes.forEach(c => {
			const w = dayToIndex(c.day);
			if (w === null || w === undefined) return;
			for (let d = new Date(start); d <= endWindow; d.setDate(d.getDate()+1)) {
				if (d.getDay() === w) {
					const s = new Date(d); const e = new Date(d);
					const [sh, sm] = (c.start||'00:00').split(':').map(Number);
					const [eh, em] = (c.end||'00:00').split(':').map(Number);
					s.setHours(sh, sm, 0, 0);
					e.setHours(eh, em, 0, 0);
					// ignore invalid intervals
					if (e <= s) continue;
					busy.push({start:new Date(s), end:new Date(e), title:c.name});
				}
			}
		});
		// merge
		busy.sort((a,b)=>a.start - b.start);
		const merged = [];
		busy.forEach(iv => {
			if (!merged.length) { merged.push({start:new Date(iv.start), end:new Date(iv.end)}); return; }
			const last = merged[merged.length-1];
			if (iv.start <= last.end) {
				if (iv.end > last.end) last.end = new Date(iv.end);
			} else merged.push({start:new Date(iv.start), end:new Date(iv.end)});
		});
		// derive free slots between now and endWindow
		const free = [];
		let cursor = new Date();
		for (const iv of merged) {
			if (iv.end < cursor) continue;
			if (iv.start > cursor) free.push({ start: new Date(cursor), end: new Date(iv.start) });
			cursor = new Date(Math.max(cursor, iv.end));
		}
		if (cursor < endWindow) free.push({ start: new Date(cursor), end: endWindow });
		return free;
	}

	// render free slots brief
	function renderFreeSlotsShort() {
		const ul = $('#freeSlots');
		if (!ul) return;
		const slots = computeFreeSlots();
		ul.innerHTML = '';
		slots.forEach(s => {
			const dur = (s.end - s.start) / 3600000;
			const div = document.createElement('div');
			div.className = 'free-slot';
			div.textContent = `${s.start.toLocaleString()} → ${s.end.toLocaleString()} (${dur.toFixed(1)} ชม.)`;
			ul.appendChild(div);
		});
		// update hero stats
		const totalFree = slots.reduce((a,b)=> a + (b.end - b.start)/3600000, 0);
		if (window.updateHeroStats) window.updateHeroStats(state.tasks.length, totalFree);
	}

	// Sleep recommendation
	const sleepBtn = $('#sleepRecBtn');
	if (sleepBtn) {
		sleepBtn.addEventListener('click', () => {
			const wakeVal = $('#wakeTime') ? $('#wakeTime').value || '07:00' : '07:00';
			const [wh,wm] = wakeVal.split(':').map(Number);
			const totalWork = state.tasks.reduce((s,t) => s + (t.est||0), 0);
			const add = Math.min(2, Math.floor(totalWork / 5));
			const sleepHours = 7 + add;
			let wake = new Date(); wake.setHours(wh, wm, 0, 0);
			if (wake.getTime() < Date.now()) wake.setDate(wake.getDate()+1);
			const bedtime = new Date(wake.getTime() - sleepHours * 3600000);
			const el = $('#sleepRecommendation');
			if (el) el.textContent = `แนะนำเข้านอนประมาณ ${bedtime.toLocaleString()} (นอน ${sleepHours} ชม.) — งานคงเหลือ ${totalWork.toFixed(1)} ชม.`;
		});
	}

	// Compute start suggestion for a task
	function computeStartSuggestion(task) {
		if (!task) return 'งานไม่พบ';
		const free = computeFreeSlots();
		const estMs = (task.est || 0) * 3600000;
		const deadline = new Date(task.deadline);
		const nowD = new Date();
		// first try contiguous slot
		for (const slot of free) {
			const s = new Date(Math.max(slot.start, nowD));
			const e = new Date(Math.min(slot.end, deadline));
			if (e <= s) continue;
			if (e - s >= estMs) {
				const suggestedStart = new Date(s.getTime());
				return `เริ่มที่ ${suggestedStart.toLocaleString()} (จะเสร็จก่อน ${deadline.toLocaleString()})`;
			}
		}
		// try split greedy
		let remaining = estMs;
		let parts = [];
		for (const slot of free) {
			if (slot.end <= nowD) continue;
			const s = new Date(Math.max(slot.start, nowD));
			const e = new Date(Math.min(slot.end, deadline));
			if (e <= s) continue;
			const take = Math.min(remaining, e - s);
			parts.push({start: new Date(s), durationMs: take});
			remaining -= take;
			if (remaining <= 0) break;
		}
		if (remaining <= 0) {
			const first = parts[0];
			return `แนะนำเริ่ม ${first.start.toLocaleString()} แบ่ง ${parts.length} ช่วงจนเสร็จ`;
		}
		return 'ไม่พบช่วงว่างพอภายใน deadline — พิจารณาปรับ deadline หรือลดงาน';
	}
	// expose by id for UI bridge
	window.computeStartSuggestionForId = function(id) {
		const t = state.tasks.find(x => x.id === id);
		return computeStartSuggestion(t);
	};

	// Compute and show plan (bound to #compute)
	const computeBtn = $('#compute');
	if (computeBtn) {
		computeBtn.addEventListener('click', () => {
			renderFreeSlotsShort();
			notifyDataUpdated();
		});
	}

	// Auto-plan via AI (simple: produce suggestions for each task)
	window.computeAutoPlan = function() {
		const tasks = state.tasks.slice().sort((a,b) => priority(b)-priority(a));
		if (!tasks.length) {
			if (window.appendAIHistory) window.appendAIHistory('ไม่มีงานให้จัดแผน', true);
			return;
		}
		tasks.forEach(t => {
			const s = computeStartSuggestion(t);
			if (window.appendAIHistory) window.appendAIHistory(`Aurora: สำหรับ "${t.title}" -> ${s}`, true);
		});
		notifyDataUpdated();
	};

	// simple AI suggest function
	window.aiSuggest = function() {
		if (!state.tasks.length) {
			if (window.appendAIHistory) window.appendAIHistory('Aurora: ไม่มีงานในระบบ', true);
			return;
		}
		const top = state.tasks.slice().sort((a,b)=> priority(b)-priority(a))[0];
		const r = computeStartSuggestion(top);
		if (window.appendAIHistory) window.appendAIHistory(`Aurora แนะนำสำหรับ "${top.title}": ${r}`, true);
		const el = $('#realtimeSuggestion'); if (el) el.textContent = `Aurora: ${r}`;
	};

	// Live updater to refresh suggestion text every minute
	let liveInterval = null;
	function startLiveUpdate(taskId) {
		if (liveInterval) clearInterval(liveInterval);
		liveInterval = setInterval(() => {
			const task = state.tasks.find(t => t.id === taskId);
			if (task) {
				const txt = computeStartSuggestion(task);
				const el = $('#realtimeSuggestion');
				if (el) el.textContent = txt;
			}
		}, 60*1000);
	}

	// small helpers
	function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

	// initial load
	load();

	// expose state for debugging
	window._SLO_state = state;
})();
