/**
 * Versioned, application-owned defaults.
 *
 * When an administrator changes a default fee schedule or another default
 * that should be offered to existing users, increment this version in the
 * same change. User values are never overwritten automatically: older
 * profiles with values that differ from current defaults get a choice to
 * adopt the defaults or keep their current settings.
 */
export const APP_DEFAULTS_VERSION = 1;
