import { useEffect, useState, useMemo, useRef } from 'react'
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, addDoc, serverTimestamp, getDocs, where, updateDoc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth, storage } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { LGAS, LGA_WARDS } from '../../data/lgaData'
import toast from 'react-hot-toast'
import styles from './Dashboard.module.css'
import { ref, deleteObject } from 'firebase/storage'

const COLORS = ['#1a3a6b', '#c8972a', '#2563ab', '#16a34a', '#dc2626', '#7c3aed', '#0891b2']

const TABS = ['Overview', 'Members', 'Party Agents', 'Analytics', 'Import']

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
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState(TABS[0])
  const [records, setRecords] = useState([])
  const [partyAgents, setPartyAgents] = useState([])
  const [partyAgentsLoading, setPartyAgentsLoading] = useState(true)
  const [deleteAgentTarget, setDeleteAgentTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const userEmail = currentUser?.email

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!currentUser) {
      navigate('/login')
    }
  }, [currentUser, navigate])

  useEffect(() => {
    const q = query(collection(db, 'enrollments'), orderBy('timestamp', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })

    const agentsQuery = query(collection(db, 'partyAgents'), orderBy('timestamp', 'desc'))
    const unsubAgents = onSnapshot(agentsQuery, (snap) => {
      setPartyAgents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setPartyAgentsLoading(false)
    })

    return () => { unsub(); unsubAgents() }
  }, [])

  const handleDeleteAgent = async () => {
    if (!deleteAgentTarget) return
    setDeleteLoading(true)
    try {
      await Promise.all((deleteAgentTarget.uploads || []).map(async (upload) => {
        if (upload.path) await deleteObject(ref(storage, upload.path)).catch(() => {})
      }))
      await deleteDoc(doc(db, 'partyAgents', deleteAgentTarget.id))
      toast.success('Party agent deleted')
      setDeleteAgentTarget(null)
    } catch {
      toast.error('Delete failed')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      navigate('/login')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const renderContent = () => {
    switch (tab) {
      case 'Overview':
        return <div>Overview Content</div>
      case 'Members':
        return <div>Members Content</div>
      case 'Party Agents':
        return (
          <div className={styles.content}>
            <div className={`card ${styles.tableCard}`}>
              {partyAgentsLoading ? (
                <div className={styles.loadingMsg}><span className={styles.loadingSpinner} />Loading party agents...</div>
              ) : partyAgents.length === 0 ? (
                <div className={styles.empty}>No party agent submissions yet</div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead><tr>
                      <th>Submitted</th><th>Name</th><th>Phone</th><th>LGA</th><th>Ward</th><th>Polling Unit</th><th>Files</th><th>Type</th><th>Actions</th>
                    </tr></thead>
                    <tbody>
                      {partyAgents.map(agent => (
                        <tr key={agent.id}>
                          <td className={styles.dateCell}>{fmtDate(agent.timestamp)}</td>
                          <td className={styles.nameCell}>{agent.name}</td>
                          <td>{agent.phone}</td>
                          <td><span className="badge badge-info">{agent.lga}</span></td>
                          <td>{agent.ward}</td>
                          <td>{agent.pollingUnit}</td>
                          <td>{(agent.uploads || []).length ? (agent.uploads || []).map((upload, i) => (
                            <a key={`${agent.id}-${i}`} href={upload.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-light)', display: 'block', padding: '2px 0', textDecoration: 'none' }}>📎 {upload.name}</a>
                          )) : '—'}</td>
                          <td><span className="badge badge-warning">Party Agent</span></td>
                          <td><button className="btn btn-danger btn-sm" onClick={() => setDeleteAgentTarget(agent)}>🗑 Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      case 'Analytics':
        return <div>Analytics Content</div>
      case 'Import':
        return <div>Import Content</div>
      default:
        return null
    }
  }

  return (
    <div className={styles.dashboard}>
      <header>
        <h1>Welcome to the Dashboard</h1>
        <button onClick={handleSignOut}>Sign Out</button>
      </header>
      <nav>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? styles.active : ''}>
            <span className={styles.navIcon}>{t === 'Overview' ? '⊞' : t === 'Members' ? '👥' : t === 'Party Agents' ? '🗳️' : t === 'Analytics' ? '📊' : '📥'}</span>
            {t}
          </button>
        ))}
      </nav>
      <main>{renderContent()}</main>

      {deleteAgentTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Delete Party Agent</h3>
            <p>Delete {deleteAgentTarget.name}'s submission and all uploaded files? This action cannot be undone.</p>
            <div className={styles.modalActions}>
              <button className="btn btn-outline" onClick={() => setDeleteAgentTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteAgent} disabled={deleteLoading}>{deleteLoading ? 'Deleting...' : '🗑 Delete Agent'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
    </div>
  )
}
