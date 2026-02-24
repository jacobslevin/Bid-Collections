import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchInvite, unlockInvite } from '../lib/api'
import dpLogo from '../assets/vendor-bid/dp-logo.svg'

export default function DealerUnlockPage() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [statusMessage, setStatusMessage] = useState('Enter password to unlock this invite.')
  const [loading, setLoading] = useState(false)
  const [inviteMeta, setInviteMeta] = useState(null)

  useEffect(() => {
    let active = true

    async function loadInvite() {
      try {
        const result = await fetchInvite(token)
        if (!active) return

        setInviteMeta(result.invite)
        if (result.invite?.unlocked) {
          navigate(`/invite/${token}/bid`)
        }
      } catch (error) {
        if (!active) return
        setStatusMessage(error.message)
      }
    }

    loadInvite()
    return () => {
      active = false
    }
  }, [navigate, token])

  const handleUnlock = async () => {
    if (!password) return

    setLoading(true)
    setStatusMessage('Unlocking invite...')

    try {
      await unlockInvite(token, password)
      setStatusMessage('Unlocked. Redirecting...')
      navigate(`/invite/${token}/bid`)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="vendor-unlock-page">
      <div className="vendor-unlock-overlay" />
      <div className="vendor-unlock-content">
        <img src={dpLogo} alt="Designer Pages PRO" className="vendor-unlock-logo" />
        <p className="vendor-unlock-kicker">
          {inviteMeta?.project_name && inviteMeta?.bid_package_name
            ? `${inviteMeta.project_name}: ${inviteMeta.bid_package_name}`
            : (inviteMeta?.bid_package_name || 'PROJECT BID')}
        </p>

        <div className="vendor-unlock-card">
          <h2>Bidder Access</h2>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleUnlock()
            }}
          />
          <button className="vendor-unlock-btn" onClick={handleUnlock} disabled={loading || !password}>ACCESS</button>
          <p className="text-muted vendor-unlock-status">{statusMessage}</p>
        </div>
      </div>
    </section>
  )
}
