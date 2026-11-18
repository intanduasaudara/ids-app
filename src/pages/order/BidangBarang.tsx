import { useEffect, useRef, useState } from 'react'
import { Controller, get, useFormContext, useWatch } from 'react-hook-form'
import { Check, Minus, Plus } from 'lucide-react'
import type { DataMaster } from '../../sync/useMaster'
import { labelPengrajin } from '../../sync/useMaster'
import { formatBulan, formatTanggal } from '../../lib/format'
import { tambahHari, useFormOrderSiap } from '../../lib/formOrder'
import { useSinkron } from '../../sync/SyncProvider'
import { Bidang, Isian, cx } from '../../components/ui/ui'
import { FotoCincin } from '../../components/FotoCincin'
import { alamatFoto, modelCocok, useKatalogCincin } from '../../lib/kodeCincin'
import { KELAS, LABEL_KELAS } from '../stok/produk'

interface Props {
  /** Awalan nama isian, mis. 'items.0.' untuk barang di dalam order, atau '' untuk satu barang. */
  awalan: string
  master: DataMaster
  hariIni: string
  tampilJumlah?: boolean
  /** Berat minimal per barang (gram) dari Pengaturan. */
  minBerat: number
  /** Pemakaian perak standar per gender (gram). Terisi otomatis saat gender dipilih, selama berat belum diubah manual. */
  beratStandar?: { LADY: number; MAN: number }
}

const KELAS_PILIH =
  'h-11 w-full rounded-xl border bg-white px-3 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-gold-300 focus:border-gold-400'

/** Isian satu barang: pengrajin, kategori, gender, jumlah, tanggal, deskripsi. Dipakai di semua formulir barang. */
export function BidangBarang({ awalan, master, hariIni, tampilJumlah = true, minBerat, beratStandar }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, control, setValue, formState, getFieldState } = useFormContext<any>()
  const n = (k: string) => `${awalan}${k}`
  const id = (k: string) => `${awalan.replace(/\./g, '-')}${k}`
  const galat = (k: string): string | undefined => get(formState.errors, n(k))?.message

  const pengrajinTerpilih = useWatch({ control, name: n('craftsman_id') }) as string
  const kategoriTerpilih = useWatch({ control, name: n('category_id') }) as string
  const tanggal = useWatch({ control, name: n('assigned_date') }) as string
  const bulanManual = useWatch({ control, name: n('production_month') }) as string | undefined
  const gender = useWatch({ control, name: n('gender') }) as 'LADY' | 'MAN' | undefined
  const targetIsi = useWatch({ control, name: n('target_date') }) as string | undefined
  const formSiap = useFormOrderSiap()
  const { pengaturan } = useSinkron()
  const hariBatas = pengaturan?.overtime_days ?? 10
  // Gender dipilih: isi pemakaian perak standar (Lady 6 g, Man 12 g), kecuali beratnya sudah diketik sendiri.
  useEffect(() => {
    if (!beratStandar || (gender !== 'LADY' && gender !== 'MAN')) return
    if (getFieldState(n('weight_grams'), formState).isDirty) return
    setValue(n('weight_grams'), String(beratStandar[gender]).replace('.', ','), { shouldValidate: formState.isSubmitted })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender])
  const [koreksiBulan, setKoreksiBulan] = useState(Boolean(bulanManual))
  useEffect(() => {
    if (bulanManual) setKoreksiBulan(true)
  }, [bulanManual])

  // Pengrajin dan kategori nonaktif hanya tampil bila sudah terpilih (data lama).
  const daftarPengrajin = master.pengrajin.filter((p) => p.is_active || p.id === pengrajinTerpilih)
  const daftarKategori = master.kategori.filter((k) => k.is_active || k.id === kategoriTerpilih)

  return (
    <div className="space-y-4">
      <Bidang label="Pengrajin" id={id('craftsman_id')} wajib galat={galat('craftsman_id')}>
        <select id={id('craftsman_id')} className={cx(KELAS_PILIH, galat('craftsman_id') ? 'border-bad-600' : 'border-ice-300')} {...register(n('craftsman_id'))}>
          <option value="">Pilih pengrajin</option>
          {daftarPengrajin.map((p) => (
            <option key={p.id} value={p.id}>
              {labelPengrajin(p)}{p.is_active ? '' : ' (nonaktif)'}
            </option>
          ))}
        </select>
      </Bidang>

      <Controller
        control={control}
        name={n('category_id')}
        render={({ field }) => (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-navy-900">Kategori perhiasan <span className="text-gold-600">*</span></legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {daftarKategori.map((k) => {
                const pilih = field.value === k.id
                return (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={pilih}
                    onClick={() => field.onChange(k.id)}
                    className={cx(
                      'min-h-[48px] rounded-xl border px-3 py-2 text-sm font-bold tracking-wide transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                      pilih ? 'border-gold-400 bg-navy-900 text-gold-200 shadow-sm' : 'border-ice-300 bg-white text-navy-800 hover:border-gold-300',
                    )}
                  >
                    {k.name}
                  </button>
                )
              })}
            </div>
            {galat('category_id') && <p role="alert" className="mt-1.5 text-sm text-bad-600">{galat('category_id')}</p>}
          </fieldset>
        )}
      />

      <div className={cx('grid gap-4', tampilJumlah && 'sm:grid-cols-2')}>
        <Controller
          control={control}
          name={n('gender')}
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-navy-900">Gender <span className="text-gold-600">*</span></legend>
              <div className="grid grid-cols-2 gap-2">
                {(['LADY', 'MAN'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={field.value === g}
                    onClick={() => field.onChange(g)}
                    className={cx(
                      'h-11 rounded-xl border text-sm font-bold tracking-wider',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                      field.value === g ? 'border-gold-400 bg-navy-900 text-gold-200' : 'border-ice-300 bg-white text-navy-800 hover:border-gold-300',
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {galat('gender') && <p role="alert" className="mt-1.5 text-sm text-bad-600">{galat('gender')}</p>}
            </fieldset>
          )}
        />
        {tampilJumlah && (
          <Controller
            control={control}
            name={n('quantity')}
            render={({ field }) => {
              const nilai = Number(field.value) || 0
              return (
                <Bidang label="Jumlah barang" id={id('quantity')} galat={galat('quantity')}>
                  <div className="flex h-11 items-stretch overflow-hidden rounded-xl border border-ice-300 bg-white">
                    <button type="button" aria-label="Kurangi" className="px-4 text-navy-900 hover:bg-ice-100 disabled:opacity-40"
                      disabled={nilai <= 1} onClick={() => field.onChange(Math.max(1, nilai - 1))}>
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      id={id('quantity')}
                      inputMode="numeric"
                      className="w-full border-x border-ice-200 text-center text-lg font-bold tabular-nums text-navy-900 focus:outline-none"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                      onBlur={field.onBlur}
                    />
                    <button type="button" aria-label="Tambah" className="px-4 text-navy-900 hover:bg-ice-100 disabled:opacity-40"
                      disabled={nilai >= 100} onClick={() => field.onChange(Math.min(100, nilai + 1))}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </Bidang>
              )
            }}
          />
        )}
      </div>

      <PilihKodeCincin awalan={awalan} kategori={master.kategori.find((k) => k.id === kategoriTerpilih)?.name ?? null} gender={gender ?? null} />
      {formSiap && (
        <div className="grid grid-cols-2 gap-3">
          <Bidang label="Ring size" id={id('ring_size')} galat={galat('ring_size')} bantuan="Opsional, contoh 13.">
            <Isian id={id('ring_size')} inputMode="decimal" maxLength={10} placeholder="13" salah={!!galat('ring_size')} {...register(n('ring_size'))} />
          </Bidang>
          <Bidang label="Target selesai" id={id('target_date')} galat={galat('target_date')}
            bantuan={targetIsi ? 'Diisi manual.' : `Kosong = otomatis ${formatTanggal(tambahHari(tanggal || hariIni, hariBatas))} (+${hariBatas} hari).`}>
            <Isian id={id('target_date')} type="date" min={tanggal || undefined} salah={!!galat('target_date')} {...register(n('target_date'))} />
          </Bidang>
        </div>
      )}

      <Controller
        control={control}
        name={n('weight_grams')}
        render={({ field }) => {
          const angka = Number(String(field.value ?? '').replace(',', '.'))
          const sah = Number.isFinite(angka) && String(field.value ?? '').trim() !== ''
          const geser = (d: number) => {
            const dasar = sah ? angka : minBerat
            field.onChange(String(Math.max(minBerat, Math.round((dasar + d) * 10) / 10)).replace('.', ','))
          }
          const label = minBerat.toLocaleString('id-ID', { maximumFractionDigits: 2 })
          return (
            <Bidang label={tampilJumlah ? 'Pemakaian perak per barang (gram)' : 'Pemakaian perak (gram)'} id={id('weight_grams')} wajib galat={galat('weight_grams')}
              bantuan={beratStandar
                ? `Terisi otomatis: Lady ${beratStandar.LADY.toLocaleString('id-ID')} g, Man ${beratStandar.MAN.toLocaleString('id-ID')} g. Bisa diubah. Minimal ${label} g. Tercatat sebagai pemakaian perak pengrajin.`
                : `Minimal ${label} gram (bisa diubah di Pengaturan). Tercatat sebagai pemakaian perak pengrajin.`}>
              <div className={cx('flex h-11 max-w-xs items-stretch overflow-hidden rounded-xl border bg-white', galat('weight_grams') ? 'border-bad-600' : 'border-ice-300')}>
                <button type="button" aria-label="Kurangi 0,5 gram" className="px-4 text-navy-900 hover:bg-ice-100 disabled:opacity-40"
                  disabled={sah && angka <= minBerat} onClick={() => geser(-0.5)}>
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  id={id('weight_grams')}
                  inputMode="decimal"
                  className="w-full border-x border-ice-200 text-center text-lg font-bold tabular-nums text-navy-900 focus:outline-none"
                  value={field.value === undefined || field.value === null ? '' : String(field.value).replace('.', ',')}
                  onChange={(e) => field.onChange(e.target.value.replace(/[^\d.,]/g, ''))}
                  onBlur={field.onBlur}
                />
                <span className="grid place-items-center border-r border-ice-200 px-2 text-sm font-semibold text-ink-muted">g</span>
                <button type="button" aria-label="Tambah 0,5 gram" className="px-4 text-navy-900 hover:bg-ice-100" onClick={() => geser(0.5)}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </Bidang>
          )
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Bidang label="Tanggal diberikan ke pengrajin" id={id('assigned_date')} wajib galat={galat('assigned_date')}>
          <Isian id={id('assigned_date')} type="date" max={hariIni} salah={!!galat('assigned_date')} {...register(n('assigned_date'))} />
        </Bidang>
        <Bidang label="Mulai produksi" id={id('production_start_date')} galat={galat('production_start_date')} bantuan="Opsional.">
          <Isian id={id('production_start_date')} type="date" min={tanggal || undefined} max={hariIni} salah={!!galat('production_start_date')} {...register(n('production_start_date'))} />
        </Bidang>
      </div>

      <div className="rounded-xl bg-ice-50 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-soft">
            Bulan produksi:{' '}
            <strong className="text-navy-900">
              {koreksiBulan && bulanManual ? formatBulan(`${bulanManual}-01`) : formatBulan(tanggal)}
            </strong>
            {!koreksiBulan && <span className="text-ink-muted"> (otomatis dari tanggal diberikan)</span>}
          </p>
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 accent-navy-900"
              checked={koreksiBulan}
              onChange={(e) => {
                setKoreksiBulan(e.target.checked)
                setValue(n('production_month'), e.target.checked ? (tanggal || hariIni).slice(0, 7) : '', { shouldDirty: true })
              }}
            />
            Koreksi manual
          </label>
        </div>
        {koreksiBulan && (
          <div className="mt-2 max-w-xs">
            <Isian aria-label="Bulan produksi" type="month" {...register(n('production_month'))} />
          </div>
        )}
      </div>

    </div>
  )
}

/**
 * Pilihan KODE CINCIN bergambar. Daftar model otomatis tersaring sesuai kategori + gender.
 * Opsional: "Tanpa kode" boleh. Tidak tampil sebelum SQL kode cincin dijalankan di Supabase.
 */
function PilihKodeCincin({ awalan, kategori, gender }: { awalan: string; kategori: string | null; gender: 'LADY' | 'MAN' | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { control, setValue } = useFormContext<any>()
  const nama = `${awalan}product_id`
  const terpilih = (useWatch({ control, name: nama }) as string | null | undefined) || ''
  const katalog = useKatalogCincin()
  const [semua, setSemua] = useState(false)

  // Kategori atau gender diganti setelah memilih kode: kode lama yang tidak cocok lagi dikosongkan.
  const sebelum = useRef({ kategori, gender })
  useEffect(() => {
    const s = sebelum.current
    sebelum.current = { kategori, gender }
    if (!terpilih || !katalog.model.length) return
    if (s.kategori === kategori && s.gender === gender) return
    if (s.kategori === null && s.gender === null) return
    if (!modelCocok(katalog.model, kategori, gender).some((m) => m.id === terpilih)) {
      setValue(nama, '', { shouldDirty: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kategori, gender])

  if (!katalog.siap) return null
  const cocok = modelCocok(katalog.model, kategori, gender)
  const tampilSemua = semua || !cocok.length
  // Kode yang sudah terpilih selalu tampil walau di luar saringan (data lama).
  const pilihan = !tampilSemua && terpilih && !cocok.some((m) => m.id === terpilih)
    ? [...katalog.model.filter((m) => m.id === terpilih), ...cocok]
    : cocok
  const model = katalog.model.find((m) => m.id === terpilih)
  const pilih = (id: string) => setValue(nama, id, { shouldDirty: true })
  const kartu = (m: (typeof katalog.model)[number]) => (
    <TombolModel key={m.id} pilih={terpilih === m.id} kode={m.code}
      src={alamatFoto(m.photo_static, m.photo_path, katalog.foto)} onClick={() => pilih(m.id)} />
  )
  // Semua model dikelompokkan per kelas (Premium, High, ...) supaya mudah dicari.
  const kelompok = KELAS.map((k) => ({ k, isi: katalog.model.filter((m) => m.class === k) })).filter((g) => g.isi.length)
  const KISI = 'grid grid-cols-4 gap-2 sm:grid-cols-6'

  return (
    // min-w-0: fieldset bawaan browser melebar mengikuti isinya; tanpa ini halaman ikut bergeser ke samping.
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-navy-900">
        Kode cincin <span className="font-normal text-ink-muted">(opsional)</span>
      </legend>
      {katalog.memuat && !katalog.model.length ? (
        <p className="text-sm text-ink-muted">Memuat katalog...</p>
      ) : (
        <div className="space-y-2" role="radiogroup" aria-label="Kode cincin">
          {model && (
            <p className="truncate rounded-lg bg-gold-50 px-2.5 py-1.5 text-xs text-ink-soft ring-1 ring-gold-200">
              Terpilih: <strong className="tracking-wide text-[#8E6C27]">{model.code}</strong> · {model.name}
            </p>
          )}
          {tampilSemua ? (
            <>
              <div className={KISI}>
                <TombolModel pilih={!terpilih} onClick={() => pilih('')} kode="Tanpa kode" src={null} kosong />
              </div>
              {kelompok.map((g) => (
                <div key={g.k}>
                  <p className="mb-1 mt-2 text-[11px] font-bold tracking-[0.15em] text-ink-muted">{LABEL_KELAS[g.k].toUpperCase()}</p>
                  <div className={KISI}>{g.isi.map(kartu)}</div>
                </div>
              ))}
            </>
          ) : (
            <div className={KISI}>
              <TombolModel pilih={!terpilih} onClick={() => pilih('')} kode="Tanpa kode" src={null} kosong />
              {pilihan.map(kartu)}
            </div>
          )}
          <p className="text-xs text-ink-muted">
            {!kategori || !gender
              ? 'Pilih kategori dan gender dulu supaya kode yang cocok muncul. '
              : !cocok.length
                ? `Belum ada model ${kategori} ${gender} di Stok barang, jadi semua model ditampilkan. `
                : tampilSemua ? `Menampilkan semua ${katalog.model.length} model. ` : `${cocok.length} model ${kategori} ${gender}. `}
          </p>
          {cocok.length > 0 && cocok.length < katalog.model.length && (
            <button type="button" onClick={() => setSemua((v) => !v)}
              className="inline-flex h-9 items-center rounded-xl border border-gold-300 bg-white px-3 text-xs font-semibold text-[#8E6C27] transition-transform active:scale-95">
              {semua ? 'Tampilkan yang cocok saja' : `Tampilkan semua model (${katalog.model.length})`}
            </button>
          )}
        </div>
      )}
    </fieldset>
  )
}

function TombolModel({ pilih, onClick, kode, src, kosong }: { pilih: boolean; onClick: () => void; kode: string; src: string | null; kosong?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={pilih}
      onClick={onClick}
      className={cx(
        'relative flex w-full min-w-0 flex-col items-center gap-1 rounded-xl border p-1.5 transition-[transform,box-shadow,border-color] duration-200 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        pilih ? 'border-gold-400 bg-navy-900 shadow-sm' : 'border-ice-300 bg-white hover:border-gold-300',
      )}
    >
      {kosong ? (
        <span className={cx('grid aspect-square w-full max-w-[3.5rem] place-items-center rounded-lg border border-dashed text-[10px] font-semibold', pilih ? 'border-gold-300 text-gold-200' : 'border-ice-300 text-ink-muted')}>—</span>
      ) : (
        <FotoCincin src={src} kode={kode} className="aspect-square w-full max-w-[3.5rem]" />
      )}
      <span className={cx('w-full truncate text-center text-[10.5px] font-bold leading-tight tracking-wide', pilih ? 'text-gold-200' : 'text-navy-800')}>{kode}</span>
      {pilih && (
        <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-gold-400 text-navy-900" aria-hidden>
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  )
}
