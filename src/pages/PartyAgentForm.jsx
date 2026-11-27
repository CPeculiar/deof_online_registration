import { useState } from 'react'
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { LGAS, LGA_WARDS } from '../data/lgaData'
import toast from 'react-hot-toast'
import styles from './EnrollmentForm.module.css'

const INITIAL = { name: '', phone: '', lga: '', ward: '', pollingUnit: '' }

const UPLOAD_URL = import.meta.env.VITE_AGENT_UPLOAD_URL
const UPLOAD_KEY = import.meta.env.VITE_AGENT_UPLOAD_KEY
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_FILES = 10
const EXT_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const mimeOf = (file) => file.type || EXT_TYPES[file.name.split('.').pop().toLowerCase()] || ''

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
  reader.readAsDataURL(file)
})

// Sends one file to the Google Apps Script web app, which saves it to Google Drive.
// text/plain avoids a CORS preflight, which Apps Script does not support.
const uploadToDrive = async (file, folderName) => {
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      key: UPLOAD_KEY,
      folderName,
      fileName: file.name,
      mimeType: mimeOf(file),
      data: await toBase64(file),
    }),
  })
  const out = await res.json().catch(() => ({ ok: false, error: `Upload server error (${res.status})` }))
  if (!out.ok) throw new Error(`${file.name}: ${out.error || 'upload failed'}`)
  return out
}

export default function PartyAgentForm() {
  const [form, setForm] = useState(INITIAL)
  const [files, setFiles] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const wards = form.lga ? LGA_WARDS[form.lga] : []

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.phone.trim()) e.phone = 'Phone number is required'
    if (!form.lga) e.lga = 'Please select an LGA'
    if (!form.ward) e.ward = 'Please select a ward'
    if (!form.pollingUnit.trim()) e.pollingUnit = 'Polling unit is required'
    if (!files.length) e.files = 'Please upload at least one file'
    else if (files.length > MAX_FILES) e.files = `You can upload at most ${MAX_FILES} files`
    else if (files.some(f => f.size > MAX_FILE_BYTES)) e.files = 'Each file must be 10 MB or smaller'
    else if (files.some(f => !mimeOf(f))) e.files = 'Only PDF, Word, JPG and PNG files are allowed'
    return e
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value, ...(name === 'lga' ? { ward: '' } : {}) }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const handleFiles = (e) => {
    const selected = Array.from(e.target.files || [])
    setFiles(selected)
    if (selected.length && errors.files) setErrors(prev => ({ ...prev, files: '' }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    if (!UPLOAD_URL || !UPLOAD_KEY) {
      toast.error('File upload is not configured. Contact the administrator.')
      return
    }

    setSubmitting(true)
    try {
      const agentRef = doc(collection(db, 'partyAgents'))
      const folderName = `${form.lga} - ${form.ward} - ${form.name.trim()} - ${agentRef.id}`
      const uploads = []

      for (const file of files) {
        const saved = await uploadToDrive(file, folderName)
        uploads.push({
          name: file.name,
          type: mimeOf(file),
          size: file.size,
          driveFileId: saved.id,
          url: saved.url,
          folderUrl: saved.folderUrl,
        })
      }

      await setDoc(agentRef, {
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
        pollingUnit: form.pollingUnit.trim(),
        uploads,
        submissionType: 'party_agent',
        timestamp: serverTimestamp(),
      })
      setSubmitted(true)
    } catch (err) {
      console.error('Party agent submission error:', err)
      toast.error(`Submission failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.blob1} /><div className={styles.blob2} />
        <div className={styles.successCard}>
          <div className={styles.successRing}><div className={styles.successIcon}>✓</div></div>
          <h2>Party Agent Submitted!</h2>
          <p>Thank you, <strong>{form.name}</strong>. Your party agent information and uploads have been received.</p>
          <div className={styles.successMeta}><span>📍 {form.lga}</span><span>🏛 {form.ward}</span></div>
          <button className={styles.registerAnotherBtn} onClick={() => { setForm(INITIAL); setFiles([]); setSubmitted(false) }}>
            + Submit Another Agent
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.blob1} /><div className={styles.blob2} />
      <div className={styles.formWrapper}>
        <div className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.logoWrap}><img src="/deof_logo.jpeg" alt="DEOF Logo" className={styles.logo} /></div>
            <div className={styles.headerText}>
              <div className={styles.headerBadge}>Party Agents</div>
              <h1>Party Agent Submission</h1>
              <p>Submit party agent details and supporting files</p>
            </div>
          </div>
          <div className={styles.headerNote}><span>Fields marked <strong>*</strong> are required</span></div>
        </div>

        <form onSubmit={submit} className={styles.form} noValidate>
          <div className={styles.section}>
            <div className={styles.sectionTitle}><span className={styles.sectionIcon}>👤</span>Agent Details</div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Name <span className={styles.req}>*</span></label>
                <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Enter full name" className={errors.name ? styles.inputErr : form.name ? styles.inputOk : ''} />
                {errors.name && <span className={styles.errMsg}>⚠ {errors.name}</span>}
              </div>
              <div className={styles.field}>
                <label>Phone Number <span className={styles.req}>*</span></label>
                <input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="e.g. 08012345678" className={errors.phone ? styles.inputErr : form.phone ? styles.inputOk : ''} />
                {errors.phone && <span className={styles.errMsg}>⚠ {errors.phone}</span>}
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}><span className={styles.sectionIcon}>📍</span>Location Details</div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>LGA <span className={styles.req}>*</span></label>
                <select name="lga" value={form.lga} onChange={handleChange} className={errors.lga ? styles.inputErr : form.lga ? styles.inputOk : ''}>
                  <option value="">-- Select LGA --</option>
                  {LGAS.map(lga => <option key={lga} value={lga}>{lga}</option>)}
                </select>
                {errors.lga && <span className={styles.errMsg}>⚠ {errors.lga}</span>}
              </div>
              <div className={styles.field}>
                <label>Ward <span className={styles.req}>*</span></label>
                <select name="ward" value={form.ward} onChange={handleChange} disabled={!form.lga} className={errors.ward ? styles.inputErr : form.ward ? styles.inputOk : ''}>
                  <option value="">{form.lga ? '-- Select Ward --' : 'Select LGA first'}</option>
                  {wards.map(ward => <option key={ward} value={ward}>{ward}</option>)}
                </select>
                {errors.ward && <span className={styles.errMsg}>⚠ {errors.ward}</span>}
              </div>
            </div>
            <div className={styles.field} style={{ marginTop: 16 }}>
              <label>Polling Unit <span className={styles.req}>*</span></label>
              <input type="text" name="pollingUnit" value={form.pollingUnit} onChange={handleChange} placeholder="Enter polling unit" className={errors.pollingUnit ? styles.inputErr : form.pollingUnit ? styles.inputOk : ''} />
              {errors.pollingUnit && <span className={styles.errMsg}>⚠ {errors.pollingUnit}</span>}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}><span className={styles.sectionIcon}>📎</span>Upload Files</div>
            <div className={styles.field}>
              <label>Supporting Documents <span className={styles.req}>*</span></label>
              <input type="file" multiple onChange={handleFiles} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className={errors.files ? styles.inputErr : ''} />
              {files.length > 0 && <span className={styles.hint}>Selected: {files.map(file => file.name).join(', ')}</span>}
              {errors.files && <span className={styles.errMsg}>⚠ {errors.files}</span>}
            </div>
          </div>

          <div className={styles.submitRow}>
            <p className={styles.privacyNote}>🔒 Uploaded files and agent details are stored securely.</p>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>{submitting ? <><span className={styles.spinner} /> Submitting...</> : 'Submit Party Agent'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
