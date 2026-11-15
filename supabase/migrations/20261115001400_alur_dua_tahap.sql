-- Alur status disederhanakan menjadi dua tahap: Dalam proses -> Sudah diserahkan.
-- Tombol SELESAI PENGERJAAN sekarang langsung menandai barang "Sudah diserahkan".
-- Barang yang masih tertahan di status "Selesai dikerjakan" ikut dipindahkan ke "Sudah diserahkan";
-- tanggal serahnya disamakan dengan tanggal selesainya. Aman dijalankan ulang (tidak ada yang berubah lagi).

update public.order_items
set status = 'diserahkan',
    delivered_at = coalesce(completed_at, now())
where status = 'selesai'
  and deleted_at is null
  and cancelled_at is null
  -- Barang di order yang dibatalkan atau ada di Sampah dibiarkan apa adanya.
  and exists (select 1 from public.orders o
              where o.id = order_items.order_id and o.cancelled_at is null and o.deleted_at is null);
