// POST /api/auth/logout — the cookie goes; nothing else to undo
import { logout } from '../../_lib/auth.js';
export async function onRequestPost() { return logout(); }
