-- OVERTIME: batas hari sejak barang diterima pengrajin. Barang yang masih dalam proses dan lewat
-- dari batas ini ditandai merah di aplikasi (hari ke-10 masih tepat waktu, mulai hari ke-11 overtime).
-- Aman dijalankan ulang.
alter table public.app_settings add column if not exists overtime_days integer not null default 10;
alter table public.app_settings drop constraint if exists app_settings_overtime_days_check;
alter table public.app_settings add constraint app_settings_overtime_days_check check (overtime_days between 1 and 90);
