import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Image as IkonGambar, Printer } from 'lucide-react'
import { PILIHAN_UKURAN_KARTU, gambarKartuOrder, kanvasKartu, pdfKartuOrder, ukuranGambarKartu, type KartuOrderPdf, type UkuranKartu } from '../lib/pdfNota'
import { pesanGalat } from '../lib/errors'
import { db } from '../lib/supabase'
import type { Barang } from '../lib/types'
import { formatTanggal } from '../lib/format'
import { useAturanOvertime } from '../lib/overtime'
import { alamatFoto, useFotoUnggahan } from '../lib/kodeCincin'
import { muatFormOrder, namaTipe, targetSelesai } from '../lib/formOrder'
import { useMuat } from '../sync/useMuat'
import { useVersiData } from '../sync/SyncProvider'
import { useNotifikasi } from '../components/ui/Notifikasi'
import { useIdentitasNota } from '../components/nota/useIdentitasNota'
import { KotakGalat, Pemuat } from '../components/ui/ui'

// KARTU FORM ORDERAN BERLIAN untuk satu barang, ukuran kartu KTP/ATM (85,6 × 54 mm).
//   /cetak-kartu/<id barang>
// Pilihan ukuran: tegak, mendatar, atau ukuran asli di kertas A4 dengan tanda potong.
// Pratinjau di layar = gambar yang sama dengan PDF dan JPG, jadi hasil cetak persis seperti yang terlihat.

const KUNCI_UKURAN = 'ids-ukuran-kartu'
function ukuranTersimpan(): UkuranKartu {
  try {
    const u = localStorage.getItem(KUNCI_UKURAN)
    if (u === 'tegak' || u === 'mendatar' || u === 'a4') return u
  } catch { /* penyimpanan tidak tersedia */ }
  return 'tegak'
}

export default function KartuOrder() {
  const { id = '' } = useParams()
  const versi = useVersiData(['order_items', 'orders', 'craftsmen', 'products'])
  const { hariBatas } = useAturanOvertime()
  const { beri } = useNotifikasi()
  const identitas = useIdentitasNota()
  const [membuat, setMembuat] = useState<'pdf' | 'gambar' | null>(null)
  const [ukuran, setUkuran] = useState<UkuranKartu>(ukuranTersimpan)
  const pilihUkuran = (u: UkuranKartu) => {
    setUkuran(u)
    try { localStorage.setItem(KUNCI_UKURAN, u) } catch { /* abaikan */ }
  }

  const data = useMuat(async () => {
    const { data: b, error } = await db().from('v_items').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!b) return null
    const barang = b as Barang
    const form = await muatFormOrder(barang.order_id, [])
    const f = form?.barang.get(barang.id)
    return { barang: { ...barang, ring_size: f?.ring_size ?? null, target_date: f?.target_date ?? null } as Barang }
  }, [id, versi])
  const b = data.data?.barang
  const foto = useFotoUnggahan([b?.product_photo_path])

  // Ukuran kertas untuk dialog cetak browser mengikuti pilihan.
  useEffect(() => {
    const gaya = document.createElement('style')
    const kertas = PILIHAN_UKURAN_KARTU.find((x) => x.nilai === ukuran)?.kertas ?? 'A4'
    gaya.textContent = `@page { size: ${kertas}; margin: 0; }`
    document.head.appendChild(gaya)
    return () => gaya.remove()
  }, [ukuran])

  if (data.memuat && !data.data) return <Pemuat />
  if (data.galat && !data.data) return <div className="p-6"><KotakGalat pesan={data.galat} ulangi={data.muatUlang} /></div>
  if (!b) return <div className="p-6"><KotakGalat pesan="Barang tidak ditemukan." /></div>

  const target = targetSelesai(b.target_date, b.assigned_date, hariBatas)
  const tipe = namaTipe(b.product_name, b.category_name, b.gender)
  const baris: [string, string, boolean?][] = [
    ['Type / Model', tipe],
    ...(b.ring_size ? [['Ring Size', b.ring_size] as [string, string]] : []),
    ['Tanggal Masuk Orderan', formatTanggal(b.assigned_date)],
    ['Target Selesai Orderan', formatTanggal(target.tanggal), true],
    ['Pengrajin', b.craftsman_code.replace(/\s+/g, '-')],
  ]
  const urlFoto = b.product_code ? alamatFoto(b.product_photo_static, b.product_photo_path, foto) : null

  const isiKartu: KartuOrderPdf = {
    nomor: b.order_number, baris, tipe: b.product_code ? `${tipe} · ${b.product_code}` : tipe, fotoUrl: urlFoto,
    jabatan: identitas.jabatan, tandaTanganUrl: identitas.tampilTtd ? identitas.ttd : null, tampilTtd: identitas.tampilTtd,
  }
  const nama = `Form-Orderan-Berlian-${b.order_number}${b.item_no > 1 ? `-${b.item_no}` : ''}`
  const buat = async (jenis: 'pdf' | 'gambar') => {
    setMembuat(jenis)
    try {
      if (jenis === 'pdf') await pdfKartuOrder(isiKartu, `${nama}${ukuran === 'tegak' ? '' : `-${ukuran}`}.pdf`, ukuran)
      else await gambarKartuOrder(isiKartu, `${nama}.jpg`, ukuran)
    } catch (e) {
      beri(pesanGalat(e), 'galat')
    } finally {
      setMembuat(null)
    }
  }

  return (
    <div className="min-h-dvh bg-ice-100 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-ice-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] print:hidden">
        <Link to={`/order/${b.order_id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" disabled={!!membuat} onClick={() => void buat('gambar')}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gold-300 bg-white px-4 text-sm font-semibold text-navy-900 hover:bg-gold-50 disabled:opacity-60">
            <IkonGambar className="h-4 w-4" /> {membuat === 'gambar' ? 'Membuat…' : 'Kirim gambar'}
          </button>
          <button type="button" disabled={!!membuat} onClick={() => void buat('pdf')}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gold-300 bg-white px-4 text-sm font-semibold text-navy-900 hover:bg-gold-50 disabled:opacity-60">
            <Download className="h-4 w-4" /> {membuat === 'pdf' ? 'Membuat PDF…' : 'Simpan PDF'}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" /> Cetak
          </button>
        </div>
        <label className="flex w-full flex-col gap-1 text-sm font-semibold text-navy-900">
          Ukuran cetak
          <select value={ukuran} onChange={(e) => pilihUkuran(e.target.value as UkuranKartu)}
            className="h-11 w-full rounded-xl border border-ice-300 bg-white px-3 text-sm font-normal">
            {PILIHAN_UKURAN_KARTU.map((x) => <option key={x.nilai} value={x.nilai}>{x.label}</option>)}
          </select>
        </label>
        <p className="w-full text-xs text-ink-muted">
          {ukuran === 'a4'
            ? 'Untuk printer biasa: kartu dicetak ukuran asli KTP/ATM di kertas A4. Saat mencetak, pilih skala 100% / "Ukuran sebenarnya", lalu gunting mengikuti tanda sudut.'
            : 'Untuk printer kartu atau kertas ukuran kartu: pilih ukuran kertas 54 × 86 mm (CR80 / ID card) di pengaturan printer.'}
          {' '}Untuk WhatsApp pakai <b>Kirim gambar</b>.
        </p>
      </div>

      <Pratinjau isi={isiKartu} ukuran={ukuran} />
    </div>
  )
}

/** Pratinjau = gambar yang sama persis dengan PDF/JPG, ditampilkan dan dicetak dalam ukuran milimeter sebenarnya. */
function Pratinjau({ isi, ukuran }: { isi: KartuOrderPdf; ukuran: UkuranKartu }) {
  const [src, setSrc] = useState<string | null>(null)
  const kunci = JSON.stringify(isi)
  const gambarUkuran: UkuranKartu = ukuran === 'a4' ? 'tegak' : ukuran
  useEffect(() => {
    let batal = false
    setSrc(null)
    kanvasKartu(isi, gambarUkuran, 16)
      .then((c) => { if (!batal) setSrc(c.toDataURL('image/png')) })
      .catch(() => { if (!batal) setSrc(null) })
    return () => { batal = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci, gambarUkuran])
  const [w, h] = ukuranGambarKartu(gambarUkuran)
  const kartu = src
    ? <img src={src} alt="Form Orderan Berlian" style={{ width: `${w}mm`, height: `${h}mm` }} className="block max-w-none shadow-card print:shadow-none" />
    : <div style={{ width: `${w}mm`, height: `${h}mm` }} className="grid place-items-center bg-white text-[6pt] text-ink-muted">Menyiapkan kartu…</div>

  if (ukuran === 'a4') {
    // Kertas A4 dengan kartu ukuran asli + tanda potong di sudut.
    const sudut = 'absolute h-[4mm] w-[4mm] border-[#787878]'
    return (
      <div className="flex justify-center px-3 py-6 print:p-0">
        <div className="relative h-[297mm] w-[210mm] shrink-0 bg-white pt-[10mm] text-center shadow-card [zoom:0.42] sm:[zoom:0.7] print:shadow-none print:[zoom:1]">
          <p className="text-[8pt] font-bold text-[#8E6C27]">FORM ORDERAN BERLIAN — ukuran kartu KTP/ATM</p>
          <p className="text-[7pt] text-[#5a4c33]">Cetak dengan skala 100% (ukuran sebenarnya), lalu gunting mengikuti tanda sudut.</p>
          <div className="relative mx-auto mt-[4mm]" style={{ width: `${w}mm`, height: `${h}mm` }}>
            {kartu}
            <span className={`${sudut} -left-[5.5mm] -top-[5.5mm] border-b border-r`} />
            <span className={`${sudut} -right-[5.5mm] -top-[5.5mm] border-b border-l`} />
            <span className={`${sudut} -bottom-[5.5mm] -left-[5.5mm] border-r border-t`} />
            <span className={`${sudut} -bottom-[5.5mm] -right-[5.5mm] border-l border-t`} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-center px-3 py-6 print:p-0">
      {/* Di layar diperbesar supaya mudah dibaca; saat dicetak ukuran asli. */}
      <div className={ukuran === 'mendatar' ? '[zoom:1.05] sm:[zoom:1.6] print:[zoom:1]' : '[zoom:1.6] sm:[zoom:2] print:[zoom:1]'}>{kartu}</div>
    </div>
  )
}
