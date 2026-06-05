update public.custom_cards
set image_drive_url = regexp_replace(
  image_drive_url,
  'https://drive\.usercontent\.google\.com/download\?id=([^&]+)&export=view',
  'https://drive.google.com/thumbnail?id=\1&sz=w600-h840'
)
where image_drive_url like 'https://drive.usercontent.google.com/download%';
