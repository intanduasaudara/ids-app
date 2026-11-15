import type { ReactNode } from 'react'
import { MapPin, Phone } from 'lucide-react'
import { LogoResmi } from '../ui/LogoResmi'
import { TandaIDS } from '../layout/Logo'
import { cx } from '../ui/ui'

// Kerangka nota bergaya invoice dengan warna logo IDS (emas-coklat, hitam, putih).
// Dipakai Nota manual (INVOICE) dan Nota Pembayaran pengrajin. Warnanya sengaja tetap
// (tidak ikut tema aplikasi) supaya hasil cetak dan tampilan di layar selalu sama.

export type KertasNotaUkuran = 'A4' | 'A5' | '80mm' | '58mm'

export interface KontakNota { wa: string | null; label: string; alamat: string | null }

export function KertasNota({
  kertas, judul, nomor, penerima, tanggal, children, lunas, ucapan, ttd, tampilTtd, jabatan, kontak, className,
}: {
  kertas: KertasNotaUkuran
  judul: string
  nomor?: ReactNode
  penerima: ReactNode
  tanggal: ReactNode
  children: ReactNode
  lunas: boolean
  ucapan: string
  ttd: ReactNode
  tampilTtd: boolean
  jabatan: string
  kontak: KontakNota
  className?: string
}) {
  const sempit = kertas === '80mm' || kertas === '58mm'
  const judulPanjang = judul.length > 9

  if (sempit) {
    return (
      <div className={cx('nota nota-sempit relative bg-white text-[#1f1a12]', className)}>
        <div className="flex flex-col items-center border-b-2 border-[#8E6C27] pb-2 text-center">
          <LogoResmi className="max-h-8" />
          <p className="mt-1.5 font-bold tracking-[0.25em] text-[#8E6C27]">{judul}</p>
          {nomor && <p className="text-[10px]">{nomor}</p>}
        </div>
        <div className="mt-2 space-y-0.5">{penerima}</div>
        <div className="mt-1 text-right text-[10px]">{tanggal}</div>
        <div className="mt-2">{children}</div>
        {lunas && <div className="mt-3 flex justify-center"><span className="cap-lunas text-base">LUNAS</span></div>}
        {tampilTtd && (
          <div className="mx-auto mt-3 w-40 text-center">
            <div className="flex h-12 items-end justify-center">{ttd}</div>
            <div className="border-b border-[#1f1a12]" />
            <p className="mt-0.5 font-semibold text-[#8E6C27]">{jabatan}</p>
          </div>
        )}
        <p className="mt-3 text-center font-display text-[12px] font-semibold italic text-[#8E6C27]">{ucapan}</p>
        <div className="mt-2 space-y-0.5 border-t border-dashed border-[#8E6C27]/60 pt-2 text-center text-[9.5px]">
          {kontak.wa && <p>WA {kontak.wa}{kontak.label ? ` (${kontak.label})` : ''}</p>}
          {kontak.alamat && <p>{kontak.alamat}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className={cx('nota relative flex flex-col overflow-hidden bg-white text-[#1f1a12]', kertas === 'A4' ? 'nota-a4' : 'nota-a5', className)}>
      {/* Pita emas miring di kanan atas */}
      <div aria-hidden className="nota-pita-atas absolute right-0 top-0 h-[clamp(1.6rem,6vw,3.2rem)] w-[76%]" />
      {/* Tanda logo samar di belakang isi */}
      <div aria-hidden className="pointer-events-none absolute -left-[12%] top-[38%] w-[70%] opacity-[0.05]">
        <TandaIDS className="!h-auto !w-full" />
      </div>

      <div className="relative flex flex-1 flex-col px-[6%] pb-[clamp(2.2rem,7vw,3.5rem)] pt-[clamp(2.8rem,11vw,5.5rem)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className={cx('font-display font-bold leading-none tracking-wide text-[#2a2318]',
              judulPanjang ? 'text-[clamp(1.35rem,6vw,2.6rem)]' : 'text-[clamp(2.2rem,11vw,4.6rem)]')}>{judul}</h1>
            {nomor && <p className="mt-1.5 text-[0.95em] tracking-wide">{nomor}</p>}
          </div>
          <LogoResmi className="w-[28%] max-w-[13rem] shrink-0" />
        </div>

        <div className="mt-[clamp(1rem,5vw,2.5rem)]">{penerima}</div>
        <div className="mt-3 text-right">{tanggal}</div>

        <div className="mt-2">{children}</div>

        <div className="mt-[clamp(1.2rem,5vw,2.5rem)] flex items-end justify-between gap-4 break-inside-avoid">
          <div className="pb-4 pl-[2%]">{lunas && <span className="cap-lunas">LUNAS</span>}</div>
          {tampilTtd && (
            <div className="w-[40%] max-w-[15rem] text-center">
              <p className="text-[0.92em]">Hormat kami,</p>
              <div className="flex h-[clamp(3rem,12vw,5rem)] items-end justify-center">{ttd}</div>
              <div className="border-b border-[#1f1a12]" />
              <p className="mt-1 font-display text-[1.25em] font-bold text-[#8E6C27]">{jabatan}</p>
              <p className="text-[0.8em] tracking-wide text-[#5a4c33]">CV. Intan Dua Saudara</p>
            </div>
          )}
        </div>

        <p className="mt-auto pt-[clamp(1.2rem,5vw,2.5rem)] text-center font-display text-[1.3em] font-semibold italic text-[#8E6C27]">{ucapan}</p>

        <div className="mt-3 flex flex-col gap-2 border-t border-[#8E6C27]/40 pt-3 text-[0.85em] sm:flex-row sm:items-start sm:justify-between">
          {kontak.wa && (
            <p className="flex shrink-0 items-center gap-2">
              <span className="nota-ikon"><Phone className="h-3 w-3" aria-hidden /></span>
              <span><span className="font-semibold">{kontak.wa}</span>{kontak.label && <span className="text-[#5a4c33]"> ({kontak.label})</span>}</span>
            </p>
          )}
          {kontak.alamat && (
            <p className="flex items-start gap-2 sm:max-w-[60%] sm:text-right">
              <span className="nota-ikon sm:order-2"><MapPin className="h-3 w-3" aria-hidden /></span>
              <span>{kontak.alamat}</span>
            </p>
          )}
        </div>
      </div>
      {/* Pita hitam miring di bawah */}
      <div aria-hidden className="nota-pita-bawah absolute bottom-0 left-0 h-[clamp(0.9rem,3.2vw,1.6rem)] w-[84%]" />
    </div>
  )
}
