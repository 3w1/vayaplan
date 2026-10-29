-- Rollback Migración 021: Eliminar tabla de autorizaciones del importador alternativo de Instagram
DROP TABLE IF EXISTS instagram_fallback_authorizations;
