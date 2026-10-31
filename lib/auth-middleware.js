/**
 * Authentication & authorisation middleware for KCF Finance.
 * All org_id values for data access come from the SERVER SESSION — never from client input.
 */

/**
 * Middleware: require an authenticated organisation session.
 * Attaches req.orgId from the session (not from client).
 */
export function requireAuth(req, res, next) {
    if (!req.session || !req.session.orgId) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    // Expose orgId via req so handlers never read from req.body/req.query for auth
    req.orgId = req.session.orgId;
    next();
}

/**
 * Middleware: require an authenticated super-admin session.
 */
export function requireAdmin(req, res, next) {
    if (!req.session || !req.session.isAdmin) {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

