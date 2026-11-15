import { useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { waInternasional } from '../../lib/wa'
import { useSinkron } from '../../sync/SyncProvider'
import type { KontakNota } from './KertasNota'

/** Identitas yang sama untuk semua nota: kontak, tanda tangan, jabatan, dan ucapan penutup (diatur di Pengaturan). */
export function useIdentitasNota() {
  const { pengaturan } = useSinkron()
  const [ttd, setTtd] = useState<string | null>(null)

  // Tanda tangan disimpan privat; dibuka dengan tautan sementara.
  useEffect(() => {
    let aktif = true
    const path = pengaturan?.signature_path
    if (!path) { setTtd(null); return }
    db().storage.from('identitas').createSignedUrl(path, 3600).then(({ data }) => { if (aktif) setTtd(data?.signedUrl ?? null) })
    return () => { aktif = false }
  }, [pengaturan?.signature_path])

  const kontak: KontakNota = {
    wa: waInternasional(pengaturan?.business_whatsapp),
    label: pengaturan?.contact_label ?? 'Admin IDS',
    alamat: pengaturan?.business_address ?? null,
  }
  return {
    ttd,
    kontak,
    jabatan: pengaturan?.signer_title || 'Manager',
    tampilTtd: pengaturan?.receipt_show_signature ?? true,
    ucapanPembeli: pengaturan?.thanks_buyer || 'Terima kasih atas pembelian Anda',
    ucapanPengrajin: pengaturan?.thanks_craftsman || "Kami tukar se'adanya barang-barang buhan pian",
  }
}
