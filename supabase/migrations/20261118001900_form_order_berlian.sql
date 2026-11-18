-- =====================================================================
-- Migrasi 19: isi "FORM ORDERAN BERLIAN" per barang
--   * Order  : nama agen, team, alamat pengiriman (nama pemesan = customer_name yang sudah ada).
--   * Barang : ukuran cincin (ring size) dan target selesai.
--   * Katalog: spesifikasi model (jenis berlian, jumlah, berat berlian, bahan ring, berat total),
--              diisi sekali per model lalu ikut tampil di setiap order dengan kode itu.
-- Semua kolom baru OPSIONAL. Aman dijalankan ulang. Tidak mengubah atau menghapus data lama.
-- =====================================================================

-- ------------------------------------------------------------ kolom baru
alter table public.orders add column if not exists agent_name text;
alter table public.orders add column if not exists team_name text;
alter table public.orders add column if not exists shipping_address text;
alter table public.orders drop constraint if exists orders_form_check;
alter table public.orders add constraint orders_form_check check (
  (agent_name is null or char_length(agent_name) <= 80)
  and (team_name is null or char_length(team_name) <= 80)
  and (shipping_address is null or char_length(shipping_address) <= 300));

alter table public.order_items add column if not exists ring_size text;
alter table public.order_items add column if not exists target_date date;
alter table public.order_items drop constraint if exists order_items_form_check;
alter table public.order_items add constraint order_items_form_check check (ring_size is null or char_length(ring_size) <= 10);

alter table public.products add column if not exists diamond_type text;
alter table public.products add column if not exists diamond_count text;
alter table public.products add column if not exists diamond_carat text;
alter table public.products add column if not exists ring_material text;
alter table public.products add column if not exists total_weight text;
alter table public.products drop constraint if exists products_spek_check;
alter table public.products add constraint products_spek_check check (
  (diamond_type is null or char_length(diamond_type) <= 40)
  and (diamond_count is null or char_length(diamond_count) <= 40)
  and (diamond_carat is null or char_length(diamond_carat) <= 40)
  and (ring_material is null or char_length(ring_material) <= 40)
  and (total_weight is null or char_length(total_weight) <= 40));

-- Isian teks dirapikan: spasi di awal/akhir dibuang, isian kosong disimpan sebagai kosong (null).
create or replace function public.rapikan_form_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'orders' then
    new.agent_name       := nullif(regexp_replace(btrim(new.agent_name), '\s+', ' ', 'g'), '');
    new.team_name        := nullif(regexp_replace(btrim(new.team_name), '\s+', ' ', 'g'), '');
    new.shipping_address := nullif(btrim(new.shipping_address), '');
  elsif tg_table_name = 'order_items' then
    new.ring_size := nullif(btrim(new.ring_size), '');
  elsif tg_table_name = 'products' then
    new.diamond_type  := nullif(btrim(new.diamond_type), '');
    new.diamond_count := nullif(btrim(new.diamond_count), '');
    new.diamond_carat := nullif(btrim(new.diamond_carat), '');
    new.ring_material := nullif(btrim(new.ring_material), '');
    new.total_weight  := nullif(btrim(new.total_weight), '');
  end if;
  return new;
end $$;

drop trigger if exists orders_rapikan_form on public.orders;
create trigger orders_rapikan_form before insert or update of agent_name, team_name, shipping_address on public.orders
  for each row execute function public.rapikan_form_order();
drop trigger if exists order_items_rapikan_form on public.order_items;
create trigger order_items_rapikan_form before insert or update of ring_size on public.order_items
  for each row execute function public.rapikan_form_order();
drop trigger if exists products_rapikan_form on public.products;
create trigger products_rapikan_form before insert or update of diamond_type, diamond_count, diamond_carat, ring_material, total_weight on public.products
  for each row execute function public.rapikan_form_order();

-- ------------------------------------------------- buat order + sisipkan barang
create or replace function public.buat_order(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id  uuid;
  it    jsonb;
  n     int;
  total int := 0;
begin
  perform public.pastikan_admin();
  if coalesce(btrim(p ->> 'order_number'), '') = '' then
    raise exception 'Nomor order wajib diisi.' using errcode = '23502';
  end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Order harus berisi minimal satu barang.' using errcode = '23502';
  end if;
  if exists (select 1 from public.orders o
             where public.order_key(o.order_number) = public.order_key(p ->> 'order_number') and o.deleted_at is null) then
    raise exception 'Nomor order % sudah dipakai. Tambahkan barang ke order yang ada atau gunakan nomor lain.', btrim(p ->> 'order_number')
      using errcode = '23505', hint = 'IDS_NOMOR_DUPLIKAT';
  end if;

  begin
    insert into public.orders (order_number, customer_name, customer_whatsapp, notes, agent_name, team_name, shipping_address)
    values (p ->> 'order_number', p ->> 'customer_name', nullif(p ->> 'customer_whatsapp', ''), nullif(btrim(p ->> 'notes'), ''),
            p ->> 'agent_name', p ->> 'team_name', p ->> 'shipping_address')
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Nomor order % sudah dipakai.', btrim(p ->> 'order_number') using errcode = '23505', hint = 'IDS_NOMOR_DUPLIKAT';
  end;

  for it in select value from jsonb_array_elements(p -> 'items') loop
    n := coalesce(nullif(it ->> 'quantity', '')::int, 1);
    if n < 1 or n > 100 then
      raise exception 'Jumlah barang harus 1 sampai 100.' using errcode = '22023';
    end if;
    for k in 1 .. n loop
      perform public._sisipkan_barang(v_id, it);
      total := total + 1;
    end loop;
  end loop;
  return v_id;
end $$;

create or replace function public._sisipkan_barang(p_order uuid, it jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_status public.item_status;
begin
  v_status := coalesce(nullif(it ->> 'status', ''), 'dalam_proses')::public.item_status;
  insert into public.order_items (
    order_id, craftsman_id, category_id, gender, description, assigned_date, production_month,
    production_start_date, status, completed_at, delivered_at, notes, photo_path, weight_grams, product_id,
    ring_size, target_date)
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
    nullif(it ->> 'product_id', '')::uuid,
    it ->> 'ring_size',
    nullif(it ->> 'target_date', '')::date)
  returning id into v_id;
  return v_id;
end $$;
