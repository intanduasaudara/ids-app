import { db } from './supabase'
import { useMuat } from '../sync/useMuat'

// FORM ORDERAN BERLIAN: isian tambahan per order (agen, team, alamat), per barang (ring size, target),
// dan spesifikasi per model katalog. Kolomnya ada setelah SQL migrasi 19 dijalankan di Supabase.

export interface DataFormOrder {
  customer_name: string | null
  agent_name: string | null
  team_name: string | null
  shipping_address: string | null
}

export interface SpekModel {
  diamond_type: string | null
  diamond_count: string | null
  diamond_carat: string | null
  ring_material: string | null
  total_weight: string | null
}

export const LABEL_SPEK: [keyof SpekModel, string][] = [
  ['diamond_type', 'Jenis Berlian'],
  ['diamond_count', 'Jumlah Berlian'],
  ['diamond_carat', 'Berat Berlian'],
  ['ring_material', 'Bahan Ring'],
  ['total_weight', 'Berat Total'],
]

let cekSiap: Promise<boolean> | null = null
/** Apakah database sudah punya kolom form order (SQL migrasi 19)? Dicek sekali per pembukaan aplikasi. */
export function formOrderSiap(): Promise<boolean> {
  if (!cekSiap) {
    cekSiap = Promise.resolve(db().from('order_items').select('ring_size, target_date').limit(1))
      .then(({ error }) => !error)
      .catch(() => false)
    // Bila belum siap, cek ulang lain kali (mungkin SQL baru saja dijalankan).
    void cekSiap.then((ok) => { if (!ok) cekSiap = null })
  }
  return cekSiap
}

export function useFormOrderSiap(): boolean {
  return useMuat(formOrderSiap, []).data ?? false
}

/** Tanggal + n hari (YYYY-MM-DD). */
export function tambahHari(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Target selesai: yang diisi manual, atau otomatis = tanggal masuk + batas hari (bawaan batas overtime). */
export function targetSelesai(target: string | null | undefined, diterima: string, hariBatas: number): { tanggal: string; otomatis: boolean } {
  return target ? { tanggal: target, otomatis: false } : { tanggal: tambahHari(diterima, hariBatas), otomatis: true }
}

/** "HIGH LADY 03" dari nama model "High Lady 03"; bila tanpa model: kategori + gender. */
export function namaTipe(productName: string | null | undefined, kategori: string, gender: string): string {
  return (productName ?? `${kategori} ${gender}`).toUpperCase()
}

/** Ambil isian form untuk satu order: data order, isian per barang, dan spesifikasi model yang dipakai. */
export async function muatFormOrder(orderId: string, productIds: (string | null | undefined)[]) {
  if (!(await formOrderSiap())) return null
  const ids = Array.from(new Set(productIds.filter((x): x is string => !!x)))
  const [o, b, p] = await Promise.all([
    db().from('orders').select('customer_name, agent_name, team_name, shipping_address').eq('id', orderId).maybeSingle(),
    db().from('order_items').select('id, ring_size, target_date').eq('order_id', orderId),
    ids.length
      ? db().from('products').select('id, diamond_type, diamond_count, diamond_carat, ring_material, total_weight').in('id', ids)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (o.error || b.error || p.error) return null
  return {
    order: (o.data ?? null) as DataFormOrder | null,
    barang: new Map(((b.data ?? []) as { id: string; ring_size: string | null; target_date: string | null }[]).map((x) => [x.id, x])),
    spek: new Map(((p.data ?? []) as (SpekModel & { id: string })[]).map((x) => [x.id, x])),
  }
}
export type FormOrder = NonNullable<Awaited<ReturnType<typeof muatFormOrder>>>
