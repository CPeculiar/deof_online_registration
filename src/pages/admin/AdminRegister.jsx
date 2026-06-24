import { useState } from 'react'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth } from '../../firebase'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import styles from './Auth.module.css'

export default function AdminRegister() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const passwordsMatch = form.confirm.length > 0 && form.password === form.confirm
  const passwordsMismatch = form.confirm.length > 0 && form.password !== form.confirm
  const passwordWeak = form.password.length > 0 && form.password.length < 6

  const getPasswordStrength = () => {
    const p = form.password
    if (!p) return null
    if (p.length < 6) return { label: 'Too short', level: 1, color: '#dc2626' }
    if (p.length < 8) return { label: 'Weak', level: 2, color: '#d97706' }
    if (/[A-Z]/.test(p) && /[0-9]/.test(p)) return { label: 'Strong', level: 4, color: '#16a34a' }
    return { label: 'Good', level: 3, color: '#2563ab' }
  }

  const strength = getPasswordStrength()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (passwordsMismatch) { toast.error('Passwords do not match'); return }
    if (passwordWeak) { toast.error('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const { user } = await createUserWithEmailAndPassword(auth, form.email, form.password)
      await updateProfile(user, { displayName: form.name })
      toast.success('Account created successfully!')
      navigate('/admin/dashboard')
    } catch (err) {
      toast.error(err.code === 'auth/email-already-in-use' ? 'Email already in use' : 'Registration failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgBlob1} />
      <div className={styles.bgBlob2} />

      <div className={styles.card}>
        <div className={styles.logoArea}>
          <div className={styles.logoWrap}>
            <img src="/deof_logo.jpeg" alt="DEOF Logo" className={styles.logo} />
            <div className={styles.logoPulse} />
          </div>
          <div className={styles.badge}>Admin Portal</div>
          <h2>Dr. Ebuka Onunkwo Foundation</h2>
        </div>

        <div className={styles.formHeader}>
          <h3>Create Admin Account</h3>
          <p>Register to manage DEOF membership data</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Full Name</label>
            <div className={styles.inputWrap}>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Your full name" required />
            </div>
          </div>

          <div className={styles.field}>
            <label>Email Address</label>
            <div className={styles.inputWrap}>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="admin@deof.org" required />
            </div>
          </div>

          <div className={styles.field}>
            <label>Password</label>
            <div className={`${styles.inputWrap} ${passwordWeak ? styles.inputError : form.password.length >= 6 ? styles.inputSuccess : ''}`}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Min. 6 characters"
                required
              />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPwd(v => !v)} tabIndex={-1}>
                {showPwd ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
            {strength && (
              <div className={styles.strengthBar}>
                <div className={styles.strengthSegments}>
                  {[1,2,3,4].map(i => (
                    <div key={i} className={styles.strengthSeg} style={{ background: i <= strength.level ? strength.color : '#e5e7eb' }} />
                  ))}
                </div>
                <span style={{ color: strength.color }}>{strength.label}</span>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label>Confirm Password</label>
            <div className={`${styles.inputWrap} ${passwordsMismatch ? styles.inputError : passwordsMatch ? styles.inputSuccess : ''}`}>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={form.confirm}
                onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Re-enter your password"
                required
              />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                {showConfirm ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
            {passwordsMismatch && (
              <span className={styles.matchMsg} style={{ color: 'var(--danger)' }}>⚠ Passwords do not match</span>
            )}
            {passwordsMatch && (
              <span className={styles.matchMsg} style={{ color: 'var(--success)' }}>✓ Passwords match</span>
            )}
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading || passwordsMismatch || passwordWeak}>
            {loading ? <><span className={styles.spinner} /> Creating account...</> : 'Create Account →'}
          </button>
        </form>

        <div className={styles.divider}><span>or</span></div>

        <div className={styles.links}>
          <p>Already have an account? <Link to="/admin/login">Sign In</Link></p>
        </div>
      </div>
    </div>
  )
}

function EyeOn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
