import { useEffect, useState, useMemo, useRef } from 'react'
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, addDoc, serverTimestamp, getDocs, where, updateDoc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { LGAS, LGA_WARDS } from '../../data/lgaData'
import toast from 'react-hot-toast'
import styles from './Dashboard.module.css'

const COLORS = ['#1a3a6b', '#c8972a', '#2563ab', '#16a34a', '#dc2626', '#7c3aed', '#0891b2']

const TABS = ['Overview', 'Members', 'Analytics', 'Import']

// Safely convert any timestamp format (Firestore Timestamp, ISO string, ms) to JS Date
const toDate = (ts) => {
  if (!ts) return null
  if (ts.seconds) return new Date(ts.seconds * 1000)
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

// Normalize values for comparison — handles ALLCAPS, trailing spaces from Google Form
const norm = (v) => (v || '').toLowerCase().trim()

// Map of dirty ward strings (from Google Form) to canonical ward names
// Key: normalized dirty value, Value: canonical name matching lgaData.js
const WARD_ALIASES = {
  'akwaihedi':  'Akwaihedi',
  'ukpor2':     'Ukpor II',
  'ukpor 2':    'Ukpor II',
  'ukpor1':     'Ukpor I',
  'ukpor 1':    'Ukpor I',
  'ukpor3':     'Ukpor III',
  'ukpor 3':    'Ukpor III',
  'ukpor4':     'Ukpor IV',
  'ukpor 4':    'Ukpor IV',
  'ukpor5':     'Ukpor V',
  'ukpor 5':    'Ukpor V',
  'utuh':       'Utuh I',
  'utuh1':      'Utuh I',
  'utuh 1':     'Utuh I',
  'utuh2':      'Utuh II',
  'utuh 2':     'Utuh II',
  'utuh3':      'Utuh III',
  'utuh 3':     'Utuh III',
  'otolo1':     'Otolo I',
  'otolo 1':    'Otolo I',
  'otolo2':     'Otolo II',
  'otolo 2':    'Otolo II',
  'otolo3':     'Otolo III',
  'otolo 3':    'Otolo III',
  'uruagu1':    'Uruagu I',
  'uruagu 1':   'Uruagu I',
  'uruagu2':    'Uruagu II',
  'uruagu 2':   'Uruagu II',
  'ekwulobia1': 'Ekwulobia I',
  'ekwulobia 1':'Ekwulobia I',
  'ekwulobia2': 'Ekwulobia II',
  'ekwulobia 2':'Ekwulobia II',
  'amichi1':    'Amichi I',
  'amichi 1':   'Amichi I',
  'amichi2':    'Amichi II',
  'amichi 2':   'Amichi II',
  'azigbo1':    'Azigbo I',
  'azigbo 1':   'Azigbo I',
  'azigbo2':    'Azigbo II',
  'azigbo 2':   'Azigbo II',
  'unubi1':     'Unubi I',
  'unubi 1':    'Unubi I',
  'unubi2':     'Unubi II',
  'unubi 2':    'Unubi II',
  'osumenyi1':  'Osumenyi I',
  'osumenyi 1': 'Osumenyi I',
  'osumenyi2':  'Osumenyi II',
  'osumenyi 2': 'Osumenyi II',
}

// Resolve a stored ward value to its canonical form for comparison
const resolveWard = (ward) => {
  const n = norm(ward)
  return WARD_ALIASES[n] ? norm(WARD_ALIASES[n]) : n
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Overview')
  const [filters, setFilters] = useState({ lga: '', ward: '', pollingUnit: '', search: '', source: '' })
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', dir: 'desc' })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const PAGE_SIZE = 20

  // Import state
  const [importRows, setImportRows] = useState([])
  const [importStatus, setImportStatus] = useState(null) // null | 'previewing' | 'importing' | 'done'
  const [importResult, setImportResult] = useState({ imported: 0, skipped: 0, errors: 0 })
  const [importProgress, setImportProgress] = useState(0)
  const fileRef = useRef(null)

  useEffect(() => {
    const q = query(collection(db, 'enrollments'), orderBy('timestamp', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [])

  const handleSignOut = async () => {
    await signOut(auth)
    navigate('/admin/login')
  }

  const wardOptions = filters.lga ? LGA_WARDS[filters.lga] : []

  const filtered = useMemo(() => {
    let data = [...records]

    if (filters.lga) {
      data = data.filter(r => norm(r.lga) === norm(filters.lga))
    }
    if (filters.ward) {
      data = data.filter(r => resolveWard(r.ward) === norm(filters.ward))
    }
    if (filters.pollingUnit) {
      const pu = norm(filters.pollingUnit)
      data = data.filter(r => norm(r.pollingUnit).includes(pu))
    }
    if (filters.source) {
      data = data.filter(r =>
        filters.source === 'google_form'
          ? r.source === 'google_form'
          : !r.source || r.source !== 'google_form'
      )
    }
    if (filters.search) {
      const s = norm(filters.search)
      data = data.filter(r =>
        norm(r.name).includes(s) ||
        norm(r.phone).replace(/\s/g, '').includes(s.replace(/\s/g, '')) ||
        norm(r.nin).includes(s) ||
        norm(r.vin).includes(s) ||
        norm(r.lga).includes(s) ||
        norm(r.ward).includes(s) ||
        resolveWard(r.ward).includes(s) ||
        norm(r.bank).includes(s) ||
        norm(r.pollingUnit).includes(s) ||
        norm(r.accountNumber).includes(s)
      )
    }
    data.sort((a, b) => {
      let av = a[sortConfig.key], bv = b[sortConfig.key]
      if (sortConfig.key === 'timestamp') {
        av = toDate(a.timestamp)?.getTime() || 0
        bv = toDate(b.timestamp)?.getTime() || 0
      }
      if (av < bv) return sortConfig.dir === 'asc' ? -1 : 1
      if (av > bv) return sortConfig.dir === 'asc' ? 1 : -1
      return 0
    })
    return data
  }, [records, filters, sortConfig])

  const sort = (key) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  const sortIcon = (key) => {
    if (sortConfig.key !== key) return ' ↕'
    return sortConfig.dir === 'asc' ? ' ↑' : ' ↓'
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Analytics data
  const lgaStats = useMemo(() => {
    const map = {}
    records.forEach(r => {
      const key = r.lga?.trim()
      if (key) map[key] = (map[key] || 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [records])

  const wardStats = useMemo(() => {
    const lgaNorm = filters.lga ? norm(filters.lga) : null
    const map = {}
    records
      .filter(r => !lgaNorm || norm(r.lga) === lgaNorm)
      .forEach(r => {
        const raw = r.ward?.trim()
        if (!raw) return
        const key = WARD_ALIASES[norm(raw)] || raw.trim()
        map[key] = (map[key] || 0) + 1
      })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10)
  }, [records, filters.lga])

  const dailyStats = useMemo(() => {
    const map = {}
    records.forEach(r => {
      const d = toDate(r.timestamp)
      if (!d) return
      const key = format(d, 'MMM dd')
      map[key] = (map[key] || 0) + 1
    })
    return Object.entries(map).map(([date, count]) => ({ date, count })).slice(-14)
  }, [records])

  const bankStats = useMemo(() => {
    const map = {}
    records.forEach(r => {
      if (r.bank?.trim()) map[r.bank.trim()] = (map[r.bank.trim()] || 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [records])

  const completionRate = records.length ? Math.round((records.filter(r => r.vin || r.nin).length / records.length) * 100) : 0
  const withBank = records.length ? Math.round((records.filter(r => r.accountNumber).length / records.length) * 100) : 0
  const fromGoogleForm = records.filter(r => r.source === 'google_form').length
  const fromDeofForm = records.filter(r => !r.source || r.source !== 'google_form').length

  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      await deleteDoc(doc(db, 'enrollments', deleteTarget))
      toast.success('Record deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Delete failed')
    } finally {
      setDeleteLoading(false)
    }
  }

  const openEdit = (record) => {
    setEditTarget(record.id)
    setEditForm({
      name:          record.name || '',
      phone:         record.phone || '',
      lga:           record.lga || '',
      ward:          record.ward || '',
      pollingUnit:   record.pollingUnit || '',
      accountNumber: record.accountNumber || '',
      bank:          record.bank || '',
      vin:           record.vin || '',
      nin:           record.nin || '',
    })
  }

  const handleEditChange = (e) => {
    const { name, value } = e.target
    setEditForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'lga' ? { ward: '' } : {}),
    }))
  }

  const handleEditSave = async () => {
    if (!editForm.name.trim() || !editForm.phone.trim() || !editForm.lga || !editForm.ward) {
      toast.error('Name, Phone, LGA and Ward are required')
      return
    }
    setEditSaving(true)
    try {
      await updateDoc(doc(db, 'enrollments', editTarget), {
        name:          editForm.name.trim(),
        phone:         editForm.phone.trim(),
        lga:           editForm.lga,
        ward:          editForm.ward,
        pollingUnit:   editForm.pollingUnit.trim(),
        accountNumber: editForm.accountNumber.trim(),
        bank:          editForm.bank.trim(),
        vin:           editForm.vin.trim(),
        nin:           editForm.nin.trim(),
      })
      toast.success('Record updated successfully')
      setEditTarget(null)
    } catch (err) {
      toast.error('Update failed. Please try again.')
    } finally {
      setEditSaving(false)
    }
  }

  const exportCSV = () => {
    setExportLoading(true)
    const headers = ['Timestamp', 'Name', 'Phone', 'LGA', 'Ward', 'Polling Unit', 'Account Number', 'Bank', 'VIN', 'NIN']
    const rows = filtered.map(r => [
      toDate(r.timestamp) ? format(toDate(r.timestamp), 'yyyy-MM-dd HH:mm:ss') : '',
      r.name, r.phone, r.lga, r.ward, r.pollingUnit, r.accountNumber, r.bank, r.vin, r.nin
    ].map(v => `"${v || ''}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `deof-members-${format(new Date(), 'yyyyMMdd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExportLoading(false)
    toast.success('Export complete!')
  }

  const clearFilters = () => {
    setFilters({ lga: '', ward: '', pollingUnit: '', search: '', source: '' })
    setPage(1)
  }

  // Reset to page 1 whenever filters/sort change
  const setFiltersAndReset = (fn) => { setFilters(fn); setPage(1) }

  const fmtDate = (ts) => {
    const d = toDate(ts)
    return d ? format(d, 'dd MMM yyyy, HH:mm') : '—'
  }

  // Excel serial date → JS Date
  const excelDateToISO = (serial) => {
    if (!serial || isNaN(serial)) return null
    const utc = Math.round((serial - 25569) * 86400 * 1000)
    return new Date(utc)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      import('xlsx').then(XLSX => {
        const wb = XLSX.read(evt.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1 })
        const rows = raw.slice(1).filter(r => r[1]) // skip header, require name
        const parsed = rows.map(r => ({
          timestamp:     excelDateToISO(r[0]),
          name:          String(r[1] || '').trim(),
          phone:         String(r[2] || '').trim(),
          lga:           String(r[3] || '').trim(),
          ward:          String(r[4] || '').trim(),
          pollingUnit:   String(r[5] || '').trim(),
          accountNumber: String(r[6] || '').trim(),
          bank:          String(r[7] || '').trim(),
          vin:           String(r[8] || '').trim(),
          nin:           String(r[9] || '').trim(),
          source:        'google_form',
        }))
        setImportRows(parsed)
        setImportStatus('previewing')
        setImportResult({ imported: 0, skipped: 0, errors: 0 })
        setImportProgress(0)
      })
    }
    reader.readAsArrayBuffer(file)
  }

  const runImport = async () => {
    setImportStatus('importing')
    let imported = 0, skipped = 0, errors = 0

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i]
      try {
        // Deduplicate by phone number
        if (row.phone) {
          const snap = await getDocs(
            query(collection(db, 'enrollments'), where('phone', '==', row.phone))
          )
          if (!snap.empty) { skipped++; setImportProgress(Math.round(((i + 1) / importRows.length) * 100)); continue }
        }
        await addDoc(collection(db, 'enrollments'), {
          ...row,
          timestamp: row.timestamp ? { seconds: Math.floor(row.timestamp.getTime() / 1000), nanoseconds: 0 } : serverTimestamp(),
        })
        imported++
      } catch (err) {
        console.error('Import error row', i, err)
        errors++
      }
      setImportProgress(Math.round(((i + 1) / importRows.length) * 100))
    }
    setImportResult({ imported, skipped, errors })
    setImportStatus('done')
    if (imported > 0) toast.success(`${imported} records imported successfully!`)
  }

  const resetImport = () => {
    setImportRows([])
    setImportStatus(null)
    setImportProgress(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className={styles.layout}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarMobileOpen : ''}`}>
        <div className={styles.sidebarTop}>
          <img src="/deof_logo.jpeg" alt="DEOF" className={styles.sidebarLogo} />
          <div>
            <div className={styles.sidebarTitle}>DEOF Admin</div>
            <div className={styles.sidebarSub}>Management Portal</div>
          </div>
        </div>
        <nav className={styles.nav}>
          {TABS.map(t => (
            <button key={t} className={`${styles.navItem} ${tab === t ? styles.navActive : ''}`} onClick={() => { setTab(t); setSidebarOpen(false) }}>
              <span className={styles.navIcon}>{t === 'Overview' ? '⊞' : t === 'Members' ? '👥' : t === 'Analytics' ? '📊' : '📥'}</span>
              {t}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>{user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}</div>
            <div>
              <div className={styles.userName}>{user?.displayName || 'Admin'}</div>
              <div className={styles.userEmail}>{user?.email}</div>
            </div>
          </div>
          <div className={styles.sidebarLinks}>
            <Link to="/" target="_blank" className={styles.sidebarLink}>🔗 View Form</Link>
            <button onClick={handleSignOut} className={styles.signOutBtn}>⏻ Sign Out</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle}>{tab}</h1>
            <p className={styles.pageSub}>
              {tab === 'Overview' && 'Real-time membership statistics'}
              {tab === 'Members' && `${filtered.length} records ${filtered.length !== records.length ? `(${records.length} total)` : ''}`}
              {tab === 'Analytics' && 'Visual insights on enrollment data'}
              {tab === 'Import' && 'Bulk import from Google Form Excel export'}
            </p>
          </div>
          <div className={styles.topBarActions}>
            <button className={styles.hamburger} onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
              <span /><span /><span />
            </button>
            <div className={styles.liveIndicator}><span className={styles.liveDot} />Live</div>
            <button className="btn btn-accent btn-sm" onClick={exportCSV} disabled={exportLoading}>
              {exportLoading ? <><span className="btn-spinner" /> Exporting...</> : '⬇ Export'}
            </button>
          </div>
        </div>

        {/* IMPORT TAB */}
        {tab === 'Import' && (
          <div className={styles.content}>
            <div className="card" style={{ maxWidth: 680 }}>
              <h3 className={styles.cardTitle}>Import from Google Form / Excel</h3>
              <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20, lineHeight: 1.6 }}>
                Upload the Excel (.xlsx) file downloaded from your Google Form responses sheet.
                The system will automatically map columns, convert timestamps, and skip any records
                whose phone number already exists in the database to prevent duplicates.
              </p>

              {/* Column map reference */}
              <div className={styles.colMapTable}>
                <div className={styles.colMapTitle}>Expected Column Order</div>
                <div className={styles.colMapGrid}>
                  {[['A','Timestamp'],['B','Name'],['C','Phone Number'],['D','Local Government'],['E','Ward'],['F','Polling Unit'],['G','Account Number'],['H','Bank'],['I','VIN'],['J','NIN']]
                    .map(([col, field]) => (
                      <div key={col} className={styles.colMapRow}>
                        <span className={styles.colMapCol}>{col}</span>
                        <span className={styles.colMapField}>{field}</span>
                      </div>
                    ))}
                </div>
              </div>

              {importStatus === null && (
                <div className={styles.uploadArea} onClick={() => fileRef.current?.click()}>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
                  <div className={styles.uploadIcon}>📂</div>
                  <p className={styles.uploadText}>Click to select Excel file</p>
                  <p className={styles.uploadSub}>.xlsx or .xls from Google Sheets export</p>
                </div>
              )}

              {importStatus === 'previewing' && (
                <div>
                  <div className={styles.previewHeader}>
                    <span className={styles.previewCount}>{importRows.length} rows detected</span>
                    <button className="btn btn-outline btn-sm" onClick={resetImport}>✕ Clear</button>
                  </div>
                  <div className={styles.tableWrapper} style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 20 }}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>#</th><th>Name</th><th>Phone</th><th>LGA</th><th>Ward</th><th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((r, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td className={styles.nameCell}>{r.name}</td>
                            <td>{r.phone}</td>
                            <td><span className="badge badge-info">{r.lga}</span></td>
                            <td>{r.ward}</td>
                            <td className={styles.dateCell}>{r.timestamp ? format(r.timestamp, 'dd MMM yyyy') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className={styles.importActions}>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>Duplicates (same phone number) will be automatically skipped.</p>
                    <button className="btn btn-primary" onClick={runImport}>🚀 Import {importRows.length} Records</button>
                  </div>
                </div>
              )}

              {importStatus === 'importing' && (
                <div className={styles.importingState}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${importProgress}%` }} />
                  </div>
                  <p>{importProgress}% — Importing records, please wait...</p>
                </div>
              )}

              {importStatus === 'done' && (
                <div className={styles.importDone}>
                  <div className={styles.importDoneGrid}>
                    <div className={styles.importStat} style={{ background: '#dcfce7', color: '#15803d' }}>
                      <strong>{importResult.imported}</strong><span>Imported</span>
                    </div>
                    <div className={styles.importStat} style={{ background: '#fef3c7', color: '#92400e' }}>
                      <strong>{importResult.skipped}</strong><span>Skipped (duplicate)</span>
                    </div>
                    <div className={styles.importStat} style={{ background: '#fee2e2', color: '#991b1b' }}>
                      <strong>{importResult.errors}</strong><span>Errors</span>
                    </div>
                  </div>
                  <button className="btn btn-outline" onClick={resetImport} style={{ marginTop: 16 }}>Import Another File</button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'Overview' && (
          <div className={styles.content}>
            <div className={styles.statsGrid}>
              <div className={`${styles.statCard} ${styles.statBlue}`}>
                <div className={styles.statIcon}>👥</div>
                <div className={styles.statVal}>{records.length}</div>
                <div className={styles.statLabel}>Total Members</div>
              </div>
              <div className={`${styles.statCard} ${styles.statGold}`}>
                <div className={styles.statIcon}>🗺</div>
                <div className={styles.statVal}>{lgaStats.length}</div>
                <div className={styles.statLabel}>LGAs Covered</div>
              </div>
              <div className={`${styles.statCard} ${styles.statGreen}`}>
                <div className={styles.statIcon}>🏛</div>
                <div className={styles.statVal}>{completionRate}%</div>
                <div className={styles.statLabel}>ID Completion Rate</div>
              </div>
              <div className={`${styles.statCard} ${styles.statPurple}`}>
                <div className={styles.statIcon}>🏦</div>
                <div className={styles.statVal}>{withBank}%</div>
                <div className={styles.statLabel}>With Bank Details</div>
              </div>
              <div className={`${styles.statCard} ${styles.statTeal}`}>
                <div className={styles.statIcon}>📋</div>
                <div className={styles.statVal}>{fromDeofForm}</div>
                <div className={styles.statLabel}>Via DEOF Form</div>
              </div>
              <div className={`${styles.statCard} ${styles.statOrange}`}>
                <div className={styles.statIcon}>🔗</div>
                <div className={styles.statVal}>{fromGoogleForm}</div>
                <div className={styles.statLabel}>Via Google Form</div>
              </div>
            </div>

            <div className={styles.overviewGrid}>
              <div className="card">
                <h3 className={styles.cardTitle}>Registrations by LGA</h3>
                <div className={styles.lgaList}>
                  {lgaStats.map(({ name, value }) => (
                    <div key={name} className={styles.lgaRow}>
                      <span className={styles.lgaName}>{name}</span>
                      <div className={styles.lgaBar}>
                        <div className={styles.lgaBarFill} style={{ width: `${(value / records.length) * 100}%` }} />
                      </div>
                      <span className={styles.lgaCount}>{value}</span>
                    </div>
                  ))}
                  {!lgaStats.length && <p className={styles.empty}>No data yet</p>}
                </div>
              </div>

              <div className="card">
                <h3 className={styles.cardTitle}>Recent Registrations</h3>
                <div className={styles.recentList}>
                  {records.slice(0, 8).map(r => (
                    <div key={r.id} className={styles.recentItem}>
                      <div className={styles.recentAvatar}>{r.name?.[0]?.toUpperCase()}</div>
                      <div className={styles.recentInfo}>
                        <div className={styles.recentName}>{r.name}</div>
                        <div className={styles.recentMeta}>{r.lga} • {r.ward}</div>
                      </div>
                      <div className={styles.recentTime}>{fmtDate(r.timestamp)}</div>
                    </div>
                  ))}
                  {!records.length && <p className={styles.empty}>No registrations yet</p>}
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 20 }}>
              <h3 className={styles.cardTitle}>Daily Registrations (Last 14 Days)</h3>
              {dailyStats.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyStats}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="var(--primary)" radius={[4,4,0,0]} name="Registrations" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className={styles.empty}>No data yet</p>}
            </div>
          </div>
        )}

        {/* MEMBERS TAB */}
        {tab === 'Members' && (
          <div className={styles.content}>
            {/* Filters */}
            <div className={`card ${styles.filterBar}`}>
              <input type="text" placeholder="🔍  Search name, phone, NIN, VIN..." value={filters.search}
                onChange={e => setFiltersAndReset(p => ({ ...p, search: e.target.value }))} style={{ minWidth: 0, flex: '1 1 200px' }} />
              <select value={filters.lga} onChange={e => setFiltersAndReset(p => ({ ...p, lga: e.target.value, ward: '' }))} style={{ minWidth: 0, flex: '1 1 130px' }}>
                <option value="">All LGAs</option>
                {LGAS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={filters.ward} onChange={e => setFiltersAndReset(p => ({ ...p, ward: e.target.value }))} disabled={!filters.lga} style={{ minWidth: 0, flex: '1 1 130px' }}>
                <option value="">All Wards</option>
                {wardOptions.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <input type="text" placeholder="Polling unit..." value={filters.pollingUnit}
                onChange={e => setFiltersAndReset(p => ({ ...p, pollingUnit: e.target.value }))} style={{ minWidth: 0, flex: '1 1 120px' }} />
              <select value={filters.source} onChange={e => setFiltersAndReset(p => ({ ...p, source: e.target.value }))} style={{ minWidth: 0, flex: '1 1 120px' }}>
                <option value="">All Sources</option>
                <option value="deof_form">DEOF Form</option>
                <option value="google_form">Google Form</option>
              </select>
              {(filters.lga || filters.ward || filters.pollingUnit || filters.search || filters.source) && (
                <button className="btn btn-outline btn-sm" onClick={clearFilters}>✕ Clear</button>
              )}
            </div>

            {/* Table */}
            <div className={`card ${styles.tableCard}`}>
              {loading ? (
                <div className={styles.loadingMsg}>
                  <span className={styles.loadingSpinner} />
                  Loading records...
                </div>
              ) : filtered.length === 0 ? (
                <div className={styles.empty}>No records found</div>
              ) : (
                <>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th onClick={() => sort('timestamp')} className={styles.sortable}>Date{sortIcon('timestamp')}</th>
                          <th onClick={() => sort('name')} className={styles.sortable}>Name{sortIcon('name')}</th>
                          <th>Phone</th>
                          <th onClick={() => sort('lga')} className={styles.sortable}>LGA{sortIcon('lga')}</th>
                          <th onClick={() => sort('ward')} className={styles.sortable}>Ward{sortIcon('ward')}</th>
                          <th>Polling Unit</th>
                          <th>Account No.</th>
                          <th>Bank</th>
                          <th>VIN</th>
                          <th>NIN</th>
                          <th>Source</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map(r => (
                          <tr key={r.id}>
                            <td className={styles.dateCell}>{fmtDate(r.timestamp)}</td>
                            <td className={styles.nameCell}>{r.name}</td>
                            <td>{r.phone}</td>
                            <td><span className="badge badge-info">{r.lga}</span></td>
                            <td>{r.ward}</td>
                            <td>{r.pollingUnit || '—'}</td>
                            <td>{r.accountNumber || '—'}</td>
                            <td>{r.bank || '—'}</td>
                            <td className={styles.idCell}>{r.vin || '—'}</td>
                            <td className={styles.idCell}>{r.nin || '—'}</td>
                            <td>
                              {r.source === 'google_form'
                                ? <span className="badge badge-warning">Google Form</span>
                                : <span className="badge badge-success">DEOF Form</span>}
                            </td>
                            <td>
                              <div className={styles.actionBtns}>
                                <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} onClick={() => openEdit(r)}>✏ Edit</button>
                                <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(r.id)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className={styles.pagination}>
                    <span className={styles.pageInfo}>
                      Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} records
                    </span>
                    <div className={styles.pageButtons}>
                      <button className={styles.pageBtn} onClick={() => setPage(1)} disabled={page === 1} title="First page">
                        «
                      </button>
                      <button className={styles.pageBtn} onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                        ← Previous
                      </button>
                      <div className={styles.pageNumbers}>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                          .reduce((acc, p, idx, arr) => {
                            if (idx > 0 && arr[idx - 1] !== p - 1) acc.push('...')
                            acc.push(p)
                            return acc
                          }, [])
                          .map((p, i) => p === '...' ? (
                            <span key={`ellipsis-${i}`} className={styles.pageEllipsis}>…</span>
                          ) : (
                            <button key={p} className={`${styles.pageNumBtn} ${p === page ? styles.pageNumActive : ''}`} onClick={() => setPage(p)}>
                              {p}
                            </button>
                          ))
                        }
                      </div>
                      <button className={styles.pageBtn} onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
                        Next →
                      </button>
                      <button className={styles.pageBtn} onClick={() => setPage(totalPages)} disabled={page === totalPages} title="Last page">
                        »
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {tab === 'Analytics' && (
          <div className={styles.content}>
            <div className={styles.analyticsGrid}>
              <div className="card">
                <h3 className={styles.cardTitle}>Members per LGA</h3>
                {lgaStats.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={lgaStats} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip />
                      <Bar dataKey="value" fill="var(--primary)" radius={[0,4,4,0]} name="Members" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className={styles.empty}>No data yet</p>}
              </div>

              <div className="card">
                <h3 className={styles.cardTitle}>
                  Top Wards {filters.lga ? `— ${filters.lga}` : '(All LGAs)'}
                  {!filters.lga && <span style={{ fontSize: 12, color: 'var(--gray-400)', marginLeft: 8 }}>Filter by LGA to narrow down</span>}
                </h3>
                <div className={styles.filterRow}>
                  <select value={filters.lga} onChange={e => setFilters(p => ({ ...p, lga: e.target.value, ward: '' }))} style={{ maxWidth: 200 }}>
                    <option value="">All LGAs</option>
                    {LGAS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                {wardStats.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={wardStats} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                      <Tooltip />
                      <Bar dataKey="value" fill="var(--accent)" radius={[0,4,4,0]} name="Members" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className={styles.empty}>No data yet</p>}
              </div>

              <div className="card">
                <h3 className={styles.cardTitle}>LGA Distribution</h3>
                {lgaStats.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={lgaStats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {lgaStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className={styles.empty}>No data yet</p>}
              </div>

              <div className="card">
                <h3 className={styles.cardTitle}>Bank Distribution</h3>
                {bankStats.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={bankStats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}>
                        {bankStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className={styles.empty}>No bank data yet</p>}
              </div>

              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <h3 className={styles.cardTitle}>Registration Trend (Last 14 Days)</h3>
                {dailyStats.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dailyStats}>
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="var(--primary-light)" radius={[4,4,0,0]} name="Registrations" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className={styles.empty}>No data yet</p>}
              </div>

              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <h3 className={styles.cardTitle}>Data Completeness</h3>
                <div className={styles.completenessGrid}>
                  {[
                    { label: 'VIN Provided', count: records.filter(r => r.vin).length },
                    { label: 'NIN Provided', count: records.filter(r => r.nin).length },
                    { label: 'Bank Details', count: records.filter(r => r.accountNumber).length },
                    { label: 'Polling Unit', count: records.filter(r => r.pollingUnit).length },
                  ].map(({ label, count }) => (
                    <div key={label} className={styles.completeItem}>
                      <div className={styles.completeLabel}>{label}</div>
                      <div className={styles.completeBar}>
                        <div className={styles.completeBarFill} style={{ width: records.length ? `${(count / records.length) * 100}%` : '0%' }} />
                      </div>
                      <div className={styles.completeStat}>{count} / {records.length} ({records.length ? Math.round((count / records.length) * 100) : 0}%)</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Delete Modal */}
      {deleteTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Delete Record</h3>
            <p>Are you sure you want to permanently delete this record? This action cannot be undone.</p>
            <div className={styles.modalActions}>
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={!!deleteLoading}>
                {deleteLoading ? <><span className="btn-spinner" /> Deleting...</> : '🗑 Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null) }}>
          <div className={styles.editModal}>
            <div className={styles.editModalHeader}>
              <div>
                <h3>Edit Member Record</h3>
                <p>Update the member's information below</p>
              </div>
              <button className={styles.editModalClose} onClick={() => setEditTarget(null)}>✕</button>
            </div>

            <div className={styles.editModalBody}>
              <div className={styles.editSection}>
                <div className={styles.editSectionTitle}>Personal Information</div>
                <div className={styles.editGrid2}>
                  <div className={styles.editField}>
                    <label>Full Name <span className={styles.editReq}>*</span></label>
                    <input type="text" name="name" value={editForm.name} onChange={handleEditChange} placeholder="Full name" />
                  </div>
                  <div className={styles.editField}>
                    <label>Phone Number <span className={styles.editReq}>*</span></label>
                    <input type="tel" name="phone" value={editForm.phone} onChange={handleEditChange} placeholder="Phone number" />
                  </div>
                </div>
              </div>

              <div className={styles.editSection}>
                <div className={styles.editSectionTitle}>Location</div>
                <div className={styles.editGrid2}>
                  <div className={styles.editField}>
                    <label>Local Government Area <span className={styles.editReq}>*</span></label>
                    <select name="lga" value={editForm.lga} onChange={handleEditChange}>
                      <option value="">-- Select LGA --</option>
                      {LGAS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className={styles.editField}>
                    <label>Ward <span className={styles.editReq}>*</span></label>
                    <select name="ward" value={editForm.ward} onChange={handleEditChange} disabled={!editForm.lga}>
                      <option value="">{editForm.lga ? '-- Select Ward --' : 'Select LGA first'}</option>
                      {(editForm.lga ? LGA_WARDS[editForm.lga] : []).map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                </div>
                <div className={styles.editField} style={{ marginTop: 14 }}>
                  <label>Polling Unit</label>
                  <input type="text" name="pollingUnit" value={editForm.pollingUnit} onChange={handleEditChange} placeholder="Polling unit" />
                </div>
              </div>

              <div className={styles.editSection}>
                <div className={styles.editSectionTitle}>Bank Details</div>
                <div className={styles.editGrid2}>
                  <div className={styles.editField}>
                    <label>Account Number</label>
                    <input type="text" name="accountNumber" value={editForm.accountNumber} onChange={handleEditChange} placeholder="Account number" maxLength={10} />
                  </div>
                  <div className={styles.editField}>
                    <label>Bank Name</label>
                    <input type="text" name="bank" value={editForm.bank} onChange={handleEditChange} placeholder="e.g. UBA, GTBank" />
                  </div>
                </div>
              </div>

              <div className={styles.editSection}>
                <div className={styles.editSectionTitle}>Identification</div>
                <div className={styles.editGrid2}>
                  <div className={styles.editField}>
                    <label>VIN — Voter ID Number</label>
                    <input type="text" name="vin" value={editForm.vin} onChange={handleEditChange} placeholder="VIN" />
                  </div>
                  <div className={styles.editField}>
                    <label>NIN — National ID Number</label>
                    <input type="text" name="nin" value={editForm.nin} onChange={handleEditChange} placeholder="NIN" />
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.editModalFooter}>
              <button className="btn btn-outline" onClick={() => setEditTarget(null)} disabled={editSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? <><span className={styles.editSpinner} /> Saving...</> : '✓ Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
