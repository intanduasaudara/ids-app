import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { pdfNotaRiwayat } from '../lib/pdfNota'
import { pesanGalat } from '../lib/errors'
import { db } from '../lib/supabase'
import type { Barang } from '../lib/types'
import { LABEL_STATUS } from '../lib/types'
import { formatAngka, formatTanggal, formatTanggalHari, hariIni as tglHariIni, tglLokal } from '../lib/format'
import { formatBerat } from '../lib/orderSchema'
import { useAturanOvertime } from '../lib/overtime'
import { alamatFoto, infoCincin, useFotoUnggahan } from '../lib/kodeCincin'
import { useMuat } from '../sync/useMuat'
import { useSinkron, useVersiData } from '../sync/SyncProvider'
import { useNotifikasi } from '../components/ui/Notifikasi'
import { KotakGalat, Pemuat, cx } from '../components/ui/ui'
import { KertasNota } from '../components/nota/KertasNota'
import { useIdentitasNota } from '../components/nota/useIdentitasNota'
import { SelCincin } from '../components/FotoCincin'

// NOTA RIWAYAT PENGRAJIN: daftar barang yang diterima pengrajin dalam periode tertentu
// (menurut tanggal Diterima), lengkap dengan kode cincin, berat, tanggal, dan status.
// Tanpa harga dan tanpa cap LUNAS. Barang/order yang dibatalkan tidak ikut.
//   /cetak-riwayat/<id pengrajin>?dari=YYYY-MM-DD&sampai=YYYY-MM-DD&status=semua|dalam_proses|diserahkan|overtime

type Kertas = 'A4' | 'A5' | '80mm' | '58mm'
type Saring = 'semua' | 'dalam_proses' | 'diserahkan' | 'overtime'
const LABEL_SARING: Record<Saring, string> = { semua: 'Semua', dalam_proses: 'Dalam proses', diserahkan: 'Sudah diserahkan', overtime: 'Overtime' }

/** 05/11/26 */
function tglSingkat(iso: string | null | undefined): string {
  if (!iso) return '-'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '-'
}

function Baris({ label, isi }: { label: string; isi: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-[8.5em] shrink-0">{label}</span>
      <span className="font-semibold text-[#8E6C27]">: {isi}</span>
    </div>
  )
}

export default function NotaRiwayat() {
  const { id = '' } = useParams()
  const [cari, setCari] = useSearchParams()
  const { pengaturan, zona } = useSinkron()
  const versi = useVersiData(['order_items', 'orders', 'craftsmen', 'products'])
  const identitas = useIdentitasNota()
  const aturan = useAturanOvertime()
  const { beri } = useNotifikasi()
  const [kertas, setKertas] = useState<Kertas>('A4')
  const [membuatPdf, setMembuatPdf] = useState(false)
  useEffect(() => { if (pengaturan) setKertas(pengaturan.receipt_paper) }, [pengaturan])

  const hariIni = tglHariIni(zona)
  const dari = cari.get('dari') ?? `${hariIni.slice(0, 8)}01`
  const sampai = cari.get('sampai') ?? hariIni
  const saring = (cari.get('status') as Saring | null) ?? 'semua'
  const atur = (k: string, v: string) => setCari((c) => { c.set(k, v); return c }, { replace: true })

  const data = useMuat(async () => {
    const [p, b] = await Promise.all([
      db().from('craftsmen').select('id, code, name').eq('id', id).maybeSingle(),
      db().from('v_items').select('*').eq('craftsman_id', id).eq('is_active', true)
        .gte('assigned_date', dari).lte('assigned_date', sampai)
        .order('assigned_date').order('order_number').order('item_no')
        .limit(2000),
    ])
    if (p.error) throw p.error
    if (b.error) throw b.error
    return { p: p.data as { id: string; code: string; name: string | null } | null, barang: (b.data ?? []) as Barang[] }
  }, [id, dari, sampai, versi])

  const semua = useMemo(() => data.data?.barang ?? [], [data.data])
  const foto = useFotoUnggahan(semua.map((b) => b.product_photo_path))

  // Ukuran kertas untuk dialog cetak browser.
  useEffect(() => {
    const gaya = document.createElement('style')
    gaya.textContent = kertas === 'A4' ? '@page { size: A4; margin: 0; }' : kertas === 'A5' ? '@page { size: A5; margin: 0; }' : `@page { size: ${kertas} auto; margin: 3mm; }`
    document.head.appendChild(gaya)
    return () => gaya.remove()
  }, [kertas])

  if (data.memuat && !data.data) return <Pemuat />
  if (data.galat && !data.data) return <div className="p-6"><KotakGalat pesan={data.galat} ulangi={data.muatUlang} /></div>
  const p = data.data?.p
  if (!p) return <div className="p-6"><KotakGalat pesan="Pengrajin tidak ditemukan." /></div>

  const telat = (b: Barang) => aturan.lewat(b.status, b.assigned_date)
  const barang = semua.filter((b) =>
    saring === 'semua' ? true
      : saring === 'overtime' ? telat(b) > 0
        : saring === 'diserahkan' ? b.status !== 'dalam_proses'
          : b.status === 'dalam_proses')
  const proses = barang.filter((b) => b.status === 'dalam_proses').length
  const serah = barang.length - proses
  const overtime = barang.filter((b) => telat(b) > 0).length
  const perak = barang.reduce((t, b) => t + (Number(b.weight_grams) || 0), 0)
  const ringkasan = [
    `${formatAngka(barang.length)} barang`,
    `Dalam proses ${formatAngka(proses)}`,
    `Sudah diserahkan ${formatAngka(serah)}`,
    overtime ? `Overtime ${formatAngka(overtime)}` : null,
    `Perak ${formatBerat(perak)}`,
  ].filter(Boolean).join(' · ')
  const periode = `${formatTanggal(dari)} – ${formatTanggal(sampai)}`
  const tglAkhir = (b: Barang) => {
    const w = b.delivered_at ?? b.completed_at
    return w ? tglSingkat(tglLokal(w, zona)) : '-'
  }
  const labelStatus = (b: Barang) => (telat(b) > 0 ? `OVERTIME ${telat(b)} hr` : LABEL_STATUS[b.status])
  const sempit = kertas === '80mm' || kertas === '58mm'
  const lebar = kertas === 'A4' ? 'max-w-[210mm]' : kertas === 'A5' ? 'max-w-[148mm]' : kertas === '80mm' ? 'max-w-[80mm]' : 'max-w-[58mm]'
  const kembar = new Map<string, number>()
  barang.forEach((b) => kembar.set(b.order_number, (kembar.get(b.order_number) ?? 0) + 1))
  const kodeOr = (b: Barang) => ((kembar.get(b.order_number) ?? 0) > 1 ? `${b.order_number}-${b.item_no}` : b.order_number)

  const simpanPdfNota = async () => {
    setMembuatPdf(true)
    try {
      await pdfNotaRiwayat({
        kode: p.code,
        nama: p.name,
        periode,
        ringkasan,
        baris: barang.map((b) => ({
          kodeOr: kodeOr(b),
          kodeCincin: b.product_code ?? null,
          fotoCincin: b.product_code ? alamatFoto(b.product_photo_static, b.product_photo_path, foto) : null,
          kategori: `${b.category_name} ${b.gender}`,
          berat: b.weight_grams != null ? formatBerat(b.weight_grams) : '-',
          diterima: tglSingkat(b.assigned_date),
          selesai: tglAkhir(b),
          status: labelStatus(b),
          overtime: telat(b) > 0,
        })),
      }, kertas, formatTanggalHari(hariIni), `Nota-Riwayat-${p.code.replace(/\s+/g, '')}-${dari}-sd-${sampai}.pdf`, {
        lunas: false, ucapan: identitas.ucapanPengrajin, jabatan: identitas.jabatan, kontak: identitas.kontak,
        tandaTanganUrl: identitas.tampilTtd ? identitas.ttd : null, tampilTtd: identitas.tampilTtd,
      })
    } catch (e) {
      beri(pesanGalat(e), 'galat')
    } finally {
      setMembuatPdf(false)
    }
  }

  return (
    <div className="min-h-dvh bg-ice-100 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-ice-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] print:hidden">
        <Link to={`/pengrajin/${p.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select aria-label="Ukuran kertas" value={kertas} onChange={(e) => setKertas(e.target.value as Kertas)} className="h-10 rounded-xl border border-ice-300 bg-white px-3 text-sm">
            <option value="A4">A4</option><option value="A5">A5</option><option value="80mm">Thermal 80 mm</option><option value="58mm">Thermal 58 mm</option>
          </select>
          <button type="button" disabled={membuatPdf} onClick={() => void simpanPdfNota()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gold-300 bg-white px-4 text-sm font-semibold text-navy-900 hover:bg-gold-50 disabled:opacity-60">
            <Download className="h-4 w-4" /> {membuatPdf ? 'Membuat PDF…' : 'Simpan PDF'}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" /> Cetak
          </button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-soft">Diterima dari</span>
          <input type="date" value={dari} max={sampai} onChange={(e) => e.target.value && atur('dari', e.target.value)} className="h-9 rounded-lg border border-ice-300 px-2" />
          <span className="text-ink-soft">sampai</span>
          <input type="date" value={sampai} min={dari} onChange={(e) => e.target.value && atur('sampai', e.target.value)} className="h-9 rounded-lg border border-ice-300 px-2" />
        </div>
        <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="Saring status">
          {(Object.keys(LABEL_SARING) as Saring[]).map((s) => (
            <button key={s} type="button" aria-pressed={saring === s} onClick={() => atur('status', s)}
              className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                s === 'overtime'
                  ? (saring === s ? 'border-[#c62828] bg-[#c62828] text-white' : 'border-[#c62828]/50 bg-white text-[#c62828]')
                  : saring === s ? 'border-navy-900 bg-navy-900 text-white' : 'border-ice-300 bg-white text-ink-soft')}>
              {LABEL_SARING[s]}
            </button>
          ))}
        </div>
        <p className="w-full text-xs text-ink-muted">
          Berisi barang yang diterima pengrajin dalam periode ini (barang yang dibatalkan tidak ikut). Simpan PDF membuat berkas nota langsung; Cetak membuka pilihan printer.
        </p>
      </div>

      <div className={cx('mx-auto my-4 px-3 sm:my-6 print:my-0 print:max-w-none print:px-0', lebar)}>
        <section className={cx('overflow-hidden rounded-xl shadow-card print:overflow-visible print:rounded-none print:shadow-none', sempit && 'bg-white')}>
          <KertasNota
            kertas={kertas}
            judul="NOTA RIWAYAT"
            nomor={<>Diterbitkan: {formatTanggalHari(hariIni)}</>}
            lunas={false}
            ucapan={identitas.ucapanPengrajin}
            jabatan={identitas.jabatan}
            tampilTtd={identitas.tampilTtd}
            kontak={identitas.kontak}
            ttd={identitas.ttd ? <img src={identitas.ttd} alt="Tanda tangan" className="max-h-full max-w-full object-contain" /> : null}
            penerima={
              <div>
                {!sempit && <p className="mb-1.5 font-display text-[1.6em] font-bold leading-tight text-[#2a2318]">Riwayat pengrajin:</p>}
                <div className="space-y-0.5">
                  <Baris label="Nama pengrajin" isi={p.name ?? '(nama belum diisi)'} />
                  <Baris label="ID pengrajin" isi={p.code} />
                  {sempit && <Baris label="Periode" isi={periode} />}
                </div>
              </div>
            }
            tanggal={sempit ? null : (
              <span className="grid grid-cols-[auto_auto_1fr] gap-x-1.5 gap-y-0.5">
                <span>Periode</span><span>:</span><span className="font-semibold">{formatTanggal(dari)}</span>
                <span>s/d</span><span>:</span><span className="font-semibold">{formatTanggal(sampai)}</span>
              </span>
            )}
          >
            {sempit ? (
              <table className="tabel-nota">
                <colgroup><col className="w-[9%]" /><col className="w-[22%]" /><col /><col className="w-[30%]" /></colgroup>
                <thead><tr><th>No</th><th>Kode OR</th><th>Barang</th><th>Status</th></tr></thead>
                <tbody>
                  {barang.map((b, i) => (
                    <tr key={b.id} className="break-inside-avoid">
                      <td>{i + 1}</td>
                      <td className="font-semibold">{kodeOr(b)}</td>
                      <td>{b.category_name} {b.gender}{b.product_code && <span className="block font-bold">{b.product_code}</span>}{b.weight_grams != null && <span className="block">{formatBerat(b.weight_grams)}</span>}</td>
                      <td className={cx(telat(b) > 0 && 'font-bold text-[#c62828]')}>{labelStatus(b)}<span className="block font-normal text-[#1f1a12]">{tglAkhir(b) !== '-' ? tglAkhir(b) : tglSingkat(b.assigned_date)}</span></td>
                    </tr>
                  ))}
                  {barang.length === 0 && <tr><td colSpan={4} className="py-4 text-center italic">Tidak ada barang.</td></tr>}
                </tbody>
                <tfoot><tr className="total-nota"><td colSpan={4} className="!text-center !whitespace-normal">{ringkasan}</td></tr></tfoot>
              </table>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="tabel-nota min-w-[34rem] text-[0.88em] print:min-w-0">
                  <colgroup>
                    <col className="w-[6%]" /><col className="w-[11%]" /><col className="w-[12%]" /><col /><col className="w-[9%]" /><col className="w-[11%]" /><col className="w-[13%]" /><col className="w-[14%]" />
                  </colgroup>
                  <thead>
                    <tr><th>No</th><th>Kode OR</th><th>Kode Cincin</th><th>Kategori + Gender</th><th>Berat</th><th>Diterima</th><th>Selesai / Diserahkan</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {barang.map((b, i) => (
                      <tr key={b.id} className="break-inside-avoid">
                        <td>{i + 1}</td>
                        <td className="font-semibold">{kodeOr(b)}</td>
                        <td><SelCincin kode={b.product_code} src={infoCincin(b, foto).foto} /></td>
                        <td>{b.category_name} {b.gender}</td>
                        <td className="tabular-nums">{b.weight_grams != null ? formatBerat(b.weight_grams) : '-'}</td>
                        <td className={cx('tabular-nums', telat(b) > 0 && 'font-bold text-[#c62828]')}>{tglSingkat(b.assigned_date)}</td>
                        <td className="tabular-nums">{tglAkhir(b)}</td>
                        <td className={cx('font-semibold', telat(b) > 0 && 'text-[#c62828]')}>{labelStatus(b)}</td>
                      </tr>
                    ))}
                    {barang.length === 0 && <tr><td colSpan={8} className="py-4 text-center italic">Tidak ada barang dalam periode ini.</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr className="total-nota"><td colSpan={8} className="!text-center !whitespace-normal">{ringkasan}</td></tr>
                  </tfoot>
                </table>
              </div>
            )}
          </KertasNota>
        </section>
      </div>
    </div>
  )
}
