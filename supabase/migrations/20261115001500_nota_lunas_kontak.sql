-- Nota baru: cap LUNAS per nota, kontak usaha, jabatan penanda tangan, dan ucapan penutup.
-- Aman dijalankan ulang.

alter table public.app_settings add column if not exists signer_title     text not null default 'Manager';
alter table public.app_settings add column if not exists contact_label    text not null default 'Admin IDS';
alter table public.app_settings add column if not exists thanks_buyer     text not null default 'Terima kasih atas pembelian Anda';
alter table public.app_settings add column if not exists thanks_craftsman text not null default 'Kami tukar se''adanya barang-barang buhan pian';

alter table public.app_settings drop constraint if exists app_settings_teks_nota_check;
alter table public.app_settings add constraint app_settings_teks_nota_check check (
  char_length(signer_title) <= 60 and char_length(contact_label) <= 60
  and char_length(thanks_buyer) <= 200 and char_length(thanks_craftsman) <= 200);

-- Alamat dan WhatsApp usaha untuk semua nota (hanya diisi bila masih kosong, supaya ubahan di Pengaturan tidak tertimpa).
update public.app_settings
set business_address = 'Jl. Kertak Baru, Desa/Kel. Pekauman, Kec. Martapura Timur, Kab. Banjar, Kalimantan Selatan'
where coalesce(business_address, '') = '';
update public.app_settings
set business_whatsapp = '6282156487531'
where coalesce(business_whatsapp, '') = '';

-- Nota manual: tandai LUNAS (cap merah) atau tidak.
alter table public.manual_notes add column if not exists is_paid boolean not null default true;
