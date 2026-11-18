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
async function muatGambar(url: string, maks = 1000): Promise<Gambar | null> {
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
    if (ukuran.w <= maks) return { data, ...ukuran }
    // Perkecil gambar besar supaya berkas PDF tidak berat.
    const im = await new Promise<HTMLImageElement>((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = data })
    const c = document.createElement('canvas')
    c.width = maks
    c.height = Math.round((ukuran.h * maks) / ukuran.w)
    c.getContext('2d')?.drawImage(im, 0, 0, c.width, c.height)
    return { data: c.toDataURL('image/png'), w: c.width, h: c.height }
  } catch {
    return null
  }
}

/** Foto kecil (kode cincin) selalu diubah ke PNG berlatar putih, supaya aman untuk semua jenis foto (webp, jpg, png). */
async function gambarKecil(url: string, sisi = 160): Promise<Gambar | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const objek = URL.createObjectURL(await r.blob())
    try {
      const im = await new Promise<HTMLImageElement>((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = objek })
      const s = Math.min(1, sisi / Math.max(im.naturalWidth, im.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(im.naturalWidth * s))
      c.height = Math.max(1, Math.round(im.naturalHeight * s))
      const g = c.getContext('2d')
      if (!g) return null
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(im, 0, 0, c.width, c.height)
      return { data: c.toDataURL('image/png'), w: c.width, h: c.height }
    } finally {
      URL.revokeObjectURL(objek)
    }
  } catch {
    return null
  }
}

/** Memuat semua foto kode cincin sekaligus (alamat yang sama hanya dimuat sekali). */
async function muatFotoCincin(alamat: (string | null | undefined)[]): Promise<Map<string, Gambar>> {
  const unik = Array.from(new Set(alamat.filter((u): u is string => !!u)))
  const hasil = await Promise.all(unik.map(async (u) => [u, await gambarKecil(u)] as const))
  return new Map(hasil.filter((x): x is readonly [string, Gambar] => x[1] !== null))
}

/**
 * Kolom "Kode Cincin" di tabel PDF: foto kecil di atas, kode di bawahnya.
 * Mengembalikan pengait autoTable untuk kolom ke-`kolom`.
 */
function kolomCincin(doc: Doc, kolom: number, foto: (baris: number) => Gambar | null, sisi: number) {
  return {
    parse: (d: { section: string; column: { index: number }; row: { index: number }; cell: { styles: { minCellHeight?: number; valign?: string; cellPadding?: unknown } } }) => {
      if (d.section !== 'body' || d.column.index !== kolom || !foto(d.row.index)) return
      d.cell.styles.minCellHeight = sisi + 7
      d.cell.styles.valign = 'bottom'
    },
    draw: (d: { section: string; column: { index: number }; row: { index: number }; cell: { x: number; y: number; width: number } }) => {
      if (d.section !== 'body' || d.column.index !== kolom) return
      const g = foto(d.row.index)
      if (!g) return
      const s = Math.min(sisi / g.w, sisi / g.h)
      const w = g.w * s, h = g.h * s
      doc.addImage(g.data, 'PNG', d.cell.x + (d.cell.width - w) / 2, d.cell.y + 1.2 + (sisi - h) / 2, w, h, undefined, 'FAST')
    },
  }
}

const logoTegak = () => muatGambar(`${import.meta.env.BASE_URL}logo-ids-tegak.png`, 600)
const logoResmi = () => muatGambar(`${import.meta.env.BASE_URL}logo-ids.png`)

/** Tanda logo IDS (tanpa tulisan) sebagai PNG, untuk latar samar. */
async function tandaLogo(): Promise<Gambar | null> {
  try {
    const [, , vw, vh] = KOTAK_LOGO.split(' ').map(Number)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${KOTAK_LOGO}" width="${vw * 2}" height="${vh * 2}">${JALUR_LOGO.map((d) => `<path d="${d}" fill="#8E6C27"/>`).join('')}</svg>`
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    const im = await new Promise<HTMLImageElement>((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = url })
    const c = document.createElement('canvas')
    c.width = vw * 2
    c.height = vh * 2
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
  const ukuran = 22 * skala
  doc.setFontSize(ukuran)
  // Huruf digambar satu per satu dengan jarak tetap supaya tepat di tengah bingkai.
  const huruf = 'LUNAS'.split('')
  const jarak = 1.6 * skala
  const lebarHuruf = huruf.map((h) => doc.getTextWidth(h) as number)
  const lebar = lebarHuruf.reduce((t, w) => t + w, 0) + jarak * (huruf.length - 1)
  const tinggiHurufBesar = ukuran * 0.3528 * 0.72
  let x = -lebar / 2
  huruf.forEach((h, i) => {
    const [tx, ty] = putar(x, tinggiHurufBesar / 2)
    doc.text(h, tx, ty, { angle: 12 })
    x += lebarHuruf[i] + jarak
  })
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

interface Aset { logo: Gambar | null; tegak: Gambar | null; tanda: Gambar | null; ttd: Gambar | null }

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
    doc.addImage(aset.tanda.data, 'PNG', -W * 0.12, H * 0.38, tw, (tw * aset.tanda.h) / aset.tanda.w, 'tanda-ids', 'FAST')
    doc.restoreGraphicsState()
  }
  const bawah = W * 0.028
  poligon(doc, [[0, H - bawah], [W * 0.84, H - bawah], [W * 0.84 - bawah * 0.9, H], [0, H]], HITAM)
}

/**
 * Kepala halaman: judul besar (+ baris kecil bila ada) di kiri, logo resmi tegak yang besar di kanan.
 * Mengembalikan y untuk kolom kiri (di bawah judul) dan kolom kanan (di bawah logo).
 */
function kepala(doc: Doc, aset: Aset, judul: string, sub: string | null): { kiri: number; kanan: number } {
  const W = doc.internal.pageSize.getWidth()
  const m = W * 0.06
  const a5 = W < 160
  const k = a5 ? 0.75 : 1
  const y0 = W * 0.06 + (a5 ? 12 : 16)
  const panjang = judul.length > 9
  doc.setTextColor(42, 35, 24)
  doc.setFont('times', 'bold')
  doc.setFontSize((panjang ? 26 : 46) * (a5 ? 0.72 : 1))
  const yJudul = y0 + (panjang ? 6 : 10) * k
  doc.text(judul, m, yJudul)
  let kiri = yJudul + 4 * k
  if (sub) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(a5 ? 8.5 : 10.5)
    doc.text(sub, m, yJudul + 7 * k)
    kiri = yJudul + 9 * k
  }
  let kanan = kiri
  const logo = aset.tegak ?? aset.logo
  if (logo) {
    const lw = W * (aset.tegak ? 0.27 : 0.28)
    const lh = (lw * logo.h) / logo.w
    doc.addImage(logo.data, 'PNG', W - m - lw, y0 - 8 * k, lw, lh, undefined, 'FAST')
    kanan = y0 - 8 * k + lh
  }
  return { kiri: kiri + (a5 ? 8 : 11), kanan: kanan + (a5 ? 5 : 7) }
}

/** Blok tanggal dua baris (Hari / Tgl) yang agak ke tengah. Mengembalikan y di bawahnya. */
function blokTanggal(doc: Doc, tanggalLengkap: string, y: number): number {
  const W = doc.internal.pageSize.getWidth()
  const k = W < 160 ? 0.8 : 1
  const [hari, ...sisa] = tanggalLengkap.split(', ')
  const tgl = sisa.join(', ') || tanggalLengkap
  const x = W * 0.6
  doc.setFontSize(10.5 * k)
  doc.setTextColor(...HITAM)
  for (const [l, v] of [['Hari', sisa.length ? hari : '-'], ['Tgl', tgl]]) {
    doc.setFont('helvetica', 'normal')
    doc.text(l, x, y)
    doc.setFont('helvetica', 'bold')
    doc.text(`: ${v}`, x + 10 * k, y)
    y += 5.5 * k
  }
  return y
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
      doc.addImage(aset.ttd.data, 'PNG', tengahTtd - w / 2, garisY - h - 1, w, h, undefined, 'FAST')
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
    styles: { fontSize: 9.5 * f, cellPadding: sempit ? 1 : { top: 2.6, bottom: 2.6, left: 2, right: 2 }, minCellHeight: sempit ? 0 : 9, textColor: HITAM, lineColor: GARIS, lineWidth: 0.2, valign: 'middle' as const, halign: 'center' as const, overflow: 'linebreak' as const },
    headStyles: { fillColor: EMAS, textColor: [255, 255, 255] as RGB, fontStyle: 'bold' as const, lineColor: EMAS },
    alternateRowStyles: { fillColor: KRIM },
    footStyles: { fillColor: HITAM, textColor: EMAS_TEKS, fontStyle: 'bold' as const, lineColor: HITAM, cellPadding: sempit ? 1.5 : 2.6 },
  }
}

/**
 * Semua judul kolom dan isinya rata tengah di kolomnya masing-masing;
 * hanya baris TOTAL yang rata kanan di bawah.
 */
function sejajarkan() {
  return (d: { section: string; cell: { styles: { halign?: string } } }) => {
    d.cell.styles.halign = d.section === 'foot' ? 'right' : 'center'
  }
}

/* --------------------------------------------------------- struk sempit 80/58 */

function strukSempit(doc: Doc, aset: Aset, judul: string, nomor: string, info: string[][], tabel: (y: number) => void, o: OpsiNotaPdf) {
  const W = doc.internal.pageSize.getWidth()
  const m = 4
  let y = m
  if (aset.logo) {
    const lw = W - 2 * m - 8
    const lh = (lw * aset.logo.h) / aset.logo.w
    doc.addImage(aset.logo.data, 'PNG', (W - lw) / 2, y, lw, lh, undefined, 'FAST')
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
  tabel(y + 1)
  y = akhirTabel(doc) + 6
  if (o.lunas) { capLunas(doc, W / 2, y + 4, 0.5); y += 13 }
  if (o.tampilTtd) {
    if (aset.ttd) {
      const s = Math.min(34 / aset.ttd.w, 12 / aset.ttd.h)
      doc.addImage(aset.ttd.data, 'PNG', W / 2 - (aset.ttd.w * s) / 2, y, aset.ttd.w * s, aset.ttd.h * s, undefined, 'FAST')
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
  const [logo, tegak, tanda, ttd] = await Promise.all([
    logoResmi(),
    sempit ? Promise.resolve(null) : logoTegak(),
    sempit ? Promise.resolve(null) : tandaLogo(),
    o.tampilTtd && o.tandaTanganUrl ? muatGambar(o.tandaTanganUrl, 600) : Promise.resolve(null),
  ])
  return { logo, tegak, tanda, ttd }
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
  baris: { kodeOr: string; kategori: string; kodeCincin?: string | null; fotoCincin?: string | null; harga: number | null }[]
}

export async function pdfNotaPembayaran(halaman: HalamanPembayaran[], kertas: KertasPdf, diterbitkan: string, namaBerkas: string, o: OpsiNotaPdf): Promise<void> {
  const { jsPDF, autoTable } = await pustaka()
  const sempit = kertas === '80mm' || kertas === '58mm'
  // Thermal 58 mm terlalu sempit untuk kolom foto: kode cincin digabung ke kolom kategori.
  const sangatSempit = kertas === '58mm'
  const [aset, foto] = await Promise.all([
    siapkanAset(o, sempit),
    sangatSempit ? Promise.resolve(new Map<string, Gambar>()) : muatFotoCincin(halaman.flatMap((h) => h.baris.map((b) => b.fotoCincin))),
  ])
  const maksBaris = Math.max(1, ...halaman.map((h) => h.baris.length))
  const fmt = formatHalaman(kertas, 120 + maksBaris * (foto.size ? 13 : 7))
  const doc = new jsPDF({ unit: 'mm', format: fmt })
  const a5 = kertas === 'A5'
  const gaya = gayaTabel(a5, sempit)

  halaman.forEach((hal, idx) => {
    if (idx > 0) doc.addPage(fmt, 'portrait')
    const W = doc.internal.pageSize.getWidth()
    const total = hal.baris.reduce((t, b) => t + (b.harga ?? 0), 0)
    const sisi = sempit ? 6 : kertas === 'A5' ? 8 : 10
    const kc = kolomCincin(doc, 2, (r) => { const u = hal.baris[r]?.fotoCincin; return u ? foto.get(u) ?? null : null }, sisi)
    const rata = sejajarkan()
    const isi = (startY: number, m: number) => autoTable(doc, {
      startY,
      head: [sangatSempit ? ['No', 'Kode OR', 'Kategori + Gender', 'Harga Satuan'] : ['No', 'Kode OR', 'Kode Cincin', 'Kategori + Gender', 'Harga Satuan']],
      body: hal.baris.length
        ? hal.baris.map((b, i) => sangatSempit
          ? [String(i + 1), b.kodeOr, b.kodeCincin ? `${b.kategori}\n${b.kodeCincin}` : b.kategori, b.harga != null ? formatRupiah(b.harga) : '']
          : [String(i + 1), b.kodeOr, b.kodeCincin ?? '-', b.kategori, b.harga != null ? formatRupiah(b.harga) : ''])
        : [],
      foot: [[{ content: 'TOTAL', colSpan: sangatSempit ? 3 : 4, styles: { halign: 'right' } }, formatRupiah(total)]],
      margin: { left: m, right: m, bottom: sempit ? 4 : W * 0.06 + 8, top: sempit ? 4 : W * 0.06 + 8 },
      ...gaya,
      columnStyles: sangatSempit
        ? { 0: { cellWidth: 6 }, 1: { cellWidth: 11 }, 3: { cellWidth: 18 } }
        : sempit
          ? { 0: { cellWidth: 5 }, 1: { cellWidth: 10 }, 2: { cellWidth: 13 }, 4: { cellWidth: 17 } }
          : { 0: { cellWidth: W * 0.07 }, 1: { cellWidth: W * 0.14 }, 2: { cellWidth: W * 0.16 }, 4: { cellWidth: W * 0.24 } },
      didParseCell: (d: Parameters<typeof rata>[0] & Parameters<typeof kc.parse>[0]) => { rata(d); if (!sangatSempit) kc.parse(d) },
      didDrawCell: sangatSempit ? undefined : kc.draw,
      didDrawPage: sempit ? undefined : (d: { pageNumber: number }) => { if (d.pageNumber > 1) hiasanHalaman(doc, aset) },
    })

    if (sempit) {
      strukSempit(doc, aset, 'NOTA PEMBAYARAN', `Diterbitkan: ${diterbitkan}`,
        [['Nama', hal.nama ?? '(nama belum diisi)'], ['ID', hal.kode], ['Tgl bayar', hal.tanggalBayar]],
        (yy) => isi(yy, 4), o)
      return
    }
    hiasanHalaman(doc, aset)
    const m = W * 0.06
    const kp = kepala(doc, aset, 'NOTA PEMBAYARAN', `Diterbitkan: ${diterbitkan}`)
    let y = kp.kiri
    const k = a5 ? 0.8 : 1
    doc.setTextColor(42, 35, 24)
    doc.setFont('times', 'bold')
    doc.setFontSize(17 * k)
    doc.text('Dibayarkan kepada:', m, y)
    y += 7 * k
    doc.setFontSize(10.5 * k)
    for (const [l, v] of [['Nama pengrajin', hal.nama ?? '(nama belum diisi)'], ['ID pengrajin', hal.kode]]) {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...HITAM)
      doc.text(l, m, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...EMAS)
      doc.text(`: ${v}`, m + 32 * k, y)
      y += 5.5 * k
    }
    const yTgl = blokTanggal(doc, hal.tanggalBayar, Math.max(kp.kanan, y - 11 * k) + 2)
    isi(Math.max(y, yTgl) + 3, m)
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
  const kp = kepala(doc, aset, 'INVOICE', null)
  let y = kp.kiri
  doc.setTextColor(42, 35, 24)
  doc.setFont('times', 'bold')
  doc.setFontSize(17 * k)
  doc.text('Kepada Yth.', m, y)
  y += 7 * k
  doc.setFontSize(15 * k)
  doc.setTextColor(...EMAS)
  const namaPenerima = doc.splitTextToSize(n.kepada ?? '....................................', W * 0.5) as string[]
  namaPenerima.forEach((b) => { doc.text(b, m, y); y += 6 * k })
  const yTgl = blokTanggal(doc, n.tanggal, Math.max(kp.kanan, y - 12 * k) + 2)
  autoTable(doc, {
    startY: Math.max(y, yTgl) + 3,
    head: [['Banyaknya', 'Nama Barang', 'Harga', 'Jumlah']],
    body: n.baris.length
      ? n.baris.map((b) => [b.banyak ? b.banyak.toLocaleString('id-ID') : '', b.nama, b.harga ? formatRupiah(b.harga) : '', b.jumlah ? formatRupiah(b.jumlah) : ''])
      : [],
    foot: [[{ content: 'TOTAL', colSpan: 3, styles: { halign: 'right' } }, formatRupiah(n.total)]],
    margin: { left: m, right: m, bottom: W * 0.06 + 8, top: W * 0.06 + 8 },
    ...gayaTabel(a5, false),
    columnStyles: { 0: { cellWidth: W * 0.15 }, 2: { cellWidth: W * 0.22 }, 3: { cellWidth: W * 0.22 } },
    didParseCell: sejajarkan(),
    didDrawPage: (d: { pageNumber: number }) => { if (d.pageNumber > 1) hiasanHalaman(doc, aset) },
  })
  kaki(doc, aset, n, akhirTabel(doc))
  await simpanPdf(doc.output('blob'), namaBerkas)
}

/* ------------------------------------------------------- Nota Riwayat Pengrajin */

export interface BarisRiwayatPdf {
  kodeOr: string
  kodeCincin: string | null
  fotoCincin: string | null
  kategori: string
  berat: string
  diterima: string
  /** Tanggal selesai / diserahkan (atau '-'). */
  selesai: string
  status: string
  overtime: boolean
}

export interface NotaRiwayatPdf {
  kode: string
  nama: string | null
  periode: string
  baris: BarisRiwayatPdf[]
  /** Ringkasan di baris bawah tabel, mis. "12 barang · Dalam proses 3 · ...". */
  ringkasan: string
}

/** NOTA RIWAYAT pengrajin: daftar semua barang dalam periode, tanpa harga dan tanpa cap LUNAS. */
export async function pdfNotaRiwayat(n: NotaRiwayatPdf, kertas: KertasPdf, diterbitkan: string, namaBerkas: string, o: OpsiNotaPdf): Promise<void> {
  const { jsPDF, autoTable } = await pustaka()
  const sempit = kertas === '80mm' || kertas === '58mm'
  const [aset, foto] = await Promise.all([
    siapkanAset(o, sempit),
    sempit ? Promise.resolve(new Map<string, Gambar>()) : muatFotoCincin(n.baris.map((b) => b.fotoCincin)),
  ])
  const fmt = formatHalaman(kertas, 130 + n.baris.length * 10)
  const doc = new jsPDF({ unit: 'mm', format: fmt })
  const W = doc.internal.pageSize.getWidth()
  const a5 = kertas === 'A5'
  const gaya = gayaTabel(a5, sempit)
  const f = sempit ? 0.72 : a5 ? 0.72 : 0.85
  const opsi = { ...o, lunas: false }
  const rata = sejajarkan()
  const merah = (d: { section: string; row: { index: number }; column: { index: number }; cell: { styles: { textColor?: unknown; fontStyle?: string } } }, kolomStatus: number) => {
    if (d.section === 'body' && d.column.index === kolomStatus && n.baris[d.row.index]?.overtime) {
      d.cell.styles.textColor = MERAH
      d.cell.styles.fontStyle = 'bold'
    }
  }

  if (sempit) {
    strukSempit(doc, aset, 'NOTA RIWAYAT', `Diterbitkan: ${diterbitkan}`,
      [['Nama', n.nama ?? '(nama belum diisi)'], ['ID', n.kode], ['Periode', n.periode]],
      (yy) => autoTable(doc, {
        startY: yy,
        head: [['No', 'Kode OR', 'Barang', 'Status']],
        body: n.baris.map((b, i) => [String(i + 1), b.kodeOr,
          [b.kategori, b.kodeCincin, b.berat].filter(Boolean).join('\n'),
          `${b.status}\n${b.selesai !== '-' ? b.selesai : b.diterima}`]),
        foot: [[{ content: n.ringkasan, colSpan: 4, styles: { halign: 'center' } }]],
        margin: { left: 4, right: 4, bottom: 4, top: 4 },
        ...gaya,
        styles: { ...gaya.styles, fontSize: 9.5 * f },
        columnStyles: { 0: { cellWidth: 5 }, 1: { cellWidth: 11 } },
        didParseCell: (d: Parameters<typeof rata>[0] & Parameters<typeof merah>[0]) => { rata(d); if (d.section === 'foot') d.cell.styles.halign = 'center'; merah(d, 3) },
      }), opsi)
    await simpanPdf(doc.output('blob'), namaBerkas)
    return
  }

  hiasanHalaman(doc, aset)
  const m = W * 0.06
  const kp = kepala(doc, aset, 'NOTA RIWAYAT', `Diterbitkan: ${diterbitkan}`)
  let y = kp.kiri
  const k = a5 ? 0.8 : 1
  doc.setTextColor(42, 35, 24)
  doc.setFont('times', 'bold')
  doc.setFontSize(17 * k)
  doc.text('Riwayat pengrajin:', m, y)
  y += 7 * k
  doc.setFontSize(10.5 * k)
  for (const [l, v] of [['Nama pengrajin', n.nama ?? '(nama belum diisi)'], ['ID pengrajin', n.kode], ['Periode', n.periode]]) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...HITAM)
    doc.text(l, m, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...EMAS)
    doc.text(`: ${v}`, m + 32 * k, y)
    y += 5.5 * k
  }
  const sisi = a5 ? 7 : 9
  const kc = kolomCincin(doc, 2, (r) => { const u = n.baris[r]?.fotoCincin; return u ? foto.get(u) ?? null : null }, sisi)
  autoTable(doc, {
    startY: Math.max(y, kp.kanan) + 3,
    head: [['No', 'Kode OR', 'Kode Cincin', 'Kategori + Gender', 'Berat', 'Diterima', 'Selesai / Diserahkan', 'Status']],
    body: n.baris.map((b, i) => [String(i + 1), b.kodeOr, b.kodeCincin ?? '-', b.kategori, b.berat, b.diterima, b.selesai, b.status]),
    foot: [[{ content: n.ringkasan, colSpan: 8, styles: { halign: 'center' } }]],
    margin: { left: m, right: m, bottom: W * 0.06 + 8, top: W * 0.06 + 8 },
    ...gaya,
    styles: { ...gaya.styles, fontSize: 9.5 * f, cellPadding: { top: 1.8, bottom: 1.8, left: 1, right: 1 }, minCellHeight: 8 },
    columnStyles: { 0: { cellWidth: W * 0.05 }, 1: { cellWidth: W * 0.1 }, 2: { cellWidth: W * 0.11 }, 4: { cellWidth: W * 0.08 }, 5: { cellWidth: W * 0.12 }, 6: { cellWidth: W * 0.14 }, 7: { cellWidth: W * 0.13 } },
    didParseCell: (d: Parameters<typeof rata>[0] & Parameters<typeof kc.parse>[0] & Parameters<typeof merah>[0]) => {
      rata(d)
      if (d.section === 'foot') d.cell.styles.halign = 'center'
      kc.parse(d)
      merah(d, 7)
    },
    didDrawCell: kc.draw,
    didDrawPage: (d: { pageNumber: number }) => { if (d.pageNumber > 1) hiasanHalaman(doc, aset) },
  })
  kaki(doc, aset, opsi, akhirTabel(doc))
  await simpanPdf(doc.output('blob'), namaBerkas)
}
