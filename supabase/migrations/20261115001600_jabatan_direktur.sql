-- Jabatan di bawah tanda tangan nota: Direktur (sebelumnya Manager). Aman dijalankan ulang.
alter table public.app_settings alter column signer_title set default 'Direktur';
update public.app_settings set signer_title = 'Direktur' where signer_title = 'Manager';
