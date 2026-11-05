/**
 * Full End-to-End Automated Test Suite for KCF Finance
 * Tests all pages, auth flows, CRUD endpoints, and admin panels.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const results = [];
  function log(name, passed, detail) {
    results.push({ name, passed, detail });
    console.log((passed ? '✓ PASS: ' : '✗ FAIL: ') + name + (detail ? ' (' + detail + ')' : ''));
  }

  try {
    // 1. Static Pages
    for (const path of ['/', '/login.html', '/register.html', '/admin.html', '/app.js', '/style.css']) {
      const res = await fetch(BASE + path);
      log('Static: ' + path, res.status === 200, 'HTTP ' + res.status);
    }

    // 2. Auth Invalid Login
    const badLogin = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fake@example.com', password: 'wrong' })
    });
    log('Auth: Invalid login rejected', badLogin.status === 401, 'HTTP ' + badLogin.status);

    // 3. Auth Valid Login
    const login = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'clco@kcf.finance', password: 'Password123!' })
    });
    const cookie = login.headers.get('set-cookie');
    log('Auth: Valid login succeeds', login.status === 200 && !!cookie, 'HTTP ' + login.status);

    const headers = { 'Content-Type': 'application/json', 'Cookie': cookie };

    // 4. Auth Me
    const me = await fetch(BASE + '/api/auth/me', { headers });
    const meData = await me.json();
    log('Auth: /api/auth/me returns org info', me.status === 200 && meData.org && meData.org.org_id === 1, 'Org ID: ' + (meData.org?.org_id));

    // 5. Categories CRUD
    const catList = await fetch(BASE + '/api/categories', { headers });
    const initialCats = await catList.json();
    log('Categories: GET list', catList.status === 200 && Array.isArray(initialCats), 'Count: ' + initialCats.length);

    const createCat = await fetch(BASE + '/api/categories', {
      method: 'POST',
      headers,
      body: JSON.stringify({ cat_name: 'E2E Test Category' })
    });
    const createdCatData = await createCat.json();
    const testCatId = createdCatData.cat_id;
    log('Categories: POST create', createCat.status === 200 && !!testCatId, 'cat_id: ' + testCatId);

    // 6. Income Sources CRUD
    const srcList = await fetch(BASE + '/api/income-sources', { headers });
    const initialSrcs = await srcList.json();
    log('Income Sources: GET list', srcList.status === 200 && Array.isArray(initialSrcs), 'Count: ' + initialSrcs.length);

    const createSrc = await fetch(BASE + '/api/income-sources', {
      method: 'POST',
      headers,
      body: JSON.stringify({ src_name: 'E2E Test Source' })
    });
    const createdSrcData = await createSrc.json();
    const testSrcId = createdSrcData.src_id;
    log('Income Sources: POST create', createSrc.status === 200 && !!testSrcId, 'src_id: ' + testSrcId);

    // 7. Income CRUD
    const createInc = await fetch(BASE + '/api/income', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        src_id: testSrcId,
        amount: 3500,
        income_date: '2026-11-05',
        description: 'E2E Test Income'
      })
    });
    const createdIncData = await createInc.json();
    const testIncId = createdIncData.income_id || createdIncData.id;
    log('Income: POST create', createInc.status === 200 && !!testIncId, 'income_id: ' + testIncId);

    const updateInc = await fetch(BASE + '/api/income?id=' + testIncId, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        src_id: testSrcId,
        amount: 4000,
        income_date: '2026-11-05',
        description: 'E2E Test Income Updated'
      })
    });
    log('Income: PUT update', updateInc.status === 200);

    const listInc = await fetch(BASE + '/api/income', { headers });
    const incs = await listInc.json();
    const foundInc = incs.find(i => (i.income_id || i.id) === testIncId);
    log('Income: GET list contains updated record', listInc.status === 200 && foundInc && foundInc.amount === 4000);

    const delInc = await fetch(BASE + '/api/income?id=' + testIncId, {
      method: 'DELETE',
      headers
    });
    log('Income: DELETE record', delInc.status === 200);

    // 8. Budgets CRUD
    const createBud = await fetch(BASE + '/api/budgets', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cat_id: testCatId,
        amount: 10000,
        period: '2026-11'
      })
    });
    const createdBudData = await createBud.json();
    const testBudId = createdBudData.budget_id || createdBudData.id || createdBudData.bud_id;
    log('Budgets: POST create', createBud.status === 200 && !!testBudId, 'bud_id: ' + testBudId);

    const budProg = await fetch(BASE + '/api/budgets/progress', { headers });
    log('Budgets: GET progress', budProg.status === 200);

    const budCheck = await fetch(BASE + '/api/budgets/live-check?cat_id=' + testCatId + '&date=2026-11-05', { headers });
    log('Budgets: GET live-check', budCheck.status === 200);

    const budSummary = await fetch(BASE + '/api/budgets/summary?cat_id=' + testCatId, { headers });
    log('Budgets: GET summary', budSummary.status === 200);

    // 9. Expenses CRUD
    const createExp = await fetch(BASE + '/api/expenses', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cat_id: testCatId,
        amount: 1200,
        e_date: '2026-11-05',
        description: 'E2E Test Expense'
      })
    });
    const createdExpData = await createExp.json();
    const testExpId = createdExpData.expense_id || createdExpData.id || createdExpData.exp_id;
    log('Expenses: POST create', createExp.status === 200 && !!testExpId, 'exp_id: ' + testExpId);

    const updateExp = await fetch(BASE + '/api/expenses?id=' + testExpId, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        cat_id: testCatId,
        amount: 1500,
        e_date: '2026-11-05',
        description: 'E2E Test Expense Updated',
        reason: 'E2E Testing edit flow'
      })
    });
    log('Expenses: PUT update with audit reason', updateExp.status === 200);

    const delExp = await fetch(BASE + '/api/expenses?id=' + testExpId, {
      method: 'DELETE',
      headers
    });
    log('Expenses: DELETE record', delExp.status === 200);

    // Delete test budget
    const delBud = await fetch(BASE + '/api/budgets?id=' + testBudId, {
      method: 'DELETE',
      headers
    });
    log('Budgets: DELETE record', delBud.status === 200);

    // Delete test category & source
    const delCat = await fetch(BASE + '/api/categories?id=' + testCatId, {
      method: 'DELETE',
      headers
    });
    log('Categories: DELETE record', delCat.status === 200);

    const delSrc = await fetch(BASE + '/api/income-sources?id=' + testSrcId, {
      method: 'DELETE',
      headers
    });
    log('Income Sources: DELETE record', delSrc.status === 200);

    // 10. Dashboard API
    const dash = await fetch(BASE + '/api/dashboard', { headers });
    const dashData = await dash.json();
    log('Dashboard: GET stats', dash.status === 200 && typeof dashData.totalExpense === 'number');

    // 11. Admin Login & Endpoints
    const adminLogin = await fetch(BASE + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@kcf.finance', password: 'Admin@12345678' })
    });
    const adminCookie = adminLogin.headers.get('set-cookie');
    log('Admin: Login succeeds', adminLogin.status === 200 && !!adminCookie);

    const adminHeaders = { 'Content-Type': 'application/json', 'Cookie': adminCookie };
    const adminOrgs = await fetch(BASE + '/api/admin/organisations', { headers: adminHeaders });
    const adminOrgsData = await adminOrgs.json();
    log('Admin: GET organisations', adminOrgs.status === 200 && Array.isArray(adminOrgsData), 'Count: ' + adminOrgsData.length);

    const auditLog = await fetch(BASE + '/api/admin/audit-log', { headers: adminHeaders });
    log('Admin: GET audit-log', auditLog.status === 200);

    const susp = await fetch(BASE + '/api/admin/suspicious', { headers: adminHeaders });
    log('Admin: GET suspicious', susp.status === 200);

    const adminLogout = await fetch(BASE + '/api/admin/logout', { method: 'POST', headers: adminHeaders });
    log('Admin: Logout', adminLogout.status === 200);

    // 12. Org Logout
    const logout = await fetch(BASE + '/api/auth/logout', { method: 'POST', headers });
    log('Auth: Org Logout', logout.status === 200);

  } catch (err) {
    console.error('Fatal error during E2E test:', err);
  }

  const failed = results.filter(r => !r.passed);
  console.log('\n--- Summary ---');
  console.log('Passed:', results.length - failed.length, '/', results.length);
  if (failed.length > 0) {
    console.log('Failed tests:', failed.map(f => f.name).join(', '));
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED! (100%)');
  }
}

run();
