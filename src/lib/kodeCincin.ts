import { useEffect, useState } from 'react'
import { db } from './supabase'
import { useMuat } from '../sync/useMuat'
import { useVersiData } from '../sync/SyncProvider'
import type { ModelCincin } from './cincin'

export * from './cincin'

/** Meminta tautan sementara untuk foto unggahan (penyimpanan privat). Foto katalog bawaan tidak perlu. */
export function useFotoUnggahan(jalur: (string | null | undefined)[]): Record<string, string> {
  const [foto, setFoto] = useState<Record<string, string>>({})
  const kunci = Array.from(new Set(jalur.filter((p): p is string => !!p))).sort().join('|')
  useEffect(() => {
    const perlu = kunci ? kunci.split('|').filter((p) => !foto[p]) : []
    if (!perlu.length) return
    let batal = false
    db().storage.from('foto-barang').createSignedUrls(perlu, 3600).then(({ data }) => {
      if (batal || !data) return
      setFoto((f) => ({ ...f, ...Object.fromEntries(data.filter((x) => x.signedUrl && x.path).map((x) => [x.path!, x.signedUrl])) }))
    })
    return () => { batal = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci])
  return foto
}

/**
 * Katalog model untuk pilihan kode cincin.
 * `siap` = database sudah punya kolom kode cincin (SQL migrasi 18 sudah dijalankan).
 * Bila belum, pilihan kode cincin disembunyikan supaya tidak ada isian yang tidak tersimpan.
 */
export function useKatalogCincin() {
  const versi = useVersiData(['products'])
  const hasil = useMuat(async () => {
    const [p, cek] = await Promise.all([
      db().from('products').select('id, code, name, class, kind, gender, photo_static, photo_path').is('deleted_at', null).order('sort_order').order('code'),
      db().from('order_items').select('product_id').limit(1),
    ])
    if (p.error) throw p.error
    return { model: (p.data ?? []) as ModelCincin[], siap: !cek.error }
  }, [versi])
  const foto = useFotoUnggahan((hasil.data?.model ?? []).map((m) => m.photo_path))
  return { model: hasil.data?.model ?? [], siap: hasil.data?.siap ?? false, memuat: hasil.memuat, foto }
}

