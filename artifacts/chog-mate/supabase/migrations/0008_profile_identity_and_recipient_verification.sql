-- Keep existing profile data while moving the app away from profile-photo URLs.
-- Age already exists from 0002_profile_identity_fields.sql.
alter table public.profiles
  add column if not exists looking_for_other text;

alter table public.users
  add column if not exists wallet_verified boolean not null default false;

-- Preserve old free-form Looking For entries in the new custom field, then
-- retain only the standard options in the array used by the new UI.
update public.profiles as profile
set looking_for_other = nullif(
  btrim(array_to_string(
    array(
      select item.value
      from unnest(coalesce(profile.looking_for, array[]::text[]))
        with ordinality as item(value, position)
      where lower(btrim(item.value)) not in
        ('dating', 'friendship', 'networking', 'collaboration', 'other')
      order by item.position
    ),
    ', '
  )),
  ''
)
where profile.looking_for_other is null;

update public.profiles as profile
set looking_for = array(
  select case lower(btrim(item.value))
    when 'dating' then 'Dating'
    when 'friendship' then 'Friendship'
    when 'networking' then 'Networking'
    when 'collaboration' then 'Collaboration'
    else 'Other'
  end
  from unnest(coalesce(profile.looking_for, array[]::text[]))
    with ordinality as item(value, position)
  where lower(btrim(item.value)) in
    ('dating', 'friendship', 'networking', 'collaboration', 'other')
  order by item.position
)
where profile.looking_for is not null;

-- The column is intentionally retained to avoid breaking existing installations
-- or rollback paths; application APIs no longer read or write it.
comment on column public.profiles.photo_url is
  'Deprecated: CHOG MATE profile pictures are the active verified Chog artwork.';
