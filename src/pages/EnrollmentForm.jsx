import { useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { LGAS, LGA_WARDS } from '../data/lgaData'
import toast from 'react-hot-toast'
import styles from './EnrollmentForm.module.css'

const INITIAL = {
  name: '', phone: '', lga: '', ward: '', pollingUnit: '',
  accountNumber: '', bank: '', vin: '', nin: '',
}

export default function EnrollmentForm() {
  const [form, setForm] = useState(INITIAL)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const wards = form.lga ? LGA_WARDS[form.lga] : []

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Full name is required'
    if (!form.phone.trim()) e.phone = 'Phone number is required'
    if (!form.lga) e.lga = 'Please select your LGA'
    if (!form.ward) e.ward = 'Please select your ward'
    return e
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'lga' ? { ward: '' } : {}),
    }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)
    try {
      await addDoc(collection(db, 'enrollments'), {
        ...form,
        timestamp: serverTimestamp(),
      })
      setSubmitted(true)
    } catch (err) {
      console.error('Firestore error:', err.code, err.message)
      if (err.code === 'permission-denied') {
        toast.error('Permission denied. Contact the administrator.')
      } else {
        toast.error(`Submission failed: ${err.message}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
        <div className={styles.successCard}>
          <div className={styles.successRing}>
            <div className={styles.successIcon}>✓</div>
          </div>
          <h2>Registration Successful!</h2>
          <p>Thank you, <strong>{form.name}</strong>. Your DEOF membership registration has been received and recorded.</p>
          <div className={styles.successMeta}>
            <span>📍 {form.lga}</span>
            <span>🏛 {form.ward}</span>
          </div>
          <button className={styles.registerAnotherBtn} onClick={() => { setForm(INITIAL); setSubmitted(false) }}>
            + Register Another Member
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.blob1} />
      <div className={styles.blob2} />

      <div className={styles.formWrapper}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.logoWrap}>
              <img src="/deof_logo.jpeg" alt="DEOF Logo" className={styles.logo} />
              <div className={styles.logoPulse} />
            </div>
            <div className={styles.headerText}>
              <div className={styles.headerBadge}>Official Registration</div>
              <h1>DEOF Enrollment Form</h1>
              <p>Dr. Ebuka Onunkwo Foundation Membership Registration</p>
            </div>
          </div>
          <div className={styles.headerNote}>
            <span>Fields marked <strong>*</strong> are required</span>
            <span>🔒 Your data is encrypted and secure</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>

          {/* Personal Information */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>👤</span>
              Personal Information
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Full Name <span className={styles.req}>*</span></label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  className={errors.name ? styles.inputErr : form.name ? styles.inputOk : ''}
                />
                {errors.name && <span className={styles.errMsg}>⚠ {errors.name}</span>}
              </div>
              <div className={styles.field}>
                <label>Phone Number <span className={styles.req}>*</span></label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="e.g. 08012345678"
                  className={errors.phone ? styles.inputErr : form.phone ? styles.inputOk : ''}
                />
                {errors.phone && <span className={styles.errMsg}>⚠ {errors.phone}</span>}
              </div>
            </div>
          </div>

          {/* Location */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>📍</span>
              Location Details
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Local Government Area <span className={styles.req}>*</span></label>
                <select
                  name="lga"
                  value={form.lga}
                  onChange={handleChange}
                  className={errors.lga ? styles.inputErr : form.lga ? styles.inputOk : ''}
                >
                  <option value="">-- Select your LGA --</option>
                  {LGAS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                {errors.lga && <span className={styles.errMsg}>⚠ {errors.lga}</span>}
              </div>
              <div className={styles.field}>
                <label>Ward <span className={styles.req}>*</span></label>
                <select
                  name="ward"
                  value={form.ward}
                  onChange={handleChange}
                  disabled={!form.lga}
                  className={`${!form.lga ? styles.selectDisabled : ''} ${errors.ward ? styles.inputErr : form.ward ? styles.inputOk : ''}`}
                >
                  <option value="">{form.lga ? '-- Select your Ward --' : 'Select LGA first'}</option>
                  {wards.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                {errors.ward && <span className={styles.errMsg}>⚠ {errors.ward}</span>}
                {!form.lga && <span className={styles.hint}>💡 Select an LGA to see ward options</span>}
              </div>
            </div>
            <div className={styles.field} style={{ marginTop: 16 }}>
              <label>Polling Unit <span className={styles.optional}>(optional)</span></label>
              <input
                type="text"
                name="pollingUnit"
                value={form.pollingUnit}
                onChange={handleChange}
                placeholder="Enter your polling unit"
              />
            </div>
          </div>

          {/* Bank Details */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>🏦</span>
              Bank Details <span className={styles.sectionOptional}>(optional)</span>
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Account Number</label>
                <input
                  type="text"
                  name="accountNumber"
                  value={form.accountNumber}
                  onChange={handleChange}
                  placeholder="10-digit account number"
                  maxLength={10}
                />
              </div>
              <div className={styles.field}>
                <label>Bank Name</label>
                <input
                  type="text"
                  name="bank"
                  value={form.bank}
                  onChange={handleChange}
                  placeholder="e.g. UBA, GTBank"
                />
              </div>
            </div>
          </div>

          {/* Identification */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>🪪</span>
              Identification <span className={styles.sectionOptional}>(optional)</span>
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>VIN — Voter ID Number</label>
                <input
                  type="text"
                  name="vin"
                  value={form.vin}
                  onChange={handleChange}
                  placeholder="Enter your VIN"
                />
              </div>
              <div className={styles.field}>
                <label>NIN — National ID Number</label>
                <input
                  type="text"
                  name="nin"
                  value={form.nin}
                  onChange={handleChange}
                  placeholder="Enter your NIN"
                />
              </div>
            </div>
          </div>

          <div className={styles.submitRow}>
            <p className={styles.privacyNote}>🔒 Your information is secure and will only be used for DEOF membership purposes.</p>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? <><span className={styles.spinner} /> Submitting...</> : '🚀 Submit Registration'}
            </button>
          </div>
        </form>

        <div className={styles.footer}>
          <span>© {new Date().getFullYear()} Dr. Ebuka Onunkwo Foundation. All rights reserved.</span>
        </div>
      </div>
    </div>
  )
}
