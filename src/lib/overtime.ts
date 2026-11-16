import { db } from './supabase'
import { hariIni } from './format'
import { useMuat } from '../sync/useMuat'
import { useSinkron, useVersiData } from '../sync/SyncProvider'

// OVERTIME: barang yang masih Dalam Proses dan sudah LEWAT batas hari sejak tanggal Diterima pengrajin.
// Batas bawaan 10 hari (diatur di Pengaturan). Hari ke-10 masih tepat waktu; mulai hari ke-11 overtime.

export const BATAS_OVERTIME_BAWAAN = 10

const geserTanggal = (iso: string, hari: number): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + hari)).toISOString().slice(0, 10)
}

const selisihHari = (dari: string, sampai: string): number => {
  const a = Date.UTC(+dari.slice(0, 4), +dari.slice(5, 7) - 1, +dari.slice(8, 10))
  const b = Date.UTC(+sampai.slice(0, 4), +sampai.slice(5, 7) - 1, +sampai.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** Aturan overtime yang berlaku sekarang. `batas` = tanggal Diterima paling akhir yang sudah terhitung overtime. */
export function useAturanOvertime() {
  const { zona, pengaturan } = useSinkron()
  const hariBatas = pengaturan?.overtime_days ?? BATAS_OVERTIME_BAWAAN
  const hari = hariIni(zona)
  const batas = geserTanggal(hari, -hariBatas - 1)
  return {
    hariBatas,
    batas,
    /** Berapa hari sudah lewat dari batas (0 bila tidak overtime). */
    lewat: (status: string, diterima: string | null | undefined): number => {
      if (status !== 'dalam_proses' || !diterima) return 0
      return Math.max(0, selisihHari(diterima.slice(0, 10), hari) - hariBatas)
    },
  }
}

/** Jumlah barang overtime per pengrajin (Map id → jumlah) dan totalnya. */
export function useOvertimePerPengrajin() {
  const { batas } = useAturanOvertime()
  const versi = useVersiData(['order_items', 'orders', 'app_settings'])
  return useMuat(async () => {
    const { data, error } = await db()
      .from('v_items')
      .select('craftsman_id')
      .eq('status', 'dalam_proses')
      .eq('is_active', true)
      .lte('assigned_date', batas)
      .limit(5000)
    if (error) throw error
    const peta = new Map<string, number>()
    for (const r of (data ?? []) as { craftsman_id: string }[]) peta.set(r.craftsman_id, (peta.get(r.craftsman_id) ?? 0) + 1)
    return { peta, total: (data ?? []).length }
  }, [batas, versi])
}
