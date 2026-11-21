import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../../api/client'
import { isValidPin, PIN_LENGTH } from '../../api/pin'
import { AuthShell, AuthTabs, Steps, type AuthRole } from '../../components/Auth'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { ChoiceCard, Panel, SecretField, TextField } from '../../components/TextField'
import { TopBar } from '../../components/TopBar'
import { useApp } from '../../context/app-context'
import { LANGUAGES } from '../../i18n'
import { looksLikeFamilyCode, normalizeFamilyCode } from '../../lib/familyCode'
import { CHILD_AGES, type AccountError, type ChildRecord, type DataOrigin, type FamilyRecord } from '../../types/account'

function errorText(
  t: (key: 'networkError' | 'invalidCode' | 'expiredCodeDemo' | 'usedCodeDemo' | 'fieldRequired' | 'saveFailed') => string,
  error: AccountError | null,
) {
  if (error === 'network') return t('networkError')
  if (error === 'not_found') return t('invalidCode')
  if (error === 'expired_demo') return t('expiredCodeDemo')
  if (error === 'used_demo') return t('usedCodeDemo')
  if (error === 'invalid') return t('fieldRequired')
  if (error) return t('saveFailed')
  return ''
}

/** Step 1 of the account screens: pick a path. */
export function Start() {
  const { t, language, setSession } = useApp()
  const navigate = useNavigate()

  const practice = () => {
    const { family } = api.startDemoFamily(language)
    setSession({ role: 'parent', origin: 'demo', family, child: null })
    navigate('/parent')
  }

  return (
    <AuthShell backTo="/" title={t('choosePathTitle')} lead={t('choosePathLead')}>
      <ChoiceCard
        icon="family"
        badge={t('authFamilyBadge')}
        title={t('pathFamily')}
        body={t('pathFamilyLead')}
        onClick={() => navigate('/register/family')}
      />
      <ChoiceCard
        icon="child"
        tone="child"
        badge={t('authChildBadge')}
        title={t('pathChild')}
        body={t('pathChildLead')}
        onClick={() => navigate('/register/child')}
      />
      <button type="button" className="btn btn-plain btn-block" onClick={practice}>
        {t('tryDemoFamily')}
      </button>
      <p className="hint">{t('tryDemoLead')}</p>
      <p className="hint">
        <Link to="/login">{t('haveAccount')}</Link>
      </p>
    </AuthShell>
  )
}

export function FamilyRegister() {
  const { t, setSession } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [ack, setAck] = useState(false)
  const [touched, setTouched] = useState({ name: false, pin: false, ack: false })
  const [serverError, setServerError] = useState<AccountError | null>(null)
  const [busy, setBusy] = useState(false)

  const touch = (field: keyof typeof touched) => setTouched((state) => ({ ...state, [field]: true }))
  const nameError = !name.trim() ? t('fieldRequired') : undefined
  const pinError = !isValidPin(pin) ? t('pinInvalid') : undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched({ name: true, pin: true, ack: true })
    if (nameError || pinError || !ack) return
    setBusy(true)
    setServerError(null)
    const result = await api.createFamily(name, pin)
    setBusy(false)
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    setSession({
      role: 'parent',
      origin: result.origin,
      family: result.data.family,
      child: null,
    })
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
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
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
        {serverError && (
          <p className="banner banner-demo" role="alert">
            {errorText(t, serverError)}
          </p>
        )}
        <button type="submit" className="btn btn-sun btn-block" disabled={busy}>
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

export function Login() {
  const { t, setSession } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [role, setRole] = useState<AuthRole>(params.get('role') === 'child' ? 'child' : 'parent')
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AccountError | null>(null)
  const [children, setChildren] = useState<ChildRecord[] | null>(null)
  const [family, setFamily] = useState<FamilyRecord | null>(null)
  const [origin, setOrigin] = useState<DataOrigin>('server')

  const normalized = normalizeFamilyCode(code)
  const codeError = !normalized
    ? t('fieldRequired')
    : !looksLikeFamilyCode(normalized)
      ? t('codeFormat')
      : undefined

  const chooseRole = (next: AuthRole) => {
    setRole(next)
    setChildren(null)
    setFamily(null)
    setError(null)
  }

  const lookup = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (codeError) return
    setBusy(true)
    setError(null)
    const result = await api.lookupFamily(normalized)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (role === 'parent') {
      setSession({ role: 'parent', origin: result.origin, family: result.data.family, child: null })
      navigate('/parent', { replace: true })
      return
    }
    setOrigin(result.origin)
    setFamily(result.data.family)
    setChildren(result.data.children)
  }

  const pick = (child: ChildRecord) => {
    if (!family) return
    setSession({ role: 'child', origin, family, child })
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
          value={code}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onBlur={() => setTouched(true)}
          error={touched ? codeError : undefined}
        />
        {error && (
          <p className="banner banner-demo" role="alert">
            {errorText(t, error)}
          </p>
        )}
        {error === 'expired_demo' || error === 'used_demo' ? <p className="hint">{t('demoCodeNote')}</p> : null}
        <button type="submit" className="btn btn-sun btn-block" disabled={busy}>
          {busy ? t('loading') : role === 'parent' ? t('signInParent') : t('signInChild')}
        </button>
      </form>
      <Link className="hint" to="/help/code">
        {t('lostCode')}
      </Link>

      {children && family && (
        <section className="auth-profiles">
          <h2 className="panel-title">{t('pickChild')}</h2>
          {children.length === 0 ? (
            <p className="lead">{t('noChildrenYet')}</p>
          ) : (
            <ul className="mission-list">
              {children.map((child) => (
                <li key={child.id}>
                  <button type="button" className="mission-card" onClick={() => pick(child)}>
                    <span className="mission-body">
                      <strong>{child.nickname || t('childProfile')}</strong>
                      <span>
                        {t('age')} {child.age}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn-plain btn-block" to="/register/child">
            {t('pathChild')}
          </Link>
        </section>
      )}
    </AuthShell>
  )
}

/**
 * Child join flow: a family code, then an optional nickname and an age.
 * No real name, email or phone number; the language follows the switcher.
 */
export function ChildJoin() {
  const { t, language, setSession } = useApp()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [nickname, setNickname] = useState('')
  const [age, setAge] = useState(8)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AccountError | null>(null)
  const [family, setFamily] = useState<{ record: FamilyRecord; origin: DataOrigin } | null>(null)

  const normalized = normalizeFamilyCode(code)
  const codeError = !normalized
    ? t('fieldRequired')
    : !looksLikeFamilyCode(normalized)
      ? t('codeFormat')
      : undefined

  const lookup = async (event: FormEvent) => {
    event.preventDefault()
    setCodeTouched(true)
    if (codeError) return
    setBusy(true)
    setError(null)
    const result = await api.lookupFamily(normalized)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      setFamily(null)
      return
    }
    setFamily({ record: result.data.family, origin: result.origin })
  }

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (!family) return
    setBusy(true)
    setError(null)
    const result = await api.addChild({
      familyCode: family.record.code,
      age,
      language,
      nickname,
      origin: family.origin,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSession({ role: 'child', origin: result.origin, family: family.record, child: result.data })
    navigate('/missions', { replace: true })
  }

  return (
    <AuthShell
      backTo="/"
      badge={t('authChildBadge')}
      title={t('joinTitle')}
      lead={t('pathChildLead')}
      tabs={<AuthTabs role="child" active="register" />}
    >
      {!family ? (
        <form className="auth-form" noValidate onSubmit={(event) => void lookup(event)}>
          <TextField
            name="familyCode"
            label={t('familyCode')}
            hint={t('codeFormat')}
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onBlur={() => setCodeTouched(true)}
            error={codeTouched ? codeError : undefined}
          />
          {error && (
            <p className="banner banner-demo" role="alert">
              {errorText(t, error)}
            </p>
          )}
          {(error === 'expired_demo' || error === 'used_demo') && <p className="hint">{t('demoCodeNote')}</p>}
          <button type="submit" className="btn btn-sun btn-block" disabled={busy}>
            {busy ? t('loading') : t('joinFamily')}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={(event) => void create(event)}>
          {family.origin === 'demo' && <p className="banner banner-demo">{t('demoBanner')}</p>}
          <div className="join-family">
            <span>{t('joinWelcome')}</span>
            <strong>{family.record.name}</strong>
            <button type="button" className="text-link" onClick={() => setFamily(null)}>
              {t('changeCode')}
            </button>
          </div>
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
            <legend>{t('age')}</legend>
            <div className="choices choices-grid">
              {CHILD_AGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === age ? 'choice is-on' : 'choice'}
                  aria-pressed={value === age}
                  onClick={() => setAge(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="hint">{t('ageNote13')}</p>
          </fieldset>
          {error && (
            <p className="banner banner-demo" role="alert">
              {errorText(t, error)}
            </p>
          )}
          <button type="submit" className="btn btn-sun btn-block" disabled={busy}>
            {busy ? t('saving') : t('saveChild')}
          </button>
        </form>
      )}
      <p className="hint">
        <Link to="/login?role=child">{t('haveProfile')}</Link>
      </p>
    </AuthShell>
  )
}

export function FamilySetup() {
  const { t, session, language, setLanguage } = useApp()
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [age, setAge] = useState(8)
  const [children, setChildren] = useState<ChildRecord[]>([])
  const [error, setError] = useState<AccountError | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!session || session.role !== 'parent') return <Navigate to="/login" replace />

  const add = async () => {
    setBusy(true)
    setError(null)
    const result = await api.addChild({
      familyCode: session.family.code,
      age,
      language,
      nickname,
      origin: session.origin,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setChildren((list) => [...list, result.data])
    setNickname('')
  }

  return (
    <main className="screen screen-wide">
      <TopBar backTo="/parent">
        <LanguageSwitcher />
      </TopBar>
      <Steps current={2} />
      {session.origin === 'demo' && <p className="banner banner-demo">{t('demoBanner')}</p>}
      <div>
        <h1 className="title">{t('familyCodeTitle')}</h1>
        <p className="lead">{t('familyCodeLead')}</p>
      </div>
      <p className="code-chip">{session.family.code}</p>
      <button
        type="button"
        className="btn btn-plain"
        onClick={() => {
          void navigator.clipboard?.writeText(session.family.code).then(() => setCopied(true))
        }}
      >
        {copied ? t('codeCopied') : t('copyCode')}
      </button>
      <Panel>
        <h2 className="panel-title">{t('addChildTitle')}</h2>
        <TextField
          name="nickname"
          label={t('nicknameOptional')}
          hint={t('nicknameHint')}
          value={nickname}
          maxLength={20}
          onChange={(event) => setNickname(event.target.value)}
        />
        <fieldset className="field">
          <legend>{t('language')}</legend>
          <div className="choices">
            {LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                className={item.code === language ? 'choice is-on' : 'choice'}
                aria-pressed={item.code === language}
                onClick={() => setLanguage(item.code)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>{t('age')}</legend>
          <div className="choices choices-grid">
            {CHILD_AGES.map((value) => (
              <button
                key={value}
                type="button"
                className={value === age ? 'choice is-on' : 'choice'}
                aria-pressed={value === age}
                onClick={() => setAge(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p className="banner banner-demo">{errorText(t, error)}</p>}
        <button type="button" className="btn btn-sun" disabled={busy} onClick={() => void add()}>
          {busy ? t('saving') : t('saveChild')}
        </button>
        {children.length > 0 && (
          <ul className="facts">
            {children.map((child) => (
              <li key={child.id}>
                {child.nickname || t('childProfile')} · {t('age')} {child.age}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="actions">
        <button type="button" className="btn btn-plain btn-block" onClick={() => navigate('/parent')}>
          {t('parentHome')}
        </button>
      </div>
    </main>
  )
}
