import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Eye, Printer, X } from 'lucide-react'
import { pdfNotaPembayaran } from '../lib/pdfNota'
import { pesanGalat } from '../lib/errors'
import { useNotifikasi } from '../components/ui/Notifikasi'
import { db } from '../lib/supabase'
import type { Barang } from '../lib/types'
import { akhirBulan, bacaRupiah, formatRupiah, formatTanggalHari, hariIni as tglHariIni, ketikRupiah, lokalKeIso } from '../lib/format'
import { useMuat } from '../sync/useMuat'
import { useSinkron } from '../sync/SyncProvider'
import { KotakGalat, Pemuat, cx } from '../components/ui/ui'
import { KertasNota, TanggalNota } from '../components/nota/KertasNota'
import { useIdentitasNota } from '../components/nota/useIdentitasNota'
import { kelompokPengrajin } from '../lib/nota'
import { SelCincin } from '../components/FotoCincin'
import { alamatFoto, infoCincin, useFotoUnggahan } from '../lib/kodeCincin'

// NOTA PEMBAYARAN pengrajin.
//   /cetak/pengrajin/<id order>                 semua pengrajin di satu order (satu halaman per pengrajin)
//   /cetak/pembayaran/<id pengrajin>?dari&sampai barang pengrajin yang selesai dalam periode itu
// Harga satuan kosong dan diketik langsung di nota; ketikan disimpan di perangkat ini per barang.

type Kertas = 'A4' | 'A5' | '80mm' | '58mm'
const KUNCI_HARGA = 'ids-harga-nota'

function bacaHarga(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KUNCI_HARGA) ?? '{}') as Record<string, number> } catch { return {} }
}
function simpanHarga(peta: Record<string, number>): void {
  try { localStorage.setItem(KUNCI_HARGA, JSON.stringify(peta)) } catch { /* abaikan */ }
}

const KUNCI_LUNAS = 'ids-nota-lunas'
function bacaLunas(): boolean {
  try { return localStorage.getItem(KUNCI_LUNAS) !== '0' } catch { return true }
}

function Baris({ label, isi }: { label: string; isi: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-[8.5em] shrink-0">{label}</span>
      <span className="font-semibold text-[#8E6C27]">: {isi}</span>
    </div>
  )
}

interface Kelompok { id: string; kode: string; nama: string | null; barang: Barang[] }

interface KeadaanHalaman { tglBayar: string; sembunyi: Set<string> }

function HalamanNota({ g, kertas, zona, harga, ubahHarga, lapor, lunas }: {
  g: Kelompok
  kertas: Kertas
  zona: string
  harga: Record<string, number>
  ubahHarga: (id: string, n: number | null) => void
  lapor: (id: string, k: KeadaanHalaman) => void
  lunas: boolean
}) {
  const identitas = useIdentitasNota()
  const [tglBayar, setTglBayar] = useState(() => tglHariIni(zona))
  const [sembunyi, setSembunyi] = useState<Set<string>>(new Set())
  useEffect(() => { lapor(g.id, { tglBayar, sembunyi }) }, [g.id, tglBayar, sembunyi, lapor])
  const barang = g.barang.filter((b) => !sembunyi.has(b.id))
  const total = barang.reduce((t, b) => t + (harga[b.id] ?? 0), 0)
  // Kode OR: nomor order; bila satu order punya beberapa barang pengrajin ini, ditambah nomor barangnya.
  const kembar = new Map<string, number>()
  g.barang.forEach((b) => kembar.set(b.order_number, (kembar.get(b.order_number) ?? 0) + 1))
  const sempit = kertas === '80mm' || kertas === '58mm'
  // Thermal 58 mm terlalu sempit untuk kolom foto: kode cincin digabung ke kolom kategori.
  const sangatSempit = kertas === '58mm'
  const foto = useFotoUnggahan(g.barang.map((b) => b.product_photo_path))

  return (
    <KertasNota
      kertas={kertas}
      judul="NOTA PEMBAYARAN"
      nomor={<>Diterbitkan: {formatTanggalHari(tglHariIni(zona))}</>}
      lunas={lunas}
      ucapan={identitas.ucapanPengrajin}
      jabatan={identitas.jabatan}
      tampilTtd={identitas.tampilTtd}
      kontak={identitas.kontak}
      ttd={identitas.ttd ? <img src={identitas.ttd} alt="Tanda tangan" className="max-h-full max-w-full object-contain" /> : null}
      penerima={
        <div>
          {!sempit && <p className="mb-1.5 font-display text-[1.6em] font-bold leading-tight text-[#2a2318]">Dibayarkan kepada:</p>}
          <div className="space-y-0.5">
            <Baris label="Nama pengrajin" isi={g.nama ?? '(nama belum diisi)'} />
            <Baris label="ID pengrajin" isi={g.kode} />
          </div>
        </div>
      }
      tanggal={<TanggalNota iso={tglBayar} teks={formatTanggalHari(tglBayar)} ubah={setTglBayar} label="Ubah tanggal pembayaran" />}
    >
      <table className="tabel-nota">
        <colgroup>
          <col className={sempit ? 'w-[9%]' : 'w-[8%]'} /><col className={sangatSempit ? 'w-[18%]' : 'w-[15%]'} />{!sangatSempit && <col className={sempit ? 'w-[19%]' : 'w-[17%]'} />}<col /><col className={sempit ? 'w-[27%]' : 'w-[25%]'} /><col className="w-[6%] print:hidden" />
        </colgroup>
        <thead>
          <tr>
            <th className="text-center">No</th>
            <th className="text-left">Kode OR</th>
            {!sangatSempit && <th>Kode Cincin</th>}
            <th className="text-left">Kategori + Gender</th>
            <th className="text-right">Harga Satuan</th>
            <th className="print:hidden" aria-label="Sembunyikan" />
          </tr>
        </thead>
        <tbody>
          {barang.map((b, i) => (
            <tr key={b.id} className="break-inside-avoid">
              <td className="text-center">{i + 1}</td>
              <td className="font-semibold">{b.order_number}{(kembar.get(b.order_number) ?? 0) > 1 && <span className="font-normal">-{b.item_no}</span>}</td>
              {!sangatSempit && <td><SelCincin kode={b.product_code} src={infoCincin(b, foto).foto} kecil={sempit} /></td>}
              <td>{b.category_name} {b.gender}{sangatSempit && b.product_code && <span className="block text-[0.85em] font-bold">{b.product_code}</span>}</td>
              <td className="text-right">
                <input
                  inputMode="numeric"
                  aria-label={`Harga satuan barang ${i + 1}`}
                  placeholder="ketik harga"
                  value={harga[b.id] != null ? ketikRupiah(String(harga[b.id])) : ''}
                  onChange={(e) => ubahHarga(b.id, bacaRupiah(e.target.value.replace(/\./g, '')))}
                  className="isian-nota w-full rounded border border-dashed border-[#c9b27e] bg-[#fffaf0] px-1 py-0.5 text-right tabular-nums placeholder:text-[#a8956a]"
                />
              </td>
              <td className="text-center print:hidden">
                <button type="button" title="Sembunyikan dari nota" onClick={() => setSembunyi((s) => new Set(s).add(b.id))}
                  className="rounded p-0.5 text-ink-muted hover:bg-bad-50 hover:text-bad-700"><X className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          ))}
          {barang.length === 0 && (
            <tr><td colSpan={sangatSempit ? 4 : 5} className="py-4 text-center italic">Tidak ada barang.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="total-nota">
            <td colSpan={sangatSempit ? 3 : 4} className="text-right">TOTAL</td>
            <td className="text-right tabular-nums">{formatRupiah(total)}</td>
            <td className="print:hidden" />
          </tr>
        </tfoot>
      </table>
      {sembunyi.size > 0 && (
        <button type="button" onClick={() => setSembunyi(new Set())} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#8E6C27] print:hidden">
          <Eye className="h-3.5 w-3.5" /> Tampilkan lagi {sembunyi.size} barang yang disembunyikan
        </button>
      )}
    </KertasNota>
  )
}

export default function Nota() {
  const { jenis = 'pengrajin', id = '' } = useParams()
  const [cari, setCari] = useSearchParams()
  const { pengaturan, zona } = useSinkron()
  const [kertas, setKertas] = useState<Kertas>('A4')
  const [harga, setHarga] = useState<Record<string, number>>(bacaHarga)
  const keadaan = useRef(new Map<string, KeadaanHalaman>())
  const [lapor] = useState(() => (idHal: string, k: KeadaanHalaman) => { keadaan.current.set(idHal, k) })
  const [membuatPdf, setMembuatPdf] = useState(false)
  const [lunas, setLunasState] = useState(bacaLunas)
  const setLunas = (v: boolean) => { setLunasState(v); try { localStorage.setItem(KUNCI_LUNAS, v ? '1' : '0') } catch { /* abaikan */ } }
  const identitas = useIdentitasNota()
  const { beri } = useNotifikasi()
  const periode = jenis === 'pembayaran'
  const awalBulan = `${tglHariIni(zona).slice(0, 8)}01`
  const dari = cari.get('dari') ?? awalBulan
  const sampai = cari.get('sampai') ?? akhirBulan(awalBulan)

  useEffect(() => { if (pengaturan) setKertas(pengaturan.receipt_paper) }, [pengaturan])

  const ubahHarga = (idBarang: string, n: number | null) => {
    setHarga((h) => {
      const baru = { ...h }
      if (n == null) delete baru[idBarang]; else baru[idBarang] = n
      simpanHarga(baru)
      return baru
    })
  }

  const data = useMuat(async () => {
    if (periode) {
      const [p, b] = await Promise.all([
        db().from('craftsmen').select('id, code, name').eq('id', id).maybeSingle(),
        db().from('v_items').select('*').eq('craftsman_id', id).eq('is_active', true).in('status', ['selesai', 'diserahkan'])
          .gte('completed_at', lokalKeIso(`${dari}T00:00`, zona) ?? dari)
          .lte('completed_at', lokalKeIso(`${sampai}T23:59`, zona) ?? sampai)
          .order('completed_at'),
      ])
      if (p.error) throw p.error
      if (b.error) throw b.error
      if (!p.data) return { kelompok: [] as Kelompok[], kembali: '/pengrajin' }
      return {
        kelompok: [{ id: p.data.id as string, kode: p.data.code as string, nama: (p.data.name as string | null) ?? null, barang: (b.data ?? []) as Barang[] }],
        kembali: `/pengrajin/${id}`,
      }
    }
    const b = await db().from('v_items').select('*').eq('order_id', id).eq('is_active', true).order('item_no')
    if (b.error) throw b.error
    const semua = (b.data ?? []) as Barang[]
    const pengrajin = cari.get('pengrajin')
    return { kelompok: kelompokPengrajin(semua).filter((g) => !pengrajin || g.id === pengrajin), kembali: `/order/${id}` }
  }, [id, periode, dari, sampai, zona])

  // Ukuran kertas untuk dialog cetak browser.
  useEffect(() => {
    const gaya = document.createElement('style')
    gaya.textContent = kertas === 'A4' ? '@page { size: A4; margin: 0; }' : kertas === 'A5' ? '@page { size: A5; margin: 0; }' : `@page { size: ${kertas} auto; margin: 3mm; }`
    document.head.appendChild(gaya)
    return () => gaya.remove()
  }, [kertas])

  const kelompok = useMemo(() => data.data?.kelompok ?? [], [data.data])
  // Tautan sementara foto unggahan untuk PDF (foto katalog bawaan tidak perlu).
  const fotoSemua = useFotoUnggahan(kelompok.flatMap((g) => g.barang.map((b) => b.product_photo_path)))

  if (jenis === 'serah') return <Navigate to={`/order/${id}`} replace />
  if (data.memuat && !data.data) return <Pemuat />
  if (data.galat) return <div className="p-6"><KotakGalat pesan={data.galat} ulangi={data.muatUlang} /></div>
  if (!kelompok.length && !periode) return <div className="p-6"><KotakGalat pesan="Order tidak ditemukan atau belum punya barang aktif." /></div>
  if (!kelompok.length) return <div className="p-6"><KotakGalat pesan="Pengrajin tidak ditemukan." /></div>

  const simpanPdfNota = async () => {
    setMembuatPdf(true)
    try {
      const halaman = kelompok.map((g) => {
        const k = keadaan.current.get(g.id)
        const kembar = new Map<string, number>()
        g.barang.forEach((b) => kembar.set(b.order_number, (kembar.get(b.order_number) ?? 0) + 1))
        return {
          kode: g.kode,
          nama: g.nama,
          tanggalBayar: formatTanggalHari(k?.tglBayar ?? tglHariIni(zona)),
          baris: g.barang.filter((b) => !k?.sembunyi.has(b.id)).map((b) => ({
            kodeOr: (kembar.get(b.order_number) ?? 0) > 1 ? `${b.order_number}-${b.item_no}` : b.order_number,
            kategori: `${b.category_name} ${b.gender}`,
            kodeCincin: b.product_code ?? null,
            fotoCincin: b.product_code ? alamatFoto(b.product_photo_static, b.product_photo_path, fotoSemua) : null,
            harga: harga[b.id] ?? null,
          })),
        }
      })
      const nama = kelompok.length === 1 ? `Nota-Pembayaran-${kelompok[0].kode.replace(/\s+/g, '')}` : 'Nota-Pembayaran'
      await pdfNotaPembayaran(halaman, kertas, formatTanggalHari(tglHariIni(zona)), `${nama}-${tglHariIni(zona)}.pdf`, {
        lunas, ucapan: identitas.ucapanPengrajin, jabatan: identitas.jabatan, kontak: identitas.kontak,
        tandaTanganUrl: identitas.tampilTtd ? identitas.ttd : null, tampilTtd: identitas.tampilTtd,
      })
    } catch (e) {
      beri(pesanGalat(e), 'galat')
    } finally {
      setMembuatPdf(false)
    }
  }

  const sempit = kertas === '80mm' || kertas === '58mm'
  const lebar = kertas === 'A4' ? 'max-w-[210mm]' : kertas === 'A5' ? 'max-w-[148mm]' : kertas === '80mm' ? 'max-w-[80mm]' : 'max-w-[58mm]'

  return (
    <div className="min-h-dvh bg-ice-100 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-ice-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] print:hidden">
        <Link to={data.data?.kembali ?? '/beranda'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select aria-label="Ukuran kertas" value={kertas} onChange={(e) => setKertas(e.target.value as Kertas)} className="h-10 rounded-xl border border-ice-300 bg-white px-3 text-sm">
            <option value="A4">A4</option><option value="A5">A5</option><option value="80mm">Thermal 80 mm</option><option value="58mm">Thermal 58 mm</option>
          </select>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-ice-300 bg-white px-3 text-sm font-semibold text-navy-900">
            <input type="checkbox" className="h-4 w-4 accent-[#c62828]" checked={lunas} onChange={(e) => setLunas(e.target.checked)} />
            <span className="text-[#c62828]">LUNAS</span>
          </label>
          <button type="button" disabled={membuatPdf} onClick={() => void simpanPdfNota()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gold-300 bg-white px-4 text-sm font-semibold text-navy-900 hover:bg-gold-50 disabled:opacity-60">
            <Download className="h-4 w-4" /> {membuatPdf ? 'Membuat PDF…' : 'Simpan PDF'}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" /> Cetak
          </button>
        </div>
        {periode && (
          <div className="flex w-full flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-soft">Barang selesai dari</span>
            <input type="date" value={dari} onChange={(e) => e.target.value && setCari((c) => { c.set('dari', e.target.value); return c }, { replace: true })}
              className="h-9 rounded-lg border border-ice-300 px-2" />
            <span className="text-ink-soft">sampai</span>
            <input type="date" value={sampai} onChange={(e) => e.target.value && setCari((c) => { c.set('sampai', e.target.value); return c }, { replace: true })}
              className="h-9 rounded-lg border border-ice-300 px-2" />
          </div>
        )}
        <p className="w-full text-xs text-ink-muted">
          Ketik harga satuan langsung di nota; totalnya dihitung otomatis dan harga tersimpan di perangkat ini. Tanda × menyembunyikan barang dari nota.
          Simpan PDF membuat berkas nota langsung (bisa dibagikan ke WhatsApp atau disimpan di File); Cetak membuka pilihan printer.
        </p>
      </div>

      <div className={cx('mx-auto my-4 space-y-6 px-3 sm:my-6 print:my-0 print:max-w-none print:space-y-0 print:px-0', lebar)}>
        {kelompok.map((g, gi, arr) => (
          <section key={g.id} className={cx('overflow-hidden rounded-xl shadow-card print:overflow-visible print:rounded-none print:shadow-none', sempit && 'bg-white', gi < arr.length - 1 && 'break-after-page')}>
            <HalamanNota g={g} kertas={kertas} zona={zona} harga={harga} ubahHarga={ubahHarga} lapor={lapor} lunas={lunas} />
          </section>
        ))}
      </div>
    </div>
  )
}
