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
import { LABEL_SPEK, muatFormOrder, namaTipe, targetSelesai } from '../lib/formOrder'
import { useMuat } from '../sync/useMuat'
import { useVersiData } from '../sync/SyncProvider'
import { useNotifikasi } from '../components/ui/Notifikasi'
import { LogoResmi } from '../components/ui/LogoResmi'
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
  const [membuatPdf, setMembuatPdf] = useState(false)

  const data = useMuat(async () => {
    const { data: b, error } = await db().from('v_items').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!b) return null
    const barang = b as Barang
    const form = await muatFormOrder(barang.order_id, [barang.product_id])
    const f = form?.barang.get(barang.id)
    return {
      barang: { ...barang, ring_size: f?.ring_size ?? null, target_date: f?.target_date ?? null } as Barang,
      order: form?.order ?? null,
      spek: barang.product_id ? form?.spek.get(barang.product_id) ?? null : null,
    }
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

  const o = data.data?.order
  const spek = data.data?.spek
  const target = targetSelesai(b.target_date, b.assigned_date, hariBatas)
  const tipe = namaTipe(b.product_name, b.category_name, b.gender)
  const baris: [string, string, boolean?][] = [
    ['Type / Model', tipe],
    ...(b.ring_size ? [['Ring Size', b.ring_size] as [string, string]] : []),
    ...(o?.agent_name ? [['Nama Agen', o.agent_name] as [string, string]] : []),
    ...(o?.team_name ? [['Team', o.team_name] as [string, string]] : []),
    ...(o?.customer_name ? [['Nama Pemesan', o.customer_name] as [string, string]] : []),
    ['Tanggal Masuk Orderan', formatTanggal(b.assigned_date)],
    ['Target Selesai Orderan', formatTanggal(target.tanggal), true],
    ['Pengrajin', b.craftsman_code.replace(/\s+/g, '-')],
  ]
  const spekIsi: [string, string][] = spek ? LABEL_SPEK.filter(([k]) => spek[k]).map(([k, l]) => [l, spek[k] as string]) : []
  const urlFoto = b.product_code ? alamatFoto(b.product_photo_static, b.product_photo_path, foto) : null

  const simpanPdfKartu = async () => {
    setMembuatPdf(true)
    try {
      await pdfKartuOrder({ nomor: b.order_number, baris, tipe, fotoUrl: urlFoto, spek: spekIsi, alamat: o?.shipping_address ?? null },
        `Kartu-Order-${b.order_number}-${b.item_no}.pdf`)
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
          Isian yang kosong (agen, team, ring size, dll.) tidak ditampilkan; isi lewat tombol Ubah di detail order.
        </p>
      </div>

      <div className="flex justify-center px-3 py-6 print:p-0">
        {/* Di layar diperbesar supaya mudah dibaca; saat dicetak ukuran asli. */}
        <div className="[zoom:1.6] sm:[zoom:2] print:[zoom:1]">
          <KertasKartu nomor={b.order_number} baris={baris} tipe={tipe} kode={b.product_code ?? null} foto={urlFoto} spek={spekIsi} alamat={o?.shipping_address ?? null} />
        </div>
      </div>
    </div>
  )
}

function KertasKartu({ nomor, baris, tipe, kode, foto, spek, alamat }: {
  nomor: string
  baris: [string, string, boolean?][]
  tipe: string
  kode: string | null
  foto: string | null
  spek: [string, string][]
  alamat: string | null
}) {
  return (
    <div className="relative h-[85.6mm] w-[54mm] overflow-hidden bg-white p-[3mm] text-[5.6pt] leading-tight text-[#1f1a12] shadow-card print:shadow-none">
      <div aria-hidden className="pointer-events-none absolute inset-[1.2mm] rounded-[1.5mm] border border-[#8E6C27]" />
      <div className="flex justify-center"><LogoResmi className="h-[6mm] w-auto" /></div>
      <div className="mt-[1.4mm] border-t-[0.4mm] border-[#8E6C27]" />
      <p className="mt-[1.6mm] text-[7pt] font-bold">No. {nomor}</p>
      <p className="text-[7.4pt] font-bold tracking-tight">FORM ORDERAN BERLIAN</p>
      <dl className="mt-[0.6mm]">
        {baris.map(([l, v, merah]) => (
          <div key={l} className="grid grid-cols-[17.5mm_1.4mm_1fr] border-b border-dotted border-[#dccdab] py-[0.45mm]">
            <dt>{l}</dt><span>:</span>
            <dd className={cx('min-w-0 break-words font-bold', merah && 'text-[#c62828]')}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-[1.6mm] text-[6pt] font-bold">Gambar dan Spesifikasi Produk</p>
      <span className="mt-[0.6mm] inline-block max-w-full truncate rounded-[1mm] bg-[#1f1a12] px-[2.5mm] py-[0.6mm] text-[6pt] font-bold text-[#e6c98a]">{tipe}</span>
      <div className="mt-[1.2mm] flex items-start gap-[2mm]">
        {kode && <FotoCincin src={foto} kode={kode} className="h-[15mm] w-[15mm] rounded-[1mm] border-[#e6d7b3]" />}
        {spek.length > 0 && (
          <dl className="grid min-w-0 flex-1 grid-cols-[12.5mm_1fr] gap-y-[0.5mm] pt-[0.8mm] text-[4.8pt]">
            {spek.map(([l, v]) => (
              <div key={l} className="contents"><dt className="text-[#5a4c33]">{l}</dt><dd className="min-w-0 break-words font-bold">{v}</dd></div>
            ))}
          </dl>
        )}
      </div>
      {alamat && (
        <p className="mt-[1.8mm] text-[5.4pt] font-bold"><span className="underline">Alamat Pengiriman :</span> <span className="uppercase underline">{alamat}</span></p>
      )}
    </div>
  )
}
