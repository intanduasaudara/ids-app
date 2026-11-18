import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { pdfKartuOrder } from '../lib/pdfNota'
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
import { TandaIDS } from '../components/layout/Logo'
import { useIdentitasNota } from '../components/nota/useIdentitasNota'
import { KotakGalat, Pemuat, cx } from '../components/ui/ui'
import { FotoCincin } from '../components/FotoCincin'

// KARTU FORM ORDERAN BERLIAN untuk satu barang, ukuran kartu KTP tegak (54 × 85,6 mm).
//   /cetak-kartu/<id barang>
// Simpan PDF membuat berkas langsung; Cetak memakai printer (atur kertas ke ukuran kartu).

export default function KartuOrder() {
  const { id = '' } = useParams()
  const versi = useVersiData(['order_items', 'orders', 'craftsmen', 'products'])
  const { hariBatas } = useAturanOvertime()
  const { beri } = useNotifikasi()
  const identitas = useIdentitasNota()
  const [membuatPdf, setMembuatPdf] = useState(false)

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

  // Ukuran kertas untuk dialog cetak browser: kartu KTP tegak.
  useEffect(() => {
    const gaya = document.createElement('style')
    gaya.textContent = '@page { size: 54mm 85.6mm; margin: 0; }'
    document.head.appendChild(gaya)
    return () => gaya.remove()
  }, [])

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

  const simpanPdfKartu = async () => {
    setMembuatPdf(true)
    try {
      await pdfKartuOrder({
        nomor: b.order_number, baris, tipe: b.product_code ? `${tipe} · ${b.product_code}` : tipe, fotoUrl: urlFoto,
        jabatan: identitas.jabatan, tandaTanganUrl: identitas.tampilTtd ? identitas.ttd : null, tampilTtd: identitas.tampilTtd,
      }, `Kartu-Order-${b.order_number}-${b.item_no}.pdf`)
    } catch (e) {
      beri(pesanGalat(e), 'galat')
    } finally {
      setMembuatPdf(false)
    }
  }

  return (
    <div className="min-h-dvh bg-ice-100 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-ice-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] print:hidden">
        <Link to={`/order/${b.order_id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" disabled={membuatPdf} onClick={() => void simpanPdfKartu()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gold-300 bg-white px-4 text-sm font-semibold text-navy-900 hover:bg-gold-50 disabled:opacity-60">
            <Download className="h-4 w-4" /> {membuatPdf ? 'Membuat PDF…' : 'Simpan PDF'}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" /> Cetak
          </button>
        </div>
        <p className="w-full text-xs text-ink-muted">
          Ukuran kartu KTP tegak (5,4 × 8,5 cm). Saat Cetak, pilih ukuran kertas kartu / 54 × 86 mm di pengaturan printer.
          Ring size yang belum diisi tidak ditampilkan; isi lewat tombol Ubah di detail order.
        </p>
      </div>

      <div className="flex justify-center px-3 py-6 print:p-0">
        {/* Di layar diperbesar supaya mudah dibaca; saat dicetak ukuran asli. */}
        <div className="[zoom:1.6] sm:[zoom:2] print:[zoom:1]">
          <KertasKartu nomor={b.order_number} baris={baris} tipe={b.product_code ? `${tipe} · ${b.product_code}` : tipe} kode={b.product_code ?? null} foto={urlFoto}
            ttd={identitas.tampilTtd ? identitas.ttd : null} tampilTtd={identitas.tampilTtd} jabatan={identitas.jabatan} />
        </div>
      </div>
    </div>
  )
}

function KertasKartu({ nomor, baris, tipe, kode, foto, ttd, tampilTtd, jabatan }: {
  nomor: string
  baris: [string, string, boolean?][]
  tipe: string
  kode: string | null
  foto: string | null
  ttd: string | null
  tampilTtd: boolean
  jabatan: string
}) {
  return (
    <div className="relative flex h-[85.6mm] w-[54mm] flex-col overflow-hidden bg-white px-[3.6mm] pb-[3mm] pt-[3.2mm] text-[5.4pt] leading-snug text-[#1f1a12] shadow-card print:shadow-none">
      {/* Bingkai emas ganda */}
      <div aria-hidden className="pointer-events-none absolute inset-[1.2mm] rounded-[1.6mm] border-[0.3mm] border-[#8E6C27]" />
      <div aria-hidden className="pointer-events-none absolute inset-[1.9mm] rounded-[1.1mm] border-[0.1mm] border-[#d4b26f]" />
      {/* Logo samar di latar */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[46%] w-[40mm] -translate-x-1/2 -translate-y-1/2 opacity-[0.06]">
        <TandaIDS className="!h-auto !w-full" />
      </div>

      <div className="relative flex flex-1 flex-col">
        <img src={`${import.meta.env.BASE_URL}logo-ids-tegak.png`} alt="CV. Intan Dua Saudara" draggable={false} className="mx-auto h-[12mm] w-auto object-contain" />
        <p className="mt-[1.4mm] text-center text-[6.2pt] font-bold tracking-[0.16em] text-[#8E6C27]">FORM ORDERAN BERLIAN</p>
        <p className="text-center text-[7pt] font-bold tracking-wide">No. {nomor}</p>
        <div className="my-[1.2mm] flex items-center gap-[1mm]" aria-hidden>
          <span className="h-[0.2mm] flex-1 bg-gradient-to-r from-transparent to-[#8E6C27]" />
          <span className="h-[1.3mm] w-[1.3mm] rotate-45 bg-[#8E6C27]" />
          <span className="h-[0.2mm] flex-1 bg-gradient-to-l from-transparent to-[#8E6C27]" />
        </div>
        <dl>
          {baris.map(([l, v, merah]) => (
            <div key={l} className="grid grid-cols-[17mm_1.6mm_1fr] border-b border-dotted border-[#dccdab] py-[0.7mm] last:border-0">
              <dt className="text-[#5a4c33]">{l}</dt><span className="text-[#5a4c33]">:</span>
              <dd className={cx('min-w-0 break-words font-bold', merah && 'text-[#c62828]')}>{v}</dd>
            </div>
          ))}
        </dl>
        {kode && (
          <div className="mt-[1.8mm] flex flex-col items-center">
            <span className="max-w-full truncate rounded-full bg-[#1f1a12] px-[2.6mm] py-[0.5mm] text-[5.4pt] font-bold tracking-wide text-[#e6c98a]">{tipe}</span>
            <FotoCincin src={foto} kode={kode} className="mt-[1.2mm] h-[17mm] w-[17mm] rounded-[1.6mm] border-[#e6d7b3] bg-white" />
          </div>
        )}
        {tampilTtd && (
          <div className="mt-auto flex flex-col items-center text-center">
            <p className="text-[4.6pt] text-[#5a4c33]">Hormat kami,</p>
            <div className="flex h-[6.5mm] items-end justify-center">{ttd && <img src={ttd} alt="Tanda tangan" className="max-h-full max-w-[22mm] object-contain" />}</div>
            <div className="w-[22mm] border-b-[0.2mm] border-[#1f1a12]" />
            <p className="mt-[0.4mm] font-display text-[6.4pt] font-bold text-[#8E6C27]">{jabatan}</p>
            <p className="text-[4.4pt] tracking-wide text-[#5a4c33]">CV. Intan Dua Saudara</p>
          </div>
        )}
      </div>
    </div>
  )
}
