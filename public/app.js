/* ══════════════════════════════════════════════════════════════════════
   KCF Finance — Application Logic (Authenticated SPA)
   Session org_id comes from the server. All API calls use credentials.
   ══════════════════════════════════════════════════════════════════════ */

const API = '/api';
let chartInstance = null;
let allBudgetData = [];
let allCategories = [];
let allIncomeSources = []; // 2NF: normalized income sources for this org
let currentUser = null; // { org_id, name, type, email }

// ── AUTH GUARD ──────────────────────────────────────────────────────────────

async function checkAuth() {
    try {
        const res = await fetch(`${API}/auth/me`, { credentials: 'include' });
        const data = await res.json();
        if (!data.authenticated) {
            window.location.replace('/login.html');
            return false;
        }
        currentUser = data.org;
        return true;
    } catch (e) {
        window.location.replace('/login.html');
        return false;
    }
}

// ── INIT ────────────────────────────────────────────────────────────────────

async function init() {
    const ok = await checkAuth();
    if (!ok) return;

    // Hide auth guard, show app
    document.getElementById('auth-guard').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';

    // Populate user info in sidebar and header
    populateUserUI();

    // Set default dates
    setDefaultDates();

    // Load categories for this org
    await loadCategories();

    // Load income sources for this org (2NF normalized)
    await loadIncomeSources();

    // Load initial view (dashboard)
    loadDashboard();

    // Setup nav, logout, profile dropdown
    setupNav();
    setupLogout();
    setupProfileDropdown();
    setupMobileNav();
    setupChatbot();
}

function getOrgLogo(type, initial) {
    const t = (type || '').toLowerCase();
    let iconSvg = '';
    let badgeBg = 'linear-gradient(135deg, #4f46e5, #7c3aed)';

    if (t.includes('church')) {
        badgeBg = 'linear-gradient(135deg, #4f46e5, #9333ea)';
        // Holy Cross / Church Cathedral SVG logo
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M6 8h12"/></svg>`;
    } else if (t.includes('orphanage')) {
        badgeBg = 'linear-gradient(135deg, #ec4899, #f43f5e)';
        // Home with heart SVG logo
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v5H4a1 1 0 0 1-1-1v-9.5z"/><path d="M12 11c-.5-1-1.5-1-2 0s1.5 2 2 3c.5-1 2.5-2 2-3s-1.5-1-2 0z"/></svg>`;
    } else if (t.includes('ngo')) {
        badgeBg = 'linear-gradient(135deg, #059669, #10b981)';
        // Globe with hands SVG logo
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>`;
    } else {
        badgeBg = 'linear-gradient(135deg, #0284c7, #38bdf8)';
        // Institution Building SVG logo
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="11" rx="1"/><path d="M12 3L2 10h20L12 3z"/><path d="M9 14v7M15 14v7"/></svg>`;
    }

    return { iconSvg, badgeBg };
}

function populateUserUI() {
    const name = currentUser.name || 'Organisation';
    const type = currentUser.type || '';
    const email = currentUser.email || '';
    const initial = name.charAt(0).toUpperCase();

    const logo = getOrgLogo(type, initial);

    // Sidebar
    document.getElementById('sidebar-org-name').textContent = name;
    document.getElementById('sidebar-org-type').textContent = type || 'Member';
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    if (sidebarAvatar) {
        sidebarAvatar.innerHTML = logo.iconSvg;
        sidebarAvatar.style.background = logo.badgeBg;
    }

    // Header profile
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) {
        headerAvatar.innerHTML = logo.iconSvg;
        headerAvatar.style.background = logo.badgeBg;
    }
    document.getElementById('header-org-name').textContent = name;

    // Dropdown profile
    document.getElementById('dropdown-org-name').textContent = name;
    document.getElementById('dropdown-email').textContent = email || '—';
    const dropdownAvatar = document.getElementById('dropdown-avatar');
    if (dropdownAvatar) {
        dropdownAvatar.innerHTML = logo.iconSvg;
        dropdownAvatar.style.background = logo.badgeBg;
    }
}

// ── NAVIGATION ──────────────────────────────────────────────────────────────

function setupNav() {
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
            li.classList.add('active');

            const target = li.dataset.target;
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
            const view = document.getElementById(target);
            if (view) view.classList.add('active-view');

            document.getElementById('page-title').textContent = li.dataset.title || target;
            document.getElementById('page-subtitle').textContent = li.dataset.sub || '';

            // Load data for the activated view
            if (target === 'dashboard-view')  loadDashboard();
            if (target === 'budget-view')     loadBudgetDashboard();
            if (target === 'income-view')     loadIncome();
            if (target === 'expense-view')    loadExpenses();

            closeMobileSidebar();
        });
    });
}

// ── LOGOUT ──────────────────────────────────────────────────────────────────

function setupLogout() {
    async function doLogout() {
        if (!confirm('Sign out of KCF Finance?')) return;
        try {
            await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch (e) { /* ignore */ }
        window.location.replace('/login.html');
    }
    document.getElementById('sidebar-logout-btn').addEventListener('click', doLogout);
    document.getElementById('header-logout-btn').addEventListener('click', doLogout);
}

// ── PROFILE DROPDOWN ─────────────────────────────────────────────────────────

function setupProfileDropdown() {
    const wrap = document.getElementById('profile-wrap');
    const dropdown = document.getElementById('profile-dropdown');
    const btn = document.getElementById('profile-btn');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) dropdown.classList.remove('open');
    });
}

// ── CHATBOT PLACEHOLDER ──────────────────────────────────────────────────────

function setupChatbot() {
    document.getElementById('chatbot-btn').addEventListener('click', () => {
        openModal('chatbot-modal');
    });
}

// ── MOBILE SIDEBAR ───────────────────────────────────────────────────────────

function setupMobileNav() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
        });
    }
    if (overlay) overlay.addEventListener('click', closeMobileSidebar);
}

function closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
}

// ── DEFAULT DATES ────────────────────────────────────────────────────────────

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);
    const expDate = document.getElementById('exp-date');
    const incDate = document.getElementById('inc-date');
    const budPeriod = document.getElementById('bud-period');
    if (expDate && !expDate.value) expDate.value = today;
    if (incDate && !incDate.value) incDate.value = today;
    if (budPeriod && !budPeriod.value) budPeriod.value = month;
}

// ── CATEGORIES ───────────────────────────────────────────────────────────────

async function loadCategories() {
    try {
        const res = await fetch(`${API}/categories`, { credentials: 'include' });
        if (!res.ok) return;
        allCategories = await res.json();
        populateCategorySelects();
        renderCategoryChips();
    } catch (e) {
        console.error('Error loading categories:', e);
    }
}

function populateCategorySelects() {
    const selects = [
        document.getElementById('exp-cat-select'),
        document.getElementById('bud-cat-select'),
        document.getElementById('ee-cat'),
        document.getElementById('eb-cat')
    ];
    selects.forEach(sel => {
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">Select category…</option>';
        allCategories.forEach(c => {
            sel.innerHTML += `<option value="${c.cat_id}">${escHtml(c.cat_name)}</option>`;
        });
        if (prev) sel.value = prev;
    });
}

function renderCategoryChips() {
    const chips = document.getElementById('category-chips');
    if (!chips) return;
    if (allCategories.length === 0) {
        chips.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">No categories yet.</span>';
        return;
    }
    chips.innerHTML = allCategories.map(c => `
        <span class="cat-chip">
            ${escHtml(c.cat_name)}
            <button onclick="deleteCategory(${c.cat_id})" title="Remove category" class="cat-chip-del">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </span>
    `).join('');
}

function toggleCatManager() {
    const body = document.getElementById('cat-manager-body');
    const chevron = document.getElementById('cat-chevron');
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

async function deleteCategory(id) {
    if (!confirm('Delete this category? All associated expenses and budgets will also be deleted.')) return;
    try {
        const res = await fetch(`${API}/categories?id=${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast('success', 'Category Deleted', 'Category and its records have been removed.');
        await loadCategories();
        loadExpenses();
        loadBudgetDashboard();
    } catch (e) {
        showToast('danger', 'Error', e.message || 'Failed to delete category.');
    }
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────

async function loadDashboard() {
    try {
        const res = await fetch(`${API}/dashboard`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('total-income').textContent  = `₹${fmt(data.totalIncome || 0)}`;
        document.getElementById('total-expense').textContent = `₹${fmt(data.totalExpense || 0)}`;
        const net = (data.totalIncome || 0) - (data.totalExpense || 0);
        const netEl = document.getElementById('net-balance');
        netEl.textContent = `₹${fmt(Math.abs(net))}`;
        netEl.style.color = net >= 0 ? 'var(--success)' : 'var(--danger)';
        if (net < 0) netEl.textContent = `-₹${fmt(Math.abs(net))}`;

        renderChart(data.expensesByCategory || []);
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

function renderChart(expenses) {
    const canvas = document.getElementById('expenseChart');
    const emptyEl = document.getElementById('chart-empty');
    if (!canvas) return;

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    if (expenses.length === 0) {
        canvas.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }
    canvas.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';

    const ctx = canvas.getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: expenses.map(e => e.cat_name),
            datasets: [{
                data: expenses.map(e => e.amount),
                backgroundColor: ['#6366f1','#10b981','#ef4444','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#38bdf8','#f97316','#84cc16'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#cbd5e1', padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { family: 'Inter', size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ₹${fmt(ctx.raw)}`
                    }
                }
            }
        }
    });
}

// ── INCOME ───────────────────────────────────────────────────────────────────

let incomeData = [];

// Load normalized income sources from /api/income-sources
async function loadIncomeSources() {
    try {
        const res = await fetch(`${API}/income-sources`, { credentials: 'include' });
        if (!res.ok) return;
        allIncomeSources = await res.json();
        populateIncomeSourceSelects();
    } catch (e) { console.error('Error loading income sources:', e); }
}

// Populate all income source <select> elements
function populateIncomeSourceSelects() {
    const selects = ['inc-source-select', 'ei-source-select'];
    selects.forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">Select source…</option>';
        allIncomeSources.forEach(s => {
            sel.innerHTML += `<option value="${s.src_id}">${escHtml(s.src_name)}</option>`;
        });
        if (currentVal) sel.value = currentVal;
    });
}

// Open the "Add Income Source" modal
function openAddIncomeSource() {
    const input = document.getElementById('new-src-name');
    if (input) input.value = '';
    openModal('add-income-source-modal');
}

// Save a new income source
async function saveNewIncomeSource() {
    const name = (document.getElementById('new-src-name')?.value || '').trim();
    if (!name) {
        showToast('warning', 'Name Required', 'Please enter an income source name.');
        return;
    }
    try {
        const res = await fetch(`${API}/income-sources`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ src_name: name })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add source');
        showToast('success', 'Source Added', `"${name}" is now available.`);
        closeModal('add-income-source-modal');
        await loadIncomeSources();
        // Auto-select the newly created source
        ['inc-source-select', 'ei-source-select'].forEach(selId => {
            const sel = document.getElementById(selId);
            if (sel) sel.value = data.src_id;
        });
    } catch (err) {
        showToast('danger', 'Error', err.message);
    }
}

async function loadIncome() {
    try {
        const res = await fetch(`${API}/income`, { credentials: 'include' });
        if (!res.ok) return;
        incomeData = await res.json();
        renderIncomeTable(incomeData);
    } catch (e) { console.error('Error loading income:', e); }
}

function renderIncomeTable(data) {
    const tbody = document.querySelector('#income-table tbody');
    const badge = document.getElementById('income-count-badge');
    if (badge) badge.textContent = `${data.length} entr${data.length === 1 ? 'y' : 'ies'}`;
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No income recorded yet</td></tr>`;
        return;
    }
    data.forEach(i => {
        const srcLabel = i.source_name || i.Source || '—';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i.income_date}</td>
            <td><strong>${escHtml(srcLabel)}</strong></td>
            <td class="text-muted">${escHtml(i.description || '—')}</td>
            <td class="amount-positive">+₹${fmt(i.amount)}</td>
            <td class="actions-cell">
                <button class="action-btn edit-btn" onclick="openEditIncome(${i.income_id})" title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="action-btn delete-btn" onclick="deleteIncome(${i.income_id})" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </td>`;
        tbody.appendChild(tr);
    });
}

// Income search
document.getElementById('income-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = incomeData.filter(i =>
        (i.source_name || i.Source || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
    );
    renderIncomeTable(filtered);
});

// Income form submit
document.getElementById('income-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('inc-submit-btn');
    const btnText = document.getElementById('inc-btn-text');
    const editId = document.getElementById('inc-submit-btn').dataset.editId;

    const srcId = document.getElementById('inc-source-select')?.value;
    if (!srcId) {
        showToast('warning', 'Source Required', 'Please select an income source.');
        return;
    }

    const body = {
        src_id: srcId,
        amount: document.getElementById('inc-amount').value,
        income_date: document.getElementById('inc-date').value,
        description: document.getElementById('inc-desc').value.trim()
    };

    btn.disabled = true;
    const prevText = btnText.textContent;
    btnText.textContent = 'Saving…';

    try {
        let res, data;
        if (editId) {
            res = await fetch(`${API}/income?id=${editId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                credentials: 'include', body: JSON.stringify(body)
            });
        } else {
            res = await fetch(`${API}/income`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                credentials: 'include', body: JSON.stringify(body)
            });
        }
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');

        const srcName = allIncomeSources.find(s => String(s.src_id) === String(srcId))?.src_name || srcId;
        showToast('success', editId ? 'Income Updated' : 'Income Recorded',
            `₹${parseFloat(body.amount).toFixed(2)} from "${srcName}".`);
        cancelEditIncome();
        loadIncome();
        loadDashboard();
    } catch (err) {
        showToast('danger', 'Error', err.message || 'Failed to save income.');
    }
    btn.disabled = false;
    btnText.textContent = prevText;
});

function openEditIncome(id) {
    openModal('edit-income-modal');
    const record = incomeData.find(i => i.income_id === id);
    if (!record) return;
    document.getElementById('edit-income-id').value = id;
    // Populate the source select, then set current value
    populateIncomeSourceSelects();
    const sel = document.getElementById('ei-source-select');
    if (sel) sel.value = record.src_id || '';
    document.getElementById('ei-amount').value = record.amount || '';
    document.getElementById('ei-date').value = record.income_date || '';
    document.getElementById('ei-desc').value = record.description || '';
}

async function saveEditIncome() {
    const id = document.getElementById('edit-income-id').value;
    const srcId = document.getElementById('ei-source-select')?.value;
    const body = {
        src_id: srcId || undefined,
        amount: document.getElementById('ei-amount').value,
        income_date: document.getElementById('ei-date').value,
        description: document.getElementById('ei-desc').value.trim()
    };
    try {
        const res = await fetch(`${API}/income?id=${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
        showToast('success', 'Income Updated', 'Record saved successfully.');
        closeModal('edit-income-modal');
        loadIncome();
        loadDashboard();
    } catch (err) {
        showToast('danger', 'Error', err.message);
    }
}

async function deleteIncome(id) {
    if (!confirm('Delete this income record?')) return;
    try {
        const res = await fetch(`${API}/income?id=${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
        showToast('success', 'Income Deleted', 'Record removed.');
        loadIncome();
        loadDashboard();
    } catch (err) {
        showToast('danger', 'Error', err.message);
    }
}

function cancelEditIncome() {
    document.getElementById('income-form').reset();
    const btn = document.getElementById('inc-submit-btn');
    delete btn.dataset.editId;
    document.getElementById('inc-btn-text').textContent = 'Add Income';
    document.getElementById('inc-cancel-btn').style.display = 'none';
}

// ── EXPENSES ─────────────────────────────────────────────────────────────────

let expenseData = [];

async function loadExpenses() {
    try {
        const res = await fetch(`${API}/expenses`, { credentials: 'include' });
        if (!res.ok) return;
        expenseData = await res.json();
        renderExpenseTable(expenseData);
    } catch (e) { console.error('Error loading expenses:', e); }
}

function renderExpenseTable(data) {
    const tbody = document.querySelector('#expense-table tbody');
    const badge = document.getElementById('expense-count-badge');
    if (badge) badge.textContent = `${data.length} expense${data.length === 1 ? '' : 's'}`;
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No expenses recorded yet</td></tr>`;
        return;
    }
    data.forEach(e => {
        const isSuspicious = e.edit_count > 3;
        const tr = document.createElement('tr');
        if (isSuspicious) tr.style.background = 'rgba(239,68,68,0.05)';
        tr.innerHTML = `
            <td>${e.e_date}</td>
            <td><strong>${escHtml(e.cat_name || 'Category ' + e.cat_id)}</strong></td>
            <td class="amount-negative">₹${fmt(e.amount)}</td>
            <td class="text-muted" style="font-size:0.8rem;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(e.description||'')}">${escHtml(e.description||'—')}</td>
            <td style="font-size:0.75rem;color:var(--text-muted);">${fmtTs(e.createdAt)}</td>
            <td style="font-size:0.75rem;color:var(--text-muted);">${e.updatedAt ? fmtTs(e.updatedAt) : '—'}</td>
            <td style="text-align:center;">
                ${e.edit_count > 0
                    ? `<span title="${isSuspicious ? '⚠ Suspicious activity flagged' : 'Edited'}" style="background:${isSuspicious ? 'rgba(239,68,68,0.15)' : 'var(--card-bg)'};color:${isSuspicious ? 'var(--danger)' : 'var(--text-muted)'};font-size:0.72rem;padding:2px 7px;border-radius:10px;border:1px solid ${isSuspicious ? 'var(--danger)' : 'var(--border)'};">${isSuspicious ? '⚠' : ''} ${e.edit_count}</span>`
                    : '<span style="color:var(--text-muted);font-size:0.75rem;">0</span>'}
            </td>
            <td class="actions-cell">
                <button class="action-btn edit-btn" onclick="openEditExpense(${e.exp_id})" title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="action-btn" onclick="openExpenseHistory(${e.exp_id})" title="View audit history" style="color:var(--text-muted);border-color:var(--border);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </button>
                <button class="action-btn delete-btn" onclick="deleteExpense(${e.exp_id})" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </td>`;
        tbody.appendChild(tr);
    });
}

// Expense form submit
document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('exp-submit-btn');
    const btnText = document.getElementById('exp-btn-text');
    btn.disabled = true;
    btnText.textContent = 'Saving…';

    const body = {
        cat_id: document.getElementById('exp-cat-select').value,
        amount: document.getElementById('exp-amount').value,
        e_date: document.getElementById('exp-date').value,
        description: (document.getElementById('exp-description')?.value || '').trim()
    };

    try {
        const res = await fetch(`${API}/expenses`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) {
            if (data.blocked) {
                showToast('danger', 'Expense Blocked!', data.message, 8000);
            } else {
                showToast('danger', 'Error', data.error || 'Failed to record expense.');
            }
            btn.disabled = false; btnText.textContent = 'Add Expense'; return;
        }

        if (data.warning) showToast('warning', 'Budget Warning', data.warning, 6000);
        else showToast('success', 'Expense Recorded', `₹${parseFloat(body.amount).toFixed(2)} added.`);

        document.getElementById('exp-amount').value = '';
        cancelEditExpense();
        loadExpenses();
        loadDashboard();
        loadBudgetDashboard();
        updateBudgetIndicator();
    } catch (err) {
        showToast('danger', 'Error', err.message || 'Failed to record expense.');
    }
    btn.disabled = false; btnText.textContent = 'Add Expense';
});

function openEditExpense(id) {
    openModal('edit-expense-modal');
    const record = expenseData.find(e => e.exp_id === id);
    if (!record) return;
    document.getElementById('edit-expense-id').value = id;
    // Populate edit category select
    const sel = document.getElementById('ee-cat');
    sel.innerHTML = '<option value="">Select category…</option>';
    allCategories.forEach(c => {
        sel.innerHTML += `<option value="${c.cat_id}">${escHtml(c.cat_name)}</option>`;
    });
    sel.value = record.cat_id;
    document.getElementById('ee-amount').value = record.amount || '';
    document.getElementById('ee-date').value = record.e_date || '';
    document.getElementById('ee-desc').value = record.description || '';
    document.getElementById('ee-reason').value = '';
    // Show suspicious warning if edit_count is high
    const warnEl = document.getElementById('ee-suspicious-warning');
    if (warnEl) warnEl.style.display = (record.edit_count >= 3) ? 'block' : 'none';
}

async function saveEditExpense() {
    const id = document.getElementById('edit-expense-id').value;
    const reason = document.getElementById('ee-reason')?.value?.trim() || '';
    if (!reason) {
        showToast('warning', 'Reason Required', 'Please provide a reason for editing this expense before saving.');
        document.getElementById('ee-reason')?.focus();
        return;
    }
    const body = {
        cat_id: document.getElementById('ee-cat').value,
        amount: document.getElementById('ee-amount').value,
        e_date: document.getElementById('ee-date').value,
        description: document.getElementById('ee-desc')?.value?.trim() || '',
        reason
    };
    try {
        const res = await fetch(`${API}/expenses?id=${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');
        if (data.is_suspicious) {
            showToast('warning', 'Expense Updated — Flagged', 'Changes saved. This edit has been flagged for admin review.');
        } else {
            showToast('success', 'Expense Updated', 'Record saved.');
        }
        closeModal('edit-expense-modal');
        loadExpenses(); loadDashboard(); loadBudgetDashboard();
    } catch (err) {
        showToast('danger', 'Error', err.message);
    }
}

async function openExpenseHistory(id) {
    openModal('expense-history-modal');
    const detailEl = document.getElementById('expense-history-detail');
    const listEl = document.getElementById('expense-history-list');
    if (detailEl) detailEl.innerHTML = 'Loading…';
    if (listEl) listEl.innerHTML = '';
    try {
        const res = await fetch(`${API}/expenses?id=${id}&history=1`, { credentials: 'include' });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to load history');
        const data = await res.json();
        const e = data.expense;
        if (detailEl) {
            detailEl.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
                    <div><strong>Category:</strong> ${escHtml(e.cat_name)}</div>
                    <div><strong>Amount:</strong> ₹${fmt(e.amount)}</div>
                    <div><strong>Expense Date:</strong> ${e.e_date}</div>
                    <div><strong>Total Edits:</strong> ${e.edit_count || 0}</div>
                    <div><strong>Created:</strong> ${fmtTs(e.createdAt)}</div>
                    <div><strong>Last Modified:</strong> ${e.updatedAt ? fmtTs(e.updatedAt) : '—'}</div>
                    ${e.description ? `<div style="grid-column:1/-1;"><strong>Description:</strong> ${escHtml(e.description)}</div>` : ''}
                </div>`;
        }
        if (listEl) {
            if (!data.history || data.history.length === 0) {
                listEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0;">No edit history recorded.</p>';
            } else {
                listEl.innerHTML = data.history.map((h, i) => {
                    let oldV = {}, newV = {};
                    try { oldV = JSON.parse(h.old_values || '{}'); } catch {}
                    try { newV = JSON.parse(h.new_values || '{}'); } catch {}
                    const cat = i === 0 ? (allCategories.find(c => c.cat_id === newV.cat_id) || {}) : {};
                    return `
                    <div style="border:1px solid var(--border);border-radius:8px;padding:0.75rem;margin-bottom:0.6rem;background:var(--card-bg);${h.is_suspicious ? 'border-color:var(--danger);background:rgba(239,68,68,0.05);' : ''}">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.4rem;">
                            <span style="font-size:0.78rem;font-weight:600;color:${h.action === 'CREATE' ? 'var(--success)' : h.is_suspicious ? 'var(--danger)' : 'var(--primary)'}">${h.action === 'CREATE' ? '✓ Created' : '✎ Edited'}${h.is_suspicious ? ' ⚠ Flagged' : ''}</span>
                            <span style="font-size:0.72rem;color:var(--text-muted);">${fmtTs(h.changed_at)}</span>
                        </div>
                        <div style="font-size:0.78rem;color:var(--text-muted);">By: <strong>${escHtml(h.changed_by)}</strong></div>
                        ${h.change_reason ? `<div style="font-size:0.78rem;margin-top:0.3rem;color:var(--text-secondary);font-style:italic;">"${escHtml(h.change_reason)}"</div>` : ''}
                        ${h.is_suspicious ? `<div style="font-size:0.72rem;color:var(--danger);margin-top:0.3rem;">⚠ ${escHtml(h.suspicious_reason)}</div>` : ''}
                        ${h.action !== 'CREATE' && h.old_values ? `
                        <div style="margin-top:0.5rem;font-size:0.75rem;display:grid;grid-template-columns:1fr 1fr;gap:0.25rem;">
                            <div style="color:var(--danger);padding:0.25rem 0.4rem;background:rgba(239,68,68,0.06);border-radius:4px;">
                                <div style="font-weight:600;margin-bottom:2px;">Before</div>
                                ${oldV.amount !== undefined ? `<div>Amount: ₹${fmt(oldV.amount)}</div>` : ''}
                                ${oldV.e_date ? `<div>Date: ${oldV.e_date}</div>` : ''}
                                ${oldV.description !== undefined ? `<div>Desc: ${escHtml(oldV.description||'—')}</div>` : ''}
                            </div>
                            <div style="color:var(--success);padding:0.25rem 0.4rem;background:rgba(16,185,129,0.06);border-radius:4px;">
                                <div style="font-weight:600;margin-bottom:2px;">After</div>
                                ${newV.amount !== undefined ? `<div>Amount: ₹${fmt(newV.amount)}</div>` : ''}
                                ${newV.e_date ? `<div>Date: ${newV.e_date}</div>` : ''}
                                ${newV.description !== undefined ? `<div>Desc: ${escHtml(newV.description||'—')}</div>` : ''}
                            </div>
                        </div>` : ''}
                    </div>`;
                }).join('');
            }
        }
    } catch (err) {
        if (detailEl) detailEl.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
    }
}

async function deleteExpense(id) {
    if (!confirm('Delete this expense? This action will be permanently recorded in the audit log.')) return;
    try {
        const res = await fetch(`${API}/expenses?id=${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
        showToast('success', 'Expense Deleted', 'Record removed.');
        loadExpenses(); loadDashboard(); loadBudgetDashboard(); updateBudgetIndicator();
    } catch (err) {
        showToast('danger', 'Error', err.message);
    }
}

function cancelEditExpense() {
    document.getElementById('expense-form').reset();
    document.getElementById('exp-btn-text').textContent = 'Add Expense';
    document.getElementById('exp-cancel-btn').style.display = 'none';
}

// Live budget indicator
document.getElementById('exp-cat-select').addEventListener('change', updateBudgetIndicator);
document.getElementById('exp-date').addEventListener('change', updateBudgetIndicator);

async function updateBudgetIndicator() {
    const indicator = document.getElementById('budget-indicator');
    const content = document.getElementById('budget-indicator-content');
    const title = document.getElementById('budget-indicator-title');
    const catId = document.getElementById('exp-cat-select').value;
    const date = document.getElementById('exp-date').value;

    if (!catId || !date) { if (indicator) indicator.style.display = 'none'; return; }

    try {
        const res = await fetch(`${API}/budgets/live-check?cat_id=${catId}&date=${date}`, { credentials: 'include' });
        const data = await res.json();

        indicator.style.display = 'block';
        if (!data.hasBudget) {
            indicator.className = 'budget-indicator budget-indicator-none';
            title.textContent = 'No Budget';
            content.innerHTML = `<p class="budget-indicator-message">No budget set for this category. Expense won't be restricted.</p>`;
            return;
        }
        const b = data.budgets[0];
        const pct = b.budget_amount > 0 ? (b.spent / b.budget_amount) * 100 : 0;
        const isOver = pct > 100, isWarn = pct > 75 && !isOver;
        indicator.className = `budget-indicator ${isOver ? 'budget-indicator-over' : isWarn ? 'budget-indicator-warn' : 'budget-indicator-ok'}`;
        title.textContent = `Budget: ${formatPeriodExplicit(b.period_type, b.period_value)}`;
        const capped = Math.min(pct, 100);
        content.innerHTML = `
            <div class="budget-indicator-stats">
                <div class="budget-indicator-stat"><span class="budget-indicator-label">Allocated</span><span class="budget-indicator-value">₹${fmt(b.budget_amount)}</span></div>
                <div class="budget-indicator-stat"><span class="budget-indicator-label">Spent</span><span class="budget-indicator-value budget-indicator-spent">₹${fmt(b.spent)}</span></div>
                <div class="budget-indicator-stat"><span class="budget-indicator-label">${b.remaining >= 0 ? 'Remaining' : 'Over by'}</span><span class="budget-indicator-value ${b.remaining >= 0 ? 'budget-indicator-remaining' : 'budget-indicator-over-value'}">₹${fmt(Math.abs(b.remaining))}</span></div>
            </div>
            <div class="budget-indicator-bar">
                <div class="budget-indicator-fill ${isOver ? 'fill-over' : isWarn ? 'fill-warn' : 'fill-ok'}" style="width:${capped}%"></div>
            </div>
            <div class="budget-indicator-pct">${pct.toFixed(1)}% used</div>`;
    } catch (e) {
        if (indicator) indicator.style.display = 'none';
    }
}

// ── BUDGETS ──────────────────────────────────────────────────────────────────

async function loadBudgetDashboard() {
    try {
        renderCategoryChips();
        const res = await fetch(`${API}/budgets/progress`, { credentials: 'include' });
        if (!res.ok) return;
        allBudgetData = await res.json();
        updateBudgetStats(allBudgetData);
        renderBudgetCards(allBudgetData);
    } catch (e) { console.error('Error loading budgets:', e); }
}

function updateBudgetStats(budgets) {
    const total = budgets.length;
    const allocated = budgets.reduce((s, b) => s + b.budget_amount, 0);
    const spent = budgets.reduce((s, b) => s + b.spent, 0);
    const warning = budgets.filter(b => {
        const pct = b.budget_amount > 0 ? (b.spent / b.budget_amount) * 100 : 0;
        return pct > 75 && pct <= 100;
    }).length;
    const over = budgets.filter(b => b.spent > b.budget_amount).length;

    document.getElementById('stat-total-budgets').textContent = total;
    document.getElementById('stat-total-allocated').textContent = `₹${formatNumber(allocated)}`;
    document.getElementById('stat-total-spent').textContent = `₹${formatNumber(spent)}`;
    const warnEl = document.getElementById('stat-warning-budget');
    if (warnEl) warnEl.textContent = warning;
    document.getElementById('stat-over-budget').textContent = over;

    updateFilterCounts(budgets);
}

function updateFilterCounts(budgets) {
    const sel = document.getElementById('budget-filter-status');
    if (!sel) return;
    const currentVal = sel.value;
    const total = budgets.length;
    const onTrack = budgets.filter(b => {
        const pct = b.budget_amount > 0 ? (b.spent / b.budget_amount) * 100 : 0;
        return pct <= 75;
    }).length;
    const warning = budgets.filter(b => {
        const pct = b.budget_amount > 0 ? (b.spent / b.budget_amount) * 100 : 0;
        return pct > 75 && pct <= 100;
    }).length;
    const over = budgets.filter(b => b.spent > b.budget_amount).length;

    sel.innerHTML = `
        <option value="">All Statuses (${total})</option>
        <option value="on-track">On Track (${onTrack})</option>
        <option value="warning">Warning / Near Limit (${warning})</option>
        <option value="over-budget">Over Budget (${over})</option>
    `;
    sel.value = currentVal;
}

function setBudgetFilter(val) {
    const sel = document.getElementById('budget-filter-status');
    if (sel) {
        sel.value = val;
        renderBudgetCards(allBudgetData);
    }
}
window.setBudgetFilter = setBudgetFilter;

function renderBudgetCards(budgets) {
    const grid = document.getElementById('budget-grid');
    const emptyState = document.getElementById('budget-empty-state');
    if (!grid || !emptyState) return;

    const statusFilter = document.getElementById('budget-filter-status')?.value || '';
    let filtered = budgets;
    if (statusFilter) {
        filtered = filtered.filter(b => {
            const pct = b.budget_amount > 0 ? (b.spent / b.budget_amount) * 100 : 0;
            if (statusFilter === 'on-track') return pct <= 75;
            if (statusFilter === 'warning') return pct > 75 && pct <= 100;
            if (statusFilter === 'over-budget') return pct > 100;
            return true;
        });
    }

    grid.querySelectorAll('.budget-card').forEach(c => c.remove());

    if (filtered.length === 0) {
        emptyState.style.display = 'flex';
        const emptyIcon = document.getElementById('budget-empty-icon');
        const emptyTitle = document.getElementById('budget-empty-title');
        const emptyDesc = document.getElementById('budget-empty-desc');
        const emptyAction = document.getElementById('budget-empty-action');

        if (budgets.length === 0) {
            if (emptyIcon) {
                emptyIcon.style.color = 'var(--text-dim)';
                emptyIcon.style.borderColor = 'var(--border)';
                emptyIcon.style.background = 'rgba(255, 255, 255, 0.04)';
                emptyIcon.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
            }
            if (emptyTitle) emptyTitle.textContent = 'No budgets yet';
            if (emptyDesc) emptyDesc.textContent = 'Create your first budget above to start tracking spending against allocations.';
            if (emptyAction) emptyAction.innerHTML = '';
        } else if (statusFilter === 'warning') {
            if (emptyIcon) {
                emptyIcon.style.color = '#10b981';
                emptyIcon.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                emptyIcon.style.background = 'rgba(16, 185, 129, 0.1)';
                emptyIcon.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
            }
            if (emptyTitle) emptyTitle.textContent = 'No budgets in warning status';
            if (emptyDesc) emptyDesc.textContent = 'None of your active budgets are currently near their limit (75%–100% of allocation). All budgets are on track or already handled.';
            if (emptyAction) emptyAction.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" onclick="setBudgetFilter('')" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.45rem 1rem;">View All Budgets (${budgets.length})</button>`;
        } else if (statusFilter === 'over-budget') {
            if (emptyIcon) {
                emptyIcon.style.color = '#10b981';
                emptyIcon.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                emptyIcon.style.background = 'rgba(16, 185, 129, 0.1)';
                emptyIcon.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
            }
            if (emptyTitle) emptyTitle.textContent = 'No over-budget categories';
            if (emptyDesc) emptyDesc.textContent = 'Excellent! None of your budgets have exceeded their allocated limits.';
            if (emptyAction) emptyAction.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" onclick="setBudgetFilter('')" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.45rem 1rem;">View All Budgets (${budgets.length})</button>`;
        } else if (statusFilter === 'on-track') {
            if (emptyIcon) {
                emptyIcon.style.color = '#f59e0b';
                emptyIcon.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                emptyIcon.style.background = 'rgba(245, 158, 11, 0.1)';
                emptyIcon.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
            }
            if (emptyTitle) emptyTitle.textContent = 'No budgets on track';
            if (emptyDesc) emptyDesc.textContent = 'All your active budgets have spent more than 75% of their allocation.';
            if (emptyAction) emptyAction.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" onclick="setBudgetFilter('')" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.45rem 1rem;">View All Budgets (${budgets.length})</button>`;
        } else {
            if (emptyTitle) emptyTitle.textContent = 'No matching budgets';
            if (emptyDesc) emptyDesc.textContent = 'No budgets match the selected filter.';
            if (emptyAction) emptyAction.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" onclick="setBudgetFilter('')" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.45rem 1rem;">Clear Filter</button>`;
        }
        return;
    }
    emptyState.style.display = 'none';

    filtered.forEach(budget => {
        const pct = budget.budget_amount > 0 ? (budget.spent / budget.budget_amount) * 100 : 0;
        const remaining = budget.budget_amount - budget.spent;
        const capped = Math.min(pct, 100);
        let statusClass, progressClass, pctClass, cardModifier = '', badgeHtml = '';

        if (pct > 100) {
            statusClass = 'status-over-budget';
            progressClass = 'progress-over-budget';
            pctClass = 'percent-over-budget';
            cardModifier = ' over-budget';
            badgeHtml = `<span class="over-budget-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> OVER BUDGET</span>`;
        } else if (pct > 75) {
            statusClass = 'status-warning';
            progressClass = 'progress-warning';
            pctClass = 'percent-warning';
            cardModifier = ' warning-budget';
            badgeHtml = `<span class="warning-budget-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> NEAR LIMIT (${pct.toFixed(0)}%)</span>`;
        } else {
            statusClass = 'status-on-track';
            progressClass = 'progress-on-track';
            pctClass = 'percent-on-track';
            badgeHtml = `<span class="on-track-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ON TRACK</span>`;
        }

        let remainingHtml = '';
        if (remaining < 0) {
            remainingHtml = `<span class="remaining-negative">Exceeded by ₹${formatNumber(Math.abs(remaining))}</span>`;
        } else if (pct > 75) {
            remainingHtml = `<span class="remaining-warning">₹${formatNumber(remaining)} remaining (${(100 - pct).toFixed(0)}% left)</span>`;
        } else {
            remainingHtml = `<span class="remaining-positive">₹${formatNumber(remaining)}</span> remaining`;
        }

        const card = document.createElement('div');
        card.className = `budget-card${cardModifier}`;
        card.innerHTML = `
            <div class="budget-card-status-bar ${statusClass}"></div>
            <div class="budget-card-header">
                <div>
                    <div class="budget-card-title">${escHtml(budget.cat_name)}</div>
                    <div class="budget-card-period">${formatPeriodExplicit(budget.period_type, budget.period_value)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:0.4rem;">
                    ${badgeHtml}
                    <div class="budget-card-actions">
                        <button class="action-btn edit-btn" onclick="openEditBudget(${budget.bud_id})" title="Edit">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteBudget(${budget.bud_id})" title="Delete">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="budget-progress-section">
                <div class="budget-progress-header">
                    <div class="budget-progress-amounts"><strong>₹${formatNumber(budget.spent)}</strong> of ₹${formatNumber(budget.budget_amount)}</div>
                    <div class="budget-progress-percentage ${pctClass}">${pct.toFixed(1)}%</div>
                </div>
                <div class="budget-progress-bar">
                    <div class="budget-progress-fill ${progressClass}" style="width:0;" data-target="${capped}%"></div>
                </div>
            </div>
            <div class="budget-card-footer">
                <div class="budget-remaining">
                    ${remainingHtml}
                </div>
            </div>`;

        grid.insertBefore(card, emptyState);
        requestAnimationFrame(() => {
            const fill = card.querySelector('.budget-progress-fill');
            if (fill) requestAnimationFrame(() => { fill.style.width = fill.dataset.target; });
        });
    });
}

document.getElementById('budget-filter-status')?.addEventListener('change', () => renderBudgetCards(allBudgetData));

// Budget form
document.getElementById('budget-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const period_type = document.querySelector('input[name="bud-period-type"]:checked').value;
    const rawPeriod = document.getElementById('bud-period').value;
    let period_value;
    if (period_type === 'quarterly') {
        const [y, m] = rawPeriod.split('-');
        period_value = `${y}-Q${Math.ceil(parseInt(m, 10) / 3)}`;
    } else if (period_type === 'yearly') {
        period_value = rawPeriod.split('-')[0];
    } else {
        period_value = rawPeriod; // monthly: YYYY-MM
    }
    const body = {
        cat_id: document.getElementById('bud-cat-select').value,
        amount: document.getElementById('bud-amount').value,
        period_type,
        period_value
    };
    try {
        const res = await fetch(`${API}/budgets`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');
        document.getElementById('bud-amount').value = '';
        showToast('success', 'Budget Created', `₹${parseFloat(body.amount).toFixed(2)} allocated.`);
        loadBudgetDashboard(); updateBudgetIndicator();
    } catch (err) { showToast('danger', 'Error', err.message || 'Failed to create budget.'); }
});

function openEditBudget(id) {
    openModal('edit-budget-modal');
    const bud = allBudgetData.find(b => b.bud_id === id);
    if (!bud) return;
    document.getElementById('edit-budget-id').value = id;
    const sel = document.getElementById('eb-cat');
    sel.innerHTML = '<option value="">Select category…</option>';
    allCategories.forEach(c => { sel.innerHTML += `<option value="${c.cat_id}">${escHtml(c.cat_name)}</option>`; });
    sel.value = bud.cat_id;
    document.getElementById('eb-amount').value = bud.budget_amount;

    // Restore period_type radio selection
    const ptype = bud.period_type || 'monthly';
    const ptypeRadio = document.querySelector(`input[name="eb-period-type"][value="${ptype}"]`);
    if (ptypeRadio) ptypeRadio.checked = true;

    // Restore period input: convert period_value back to YYYY-MM for the month input
    const pval = bud.period_value || '';
    if (ptype === 'monthly' && /^\d{4}-\d{2}$/.test(pval)) {
        document.getElementById('eb-period').value = pval;
    } else if (ptype === 'quarterly') {
        // Convert 2026-Q1 → 2026-01 for the month picker
        const qm = pval.match(/^(\d{4})-Q(\d)$/);
        if (qm) {
            const startMonth = (parseInt(qm[2], 10) - 1) * 3 + 1;
            document.getElementById('eb-period').value = `${qm[1]}-${String(startMonth).padStart(2, '0')}`;
        }
    } else if (ptype === 'yearly') {
        // For yearly, set to Jan of that year
        document.getElementById('eb-period').value = pval.length === 4 ? `${pval}-01` : '';
    } else {
        document.getElementById('eb-period').value = pval.length === 7 ? pval : '';
    }
}

async function saveEditBudget() {
    const id = document.getElementById('edit-budget-id').value;
    const rawPeriod = document.getElementById('eb-period').value;
    const period_type = document.querySelector('input[name="eb-period-type"]:checked')?.value || 'monthly';
    let period_value;
    if (period_type === 'quarterly') {
        const [y, m] = rawPeriod.split('-');
        period_value = `${y}-Q${Math.ceil(parseInt(m, 10) / 3)}`;
    } else if (period_type === 'yearly') {
        period_value = rawPeriod.split('-')[0];
    } else {
        period_value = rawPeriod;
    }
    const body = {
        cat_id: document.getElementById('eb-cat').value,
        amount: document.getElementById('eb-amount').value,
        period_type,
        period_value
    };
    try {
        const res = await fetch(`${API}/budgets?id=${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
        showToast('success', 'Budget Updated', 'Changes saved.');
        closeModal('edit-budget-modal');
        loadBudgetDashboard();
    } catch (err) { showToast('danger', 'Error', err.message); }
}

async function deleteBudget(id) {
    if (!confirm('Delete this budget? This cannot be undone.')) return;
    try {
        const res = await fetch(`${API}/budgets?id=${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
        showToast('success', 'Budget Deleted', 'Budget removed.');
        loadBudgetDashboard(); updateBudgetIndicator();
    } catch (err) { showToast('danger', 'Error', err.message); }
}

function cancelEditBudget() {}

// Period hint
document.querySelectorAll('input[name="bud-period-type"]').forEach(r => {
    r.addEventListener('change', () => {
        const t = document.querySelector('input[name="bud-period-type"]:checked').value;
        const hint = document.getElementById('period-hint');
        if (hint) {
            if (t === 'monthly') hint.textContent = 'Monthly budgets track expenses within the selected month.';
            else if (t === 'quarterly') hint.textContent = 'Quarterly: covers 3 months (e.g. Q1 = Jan–Mar).';
            else hint.textContent = 'Yearly: covers all expenses from Jan 1 to Dec 31.';
        }
    });
});

// ── CATEGORIES FORM ──────────────────────────────────────────────────────────

document.getElementById('cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value.trim();
    try {
        const res = await fetch(`${API}/categories`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ cat_name: name })
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');
        document.getElementById('cat-name').value = '';
        showToast('success', 'Category Added', `"${name}" created.`);
        await loadCategories();
    } catch (err) { showToast('danger', 'Error', err.message || 'Failed to add category.'); }
});

// ── MODALS ───────────────────────────────────────────────────────────────────

function openModal(id) {
    document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
}

document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.remove('open');
    });
});

// ── TOAST NOTIFICATIONS ──────────────────────────────────────────────────────

function showToast(type, title, message, duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        danger: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.danger}</div>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="toast-progress" style="animation-duration:${duration}ms;"></div>`;

    container.appendChild(toast);
    toast.querySelector('.toast-close').addEventListener('click', () => removeToast(toast));
    setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
    if (!toast?.parentNode) return;
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.parentNode?.removeChild(toast), 300);
}

// ── FORMAT HELPERS ───────────────────────────────────────────────────────────

function fmt(n) { return Number(n).toFixed(2); }

/**
 * Format an ISO timestamp to a human-readable local datetime string.
 * Uses the browser's local timezone automatically.
 */
function fmtTs(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        return d.toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return isoStr;
    }
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Number(n).toFixed(2);
}

function formatPeriodExplicit(period_type_or_string, period_value) {
    // Called with two args: (period_type, period_value)
    if (period_value !== undefined) {
        const ptype = period_type_or_string;
        const pval  = period_value;
        if (!pval) return '—';
        if (ptype === 'quarterly') {
            const qm = pval.match(/^(\d{4})-Q(\d)$/);
            if (qm) return `Quarterly: Q${qm[2]} ${qm[1]}`;
            return pval;
        }
        if (ptype === 'yearly') {
            if (/^\d{4}$/.test(pval)) return `Full Year: ${pval}`;
            return pval;
        }
        // monthly or fallback
        const parts = pval.split('-');
        if (parts.length >= 2) {
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return `Monthly: ${months[parseInt(parts[1], 10) - 1] || parts[1]} ${parts[0]}`;
        }
        return pval;
    }

    // Called with single period string (legacy)
    const period = period_type_or_string;
    if (!period) return '—';
    const qm = period.match(/^(\d{4})-Q(\d)$/);
    if (qm) return `Quarterly: Q${qm[2]} ${qm[1]}`;
    if (/^\d{4}$/.test(period)) return `Full Year: ${period}`;
    const parts = period.split('-');
    if (parts.length >= 2) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `Monthly: ${months[parseInt(parts[1], 10) - 1] || parts[1]} ${parts[0]}`;
    }
    return period;
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── STARTUP ──────────────────────────────────────────────────────────────────

init();
