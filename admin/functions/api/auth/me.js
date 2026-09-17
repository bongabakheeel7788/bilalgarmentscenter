// GET /api/auth/me — who is looking, and with which keys (the app paints its menu from this)
import { guard } from '../../_lib/auth.js';
export const onRequestGet = guard(null, async user => ({ user: { id: user.id, name: user.name, username: user.username, role: user.role }, perms: user.perms }));
