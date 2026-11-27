import { useState } from 'react'
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'
import { LGAS, LGA_WARDS } from '../data/lgaData'
import toast from 'react-hot-toast'
import styles from './EnrollmentForm.module.css'

const INITIAL = { name: '', phone: '', lga: '', ward: '', pollingUnit: '' }

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

    setSubmitting(true)
    try {
      const agentRef = doc(collection(db, 'partyAgents'))
      const uploads = []

      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const fileRef = ref(storage, `partyAgents/${agentRef.id}/${Date.now()}_${safeName}`)
        await uploadBytes(fileRef, file)
        uploads.push({
          name: file.name,
          type: file.type,
          size: file.size,
          url: await getDownloadURL(fileRef),
          path: fileRef.fullPath,
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
      console.error('Party agent submission error:', err.code, err.message)
      toast.error(err.code === 'storage/unauthorized'
        ? 'File upload is not permitted. Contact the administrator.'
        : `Submission failed: ${err.message}`)
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
