import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../../firebase'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import styles from './Auth.module.css'

export default function AdminLogin() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, form.email, form.password)
      toast.success('Welcome back!')
      navigate('/admin/dashboard')
    } catch (err) {
      toast.error('Invalid email or password. Please try again.')
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
          <h3>Welcome Back</h3>
          <p>Sign in to access the admin dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Email Address</label>
            <div className={styles.inputWrap}>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="admin@deof.org"
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>Password</label>
            <div className={styles.inputWrap}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Enter your password"
                required
              />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPwd(v => !v)} tabIndex={-1} aria-label="Toggle password">
                {showPwd ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? <><span className={styles.spinner} /> Signing in...</> : 'Sign In →'}
          </button>
        </form>

        <div className={styles.divider}><span>or</span></div>

        <div className={styles.links}>
          <p>Don't have an account? <Link to="/admin/register">Create Account</Link></p>
          <p><Link to="/" className={styles.backLink}>← Back to Enrollment Form</Link></p>
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
