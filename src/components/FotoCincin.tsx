import { useState } from 'react'
import { Gem } from 'lucide-react'
import { cx } from './ui/ui'

/** Foto kecil model cincin. Bila foto tidak ada atau gagal dimuat, tampil ikon permata. */
export function FotoCincin({ src, kode, className }: { src: string | null; kode?: string | null; className?: string }) {
  const [gagal, setGagal] = useState(false)
  return (
    <span className={cx('inline-grid shrink-0 place-items-center overflow-hidden rounded-lg border border-gold-200 bg-white', className ?? 'h-10 w-10')}>
      {src && !gagal ? (
        <img src={src} alt={kode ? `Cincin ${kode}` : 'Cincin'} loading="lazy" decoding="async"
          className="h-full w-full object-contain p-0.5" onError={() => setGagal(true)} />
      ) : (
        <Gem className="h-1/2 w-1/2 text-gold-400" aria-hidden />
      )}
    </span>
  )
}

/** Lencana kode cincin + foto kecil, untuk daftar barang. Tidak tampil bila barang belum diberi kode. */
export function LencanaCincin({ kode, src }: { kode: string | null; src: string | null }) {
  if (!kode) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-200 bg-gold-50 py-0.5 pl-0.5 pr-2 text-xs font-bold tracking-wide text-[#8E6C27]">
      <FotoCincin src={src} kode={kode} className="h-6 w-6 rounded-full" />
      {kode}
    </span>
  )
}

/** Isi sel "Kode Cincin" di nota: foto kecil di atas kodenya. Kosong = tanda strip. */
export function SelCincin({ kode, src, kecil }: { kode: string | null | undefined; src: string | null; kecil?: boolean }) {
  if (!kode) return <span className="text-[#a8956a]">-</span>
  return (
    <span className="inline-flex flex-col items-center gap-0.5 leading-none">
      {src && <FotoCincin src={src} kode={kode} className={kecil ? 'h-[1.8em] w-[1.8em] rounded border-[#e6d7b3]' : 'h-[2.6em] w-[2.6em] rounded-md border-[#e6d7b3]'} />}
      <span className="text-[0.85em] font-bold tracking-wide">{kode}</span>
    </span>
  )
}
