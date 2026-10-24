/* ═══════════════════════════════════════════════════
   KCF Finance — Application Logic
   ═══════════════════════════════════════════════════ */

const API_URL = '/api';
let chartInstance = null;
let currentOrgId = '';
let allBudgetData = [];
let allOrganizations = [];

// ═══════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════

const subtitles = {
    'dashboard-view': 'Overview of your financial data',
    'org-view': 'Manage your institutions',
    'expense-view': 'Track and record all expenditures',
    'income-view': 'Log donations, grants & other revenue',
    'budget-view': 'Plan, allocate & monitor spending limits'
};

document.querySelectorAll('.nav-links li').forEach(link => {
    link.addEventListener('click', (e) => {
        const li = e.currentTarget;
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        li.classList.add('active');

        const targetId = li.getAttribute('data-target');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
        const targetView = document.getElementById(targetId);
        if (targetView) targetView.classList.add('active-view');

        const title = li.querySelector('span').textContent;
        document.getElementById('page-title').textContent = title;
        document.getElementById('page-subtitle').textContent = subtitles[targetId] || '';

        // If an organisation is selected, refresh data for this view
        if (currentOrgId) {
            if (targetId === 'dashboard-view') loadDashboard();
            if (targetId === 'org-view') loadOrganizationsTable(currentOrgId);
            if (targetId === 'expense-view') loadExpenses(currentOrgId);
            if (targetId === 'income-view') loadIncome(currentOrgId);
            if (targetId === 'budget-view') loadBudgetDashboard(currentOrgId);
        }

        closeMobileSidebar();
    });
});

// Mobile sidebar toggle
const hamburgerBtn = document.getElementById('hamburger-btn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('open');
    });
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeMobileSidebar);
}

function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('open');
}

// ═══════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════

async function init() {
    setDefaultDates();
    await loadOrganizations();

    // Check if previously selected org exists in localStorage
    const savedOrg = localStorage.getItem('selected_org_id');
    const globalSelect = document.getElementById('global-org-select');

    if (savedOrg && allOrganizations.some(o => o.org_id == savedOrg)) {
        globalSelect.value = savedOrg;
    }

    onGlobalOrgChange();
}

function setDefaultDates() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentMonth = todayStr.substring(0, 7); // YYYY-MM

    const expDateInput = document.getElementById('exp-date');
    if (expDateInput && !expDateInput.value) expDateInput.value = todayStr;

    const incDateInput = document.getElementById('inc-date');
    if (incDateInput && !incDateInput.value) incDateInput.value = todayStr;

    const budPeriodInput = document.getElementById('bud-period');
    if (budPeriodInput && !budPeriodInput.value) budPeriodInput.value = currentMonth;
}

// ═══════════════════════════════════════════════════
// ORGANISATION MANAGEMENT & GLOBAL SCOPING
// ═══════════════════════════════════════════════════

async function loadOrganizations() {
    try {
        const res = await fetch(`${API_URL}/organisations`);
        allOrganizations = await res.json();

        // Populate all org dropdowns
        const selects = ['global-org-select', 'exp-org-select', 'cat-org-select', 'inc-org-select', 'bud-org-select'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                const currentVal = select.value;
                select.innerHTML = '<option value="">Select Organization</option>';
                allOrganizations.forEach(org => {
                    select.innerHTML += `<option value="${org.org_id}">${org.name}</option>`;
                });
                if (currentVal && allOrganizations.some(o => o.org_id == currentVal)) {
                    select.value = currentVal;
                }
            }
        });

        loadOrganizationsTable();
    } catch (e) {
        console.error('API Error: Ensure the server is running.', e);
    }
}

// Global Org Change handler
document.getElementById('global-org-select').addEventListener('change', onGlobalOrgChange);

async function onGlobalOrgChange() {
    currentOrgId = document.getElementById('global-org-select').value;
    localStorage.setItem('selected_org_id', currentOrgId);

    const hasOrg = Boolean(currentOrgId);

    // Update view visibility: hide prompts and show contents ONLY when an org is selected
    updateOrgScopedVisibility('dashboard', hasOrg);
    updateOrgScopedVisibility('expense', hasOrg);
    updateOrgScopedVisibility('income', hasOrg);
    updateOrgScopedVisibility('budget', hasOrg);

    if (hasOrg) {
        // Automatically sync all form dropdowns with currentOrgId
        ['exp-org-select', 'cat-org-select', 'inc-org-select', 'bud-org-select'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = currentOrgId;
        });

        // Load cascading categories for currentOrgId
        await loadCategoriesForOrg(currentOrgId);

        // Load data across all views
        loadDashboard();
        loadOrganizationsTable();
        loadExpenses(currentOrgId);
        loadIncome(currentOrgId);
        loadBudgetDashboard(currentOrgId);
        updateBudgetIndicator();
    } else {
        // Reset dashboard metrics
        document.getElementById('total-income').textContent = '$0.00';
        document.getElementById('total-expense').textContent = '$0.00';
        document.getElementById('net-balance').textContent = '$0.00';
        if (chartInstance) chartInstance.destroy();

        // Clear tables and cards
        const expBody = document.querySelector('#expense-table tbody');
        if (expBody) expBody.innerHTML = '';
        const incBody = document.querySelector('#income-table tbody');
        if (incBody) incBody.innerHTML = '';
        loadOrganizationsTable();

        // Hide budget indicator
        const indicator = document.getElementById('budget-indicator');
        if (indicator) indicator.style.display = 'none';
    }
}

function updateOrgScopedVisibility(viewPrefix, hasOrg, contentIdOverride = null) {
    const prompt = document.getElementById(`${viewPrefix}-no-org`);
    const content = document.getElementById(contentIdOverride || `${viewPrefix}-content`);

    if (prompt) prompt.style.display = hasOrg ? 'none' : 'flex';
    if (content) content.style.display = hasOrg ? 'block' : 'none';
}

async function loadCategoriesForOrg(orgId) {
    if (!orgId) return;
    try {
        const res = await fetch(`${API_URL}/categories`);
        const cats = await res.json();
        const orgCats = cats.filter(c => c.org_id == orgId);

        // Update expense category select
        const expCatSelect = document.getElementById('exp-cat-select');
        if (expCatSelect) {
            expCatSelect.innerHTML = '<option value="">Select Category</option>';
            orgCats.forEach(c => {
                expCatSelect.innerHTML += `<option value="${c.cat_id}">${c.cat_name}</option>`;
            });
        }

        // Update budget category select
        const budCatSelect = document.getElementById('bud-cat-select');
        if (budCatSelect) {
            budCatSelect.innerHTML = '<option value="">Select Category</option>';
            orgCats.forEach(c => {
                budCatSelect.innerHTML += `<option value="${c.cat_id}">${c.cat_name}</option>`;
            });
        }
    } catch (e) {
        console.error('Error loading categories:', e);
    }
}

// Organisation Table rendering — all organisations
function loadOrganizationsTable() {
    const tbody = document.querySelector('#org-table tbody');
    const badge = document.getElementById('org-badge');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (badge) {
        badge.textContent = `${allOrganizations.length} organisation${allOrganizations.length === 1 ? '' : 's'}`;
    }

    if (allOrganizations.length === 0) {
        tbody.innerHTML = '<tr class="table-empty-row"><td colspan="6">No organisations yet. Use the form above to add one.</td></tr>';
        return;
    }

    allOrganizations.forEach(org => {
        const isSelected = currentOrgId && currentOrgId == org.org_id;
        const row = document.createElement('tr');
        if (isSelected) row.classList.add('selected-row');
        row.innerHTML = `
            <td><strong>#${org.org_id}</strong></td>
            <td><strong>${escapeHtml(org.name)}</strong>${isSelected ? ' <span class="badge" style="margin-left:0.5rem;font-size:0.65rem;">Selected</span>' : ''}</td>
            <td><span class="badge">${escapeHtml(org.type || 'Standard')}</span></td>
            <td>${escapeHtml(org.address || '—')}</td>
            <td>${escapeHtml(org.Contact || '—')}</td>
            <td>
                <div style="display:flex; gap:0.4rem;">
                    <button onclick="editOrg(${org.org_id})" class="budget-action-btn" title="Edit Organisation">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onclick="deleteOrg(${org.org_id})" class="budget-action-btn delete-btn" title="Delete Organisation">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ═══════════════════════════════════════════════════
// EXPENSES MODULE & TABLE
// ═══════════════════════════════════════════════════

async function loadExpenses(orgId) {
    if (!orgId) return;
    try {
        const res = await fetch(`${API_URL}/expenses?org_id=${orgId}`);
        const expenses = await res.json();

        const tbody = document.querySelector('#expense-table tbody');
        const badge = document.getElementById('expense-count-badge');
        if (badge) badge.textContent = `${expenses.length} expense${expenses.length === 1 ? '' : 's'}`;

        if (!tbody) return;
        tbody.innerHTML = '';

        if (expenses.length === 0) {
            tbody.innerHTML = '<tr class="table-empty-row"><td colspan="4">No expenses recorded for this organisation yet</td></tr>';
            return;
        }

        expenses.forEach(e => {
            tbody.innerHTML += `
                <tr>
                    <td>${e.e_date}</td>
                    <td><strong>${escapeHtml(e.cat_name || 'Category ' + e.cat_id)}</strong></td>
                    <td style="color:#f87171; font-weight:600;">$${parseFloat(e.amount).toFixed(2)}</td>
                    <td>
                        <button onclick="deleteExpense(${e.exp_id})" class="budget-action-btn delete-btn" title="Delete Expense">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error('Error loading expenses:', err);
    }
}

async function deleteExpense(id) {
    if (confirm('Delete this expense entry?')) {
        try {
            await fetch(`${API_URL}/expenses?id=${id}`, { method: 'DELETE' });
            showToast('success', 'Expense Deleted', 'Expense has been removed successfully.');
            if (currentOrgId) {
                loadExpenses(currentOrgId);
                loadDashboard();
                loadBudgetDashboard(currentOrgId);
                updateBudgetIndicator();
            }
        } catch (err) {
            showToast('danger', 'Error', 'Failed to delete expense.');
        }
    }
}

// Cascading category load on org change for expenses form
document.getElementById('exp-org-select').addEventListener('change', async (e) => {
    await loadCategoriesForOrg(e.target.value);
    updateBudgetIndicator();
});

// Live budget indicator on category/date changes
document.getElementById('exp-cat-select').addEventListener('change', updateBudgetIndicator);
document.getElementById('exp-date').addEventListener('change', updateBudgetIndicator);

async function updateBudgetIndicator() {
    const indicator = document.getElementById('budget-indicator');
    const content = document.getElementById('budget-indicator-content');
    const title = document.getElementById('budget-indicator-title');
    const orgId = document.getElementById('exp-org-select').value || currentOrgId;
    const catId = document.getElementById('exp-cat-select').value;
    const date = document.getElementById('exp-date').value;

    if (!orgId || !catId || !date) {
        if (indicator) indicator.style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/budgets/live-check?org_id=${orgId}&cat_id=${catId}&date=${date}`);
        const data = await res.json();

        indicator.style.display = 'block';

        if (!data.hasBudget) {
            indicator.className = 'budget-indicator budget-indicator-none';
            title.textContent = 'No Budget Found';
            content.innerHTML = `<p class="budget-indicator-message">No budget allocated for this category in the selected period. Expense will not be limited.</p>`;
            return;
        }

        const b = data.budgets[0]; // Primary matching budget
        const pct = b.budget_amount > 0 ? (b.spent / b.budget_amount) * 100 : 0;
        const isOver = pct > 100;
        const isWarning = pct > 75 && pct <= 100;

        indicator.className = `budget-indicator ${isOver ? 'budget-indicator-over' : isWarning ? 'budget-indicator-warn' : 'budget-indicator-ok'}`;
        title.textContent = `Budget: ${formatPeriodExplicit(b.period)}`;

        const cappedPct = Math.min(pct, 100);
        content.innerHTML = `
            <div class="budget-indicator-stats">
                <div class="budget-indicator-stat">
                    <span class="budget-indicator-label">Allocated</span>
                    <span class="budget-indicator-value">$${b.budget_amount.toFixed(2)}</span>
                </div>
                <div class="budget-indicator-stat">
                    <span class="budget-indicator-label">Spent</span>
                    <span class="budget-indicator-value budget-indicator-spent">$${b.spent.toFixed(2)}</span>
                </div>
                <div class="budget-indicator-stat">
                    <span class="budget-indicator-label">${b.remaining >= 0 ? 'Remaining' : 'Over by'}</span>
                    <span class="budget-indicator-value ${b.remaining >= 0 ? 'budget-indicator-remaining' : 'budget-indicator-over-value'}">$${Math.abs(b.remaining).toFixed(2)}</span>
                </div>
            </div>
            <div class="budget-indicator-bar">
                <div class="budget-indicator-fill ${isOver ? 'fill-over' : isWarning ? 'fill-warn' : 'fill-ok'}" style="width: ${cappedPct}%;"></div>
            </div>
            <div class="budget-indicator-pct">${pct.toFixed(1)}% used</div>
        `;
    } catch (err) {
        if (indicator) indicator.style.display = 'none';
        console.error('Budget indicator error:', err);
    }
}

// ═══════════════════════════════════════════════════
// INCOME MODULE & TABLE
// ═══════════════════════════════════════════════════

async function loadIncome(orgId) {
    if (!orgId) return;
    try {
        const res = await fetch(`${API_URL}/income?org_id=${orgId}`);
        const incomes = await res.json();

        const tbody = document.querySelector('#income-table tbody');
        const badge = document.getElementById('income-count-badge');
        if (badge) badge.textContent = `${incomes.length} entr${incomes.length === 1 ? 'y' : 'ies'}`;

        if (!tbody) return;
        tbody.innerHTML = '';

        if (incomes.length === 0) {
            tbody.innerHTML = '<tr class="table-empty-row"><td colspan="5">No income recorded for this organisation yet</td></tr>';
            return;
        }

        incomes.forEach(i => {
            tbody.innerHTML += `
                <tr>
                    <td>${i.income_date}</td>
                    <td><strong>${escapeHtml(i.Source)}</strong></td>
                    <td style="color:var(--text-muted);">${escapeHtml(i.description || '—')}</td>
                    <td style="color:#34d399; font-weight:600;">+$${parseFloat(i.amount).toFixed(2)}</td>
                    <td>
                        <button onclick="deleteIncome(${i.income_id})" class="budget-action-btn delete-btn" title="Delete Income">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error('Error loading income:', err);
    }
}

async function deleteIncome(id) {
    if (confirm('Delete this income record?')) {
        try {
            await fetch(`${API_URL}/income?id=${id}`, { method: 'DELETE' });
            showToast('success', 'Income Deleted', 'Income record has been removed.');
            if (currentOrgId) {
                loadIncome(currentOrgId);
                loadDashboard();
            }
        } catch (err) {
            showToast('danger', 'Error', 'Failed to delete income.');
        }
    }
}

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════

async function loadDashboard() {
    const orgId = currentOrgId || document.getElementById('global-org-select').value;
    if (!orgId) {
        document.getElementById('total-income').textContent = `$0.00`;
        document.getElementById('total-expense').textContent = `$0.00`;
        document.getElementById('net-balance').textContent = `$0.00`;
        if (chartInstance) chartInstance.destroy();
        return;
    }

    try {
        const res = await fetch(`${API_URL}/dashboard?org_id=${orgId}`);
        const data = await res.json();

        document.getElementById('total-income').textContent = `$${(data.totalIncome || 0).toFixed(2)}`;
        document.getElementById('total-expense').textContent = `$${(data.totalExpense || 0).toFixed(2)}`;
        document.getElementById('net-balance').textContent = `$${((data.totalIncome || 0) - (data.totalExpense || 0)).toFixed(2)}`;

        renderChart(data.expensesByCategory || []);
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

function renderChart(expenses) {
    const canvas = document.getElementById('expenseChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (chartInstance) chartInstance.destroy();

    const labels = expenses.map(e => e.cat_name);
    const data = expenses.map(e => e.amount);

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#6366f1', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#38bdf8'],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#f8fafc',
                        padding: 16,
                        usePointStyle: true,
                        pointStyleWidth: 10,
                        font: { family: 'Inter', size: 12 }
                    }
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════
// BUDGET MODULE
// ═══════════════════════════════════════════════════

async function loadBudgetDashboard(orgId) {
    const targetOrg = orgId || currentOrgId;
    if (!targetOrg) {
        updateBudgetStats([]);
        renderBudgetCards([]);
        return;
    }

    try {
        const res = await fetch(`${API_URL}/budgets/progress?org_id=${targetOrg}`);
        allBudgetData = await res.json();
        updateBudgetStats(allBudgetData);
        renderBudgetCards(allBudgetData);
    } catch (e) {
        console.error('Error loading budgets:', e);
    }
}

function updateBudgetStats(budgets) {
    const total = budgets.length;
    const totalAllocated = budgets.reduce((sum, b) => sum + b.budget_amount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const overBudget = budgets.filter(b => b.spent > b.budget_amount).length;

    const statBudgets = document.getElementById('stat-total-budgets');
    const statAllocated = document.getElementById('stat-total-allocated');
    const statSpent = document.getElementById('stat-total-spent');
    const statOver = document.getElementById('stat-over-budget');

    if (statBudgets) statBudgets.textContent = total;
    if (statAllocated) statAllocated.textContent = `$${formatNumber(totalAllocated)}`;
    if (statSpent) statSpent.textContent = `$${formatNumber(totalSpent)}`;
    if (statOver) statOver.textContent = overBudget;
}

function renderBudgetCards(budgets) {
    const grid = document.getElementById('budget-grid');
    const emptyState = document.getElementById('budget-empty-state');
    if (!grid || !emptyState) return;

    // Apply status filter
    const statusFilterSelect = document.getElementById('budget-filter-status');
    const statusFilter = statusFilterSelect ? statusFilterSelect.value : '';

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

    // Clear existing cards
    grid.querySelectorAll('.budget-card').forEach(c => c.remove());

    if (filtered.length === 0) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    filtered.forEach(budget => {
        const pct = budget.budget_amount > 0 ? (budget.spent / budget.budget_amount) * 100 : 0;
        const remaining = budget.budget_amount - budget.spent;
        const cappedPct = Math.min(pct, 100);

        let statusClass, progressClass, percentClass;
        if (pct > 100) {
            statusClass = 'status-over-budget';
            progressClass = 'progress-over-budget';
            percentClass = 'percent-over-budget';
        } else if (pct > 75) {
            statusClass = 'status-warning';
            progressClass = 'progress-warning';
            percentClass = 'percent-warning';
        } else {
            statusClass = 'status-on-track';
            progressClass = 'progress-on-track';
            percentClass = 'percent-on-track';
        }

        const card = document.createElement('div');
        card.className = `budget-card${pct > 100 ? ' over-budget' : ''}`;
        card.innerHTML = `
            <div class="budget-card-status-bar ${statusClass}"></div>
            <div class="budget-card-header">
                <div>
                    <div class="budget-card-title">${escapeHtml(budget.cat_name)}</div>
                    <div class="budget-card-org">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                        ${escapeHtml(budget.org_name)}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    ${pct > 100 ? '<span class="over-budget-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 1 1.71 3h16.94a2 2 0 0 1 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> OVER</span>' : ''}
                    <span class="budget-card-period" title="This budget tracks expenses dated within this period">${formatPeriodExplicit(budget.period)}</span>
                </div>
            </div>
            <div class="budget-progress-section">
                <div class="budget-progress-header">
                    <div class="budget-progress-amounts">
                        <strong>$${formatNumber(budget.spent)}</strong> of $${formatNumber(budget.budget_amount)}
                    </div>
                    <div class="budget-progress-percentage ${percentClass}">${pct.toFixed(1)}%</div>
                </div>
                <div class="budget-progress-bar">
                    <div class="budget-progress-fill ${progressClass}" style="width: 0%;" data-target-width="${cappedPct}%"></div>
                </div>
            </div>
            <div class="budget-card-footer">
                <div class="budget-remaining">
                    ${remaining >= 0
                        ? `<span class="remaining-positive">$${formatNumber(remaining)}</span> remaining`
                        : `<span class="remaining-negative">$${formatNumber(Math.abs(remaining))}</span> over limit`
                    }
                </div>
                <div class="budget-card-actions">
                    <button class="budget-action-btn delete-btn" onclick="deleteBudget(${budget.bud_id})" title="Delete Budget">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;

        grid.insertBefore(card, emptyState);

        // Animate the progress bar fill
        requestAnimationFrame(() => {
            const fill = card.querySelector('.budget-progress-fill');
            if (fill) {
                requestAnimationFrame(() => {
                    fill.style.width = fill.dataset.targetWidth;
                });
            }
        });
    });
}

// Budget status filter listener
const budgetStatusFilter = document.getElementById('budget-filter-status');
if (budgetStatusFilter) {
    budgetStatusFilter.addEventListener('change', () => renderBudgetCards(allBudgetData));
}

// Cascading category load on org change for budget form
document.getElementById('bud-org-select').addEventListener('change', async (e) => {
    await loadCategoriesForOrg(e.target.value);
});

// Delete budget
async function deleteBudget(id) {
    if (confirm('Delete this budget? This cannot be undone.')) {
        try {
            await fetch(`${API_URL}/budgets?id=${id}`, { method: 'DELETE' });
            showToast('success', 'Budget Deleted', 'The budget has been removed successfully.');
            if (currentOrgId) {
                loadBudgetDashboard(currentOrgId);
                updateBudgetIndicator();
            }
        } catch (e) {
            showToast('danger', 'Error', 'Failed to delete budget.');
        }
    }
}

// Period hint updater for budget form
document.querySelectorAll('input[name="bud-period-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const hint = document.getElementById('period-hint');
        const type = document.querySelector('input[name="bud-period-type"]:checked').value;
        if (type === 'monthly') {
            hint.textContent = '💡 Monthly budgets only track expenses dated within the selected month.';
        } else if (type === 'quarterly') {
            hint.textContent = '💡 Quarterly budgets cover 3 months (e.g. Q1 = Jan–Mar). The quarter is derived from the month you select.';
        } else {
            hint.textContent = '💡 Yearly budgets cover all expenses from Jan 1 to Dec 31 of the selected year.';
        }
    });
});

// ═══════════════════════════════════════════════════
// FORM SUBMISSIONS
// ═══════════════════════════════════════════════════

// Organisation form (supports both Add and Edit)
document.getElementById('org-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('org-edit-id').value;
    const body = {
        name: document.getElementById('org-name').value.trim(),
        type: document.getElementById('org-type').value,
        address: document.getElementById('org-address').value.trim(),
        Contact: document.getElementById('org-contact').value.trim()
    };

    if (!body.name) {
        showToast('warning', 'Validation Error', 'Organisation name is required.');
        return;
    }

    try {
        if (editId) {
            // Update existing organisation
            const res = await fetch(`${API_URL}/organisations?id=${editId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
            showToast('success', 'Organisation Updated', `"${body.name}" has been updated.`);
            cancelEditOrg();
        } else {
            // Create new organisation
            const res = await fetch(`${API_URL}/organisations`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Creation failed');
            const created = await res.json();
            e.target.reset();
            document.getElementById('org-edit-id').value = '';
            showToast('success', 'Organisation Added', `"${body.name}" has been created.`);

            // Automatically switch to the newly created organisation
            await loadOrganizations();
            if (created.id) {
                document.getElementById('global-org-select').value = created.id;
                onGlobalOrgChange();
            }
            return;
        }
        await loadOrganizations();
        if (currentOrgId) onGlobalOrgChange();
    } catch (err) {
        showToast('danger', 'Error', editId ? 'Failed to update organisation.' : 'Failed to create organisation.');
    }
});

// Category form
document.getElementById('cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const orgId = document.getElementById('cat-org-select').value || currentOrgId;
    const body = {
        org_id: orgId,
        cat_name: document.getElementById('cat-name').value.trim(),
        description: ''
    };
    try {
        const res = await fetch(`${API_URL}/categories`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to add category');
        document.getElementById('cat-name').value = '';
        showToast('success', 'Category Added', `"${body.cat_name}" category created.`);
        await loadCategoriesForOrg(orgId);
    } catch (err) {
        showToast('danger', 'Error', 'Failed to add category.');
    }
});

// Expense form
document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const orgId = document.getElementById('exp-org-select').value || currentOrgId;
    const body = {
        org_id: orgId,
        cat_id: document.getElementById('exp-cat-select').value,
        amount: document.getElementById('exp-amount').value,
        e_date: document.getElementById('exp-date').value
    };

    try {
        const res = await fetch(`${API_URL}/expenses`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();

        if (data.blocked) {
            showToast('danger', 'Expense Blocked!', data.message, 8000);
            return;
        }

        if (!res.ok) throw new Error(data.error || 'Failed to record expense');

        if (data.warning) {
            showToast('warning', 'Budget Warning', data.warning, 6000);
        } else {
            showToast('success', 'Expense Recorded', `$${parseFloat(body.amount).toFixed(2)} expense added.`);
        }

        // Reset amount only, retain date & org
        document.getElementById('exp-amount').value = '';
        if (currentOrgId) {
            loadExpenses(currentOrgId);
            loadDashboard();
            loadBudgetDashboard(currentOrgId);
            updateBudgetIndicator();
        }
    } catch (err) {
        showToast('danger', 'Error', 'Failed to record expense. Please try again.');
    }
});

// Income form
document.getElementById('income-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const orgId = document.getElementById('inc-org-select').value || currentOrgId;
    const body = {
        org_id: orgId,
        Source: document.getElementById('inc-source').value.trim(),
        amount: document.getElementById('inc-amount').value,
        income_date: document.getElementById('inc-date').value,
        description: document.getElementById('inc-desc').value.trim()
    };

    try {
        const res = await fetch(`${API_URL}/income`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to record income');

        // Reset form inputs
        document.getElementById('inc-source').value = '';
        document.getElementById('inc-amount').value = '';
        document.getElementById('inc-desc').value = '';

        showToast('success', 'Income Recorded', `$${parseFloat(body.amount).toFixed(2)} income from "${body.Source}".`);
        if (currentOrgId) {
            loadIncome(currentOrgId);
            loadDashboard();
        }
    } catch (err) {
        showToast('danger', 'Error', 'Failed to record income.');
    }
});

// Budget form
document.getElementById('budget-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const periodType = document.querySelector('input[name="bud-period-type"]:checked').value;
    const rawPeriod = document.getElementById('bud-period').value;

    let period;
    if (periodType === 'quarterly') {
        const [year, month] = rawPeriod.split('-');
        const quarter = Math.ceil(parseInt(month, 10) / 3);
        period = `${year}-Q${quarter}`;
    } else if (periodType === 'yearly') {
        period = rawPeriod.split('-')[0];
    } else {
        period = rawPeriod;
    }

    const orgId = document.getElementById('bud-org-select').value || currentOrgId;
    const body = {
        org_id: orgId,
        cat_id: document.getElementById('bud-cat-select').value,
        amount: document.getElementById('bud-amount').value,
        period
    };

    try {
        const res = await fetch(`${API_URL}/budgets`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to create budget');

        document.getElementById('bud-amount').value = '';
        document.getElementById('period-monthly').checked = true;

        showToast('success', 'Budget Created', `$${parseFloat(body.amount).toFixed(2)} budget allocated for ${formatPeriod(period)}.`);
        if (currentOrgId) {
            loadBudgetDashboard(currentOrgId);
            updateBudgetIndicator();
        }
    } catch (err) {
        showToast('danger', 'Error', 'Failed to create budget.');
    }
});

// Delete organisation
async function deleteOrg(id) {
    if (confirm('Delete this organisation? All related categories, expenses, income, and budgets will be deleted.')) {
        try {
            await fetch(`${API_URL}/organisations?id=${id}`, { method: 'DELETE' });
            showToast('success', 'Organisation Deleted', 'Organisation removed.');
            if (currentOrgId == id) {
                document.getElementById('global-org-select').value = '';
                onGlobalOrgChange();
            }
            await loadOrganizations();
        } catch (err) {
            showToast('danger', 'Error', 'Failed to delete organisation.');
        }
    }
}
// Edit organisation — populate form with existing data
function editOrg(orgId) {
    const org = allOrganizations.find(o => o.org_id == orgId);
    if (!org) return;

    document.getElementById('org-edit-id').value = org.org_id;
    document.getElementById('org-name').value = org.name || '';
    document.getElementById('org-type').value = org.type || 'Orphanage';
    document.getElementById('org-address').value = org.address || '';
    document.getElementById('org-contact').value = org.Contact || '';

    document.getElementById('org-form-title').textContent = 'Edit Organisation';
    document.getElementById('org-submit-btn').innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Update Organisation
    `;
    document.getElementById('org-cancel-btn').style.display = 'inline-flex';

    // Scroll to form
    document.getElementById('org-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelEditOrg() {
    document.getElementById('org-edit-id').value = '';
    document.getElementById('org-form').reset();
    document.getElementById('org-form-title').textContent = 'Add Organisation';
    document.getElementById('org-submit-btn').innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Organisation
    `;
    document.getElementById('org-cancel-btn').style.display = 'none';
}

// ═══════════════════════════════════════════════════
// FORMAT & UTILITY HELPERS
// ═══════════════════════════════════════════════════

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Number(num).toFixed(2);
}

function formatPeriod(period) {
    if (!period) return '—';
    const quarterMatch = period.match(/^(\d{4})-Q(\d)$/);
    if (quarterMatch) return `Q${quarterMatch[2]} ${quarterMatch[1]}`;
    if (/^\d{4}$/.test(period)) return period;
    const parts = period.split('-');
    if (parts.length >= 2) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIdx = parseInt(parts[1], 10) - 1;
        return `${months[monthIdx] || parts[1]} ${parts[0]}`;
    }
    return period;
}

function formatPeriodExplicit(period) {
    if (!period) return '—';
    const quarterMatch = period.match(/^(\d{4})-Q(\d)$/);
    if (quarterMatch) return `Quarterly: Q${quarterMatch[2]} ${quarterMatch[1]}`;
    if (/^\d{4}$/.test(period)) return `Full Year: ${period}`;
    const parts = period.split('-');
    if (parts.length >= 2) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIdx = parseInt(parts[1], 10) - 1;
        return `Monthly: ${months[monthIdx] || parts[1]} ${parts[0]}`;
    }
    return period;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════

function showToast(type, title, message, duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        danger: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.position = 'relative';
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.danger}</div>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" aria-label="Dismiss">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    container.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.animation = 'toastOut 0.4s ease forwards';
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 400);
}

function showAlert(message) {
    showToast('danger', 'Alert', message);
}

// ═══════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════

init();
