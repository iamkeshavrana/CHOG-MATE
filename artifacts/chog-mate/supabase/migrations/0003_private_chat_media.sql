alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_content_type text,
  add column if not exists attachment_size integer;

alter table public.messages
  drop constraint if exists messages_message_type_check,
  add constraint messages_message_type_check
    check (message_type in ('text', 'voice', 'image', 'file')),
  drop constraint if exists messages_attachment_payload_check,
  add constraint messages_attachment_payload_check check (
    (
      message_type = 'text'
      and attachment_path is null
      and attachment_name is null
      and attachment_content_type is null
      and attachment_size is null
    )
    or (
      message_type in ('voice', 'image', 'file')
      and attachment_path is not null
      and attachment_name is not null
      and attachment_content_type is not null
      and attachment_size between 1 and 15728640
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chog-mate-chat',
  'chog-mate-chat',
  false,
  15728640,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/mp3',
    'video/webm',
    'application/pdf',
    'text/plain',
    'application/zip',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
