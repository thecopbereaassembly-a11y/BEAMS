-- ============================================================================
-- BEAMS · 98 · Storage buckets
--
-- Private by default (docs/08 §5). Files are never served from a public URL —
-- downloads go through short-lived signed URLs minted server-side only after a
-- document.read permission check.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documents',
    'documents',
    false,
    52428800, -- 50 MB
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg', 'image/png', 'image/webp',
      'text/plain', 'text/csv'
    ]
  ),
  (
    'member-photos',
    'member-photos',
    false,
    5242880, -- 5 MB
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do nothing;

-- NOTE: no permissive storage RLS policies are added on purpose. All access is
-- brokered by the server using the service role AFTER an app-level permission
-- check, so a leaked anon key cannot enumerate church documents.
