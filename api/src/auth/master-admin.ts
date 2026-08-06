/*
 * Who the master administrator is.
 *
 * This one address governs four separate rules in AuthService — who may list,
 * create and delete admin accounts, and which account may never be deleted. It
 * was written out literally at all four call sites, so changing the owner of a
 * deployment meant finding every copy and getting all four right; miss the
 * fourth and the old owner's account becomes deletable.
 *
 * MASTER_ADMIN_EMAIL overrides it per deployment. The literal stays as the
 * fallback because existing installations depend on it and an unset variable
 * must not silently lock everyone out of admin management.
 */

const FALLBACK_MASTER_ADMIN = 'objectsquarerajan@gmail.com';

export function masterAdminEmail(): string {
  return (process.env.MASTER_ADMIN_EMAIL || FALLBACK_MASTER_ADMIN).trim().toLowerCase();
}

/** Email comparison is case-insensitive — addresses are not case-sensitive in practice. */
export function isMasterAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === masterAdminEmail();
}
