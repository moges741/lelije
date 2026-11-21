import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../../api/client'
import type { Failure } from '../../api/http'
import { AuthShell, AuthTabs, Steps, type AuthRole } from '../../components/Auth'
import { Icon } from '../../components/Icon'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { PinPrompt } from '../../components/PinPrompt'
import { Panel, SecretField, TextField } from '../../components/TextField'
import { TopBar } from '../../components/TopBar'
import { useApp } from '../../context/app-context'
import { LANGUAGES, type TranslationKey } from '../../i18n'
import { failureKey } from '../../lib/failure'
import { looksLikeFamilyCode, normalizeFamilyCode } from '../../lib/familyCode'
import { isValidPin, PIN_LENGTH, pinDigits } from '../../lib/pin'
import { useRemote } from '../../lib/useRemote'
import { CHILD_AGES, type ChildRecord, type FamilyRecord, type FamilyWithChildren } from '../../types/account'

function accountErrorKey(error: Failure): TranslationKey {
  if (error === 'not_found') return 'invalidCode'
  if (error === 'invalid') return 'fieldRequired'
  return failureKey(error)
}

function useFamilyCode() {
  const { t } = useApp()
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const normalized = normalizeFamilyCode(code)
  const error = !normalized
    ? t('fieldRequired')
    : !looksLikeFamilyCode(normalized)
      ? t('codeFormat')
      : undefined
  return { code, setCode, normalized, error, touched, setTouched }
}

function ProfileList({ profiles, onPick }: { profiles: ChildRecord[]; onPick: (child: ChildRecord) => void }) {
  const { t } = useApp()
  if (profiles.length === 0) return <p className="lead">{t('noChildrenYet')}</p>
  return (
    <ul className="mission-list">
      {profiles.map((child) => (
        <li key={child.id}>
          <button type="button" className="mission-card" onClick={() => onPick(child)}>
            <span className="mission-icon">
              <Icon name="child" size={28} />
            </span>
            <span className="mission-body">
              <strong>{child.nickname || t('childProfile')}</strong>
              <span>
                {t('age')} {child.age}
              </span>
            </span>
            <span className="mission-go" aria-hidden="true">
              <Icon name="play" size={20} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function AgeChoices({ age, onChange }: { age: number; onChange: (age: number) => void }) {
  const { t } = useApp()
  return (
    <fieldset className="field">
      <legend>{t('age')}</legend>
      <div className="choices choices-grid">
        {CHILD_AGES.map((value) => (
          <button
            key={value}
            type="button"
            className={value === age ? 'choice is-on' : 'choice'}
            aria-pressed={value === age}
            onClick={() => onChange(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <p className="hint">{t('ageNote13')}</p>
    </fieldset>
  )
}

export function FamilyRegister() {
  const { t, setSession } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [ack, setAck] = useState(false)
  const [touched, setTouched] = useState({ name: false, pin: false, ack: false })
  const [error, setError] = useState<Failure | null>(null)
  const [busy, setBusy] = useState(false)

  const touch = (field: keyof typeof touched) => setTouched((state) => ({ ...state, [field]: true }))
  const nameError = !name.trim() ? t('fieldRequired') : undefined
  const pinError = !isValidPin(pin) ? t('pinInvalid') : undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched({ name: true, pin: true, ack: true })
    if (nameError || pinError || !ack) return
    setBusy(true)
    setError(null)
    const result = await api.createFamily(name.trim(), pin)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSession({ role: 'parent', family: result.data.family, child: null })
    navigate('/family', { replace: true })
  }

  return (
    <AuthShell
      backTo="/"
      badge={t('authFamilyBadge')}
      title={t('registerFamilyTitle')}
      lead={t('noPasswordBody')}
      tabs={<AuthTabs role="parent" active="register" />}
    >
      <Steps current={1} />
      <form className="auth-form" noValidate onSubmit={(event) => void submit(event)}>
        <TextField
          name="familyName"
          label={t('familyName')}
          hint={t('familyNameHint')}
          value={name}
          maxLength={40}
          autoComplete="organization"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => touch('name')}
          error={touched.name ? nameError : undefined}
        />
        <SecretField
          name="parentPin"
          inputMode="numeric"
          pattern="[0-9]*"
          label={t('pinLabel')}
          hint={t('pinHint')}
          value={pin}
          maxLength={PIN_LENGTH}
          autoComplete="new-password"
          onChange={(event) => setPin(pinDigits(event.target.value))}
          onBlur={() => touch('pin')}
          error={touched.pin ? pinError : undefined}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={ack}
            onChange={(event) => {
              setAck(event.target.checked)
              touch('ack')
            }}
          />
          <span>{t('privacyAgree')}</span>
        </label>
        {touched.ack && !ack && (
          <p className="field-error" role="alert">
            {t('ackRequired')}
          </p>
        )}
        {error && (
          <p className="banner banner-warn" role="alert">
            {t(accountErrorKey(error))}
          </p>
        )}
        <button type="submit" className="btn btn-sun btn-block" disabled={busy} aria-busy={busy}>
          {busy ? t('creating') : t('createFamily')}
        </button>
      </form>
    </AuthShell>
  )
}

export function CodeHelp() {
  const { t } = useApp()
  return (
    <AuthShell backTo="/login" title={t('noPasswordTitle')} lead={t('lostCodeBody')}>
      <Link className="btn btn-sun btn-block" to="/login">
        {t('signIn')}
      </Link>
    </AuthShell>
  )
}

/** Grown-ups sign in with the code and the PIN; children with the code and their profile. */
export function Login() {
  const { t, setSession } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [role, setRole] = useState<AuthRole>(params.get('role') === 'child' ? 'child' : 'parent')
  const code = useFamilyCode()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Failure | null>(null)
  const [found, setFound] = useState<FamilyWithChildren | null>(null)

  const chooseRole = (next: AuthRole) => {
    setRole(next)
    setFound(null)
    setError(null)
  }

  const lookup = async (event: FormEvent) => {
    event.preventDefault()
    code.setTouched(true)
    if (code.error) return
    setBusy(true)
    setError(null)
    const result = await api.findFamily(code.normalized)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFound(result.data)
  }

  const pick = (family: FamilyRecord, child: ChildRecord) => {
    setSession({ role: 'child', family, child })
    navigate('/missions', { replace: true })
  }

  return (
    <AuthShell
      backTo="/"
      title={t('loginTitle')}
      lead={t('loginLead')}
      tabs={<AuthTabs role={role} active="login" />}
    >
      <div className="choices" role="group" aria-label={t('loginTitle')}>
        <button
          type="button"
          className={role === 'parent' ? 'choice is-on' : 'choice'}
          aria-pressed={role === 'parent'}
          onClick={() => chooseRole('parent')}
        >
          {t('roleParent')}
        </button>
        <button
          type="button"
          className={role === 'child' ? 'choice is-on' : 'choice'}
          aria-pressed={role === 'child'}
          onClick={() => chooseRole('child')}
        >
          {t('roleChild')}
        </button>
      </div>
      <form className="auth-form" noValidate onSubmit={(event) => void lookup(event)}>
        <TextField
          name="familyCode"
          label={t('familyCode')}
          hint={t('familyCodeHint')}
          value={code.code}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            code.setCode(event.target.value.toUpperCase())
            setFound(null)
          }}
          onBlur={() => code.setTouched(true)}
          error={code.touched ? code.error : undefined}
        />
        {error && (
          <p className="banner banner-warn" role="alert">
            {t(accountErrorKey(error))}
          </p>
        )}
        <button type="submit" className="btn btn-sun btn-block" disabled={busy} aria-busy={busy}>
          {busy ? t('loading') : role === 'parent' ? t('signInParent') : t('signInChild')}
        </button>
      </form>
      <Link className="hint" to="/help/code">
        {t('lostCode')}
      </Link>

      {found && role === 'child' && (
        <section className="auth-profiles">
          <h2 className="panel-title">{t('pickChild')}</h2>
          <ProfileList profiles={found.children} onPick={(child) => pick(found.family, child)} />
          <Link className="btn btn-plain btn-block" to="/register/child" state={{ found }}>
            {t('newProfile')}
          </Link>
        </section>
      )}
      {found && role === 'parent' && (
        <PinPrompt
          family={found.family}
          action={(pin) => api.checkFamilyPin(found.family.code, pin)}
          onCancel={() => setFound(null)}
          onDone={(result) => {
            if (!result.ok) {
              setFound(null)
              setError(result.error)
              return
            }
            setSession({ role: 'parent', family: { ...found.family, hasPin: true }, child: null })
            navigate('/parent', { replace: true })
          }}
        />
      )}
    </AuthShell>
  )
}

function foundFromState(state: unknown): FamilyWithChildren | null {
  if (typeof state !== 'object' || state === null || !('found' in state)) return null
  return (state as { found: FamilyWithChildren }).found
}

/**
 * Child join flow: the family code, then pick an existing profile or make one
 * with an optional nickname and an age. The language follows the switcher.
 */
export function ChildJoin() {
  const { t, language, setSession } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [found, setFound] = useState(() => foundFromState(location.state))
  const code = useFamilyCode()
  const [nickname, setNickname] = useState('')
  const [age, setAge] = useState(8)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Failure | null>(null)

  const lookup = async (event: FormEvent) => {
    event.preventDefault()
    code.setTouched(true)
    if (code.error) return
    setBusy(true)
    setError(null)
    const result = await api.findFamily(code.normalized)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFound(result.data)
  }

  const enter = (family: FamilyRecord, child: ChildRecord) => {
    setSession({ role: 'child', family, child })
    navigate('/missions', { replace: true })
  }

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (!found) return
    setBusy(true)
    setError(null)
    const result = await api.addChild({ familyCode: found.family.code, age, language, nickname })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    enter(found.family, result.data)
  }

  return (
    <AuthShell
      backTo="/"
      badge={t('authChildBadge')}
      title={t('joinTitle')}
      lead={t('pathChildLead')}
      tabs={<AuthTabs role="child" active="register" />}
    >
      {!found ? (
        <>
          <form className="auth-form" noValidate onSubmit={(event) => void lookup(event)}>
            <TextField
              name="familyCode"
              label={t('familyCode')}
              hint={t('codeFormat')}
              value={code.code}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => code.setCode(event.target.value.toUpperCase())}
              onBlur={() => code.setTouched(true)}
              error={code.touched ? code.error : undefined}
            />
            {error && (
              <p className="banner banner-warn" role="alert">
                {t(accountErrorKey(error))}
              </p>
            )}
            <button type="submit" className="btn btn-sun btn-block" disabled={busy} aria-busy={busy}>
              {busy ? t('loading') : t('joinFamily')}
            </button>
          </form>
          <p className="hint">
            <Link to="/login?role=child">{t('haveProfile')}</Link>
          </p>
        </>
      ) : (
        <>
          <div className="join-family">
            <span>{t('joinWelcome')}</span>
            <strong>{found.family.name}</strong>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setFound(null)
                setError(null)
              }}
            >
              {t('changeCode')}
            </button>
          </div>
          {found.children.length > 0 && (
            <section className="auth-profiles">
              <h2 className="panel-title">{t('pickChild')}</h2>
              <ProfileList profiles={found.children} onPick={(child) => enter(found.family, child)} />
            </section>
          )}
          <form className="auth-form" onSubmit={(event) => void create(event)}>
            {found.children.length > 0 && <h2 className="panel-title">{t('newProfileTitle')}</h2>}
            <TextField
              name="nickname"
              label={t('nicknameOptional')}
              hint={t('nicknameHint')}
              value={nickname}
              maxLength={20}
              autoComplete="off"
              onChange={(event) => setNickname(event.target.value)}
            />
            <AgeChoices age={age} onChange={setAge} />
            {error && (
              <p className="banner banner-warn" role="alert">
                {t(accountErrorKey(error))}
              </p>
            )}
            <button type="submit" className="btn btn-sun btn-block" disabled={busy} aria-busy={busy}>
              {busy ? t('saving') : t('saveChild')}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  )
}

/** After creating the family: the code to share, and child profiles. */
export function FamilySetup() {
  const { t, language, session } = useApp()
  const navigate = useNavigate()
  const code = session?.family.code ?? ''
  const saved = useRemote(session ? `family:${code}` : null, () => api.findFamily(code))
  const [added, setAdded] = useState<ChildRecord[]>([])
  const [nickname, setNickname] = useState('')
  const [age, setAge] = useState(8)
  const [childLanguage, setChildLanguage] = useState(language)
  const [error, setError] = useState<Failure | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!session) return null

  const children = [...(saved.data?.children ?? [])]
  for (const child of added) {
    if (!children.some((known) => known.id === child.id)) children.push(child)
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await api.addChild({ familyCode: code, age, language: childLanguage, nickname })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setAdded((list) => [...list, result.data])
    setNickname('')
  }

  return (
    <main className="screen screen-wide">
      <TopBar backTo="/parent">
        <LanguageSwitcher />
      </TopBar>
      <Steps current={2} />
      <div>
        <h1 className="title">{t('familyCodeTitle')}</h1>
        <p className="lead">{t('familyCodeLead')}</p>
      </div>
      <p className="code-chip">{code}</p>
      <button
        type="button"
        className="btn btn-plain"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => setCopied(true))
        }}
      >
        {copied ? t('codeCopied') : t('copyCode')}
      </button>
      <Panel>
        <form className="auth-form" onSubmit={(event) => void add(event)}>
          <h2 className="panel-title">{t('addChildTitle')}</h2>
          <TextField
            name="nickname"
            label={t('nicknameOptional')}
            hint={t('nicknameHint')}
            value={nickname}
            maxLength={20}
            autoComplete="off"
            onChange={(event) => setNickname(event.target.value)}
          />
          <fieldset className="field">
            <legend>{t('language')}</legend>
            <div className="choices">
              {LANGUAGES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={item.code === childLanguage ? 'choice is-on' : 'choice'}
                  aria-pressed={item.code === childLanguage}
                  onClick={() => setChildLanguage(item.code)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </fieldset>
          <AgeChoices age={age} onChange={setAge} />
          {error && (
            <p className="banner banner-warn" role="alert">
              {t(accountErrorKey(error))}
            </p>
          )}
          <button type="submit" className="btn btn-sun" disabled={busy} aria-busy={busy}>
            {busy ? t('saving') : t('saveChild')}
          </button>
        </form>
        {children.length > 0 && (
          <ul className="facts">
            {children.map((child) => (
              <li key={child.id}>
                <Icon name="child" />
                {child.nickname || t('childProfile')} · {t('age')} {child.age}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="actions">
        <button type="button" className="btn btn-sun btn-block" onClick={() => navigate('/parent')}>
          {t('parentHome')}
        </button>
      </div>
    </main>
  )
}
