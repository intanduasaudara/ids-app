import { unduh } from './unduh'
import { formatRupiah } from './format'
import { JALUR_LOGO, KOTAK_LOGO } from '../components/layout/jalurLogo'

// PDF nota yang dibuat langsung di perangkat (tanpa dialog cetak): Nota Pembayaran dan nota manual (INVOICE).
// Desain sama dengan tampilan di layar: pita emas miring, logo, tabel berkepala emas, total hitam,
// cap LUNAS merah, tanda tangan + jabatan, ucapan, kontak WA dan alamat, pita hitam di bawah.
// Pustaka PDF baru dimuat saat tombol "Simpan PDF" ditekan.

export type KertasPdf = 'A4' | 'A5' | '80mm' | '58mm'

interface Gambar { data: string; w: number; h: number }
type RGB = [number, number, number]

const EMAS: RGB = [142, 108, 39]
const EMAS_MUDA: RGB = [212, 178, 111]
const EMAS_TEKS: RGB = [230, 201, 138]
const HITAM: RGB = [31, 26, 18]
const GARIS: RGB = [220, 205, 171]
const KRIM: RGB = [250, 246, 236]
const MERAH: RGB = [198, 40, 40]
const ABU: RGB = [90, 76, 51]

/** Memuat gambar (logo, tanda tangan) menjadi data URL beserta ukurannya. */
async function muatGambar(url: string): Promise<Gambar | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    const data = await new Promise<string>((ok, gagal) => {
      const fr = new FileReader()
      fr.onload = () => ok(String(fr.result))
      fr.onerror = () => gagal(fr.error)
      fr.readAsDataURL(blob)
    })
    const ukuran = await new Promise<{ w: number; h: number }>((ok, gagal) => {
      const im = new Image()
      im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight })
      im.onerror = gagal
      im.src = data
    })
    return { data, ...ukuran }
  } catch {
    return null
  }
}

const logoResmi = () => muatGambar(`${import.meta.env.BASE_URL}logo-ids.png`)

/** Tanda logo IDS (tanpa tulisan) sebagai PNG, untuk latar samar. */
async function tandaLogo(): Promise<Gambar | null> {
  try {
    const [, , vw, vh] = KOTAK_LOGO.split(' ').map(Number)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${KOTAK_LOGO}" width="${vw * 3}" height="${vh * 3}">${JALUR_LOGO.map((d) => `<path d="${d}" fill="#8E6C27"/>`).join('')}</svg>`
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    const im = await new Promise<HTMLImageElement>((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = url })
    const c = document.createElement('canvas')
    c.width = vw * 3
    c.height = vh * 3
    c.getContext('2d')?.drawImage(im, 0, 0, c.width, c.height)
    return { data: c.toDataURL('image/png'), w: c.width, h: c.height }
  } catch {
    return null
  }
}

/**
 * Menyimpan PDF. Di HP yang mendukung, membuka lembar bagikan (Simpan ke File, WhatsApp, dll.);
 * selain itu langsung diunduh.
 */
export async function simpanPdf(blob: Blob, namaBerkas: string): Promise<void> {
  const berkas = new File([blob], namaBerkas, { type: 'application/pdf' })
  const sentuh = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  if (sentuh && typeof navigator.canShare === 'function' && navigator.canShare({ files: [berkas] })) {
    try {
      await navigator.share({ files: [berkas], title: namaBerkas })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  unduh(blob, namaBerkas)
}

async function pustaka() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any
const akhirTabel = (doc: Doc): number => (doc.lastAutoTable?.finalY as number | undefined) ?? 60

/** Poligon terisi dari titik-titik mutlak. */
function poligon(doc: Doc, titik: [number, number][], warna: RGB, gaya: 'F' | 'S' = 'F') {
  const [x0, y0] = titik[0]
  const delta = titik.slice(1).map(([x, y], i) => [x - titik[i][0], y - titik[i][1]])
  if (gaya === 'F') doc.setFillColor(...warna); else doc.setDrawColor(...warna)
  doc.lines(delta, x0, y0, [1, 1], gaya, true)
}

/** Cap LUNAS merah miring dengan bingkai garis ganda. Titik (cx, cy) = tengah cap. */
function capLunas(doc: Doc, cx: number, cy: number, skala = 1) {
  const sudut = (12 * Math.PI) / 180
  const putar = (x: number, y: number): [number, number] => [
    cx + x * Math.cos(sudut) + y * Math.sin(sudut),
    cy - x * Math.sin(sudut) + y * Math.cos(sudut),
  ]
  doc.setLineWidth(0.6 * skala)
  for (const [w, h] of [[23, 7.6], [21, 5.6]]) {
    const a = w * skala, b = h * skala
    poligon(doc, [putar(-a, -b), putar(a, -b), putar(a, b), putar(-a, b)], MERAH, 'S')
  }
  doc.setTextColor(...MERAH)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24 * skala)
  doc.setCharSpace(2.2 * skala)
  const lebar = doc.getTextWidth('LUNAS')
  const [tx, ty] = putar(-lebar / 2, 3 * skala)
  doc.text('LUNAS', tx, ty, { angle: 12 })
  doc.setCharSpace(0)
}

/* ------------------------------------------------------------- kerangka umum */

export interface KontakPdf { wa: string | null; label: string; alamat: string | null }

export interface OpsiNotaPdf {
  lunas: boolean
  ucapan: string
  jabatan: string
  kontak: KontakPdf
  tandaTanganUrl: string | null
  tampilTtd: boolean
}

interface Aset { logo: Gambar | null; tanda: Gambar | null; ttd: Gambar | null }

/** Hiasan halaman A4/A5: pita emas atas, tanda logo samar, pita hitam bawah. */
function hiasanHalaman(doc: Doc, aset: Aset) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const pita = W * 0.06
  poligon(doc, [[W * 0.24 + pita * 0.4, 0], [W, 0], [W, pita], [W * 0.24, pita]], EMAS)
  poligon(doc, [[W * 0.86, 0], [W, 0], [W, pita], [W * 0.84, pita]], EMAS_MUDA)
  if (aset.tanda) {
    doc.saveGraphicsState()
    doc.setGState(new doc.GState({ opacity: 0.05 }))
    const tw = W * 0.7
    doc.addImage(aset.tanda.data, 'PNG', -W * 0.12, H * 0.38, tw, (tw * aset.tanda.h) / aset.tanda.w)
    doc.restoreGraphicsState()
  }
  const bawah = W * 0.028
  poligon(doc, [[0, H - bawah], [W * 0.84, H - bawah], [W * 0.84 - bawah * 0.9, H], [0, H]], HITAM)
}

/** Kepala halaman: judul besar + nomor di kiri, logo di kanan. Mengembalikan y berikutnya. */
function kepala(doc: Doc, aset: Aset, judul: string, nomor: string): number {
  const W = doc.internal.pageSize.getWidth()
  const m = W * 0.06
  const a5 = W < 160
  const y0 = W * 0.06 + (a5 ? 12 : 16)
  const panjang = judul.length > 9
  doc.setTextColor(42, 35, 24)
  doc.setFont('times', 'bold')
  doc.setFontSize((panjang ? 26 : 46) * (a5 ? 0.72 : 1))
  doc.text(judul, m, y0 + (panjang ? 6 : 10) * (a5 ? 0.75 : 1))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(a5 ? 8.5 : 10.5)
  doc.text(nomor, m, y0 + (panjang ? 13 : 18) * (a5 ? 0.75 : 1))
  if (aset.logo) {
    const lw = W * 0.28
    const lh = (lw * aset.logo.h) / aset.logo.w
    doc.addImage(aset.logo.data, 'PNG', W - m - lw, y0 - 6, lw, lh)
    return Math.max(y0 + 24 * (a5 ? 0.75 : 1), y0 - 6 + lh) + (a5 ? 6 : 10)
  }
  return y0 + 26
}

/** Bagian bawah: cap LUNAS, tanda tangan + jabatan, ucapan, kontak. Dimulai dari y (setelah tabel). */
function kaki(doc: Doc, aset: Aset, o: OpsiNotaPdf, y: number) {
  const W = doc.internal.pageSize.getWidth()
  let H = doc.internal.pageSize.getHeight()
  const m = W * 0.06
  const a5 = W < 160
  const k = a5 ? 0.8 : 1
  const tinggiKaki = 78 * k
  if (y + tinggiKaki > H - 6) {
    doc.addPage()
    hiasanHalaman(doc, aset)
    H = doc.internal.pageSize.getHeight()
    y = W * 0.06 + 14
  }
  y += 8 * k
  // Tanda tangan di kanan
  const ttdLebar = W * 0.36
  const ttdX = W - m - ttdLebar
  const tengahTtd = ttdX + ttdLebar / 2
  if (o.tampilTtd) {
    doc.setTextColor(...HITAM)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10 * k)
    doc.text('Hormat kami,', tengahTtd, y + 2, { align: 'center' })
    const garisY = y + 26 * k
    if (aset.ttd) {
      const s = Math.min((ttdLebar * 0.85) / aset.ttd.w, (20 * k) / aset.ttd.h)
      const w = aset.ttd.w * s, h = aset.ttd.h * s
      doc.addImage(aset.ttd.data, 'PNG', tengahTtd - w / 2, garisY - h - 1, w, h)
    }
    doc.setDrawColor(...HITAM)
    doc.setLineWidth(0.3)
    doc.line(ttdX, garisY, ttdX + ttdLebar, garisY)
    doc.setFont('times', 'bold')
    doc.setFontSize(14 * k)
    doc.setTextColor(...EMAS)
    doc.text(o.jabatan, tengahTtd, garisY + 6 * k, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8 * k)
    doc.setTextColor(...ABU)
    doc.text('CV. Intan Dua Saudara', tengahTtd, garisY + 10.5 * k, { align: 'center' })
  }
  if (o.lunas) capLunas(doc, m + 26 * k, y + 16 * k, k)

  // Ucapan + kontak menempel di bawah halaman
  const yKontak = H - W * 0.028 - 6 - (a5 ? 9 : 11)
  doc.setFont('times', 'bolditalic')
  doc.setFontSize(14 * k)
  doc.setTextColor(...EMAS)
  doc.text(o.ucapan, W / 2, yKontak - 9 * k, { align: 'center', maxWidth: W - 2 * m })
  doc.setDrawColor(...GARIS)
  doc.setLineWidth(0.3)
  doc.line(m, yKontak - 4, W - m, yKontak - 4)
  doc.setFontSize(8.5 * k)
  doc.setTextColor(...HITAM)
  const bulat = (x: number, yy: number, huruf: string) => {
    doc.setFillColor(...EMAS)
    doc.circle(x, yy - 1.1, 2.3 * k, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5 * k)
    doc.text(huruf, x, yy - 0.2, { align: 'center' })
    doc.setTextColor(...HITAM)
    doc.setFontSize(8.5 * k)
  }
  if (o.kontak.wa) {
    bulat(m + 2.3 * k, yKontak + 1, 'WA')
    doc.setFont('helvetica', 'bold')
    doc.text(o.kontak.wa, m + 6.5 * k, yKontak + 1)
    if (o.kontak.label) {
      const lw = doc.getTextWidth(o.kontak.wa)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...ABU)
      doc.text(` (${o.kontak.label})`, m + 6.5 * k + lw, yKontak + 1)
      doc.setTextColor(...HITAM)
    }
  }
  if (o.kontak.alamat) {
    doc.setFont('helvetica', 'normal')
    const lebarAlamat = W * 0.5
    const baris = doc.splitTextToSize(o.kontak.alamat, lebarAlamat) as string[]
    baris.forEach((b, i) => doc.text(b, W - m - 6 * k, yKontak + 1 + i * 3.8 * k, { align: 'right' }))
    // Ikon lokasi: lingkaran emas dengan titik putih.
    const px = W - m - 2.3 * k, py = yKontak - 0.1
    doc.setFillColor(...EMAS)
    doc.circle(px, py, 2.3 * k, 'F')
    doc.setFillColor(255, 255, 255)
    doc.circle(px, py - 0.3 * k, 0.8 * k, 'F')
  }
}

/** Gaya tabel bersama (kepala emas, garis krem, baris selang-seling, total hitam). */
function gayaTabel(a5: boolean, sempit: boolean) {
  const f = sempit ? 0.8 : a5 ? 0.88 : 1
  return {
    theme: 'grid' as const,
    styles: { fontSize: 9.5 * f, cellPadding: sempit ? 1 : 2, textColor: HITAM, lineColor: GARIS, lineWidth: 0.2, valign: 'middle' as const },
    headStyles: { fillColor: EMAS, textColor: [255, 255, 255] as RGB, fontStyle: 'bold' as const, lineColor: EMAS },
    alternateRowStyles: { fillColor: KRIM },
    footStyles: { fillColor: HITAM, textColor: EMAS_TEKS, fontStyle: 'bold' as const, lineColor: HITAM, cellPadding: sempit ? 1.5 : 2.6 },
  }
}

/* --------------------------------------------------------- struk sempit 80/58 */

function strukSempit(doc: Doc, aset: Aset, judul: string, nomor: string, info: string[][], tabel: () => void, o: OpsiNotaPdf) {
  const W = doc.internal.pageSize.getWidth()
  const m = 4
  let y = m
  if (aset.logo) {
    const lw = W - 2 * m - 8
    const lh = (lw * aset.logo.h) / aset.logo.w
    doc.addImage(aset.logo.data, 'PNG', (W - lw) / 2, y, lw, lh)
    y += lh + 4
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...EMAS)
  doc.text(judul, W / 2, y, { align: 'center', charSpace: 0.6 })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...HITAM)
  doc.text(nomor, W / 2, y + 3.5, { align: 'center' })
  y += 5.5
  doc.setDrawColor(...EMAS)
  doc.setLineWidth(0.5)
  doc.line(m, y, W - m, y)
  y += 4.5
  doc.setFontSize(7.5)
  for (const [l, v] of info) {
    doc.setFont('helvetica', 'normal')
    doc.text(l, m, y)
    doc.setFont('helvetica', 'bold')
    doc.text(`: ${v}`, m + 17, y)
    y += 3.8
  }
  doc.__y = y + 1
  tabel()
  y = akhirTabel(doc) + 6
  if (o.lunas) { capLunas(doc, W / 2, y + 4, 0.5); y += 13 }
  if (o.tampilTtd) {
    if (aset.ttd) {
      const s = Math.min(34 / aset.ttd.w, 12 / aset.ttd.h)
      doc.addImage(aset.ttd.data, 'PNG', W / 2 - (aset.ttd.w * s) / 2, y, aset.ttd.w * s, aset.ttd.h * s)
    }
    y += 13
    doc.setDrawColor(...HITAM)
    doc.setLineWidth(0.2)
    doc.line(W / 2 - 18, y, W / 2 + 18, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...EMAS)
    doc.text(o.jabatan, W / 2, y + 3.5, { align: 'center' })
    y += 8
  }
  doc.setFont('times', 'bolditalic')
  doc.setFontSize(8.5)
  doc.setTextColor(...EMAS)
  const uc = doc.splitTextToSize(o.ucapan, W - 2 * m) as string[]
  uc.forEach((b) => { doc.text(b, W / 2, y, { align: 'center' }); y += 3.8 })
  y += 1
  doc.setDrawColor(...EMAS)
  doc.setLineDashPattern([0.8, 0.8], 0)
  doc.line(m, y, W - m, y)
  doc.setLineDashPattern([], 0)
  y += 3.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...HITAM)
  const kontak = [o.kontak.wa ? `WA ${o.kontak.wa}${o.kontak.label ? ` (${o.kontak.label})` : ''}` : null, o.kontak.alamat].filter(Boolean) as string[]
  for (const t of kontak) {
    ;(doc.splitTextToSize(t, W - 2 * m) as string[]).forEach((b) => { doc.text(b, W / 2, y, { align: 'center' }); y += 3 })
  }
}

async function siapkanAset(o: OpsiNotaPdf, sempit: boolean): Promise<Aset> {
  const [logo, tanda, ttd] = await Promise.all([
    logoResmi(),
    sempit ? Promise.resolve(null) : tandaLogo(),
    o.tampilTtd && o.tandaTanganUrl ? muatGambar(o.tandaTanganUrl) : Promise.resolve(null),
  ])
  return { logo, tanda, ttd }
}

function formatHalaman(kertas: KertasPdf, tinggi: number): [number, number] | string {
  if (kertas === 'A4') return 'a4'
  if (kertas === 'A5') return 'a5'
  return [kertas === '80mm' ? 80 : 58, Math.max(140, tinggi)]
}

/* ------------------------------------------------------------ Nota Pembayaran */

export interface HalamanPembayaran {
  kode: string
  nama: string | null
  tanggalBayar: string
  baris: { kodeOr: string; kategori: string; harga: number | null }[]
}

export async function pdfNotaPembayaran(halaman: HalamanPembayaran[], kertas: KertasPdf, diterbitkan: string, namaBerkas: string, o: OpsiNotaPdf): Promise<void> {
  const { jsPDF, autoTable } = await pustaka()
  const sempit = kertas === '80mm' || kertas === '58mm'
  const aset = await siapkanAset(o, sempit)
  const maksBaris = Math.max(1, ...halaman.map((h) => h.baris.length))
  const fmt = formatHalaman(kertas, 120 + maksBaris * 7)
  const doc = new jsPDF({ unit: 'mm', format: fmt })
  const a5 = kertas === 'A5'
  const gaya = gayaTabel(a5, sempit)

  halaman.forEach((hal, idx) => {
    if (idx > 0) doc.addPage(fmt, 'portrait')
    const W = doc.internal.pageSize.getWidth()
    const total = hal.baris.reduce((t, b) => t + (b.harga ?? 0), 0)
    const isi = (startY: number, m: number) => autoTable(doc, {
      startY,
      head: [['No', 'Kode OR', 'Kategori + Gender', 'Harga Satuan']],
      body: hal.baris.length
        ? hal.baris.map((b, i) => [String(i + 1), b.kodeOr, b.kategori, b.harga != null ? formatRupiah(b.harga) : ''])
        : [['', '', 'Tidak ada barang', '']],
      foot: [[{ content: 'TOTAL', colSpan: 3, styles: { halign: 'right' } }, formatRupiah(total)]],
      margin: { left: m, right: m, bottom: sempit ? 4 : W * 0.06 + 8, top: sempit ? 4 : W * 0.06 + 8 },
      ...gaya,
      columnStyles: { 0: { cellWidth: sempit ? 6 : W * 0.07, halign: 'center' }, 3: { halign: 'right', cellWidth: sempit ? 18 : W * 0.26 } },
      didDrawPage: sempit ? undefined : (d: { pageNumber: number }) => { if (d.pageNumber > 1) hiasanHalaman(doc, aset) },
    })

    if (sempit) {
      strukSempit(doc, aset, 'NOTA PEMBAYARAN', `Diterbitkan: ${diterbitkan}`,
        [['Nama', hal.nama ?? '(nama belum diisi)'], ['ID', hal.kode], ['Tgl bayar', hal.tanggalBayar]],
        () => isi(doc.__y, 4), o)
      return
    }
    hiasanHalaman(doc, aset)
    const m = W * 0.06
    let y = kepala(doc, aset, 'NOTA PEMBAYARAN', `Diterbitkan: ${diterbitkan}`)
    const k = a5 ? 0.8 : 1
    doc.setTextColor(42, 35, 24)
    doc.setFont('times', 'bold')
    doc.setFontSize(17 * k)
    doc.text('Dibayarkan kepada:', m, y)
    y += 7 * k
    doc.setFontSize(10.5 * k)
    for (const [l, v] of [['Nama pengrajin', hal.nama ?? '(nama belum diisi)'], ['ID pengrajin', hal.kode]]) {
      doc.setFont('helvetica', 'normal')
      doc.text(l, m, y)
      doc.setFont('helvetica', 'bold')
      doc.text(`: ${v}`, m + 32 * k, y)
      y += 5.5 * k
    }
    doc.setFont('helvetica', 'normal')
    doc.text('Tanggal pembayaran: ', W - m - doc.getTextWidth(hal.tanggalBayar) - 0.5, y + 2, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(hal.tanggalBayar, W - m, y + 2, { align: 'right' })
    isi(y + 5, m)
    kaki(doc, aset, o, akhirTabel(doc))
  })
  await simpanPdf(doc.output('blob'), namaBerkas)
}

/* ---------------------------------------------------------- Nota manual (INVOICE) */

export interface NotaManualPdf extends OpsiNotaPdf {
  nomor: string
  tanggal: string
  kepada: string | null
  baris: { banyak: number; nama: string; harga: number; jumlah: number }[]
  total: number
}

export async function pdfNotaManual(n: NotaManualPdf, kertas: 'A4' | 'A5', namaBerkas: string): Promise<void> {
  const { jsPDF, autoTable } = await pustaka()
  const aset = await siapkanAset(n, false)
  const doc = new jsPDF({ unit: 'mm', format: kertas === 'A4' ? 'a4' : 'a5' })
  const W = doc.internal.pageSize.getWidth()
  const m = W * 0.06
  const a5 = kertas === 'A5'
  const k = a5 ? 0.8 : 1
  hiasanHalaman(doc, aset)
  let y = kepala(doc, aset, 'INVOICE', `NO: ${n.nomor}`)
  doc.setTextColor(42, 35, 24)
  doc.setFont('times', 'bold')
  doc.setFontSize(17 * k)
  doc.text('Kepada Yth.', m, y)
  y += 7 * k
  doc.setFontSize(14 * k)
  doc.text(n.kepada ?? '....................................', m, y)
  y += 6 * k
  doc.setFontSize(10.5 * k)
  doc.setFont('helvetica', 'normal')
  doc.text('Tanggal: ', W - m - doc.getTextWidth(n.tanggal) - 0.5, y + 2, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.text(n.tanggal, W - m, y + 2, { align: 'right' })
  autoTable(doc, {
    startY: y + 5,
    head: [['Banyaknya', 'Nama Barang', 'Harga', 'Jumlah']],
    body: n.baris.length
      ? n.baris.map((b) => [b.banyak ? b.banyak.toLocaleString('id-ID') : '', b.nama, b.harga ? formatRupiah(b.harga) : '', b.jumlah ? formatRupiah(b.jumlah) : ''])
      : [['', '', '', '']],
    foot: [[{ content: 'TOTAL', colSpan: 3, styles: { halign: 'right' } }, formatRupiah(n.total)]],
    margin: { left: m, right: m, bottom: W * 0.06 + 8, top: W * 0.06 + 8 },
    ...gayaTabel(a5, false),
    columnStyles: { 0: { cellWidth: W * 0.15, halign: 'center' }, 2: { halign: 'right', cellWidth: W * 0.2 }, 3: { halign: 'right', cellWidth: W * 0.2 } },
    didDrawPage: (d: { pageNumber: number }) => { if (d.pageNumber > 1) hiasanHalaman(doc, aset) },
  })
  kaki(doc, aset, n, akhirTabel(doc))
  await simpanPdf(doc.output('blob'), namaBerkas)
}
