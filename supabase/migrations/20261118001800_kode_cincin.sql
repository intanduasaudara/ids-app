-- =====================================================================
-- Migrasi 18: kode cincin (model katalog) per barang order
--   * Setiap barang order boleh diberi kode model dari katalog Stok barang
--     (misalnya PR-L01, HI-M03). Kolom ini OPSIONAL: barang lama tetap sah tanpa kode.
--   * Kode, nama, dan foto model ikut tampil di v_items (untuk detail order, nota, riwayat).
--   * Stok barang TIDAK berubah karena order (order = pesanan produksi, bukan penjualan stok).
-- Aman dijalankan ulang. Tidak mengubah atau menghapus data lama.
-- =====================================================================

alter table public.order_items add column if not exists product_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_product_fk') then
    alter table public.order_items
      add constraint order_items_product_fk foreign key (product_id) references public.products (id) on delete set null;
  end if;
end $$;

create index if not exists order_items_product_ix on public.order_items (product_id) where product_id is not null;

-- Model yang dipilih harus ada dan tidak sedang di Sampah (dicek hanya saat kode diisi atau diganti).
create or replace function public.order_items_cek_produk()
returns trigger language plpgsql set search_path = '' as $$
declare v_p record;
begin
  if new.product_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.product_id is not distinct from old.product_id then
    return new;
  end if;
  select p.code, p.deleted_at into v_p from public.products p where p.id = new.product_id;
  if not found then
    raise exception 'Kode cincin tidak ditemukan di katalog.' using errcode = '23503';
  end if;
  if v_p.deleted_at is not null then
    raise exception 'Kode cincin % ada di Sampah. Pulihkan dulu atau pilih kode lain.', v_p.code using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists order_items_cek_produk on public.order_items;
create trigger order_items_cek_produk before insert or update of product_id on public.order_items
  for each row execute function public.order_items_cek_produk();

-- Sisipkan barang: sekarang juga menyimpan kode cincin (product_id) bila dikirim.
create or replace function public._sisipkan_barang(p_order uuid, it jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_status public.item_status;
begin
  v_status := coalesce(nullif(it ->> 'status', ''), 'dalam_proses')::public.item_status;
  insert into public.order_items (
    order_id, craftsman_id, category_id, gender, description, assigned_date, production_month,
    production_start_date, status, completed_at, delivered_at, notes, photo_path, weight_grams, product_id)
  values (
    p_order,
    (it ->> 'craftsman_id')::uuid,
    (it ->> 'category_id')::uuid,
    (it ->> 'gender')::public.gender_category,
    it ->> 'description',
    nullif(it ->> 'assigned_date', '')::date,
    nullif(it ->> 'production_month', '')::date,
    nullif(it ->> 'production_start_date', '')::date,
    v_status,
    case when v_status <> 'dalam_proses' then nullif(it ->> 'completed_at', '')::timestamptz end,
    case when v_status = 'diserahkan' then nullif(it ->> 'delivered_at', '')::timestamptz end,
    it ->> 'notes',
    nullif(it ->> 'photo_path', ''),
    nullif(it ->> 'weight_grams', '')::numeric,
    nullif(it ->> 'product_id', '')::uuid)
  returning id into v_id;
  return v_id;
end $$;

-- Tampilan barang: kolom lama tetap sama urutannya, kolom kode cincin ditambahkan di akhir.
create or replace view public.v_items with (security_invoker = true) as
select
  i.id, i.order_id, o.order_number, o.customer_name, o.customer_whatsapp, i.item_no,
  i.craftsman_id, c.code as craftsman_code, c.name as craftsman_name,
  i.category_id, k.name as category_name, i.gender, i.description, i.assigned_date, i.production_month,
  extract(year from i.production_month)::int as production_year,
  extract(month from i.production_month)::int as production_month_no,
  i.production_month_manual, i.production_start_date, i.status, public.label_status(i.status) as status_label,
  i.completed_at, i.delivered_at, i.notes, i.photo_path, i.cancelled_at, i.cancel_reason,
  o.cancelled_at as order_cancelled_at,
  (i.cancelled_at is null and o.cancelled_at is null and o.deleted_at is null) as is_active,
  i.created_at, i.updated_at,
  i.weight_grams,
  i.product_id,
  p.code         as product_code,
  p.name         as product_name,
  p.photo_static as product_photo_static,
  p.photo_path   as product_photo_path
from public.order_items i
join public.orders o              on o.id = i.order_id
join public.craftsmen c           on c.id = i.craftsman_id
join public.jewelry_categories k  on k.id = i.category_id
left join public.products p       on p.id = i.product_id
where o.deleted_at is null and i.deleted_at is null;

revoke all on public.v_items from anon, public;
grant select on public.v_items to authenticated;

-- Riwayat: perubahan kode cincin dicatat sebagai kode (mis. PR-L01 -> PR-L02).
create or replace function public.log_order_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d    jsonb;
  skip text[] := array['updated_at', 'created_at', 'status', 'completed_at', 'delivered_at', 'craftsman_id',
                       'cancelled_at', 'cancel_reason', 'production_month_manual', 'deleted_at', 'product_id'];
begin
  if tg_op = 'INSERT' then
    perform public.tulis_log('barang_ditambahkan', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      jsonb_build_object('barang_ke', new.item_no, 'pengrajin', public.info_pengrajin(new.craftsman_id),
        'kategori', (select k.name from public.jewelry_categories k where k.id = new.category_id),
        'gender', new.gender, 'kode_cincin', (select p.code from public.products p where p.id = new.product_id),
        'tanggal_diberikan', new.assigned_date, 'bulan_produksi', new.production_month,
        'status', new.status));
    perform public.tulis_log('pengrajin_ditugaskan', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      public.info_pengrajin(new.craftsman_id));
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('barang_dihapus', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      jsonb_build_object('barang_ke', new.item_no));
    return new;
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.tulis_log('barang_dipulihkan_sampah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      jsonb_build_object('barang_ke', new.item_no));
    return new;
  end if;
  if new.craftsman_id is distinct from old.craftsman_id then
    perform public.tulis_log('pengrajin_ditugaskan', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
      public.info_pengrajin(old.craftsman_id), public.info_pengrajin(new.craftsman_id));
  end if;
  if new.status is distinct from old.status then
    perform public.tulis_log('status_diubah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
      jsonb_build_object('status', old.status, 'tanggal_selesai', old.completed_at, 'tanggal_serah', old.delivered_at),
      jsonb_build_object('status', new.status, 'tanggal_selesai', new.completed_at, 'tanggal_serah', new.delivered_at));
  else
    if new.completed_at is distinct from old.completed_at then
      perform public.tulis_log('tanggal_selesai_diubah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
        jsonb_build_object('tanggal_selesai', old.completed_at), jsonb_build_object('tanggal_selesai', new.completed_at));
    end if;
    if new.delivered_at is distinct from old.delivered_at then
      perform public.tulis_log('tanggal_serah_diubah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
        jsonb_build_object('tanggal_serah', old.delivered_at), jsonb_build_object('tanggal_serah', new.delivered_at));
    end if;
  end if;
  if old.cancelled_at is null and new.cancelled_at is not null then
    perform public.tulis_log('barang_dibatalkan', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      jsonb_build_object('barang_ke', new.item_no, 'alasan', new.cancel_reason));
  end if;
  -- Kode cincin dicatat dengan kodenya (PR-L01), bukan nomor acak di database.
  if new.product_id is distinct from old.product_id then
    perform public.tulis_log('barang_diubah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
      jsonb_build_object('kode_cincin', (select p.code from public.products p where p.id = old.product_id)),
      jsonb_build_object('kode_cincin', (select p.code from public.products p where p.id = new.product_id)));
  end if;
  d := public.jsonb_selisih(to_jsonb(old), to_jsonb(new), skip);
  if d <> '{}'::jsonb then
    perform public.tulis_log('barang_diubah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
      (select jsonb_object_agg(k, v -> 'lama') from jsonb_each(d) as e(k, v)),
      (select jsonb_object_agg(k, v -> 'baru') from jsonb_each(d) as e(k, v)));
  end if;
  return new;
end $$;

