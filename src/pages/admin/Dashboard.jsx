import { useEffect, useState, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore'
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

const TABS = ['Overview', 'Members', 'Analytics']

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Overview')
  const [filters, setFilters] = useState({ lga: '', ward: '', pollingUnit: '', search: '' })
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', dir: 'desc' })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [exportLoading, setExportLoading] = useState(false)

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
    if (filters.lga) data = data.filter(r => r.lga === filters.lga)
    if (filters.ward) data = data.filter(r => r.ward === filters.ward)
    if (filters.pollingUnit) data = data.filter(r => r.pollingUnit?.toLowerCase().includes(filters.pollingUnit.toLowerCase()))
    if (filters.search) {
      const s = filters.search.toLowerCase()
      data = data.filter(r =>
        r.name?.toLowerCase().includes(s) ||
        r.phone?.toLowerCase().includes(s) ||
        r.nin?.toLowerCase().includes(s) ||
        r.vin?.toLowerCase().includes(s)
      )
    }
    data.sort((a, b) => {
      let av = a[sortConfig.key], bv = b[sortConfig.key]
      if (sortConfig.key === 'timestamp') {
        av = a.timestamp?.seconds || 0
        bv = b.timestamp?.seconds || 0
      }
      if (av < bv) return sortConfig.dir === 'asc' ? -1 : 1
      if (av > bv) return sortConfig.dir === 'asc' ? 1 : -1
      return 0
    })
    return data
  }, [records, filters, sortConfig])

  const sort = (key) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const sortIcon = (key) => {
    if (sortConfig.key !== key) return ' ↕'
    return sortConfig.dir === 'asc' ? ' ↑' : ' ↓'
  }

  // Analytics data
  const lgaStats = useMemo(() => {
    const map = {}
    records.forEach(r => { if (r.lga) map[r.lga] = (map[r.lga] || 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [records])

  const wardStats = useMemo(() => {
    const lga = filters.lga || null
    const map = {}
    records.filter(r => !lga || r.lga === lga).forEach(r => {
      if (r.ward) map[r.ward] = (map[r.ward] || 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10)
  }, [records, filters.lga])

  const dailyStats = useMemo(() => {
    const map = {}
    records.forEach(r => {
      if (!r.timestamp) return
      const d = format(new Date(r.timestamp.seconds * 1000), 'MMM dd')
      map[d] = (map[d] || 0) + 1
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

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'enrollments', deleteTarget))
      toast.success('Record deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Delete failed')
    }
  }

  const exportCSV = () => {
    setExportLoading(true)
    const headers = ['Timestamp', 'Name', 'Phone', 'LGA', 'Ward', 'Polling Unit', 'Account Number', 'Bank', 'VIN', 'NIN']
    const rows = filtered.map(r => [
      r.timestamp ? format(new Date(r.timestamp.seconds * 1000), 'yyyy-MM-dd HH:mm:ss') : '',
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

  const clearFilters = () => setFilters({ lga: '', ward: '', pollingUnit: '', search: '' })

  const fmtDate = (ts) => ts?.seconds ? format(new Date(ts.seconds * 1000), 'dd MMM yyyy, HH:mm') : '—'

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <img src="/deof_logo.jpeg" alt="DEOF" className={styles.sidebarLogo} />
          <div>
            <div className={styles.sidebarTitle}>DEOF Admin</div>
            <div className={styles.sidebarSub}>Management Portal</div>
          </div>
        </div>
        <nav className={styles.nav}>
          {TABS.map(t => (
            <button key={t} className={`${styles.navItem} ${tab === t ? styles.navActive : ''}`} onClick={() => setTab(t)}>
              <span className={styles.navIcon}>{t === 'Overview' ? '⊞' : t === 'Members' ? '👥' : '📊'}</span>
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
            </p>
          </div>
          <div className={styles.topBarActions}>
            <div className={styles.liveIndicator}><span className={styles.liveDot} />Live</div>
            <button className="btn btn-accent btn-sm" onClick={exportCSV} disabled={exportLoading}>
              ⬇ Export CSV
            </button>
          </div>
        </div>

        {/* OVERVIEW TAB */}
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
                onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} style={{ maxWidth: 280 }} />
              <select value={filters.lga} onChange={e => setFilters(p => ({ ...p, lga: e.target.value, ward: '' }))}>
                <option value="">All LGAs</option>
                {LGAS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={filters.ward} onChange={e => setFilters(p => ({ ...p, ward: e.target.value }))} disabled={!filters.lga}>
                <option value="">All Wards</option>
                {wardOptions.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <input type="text" placeholder="Polling unit..." value={filters.pollingUnit}
                onChange={e => setFilters(p => ({ ...p, pollingUnit: e.target.value }))} style={{ maxWidth: 180 }} />
              {(filters.lga || filters.ward || filters.pollingUnit || filters.search) && (
                <button className="btn btn-outline btn-sm" onClick={clearFilters}>✕ Clear</button>
              )}
            </div>

            {/* Table */}
            <div className={`card ${styles.tableCard}`}>
              {loading ? (
                <div className={styles.loadingMsg}>Loading records...</div>
              ) : filtered.length === 0 ? (
                <div className={styles.empty}>No records found</div>
              ) : (
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
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(r => (
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
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(r.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
