import type { Produk } from '../pages/stok/produk'

// KODE CINCIN: setiap barang order boleh diberi kode model dari katalog Stok barang
// (PR-L01, HI-M03, ...). Fotonya ikut tampil kecil di detail order dan di nota.
// File ini hanya berisi fungsi murni (bisa dites tanpa database).

export type ModelCincin = Pick<Produk, 'id' | 'code' | 'name' | 'class' | 'kind' | 'gender' | 'photo_static' | 'photo_path'>

/** Alamat foto model: foto unggahan sendiri (tautan sementara) diutamakan, lalu foto katalog bawaan. */
export function alamatFoto(photoStatic: string | null | undefined, photoPath: string | null | undefined, unggahan: Record<string, string>): string | null {
  if (photoPath && unggahan[photoPath]) return unggahan[photoPath]
  if (photoStatic) return `${import.meta.env.BASE_URL}${photoStatic}`
  return null
}

/**
 * Model yang cocok untuk kategori + gender yang dipilih di formulir order.
 *   PREMIUM/HIGH/LUXURY/SULTAN -> cincin kelas itu, COUPLE -> kelas Couple,
 *   LIONTIN -> semua liontin, BRACELET -> semua gelang, SPESIAL ITEM -> kelas Special/Lainnya.
 * Kategori lain (buatan sendiri) -> semua model. Gender: model tanpa gender selalu ikut.
 */
export function modelCocok(semua: ModelCincin[], kategori: string | null | undefined, gender: 'LADY' | 'MAN' | null | undefined): ModelCincin[] {
  const k = (kategori ?? '').trim().toUpperCase()
  const pas = (m: ModelCincin): boolean => {
    if (k === 'LIONTIN') return m.kind === 'Liontin'
    if (k === 'BRACELET') return m.kind === 'Gelang'
    if (k === 'COUPLE') return m.class === 'COUPLE'
    if (k.startsWith('SPESIAL') || k.startsWith('SPECIAL')) return m.class === 'SPESIAL' || m.class === 'LAINNYA'
    if (k === 'PREMIUM' || k === 'HIGH' || k === 'LUXURY' || k === 'SULTAN') return m.class === k && m.kind === 'Cincin'
    return true
  }
  return semua.filter((m) => pas(m) && (!gender || !m.gender || m.gender === gender))
}

/** Kode cincin + foto kecil dari baris v_items. */
export interface InfoCincin { kode: string | null; foto: string | null }
export function infoCincin(b: { product_code?: string | null; product_photo_static?: string | null; product_photo_path?: string | null }, unggahan: Record<string, string>): InfoCincin {
  return { kode: b.product_code ?? null, foto: b.product_code ? alamatFoto(b.product_photo_static, b.product_photo_path, unggahan) : null }
}
