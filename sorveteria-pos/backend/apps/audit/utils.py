from apps.audit.models import AuditLog


def log_audit(*, user, action: str, entity: str, entity_id: str, before=None, after=None) -> None:
    audit_user = user if user is not None and getattr(user, 'is_authenticated', False) else None
    AuditLog.objects.create(
        user=audit_user,
        action=action,
        entity=entity,
        entity_id=str(entity_id),
        before=before,
        after=after,
    )
