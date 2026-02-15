import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchInvite, unlockInvite } from '../lib/api'

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
    <section className="unlock">
      <p className="eyebrow">Dealer Access</p>
      <h2>Unlock Invitation</h2>
      <p className="text-muted">Invite token: <code>{token}</code></p>
      {inviteMeta ? (
        <p className="text-muted">Dealer: {inviteMeta.dealer_name} | Package: {inviteMeta.bid_package_name}</p>
      ) : null}
      <label>
        Password
        <input
          type="password"
          placeholder="Enter invite password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleUnlock()
          }}
        />
      </label>
      <button className="btn btn-primary" onClick={handleUnlock} disabled={loading || !password}>Unlock</button>
      <p className="text-muted">{statusMessage}</p>
    </section>
  )
}
