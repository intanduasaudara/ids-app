import { z } from 'zod'

const POLA_TGL = /^\d{4}-\d{2}-\d{2}$/
const POLA_BULAN = /^\d{4}-\d{2}$/

const teksOpsional = (maks: number, label: string) =>
  z
    .string()
    .max(maks, `${label} maksimal ${maks} karakter`)
    .optional()
    .transform((v) => {
      const t = (v ?? '').trim()
      return t === '' ? null : t
    })

/** Berat minimal bawaan (gram) bila pengaturan belum termuat. */
export const BERAT_MINIMAL_BAWAAN = 6

/** Format berat untuk tampilan: 6,5 g. */
export function formatBerat(g: number | string | null | undefined): string {
  if (g === null || g === undefined || g === '') return '-'
  return `${Number(g).toLocaleString('id-ID', { maximumFractionDigits: 2 })} g`
}

/**
 * Membuat skema barang. `hariIni` = tanggal hari ini (YYYY-MM-DD) di zona waktu usaha,
 * `minBerat` = berat minimal per barang (gram) dari Pengaturan.
 */
/** Pilihan ring size: 0 sampai 33. */
export const PILIHAN_RING_SIZE = Array.from({ length: 34 }, (_, i) => String(i))

/**
 * `wajib` = order/barang BARU: semua isian harus terisi (kode cincin, ring size, mulai produksi).
 * Saat mengubah barang lama, isian ini tetap boleh kosong supaya data lama bisa disimpan.
 */
export function skemaBarang(hariIni: string, minBerat: number = BERAT_MINIMAL_BAWAAN, wajib = false) {
  const min = minBerat > 0 ? minBerat : BERAT_MINIMAL_BAWAAN
  const label = min.toLocaleString('id-ID', { maximumFractionDigits: 2 })
  return z
    .object({
      craftsman_id: z.string().min(1, 'Pilih pengrajin'),
      category_id: z.string().min(1, 'Pilih kategori'),
      gender: z.enum(['LADY', 'MAN'], { errorMap: () => ({ message: 'Pilih LADY atau MAN' }) }),
      weight_grams: z.preprocess(
        (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : Number(v.replace(',', '.'))) : v),
        z.number({ required_error: 'Isi berat barang', invalid_type_error: 'Berat harus angka, contoh 6,5' })
          .min(min, `Berat minimal ${label} gram`)
          .max(100000, 'Berat terlalu besar'),
      ),
      quantity: z.coerce.number({ invalid_type_error: 'Isi jumlah' }).int('Jumlah harus bilangan bulat').min(1, 'Minimal 1').max(100, 'Maksimal 100'),
      assigned_date: z
        .string()
        .regex(POLA_TGL, 'Isi tanggal diberikan ke pengrajin')
        .refine((v) => v <= hariIni, 'Tanggal tidak boleh di masa depan'),
      /** Kosong = otomatis dari tanggal diberikan. Isi 'YYYY-MM' bila dikoreksi manual. */
      production_month: z
        .string()
        .optional()
        .refine((v) => !v || POLA_BULAN.test(v), 'Format bulan tidak valid'),
      production_start_date: z
        .string()
        .optional()
        .refine((v) => !v || POLA_TGL.test(v), 'Format tanggal tidak valid'),
      description: teksOpsional(500, 'Deskripsi'),
      notes: teksOpsional(500, 'Catatan'),
      /** Form order: ukuran cincin dan target selesai (kosong = otomatis). */
      ring_size: teksOpsional(10, 'Ring size'),
      target_date: z
        .string()
        .optional()
        .nullable()
        .refine((v) => !v || POLA_TGL.test(v), 'Format tanggal tidak valid'),
      /** Kode cincin (model katalog). Kosong = tanpa kode. */
      product_id: z
        .string()
        .optional()
        .nullable()
        .transform((v) => (v ? v : null)),
    })
    .refine((b) => !b.production_start_date || b.production_start_date >= b.assigned_date, {
      message: 'Tidak boleh sebelum tanggal diberikan ke pengrajin',
      path: ['production_start_date'],
    })
    .refine((b) => !b.target_date || b.target_date >= b.assigned_date, {
      message: 'Target tidak boleh sebelum tanggal masuk',
      path: ['target_date'],
    })
    .refine((b) => !wajib || !!b.product_id, { message: 'Pilih kode cincin', path: ['product_id'] })
    .refine((b) => !wajib || !!b.ring_size, { message: 'Pilih ring size', path: ['ring_size'] })
    .refine((b) => !wajib || !!b.production_start_date, { message: 'Isi tanggal mulai produksi', path: ['production_start_date'] })
}

export function skemaOrder(hariIni: string, minBerat: number = BERAT_MINIMAL_BAWAAN, wajib = false) {
  return z.object({
    order_number: z.string().trim().min(1, 'Nomor order wajib diisi').max(30, 'Maksimal 30 karakter'),
    notes: teksOpsional(1000, 'Catatan'),
    customer_name: teksOpsional(80, 'Nama pemesan'),
    agent_name: teksOpsional(80, 'Nama agen'),
    team_name: teksOpsional(80, 'Team'),
    shipping_address: teksOpsional(300, 'Alamat pengiriman'),
    items: z.array(skemaBarang(hariIni, minBerat, wajib)).min(1, 'Order harus berisi minimal satu barang'),
  })
}

export type MasukanBarang = z.input<ReturnType<typeof skemaBarang>>
export type DataBarang = z.output<ReturnType<typeof skemaBarang>>
export type MasukanOrder = z.input<ReturnType<typeof skemaOrder>>
export type DataOrder = z.output<ReturnType<typeof skemaOrder>>

/** Bentuk data barang untuk fungsi database (buat_order / tambah_barang). */
export function muatanBarang(b: DataBarang): Record<string, unknown> {
  return {
    quantity: b.quantity,
    craftsman_id: b.craftsman_id,
    category_id: b.category_id,
    gender: b.gender,
    weight_grams: b.weight_grams,
    assigned_date: b.assigned_date,
    production_month: b.production_month ? `${b.production_month}-01` : null,
    production_start_date: b.production_start_date || null,
    description: b.description,
    notes: b.notes,
    product_id: b.product_id,
    ring_size: b.ring_size,
    target_date: b.target_date || null,
  }
}

export function muatanOrder(d: DataOrder): Record<string, unknown> {
  return {
    order_number: d.order_number,
    notes: d.notes,
    // Isian form order hanya dikirim bila diisi.
    ...Object.fromEntries(
      (['customer_name', 'agent_name', 'team_name', 'shipping_address'] as const)
        .filter((k) => d[k]).map((k) => [k, d[k]]),
    ),
    items: d.items.map(muatanBarang),
  }
}

export function totalBarang(items: { quantity?: unknown }[]): number {
  return items.reduce((n, b) => n + (Number(b.quantity) > 0 ? Math.floor(Number(b.quantity)) : 0), 0)
}

export function barangKosong(hariIni: string, minBerat: number = BERAT_MINIMAL_BAWAAN): MasukanBarang {
  return { craftsman_id: '', category_id: '', gender: undefined as unknown as 'LADY', weight_grams: minBerat, quantity: 1, assigned_date: hariIni, production_month: '', production_start_date: '', description: '', notes: '', product_id: '', ring_size: '', target_date: '' }
}
