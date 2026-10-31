/* ══════════════════════════════════════════════════════════════════════
   KCF Finance — Application Logic (Authenticated SPA)
   Session org_id comes from the server. All API calls use credentials.
   ══════════════════════════════════════════════════════════════════════ */

const API = '/api';
let chartInstance = null;
let allBudgetData = [];
let allCategories = [];
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
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i.income_date}</td>
            <td><strong>${escHtml(i.Source)}</strong></td>
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
        (i.Source || '').toLowerCase().includes(q) ||
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

    const body = {
        Source: document.getElementById('inc-source').value.trim(),
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

        showToast('success', editId ? 'Income Updated' : 'Income Recorded',
            `₹${parseFloat(body.amount).toFixed(2)} from "${body.Source}".`);
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
    document.getElementById('ei-source').value = record.Source || '';
    document.getElementById('ei-amount').value = record.amount || '';
    document.getElementById('ei-date').value = record.income_date || '';
    document.getElementById('ei-desc').value = record.description || '';
}

async function saveEditIncome() {
    const id = document.getElementById('edit-income-id').value;
    const body = {
        Source: document.getElementById('ei-source').value.trim(),
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
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row">No expenses recorded yet</td></tr>`;
        return;
    }
    data.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${e.e_date}</td>
            <td><strong>${escHtml(e.cat_name || 'Category ' + e.cat_id)}</strong></td>
            <td class="amount-negative">₹${fmt(e.amount)}</td>
            <td class="actions-cell">
                <button class="action-btn edit-btn" onclick="openEditExpense(${e.exp_id})" title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
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
        e_date: document.getElementById('exp-date').value
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
}

async function saveEditExpense() {
    const id = document.getElementById('edit-expense-id').value;
    const body = {
        cat_id: document.getElementById('ee-cat').value,
        amount: document.getElementById('ee-amount').value,
        e_date: document.getElementById('ee-date').value
    };
    try {
        const res = await fetch(`${API}/expenses?id=${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
        showToast('success', 'Expense Updated', 'Record saved.');
        closeModal('edit-expense-modal');
        loadExpenses(); loadDashboard(); loadBudgetDashboard();
    } catch (err) {
        showToast('danger', 'Error', err.message);
    }
}

async function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
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
        title.textContent = `Budget: ${formatPeriodExplicit(b.period)}`;
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
    const over = budgets.filter(b => b.spent > b.budget_amount).length;

    document.getElementById('stat-total-budgets').textContent = total;
    document.getElementById('stat-total-allocated').textContent = `₹${formatNumber(allocated)}`;
    document.getElementById('stat-total-spent').textContent = `₹${formatNumber(spent)}`;
    document.getElementById('stat-over-budget').textContent = over;
}

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

    if (filtered.length === 0) { emptyState.style.display = 'flex'; return; }
    emptyState.style.display = 'none';

    filtered.forEach(budget => {
        const pct = budget.budget_amount > 0 ? (budget.spent / budget.budget_amount) * 100 : 0;
        const remaining = budget.budget_amount - budget.spent;
        const capped = Math.min(pct, 100);
        let statusClass, progressClass, pctClass;
        if (pct > 100)      { statusClass = 'status-over-budget'; progressClass = 'progress-over-budget'; pctClass = 'percent-over-budget'; }
        else if (pct > 75)  { statusClass = 'status-warning'; progressClass = 'progress-warning'; pctClass = 'percent-warning'; }
        else                { statusClass = 'status-on-track'; progressClass = 'progress-on-track'; pctClass = 'percent-on-track'; }

        const card = document.createElement('div');
        card.className = `budget-card${pct > 100 ? ' over-budget' : ''}`;
        card.innerHTML = `
            <div class="budget-card-status-bar ${statusClass}"></div>
            <div class="budget-card-header">
                <div>
                    <div class="budget-card-title">${escHtml(budget.cat_name)}</div>
                    <div class="budget-card-period">${formatPeriodExplicit(budget.period)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:0.4rem;">
                    ${pct > 100 ? '<span class="over-budget-badge">OVER</span>' : ''}
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
                    ${remaining >= 0
                        ? `<span class="remaining-positive">₹${formatNumber(remaining)}</span> remaining`
                        : `<span class="remaining-negative">₹${formatNumber(Math.abs(remaining))}</span> over limit`}
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
    const periodType = document.querySelector('input[name="bud-period-type"]:checked').value;
    const rawPeriod = document.getElementById('bud-period').value;
    let period;
    if (periodType === 'quarterly') {
        const [y, m] = rawPeriod.split('-');
        period = `${y}-Q${Math.ceil(parseInt(m, 10) / 3)}`;
    } else if (periodType === 'yearly') {
        period = rawPeriod.split('-')[0];
    } else {
        period = rawPeriod;
    }
    const body = { cat_id: document.getElementById('bud-cat-select').value, amount: document.getElementById('bud-amount').value, period };
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
    document.getElementById('eb-period').value = bud.period.length === 7 ? bud.period : '';
}

async function saveEditBudget() {
    const id = document.getElementById('edit-budget-id').value;
    const body = {
        cat_id: document.getElementById('eb-cat').value,
        amount: document.getElementById('eb-amount').value,
        period: document.getElementById('eb-period').value
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

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Number(n).toFixed(2);
}

function formatPeriodExplicit(period) {
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
