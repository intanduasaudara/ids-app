import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Download, Plus, Printer, Save, Trash2, X } from 'lucide-react'
import { pdfNotaManual } from '../../lib/pdfNota'
import { db } from '../../lib/supabase'
import { bacaRupiah, formatRupiah, formatTanggalHari, hariIni, ketikRupiah } from '../../lib/format'
import { pesanGalat } from '../../lib/errors'
import { useSinkron } from '../../sync/SyncProvider'
import { useMuat } from '../../sync/useMuat'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Konfirmasi } from '../../components/ui/Dialog'
import { KotakGalat, Pemuat, Tombol } from '../../components/ui/ui'
import { KertasNota } from '../../components/nota/KertasNota'
import { useIdentitasNota } from '../../components/nota/useIdentitasNota'

// Nota manual: diketik bebas, jumlah = banyaknya x harga, total otomatis.
// Disimpan di database supaya bisa dibuka, diubah, dan dicetak lagi dari perangkat mana pun.

interface BarisKetik { banyak: string; nama: string; harga: string }
interface NotaTersimpan {
  id: string
  note_no: number
  note_date: string
  recipient: string | null
  lines: { banyak: number; nama: string; harga: number; jumlah: number }[]
  total: number
  is_paid: boolean
}
type Kertas = 'A4' | 'A5'

const barisKosong = (): BarisKetik => ({ banyak: '', nama: '', harga: '' })
const angka = (t: string): number => {
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const jumlahBaris = (b: BarisKetik) => Math.round(angka(b.banyak) * (bacaRupiah(b.harga) ?? 0) * 100) / 100

export default function EditorNota() {
  const { id } = useParams()
  const baru = !id
  const navigasi = useNavigate()
  const { zona } = useSinkron()
  const identitas = useIdentitasNota()
  const { beri } = useNotifikasi()
  const [tanggal, setTanggal] = useState(() => hariIni(zona))
  const [kepada, setKepada] = useState('')
  const [baris, setBaris] = useState<BarisKetik[]>(() => [barisKosong(), barisKosong(), barisKosong()])
  const [nomor, setNomor] = useState<number | null>(null)
  const [berubah, setBerubah] = useState(false)
  const [menyimpan, setMenyimpan] = useState(false)
  const [tanyaHapus, setTanyaHapus] = useState(false)
  const [kertas, setKertas] = useState<Kertas>('A5')
  const [lunas, setLunas] = useState(true)
  const [membuatPdf, setMembuatPdf] = useState(false)
  const ttd = identitas.ttd

  const data = useMuat(async () => {
    if (!id) return null
    const { data, error } = await db().from('manual_notes').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) throw error
    return data as NotaTersimpan | null
  }, [id])

  useEffect(() => {
    const n = data.data
    if (!n) return
    setTanggal(n.note_date)
    setKepada(n.recipient ?? '')
    setNomor(n.note_no)
    setLunas(n.is_paid ?? true)
    setBaris(n.lines.length
      ? n.lines.map((b) => ({ banyak: b.banyak ? String(b.banyak).replace('.', ',') : '', nama: b.nama, harga: b.harga ? ketikRupiah(String(b.harga)) : '' }))
      : [barisKosong()])
    setBerubah(false)
  }, [data.data])

  useEffect(() => {
    const gaya = document.createElement('style')
    gaya.textContent = kertas === 'A4' ? '@page { size: A4; margin: 0; }' : '@page { size: A5; margin: 0; }'
    document.head.appendChild(gaya)
    return () => gaya.remove()
  }, [kertas])

  const total = useMemo(() => baris.reduce((t, b) => t + jumlahBaris(b), 0), [baris])
  const ubah = (i: number, k: keyof BarisKetik, v: string) => {
    setBaris((s) => s.map((b, j) => (j === i ? { ...b, [k]: v } : b)))
    setBerubah(true)
  }

  const simpan = async (): Promise<boolean> => {
    setMenyimpan(true)
    try {
      const isi = baris
        .filter((b) => b.nama.trim() || b.banyak.trim() || b.harga.trim())
        .map((b) => ({ banyak: angka(b.banyak), nama: b.nama.trim(), harga: bacaRupiah(b.harga) ?? 0 }))
      const muatan = { note_date: tanggal, recipient: kepada.trim() || null, lines: isi, is_paid: lunas }
      if (baru) {
        const { data: d, error } = await db().from('manual_notes').insert(muatan).select('id, note_no').single()
        if (error) throw error
        setBerubah(false)
        beri(`Nota No. ${d.note_no} disimpan.`)
        navigasi(`/nota/${d.id as string}`, { replace: true })
      } else {
        const { error } = await db().from('manual_notes').update(muatan).eq('id', id)
        if (error) throw error
        setBerubah(false)
        beri('Nota disimpan.')
      }
      return true
    } catch (e) {
      beri(pesanGalat(e), 'galat')
      return false
    } finally {
      setMenyimpan(false)
    }
  }

  const cetak = async () => {
    if (berubah || baru) {
      const ok = await simpan()
      if (!ok) return
    }
    window.setTimeout(() => window.print(), 150)
  }

  const simpanPdf = async () => {
    if (berubah || baru) {
      const ok = await simpan()
      if (!ok) return
    }
    setMembuatPdf(true)
    try {
      const isi = baris.filter((b) => b.nama.trim() || b.banyak.trim() || b.harga.trim())
        .map((b) => ({ banyak: angka(b.banyak), nama: b.nama.trim(), harga: bacaRupiah(b.harga) ?? 0, jumlah: jumlahBaris(b) }))
      const no = nomor != null ? String(nomor).padStart(4, '0') : 'baru'
      await pdfNotaManual({
        nomor: `INV-${no}`, tanggal: formatTanggalHari(tanggal), kepada: kepada.trim() || null, baris: isi, total,
        tandaTanganUrl: identitas.tampilTtd ? ttd : null, tampilTtd: identitas.tampilTtd, jabatan: identitas.jabatan,
        lunas, ucapan: identitas.ucapanPembeli, kontak: identitas.kontak,
      }, kertas, `Invoice-${no}-${tanggal}.pdf`)
    } catch (e) {
      beri(pesanGalat(e), 'galat')
    } finally {
      setMembuatPdf(false)
    }
  }

  if (!baru && data.memuat && !data.data) return <Pemuat />
  if (!baru && data.galat) return <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />
  if (!baru && !data.memuat && !data.data) return <KotakGalat pesan="Nota tidak ditemukan atau sudah dihapus." />

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link to="/nota" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Daftar nota</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select aria-label="Ukuran kertas" value={kertas} onChange={(e) => setKertas(e.target.value as Kertas)} className="h-10 rounded-xl border border-ice-300 bg-white px-3 text-sm">
            <option value="A5">A5</option><option value="A4">A4</option>
          </select>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-ice-300 bg-white px-3 text-sm font-semibold text-navy-900">
            <input type="checkbox" className="h-4 w-4 accent-[#c62828]" checked={lunas} onChange={(e) => { setLunas(e.target.checked); setBerubah(true) }} />
            Tandai <span className="text-[#c62828]">LUNAS</span>
          </label>
          {!baru && <Tombol ragam="hantu" className="text-bad-700 hover:bg-bad-50" ikon={<Trash2 className="h-4 w-4" />} onClick={() => setTanyaHapus(true)}>Hapus</Tombol>}
          <Tombol ragam="kedua" ikon={<Save className="h-4 w-4" />} memuat={menyimpan} disabled={!berubah && !baru} onClick={() => void simpan()}>
            {berubah || baru ? 'Simpan' : 'Tersimpan'}
          </Tombol>
          <Tombol ragam="kedua" ikon={<Download className="h-4 w-4" />} memuat={membuatPdf} disabled={menyimpan} onClick={() => void simpanPdf()}>Simpan PDF</Tombol>
          <Tombol ikon={<Printer className="h-4 w-4" />} disabled={menyimpan} onClick={() => void cetak()}>Cetak</Tombol>
        </div>
      </div>

      <div className={`mx-auto ${kertas === 'A4' ? 'max-w-[210mm]' : 'max-w-[148mm]'} overflow-hidden rounded-xl2 border border-ice-200 shadow-card print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none`}>
        <KertasNota
          kertas={kertas}
          judul="INVOICE"
          nomor={<>NO: INV-{nomor != null ? String(nomor).padStart(4, '0') : 'baru'}</>}
          lunas={lunas}
          ucapan={identitas.ucapanPembeli}
          jabatan={identitas.jabatan}
          tampilTtd={identitas.tampilTtd}
          kontak={identitas.kontak}
          ttd={ttd ? <img src={ttd} alt="Tanda tangan" className="max-h-full max-w-full object-contain" />
            : <Link to="/pengaturan" className="mb-1 text-[11px] text-ink-muted underline print:hidden">Pasang tanda tangan di Pengaturan</Link>}
          penerima={
            <label className="block">
              <span className="block font-display text-[1.6em] font-bold leading-tight text-[#2a2318]">Kepada Yth.</span>
              <input value={kepada} onChange={(e) => { setKepada(e.target.value); setBerubah(true) }} maxLength={120} placeholder="nama pembeli (boleh dikosongkan)"
                className="isian-nota mt-1 w-full max-w-md border-b border-dotted border-black/40 bg-transparent px-1 font-display text-[1.3em] font-semibold focus:outline-none" />
            </label>
          }
          tanggal={
            <label className="relative inline-flex cursor-pointer items-center gap-1.5">
              Tanggal: <span className="font-semibold underline decoration-dotted decoration-[#8E6C27] underline-offset-4 print:no-underline">{formatTanggalHari(tanggal)}</span>
              <CalendarDays className="h-4 w-4 text-[#8E6C27] print:hidden" aria-hidden />
              <input type="date" value={tanggal} onChange={(e) => { if (e.target.value) { setTanggal(e.target.value); setBerubah(true) } }}
                aria-label="Ubah tanggal nota" className="absolute inset-0 h-full w-full cursor-pointer opacity-0 print:hidden" />
            </label>
          }
        >
          <table className="tabel-nota">
            <colgroup>
              <col className="w-[14%]" /><col /><col className="w-[25%]" /><col className="w-[27%]" /><col className="w-[6%] print:hidden" />
            </colgroup>
            <thead>
              <tr>
                <th className="text-center">Banyaknya</th>
                <th className="text-left">Nama Barang</th>
                <th className="text-right">Harga</th>
                <th className="text-right">Jumlah</th>
                <th className="print:hidden" aria-label="Hapus baris" />
              </tr>
            </thead>
            <tbody>
              {baris.map((b, i) => (
                <tr key={i}>
                  <td>
                    <input inputMode="decimal" aria-label={`Banyaknya baris ${i + 1}`} value={b.banyak}
                      onChange={(e) => ubah(i, 'banyak', e.target.value.replace(/[^\d,.]/g, ''))}
                      className="isian-nota w-full rounded border border-dashed border-[#c9b27e] bg-[#fffaf0] px-1 py-0.5 text-center tabular-nums" />
                  </td>
                  <td>
                    <input aria-label={`Nama barang baris ${i + 1}`} value={b.nama} maxLength={200} onChange={(e) => ubah(i, 'nama', e.target.value)}
                      className="isian-nota w-full rounded border border-dashed border-[#c9b27e] bg-[#fffaf0] px-1 py-0.5" />
                  </td>
                  <td>
                    <input inputMode="numeric" aria-label={`Harga baris ${i + 1}`} value={b.harga} onChange={(e) => ubah(i, 'harga', ketikRupiah(e.target.value))}
                      className="isian-nota w-full rounded border border-dashed border-[#c9b27e] bg-[#fffaf0] px-1 py-0.5 text-right tabular-nums" />
                  </td>
                  <td className="text-right tabular-nums">{jumlahBaris(b) ? formatRupiah(jumlahBaris(b)) : ''}</td>
                  <td className="text-center print:hidden">
                    <button type="button" title="Hapus baris" disabled={baris.length === 1}
                      onClick={() => { setBaris((s) => s.filter((_, j) => j !== i)); setBerubah(true) }}
                      className="rounded p-0.5 text-ink-muted hover:bg-bad-50 hover:text-bad-700 disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-nota">
                <td colSpan={3} className="text-right">TOTAL</td>
                <td className="text-right tabular-nums">{formatRupiah(total)}</td>
                <td className="print:hidden" />
              </tr>
            </tfoot>
          </table>
          <button type="button" onClick={() => { setBaris((s) => [...s, barisKosong()]); setBerubah(true) }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-[#8E6C27] hover:bg-[#faf6ec] print:hidden">
            <Plus className="h-4 w-4" /> Tambah baris
          </button>
        </KertasNota>
      </div>

      <Konfirmasi
        terbuka={tanyaHapus}
        tutup={() => setTanyaHapus(false)}
        judul="Hapus nota ini?"
        pesan={<p>Nota pindah ke <strong className="text-navy-900">Sampah</strong> dan bisa dipulihkan selama 7 hari.</p>}
        labelYa="Pindahkan ke Sampah"
        bahaya
        jalankan={async () => {
          const { error } = await db().rpc('hapus_nota', { p_id: id })
          if (error) throw error
          beri('Nota dipindah ke Sampah.')
          navigasi('/nota', { replace: true })
        }}
      />
    </>
  )
}
