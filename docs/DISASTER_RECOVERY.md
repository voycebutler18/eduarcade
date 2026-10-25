# Mendlyx Disaster Recovery Runbook

## Recovery objectives

- Database protection: Supabase Pro daily physical backups, 7-day retention.
- Application recovery manifests: generated every 6 hours by the Mendlyx worker fleet.
- Storage protection: content-addressed copies of lease documents, maintenance photos, and message attachments are mirrored into the private `mendlyx-recovery-mirror` bucket.
- Synthetic recovery drill: `disaster-recovery-v1` validates database write/restore, Storage delete/restore, API responsiveness, recovery manifest creation, and post-drill integrity without modifying customer records.

## What is protected

Critical operational Postgres tables, including properties, units, tenants, leases, charges, payments, payment transactions, documents, resident conversations, maintenance, NOVA state/exceptions, lease intelligence, vendor quotes/invoices, Money Chaser, privacy settings, privacy requests, business profiles, and minor-data authorizations.

Private Storage source buckets:

- `lease-documents`
- `maintenance-photos`
- `message-attachments`

Storage backups are immutable by content checksum. New file contents create a new mirrored version instead of overwriting the previous version.

## Normal health criteria

Mission Control should report Backup & Restore Readiness as Healthy when:

1. The latest recovery manifest is verified and less than 8 hours old.
2. The latest storage mirror completed with zero failures.
3. The latest database integrity snapshot has zero failures.
4. The synthetic disaster-recovery drill passed within the last 30 days.
5. The platform backup configuration indicates Supabase daily physical backups with 7-day retention.

## Database disaster

1. Stop consequential background automation if data integrity is uncertain.
2. Identify the desired recovery point from the last healthy recovery manifest and incident timeline.
3. Restore the Supabase project from the nearest platform backup before the incident.
4. After Supabase restore completes, restart Mendlyx services.
5. Confirm `/health` is healthy.
6. Run the Mendlyx integrity snapshot and compare critical table counts with the nearest verified recovery manifest.
7. Confirm resident email webhooks, payment webhooks, vendor automation, lease intelligence, and Money Chaser state are healthy before resuming normal operation.

## Storage object loss

1. Identify the missing source bucket and object path.
2. Look up the newest matching row in `mendlyx_storage_backup_objects`.
3. Download the content-addressed backup object from the private `mendlyx-recovery-mirror` bucket.
4. Restore it to the original source bucket/path.
5. Verify the restored bytes against the stored SHA-256 checksum before marking the incident resolved.

## Project deletion / total provider loss

Supabase removes database backups and Storage objects when an entire project is permanently deleted. Prevent project deletion through restricted organization access and MFA. For a total-project-loss scenario, a separate external/off-site copy is required in addition to the in-project mirror.

## Safety rules

- Recovery drills use only synthetic canary data.
- Never delete or mutate a real tenant, lease, payment, maintenance request, or resident message to test recovery.
- Never expose service-role keys, webhook secrets, OAuth tokens, or mirrored private files in Mission Control.
- A failed manifest or recovery drill must be treated as a degraded/attention state rather than silently ignored.
