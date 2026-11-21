import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import * as api from '../../api/client'
import { ChoiceCard, Panel, TextField } from '../../components/TextField'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { TopBar } from '../../components/TopBar'
import { useApp } from '../../context/app-context'
import { LANGUAGES } from '../../i18n'
import { CHILD_AGES, type AccountError, type ChildRecord, type DataOrigin, type FamilyRecord } from '../../types/account'
import type { AppLanguage } from '../../types/mission'

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

export function Start() {
  const { t, session } = useApp()
  const navigate = useNavigate()
  if (session?.role === 'child' && session.child) return <Navigate to="/missions" replace />
  if (session?.role === 'parent') return <Navigate to="/parent" replace />

  return (
    <main className="screen">
      <TopBar backTo="/">
        <LanguageSwitcher />
      </TopBar>
      <div>
        <h1 className="title">{t('choosePathTitle')}</h1>
        <p className="lead">{t('choosePathLead')}</p>
      </div>
      <ChoiceCard title={t('pathFamily')} body={t('pathFamilyLead')} onClick={() => navigate('/register/family')} />
      <ChoiceCard title={t('pathChild')} body={t('pathChildLead')} onClick={() => navigate('/register/child')} />
      <p className="hint">
        <Link to="/login">{t('haveAccount')}</Link>
      </p>
    </main>
  )
}

export function FamilyRegister() {
  const { t, setSession } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [ack, setAck] = useState(false)
  const [error, setError] = useState<AccountError | 'ack' | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      setError('invalid')
      return
    }
    if (!ack) {
      setError('ack')
      return
    }
    setBusy(true)
    setError(null)
    const result = await api.createFamily(name)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
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
    <main className="screen">
      <TopBar backTo="/start">
        <LanguageSwitcher />
      </TopBar>
      <div>
        <h1 className="title">{t('registerFamilyTitle')}</h1>
        <p className="lead">{t('noPasswordBody')}</p>
      </div>
      <TextField
        name="familyName"
        label={t('familyName')}
        hint={t('familyNameHint')}
        value={name}
        maxLength={40}
        autoComplete="organization"
        onChange={(event) => setName(event.target.value)}
        error={error === 'invalid' ? t('fieldRequired') : undefined}
      />
      <label className="check">
        <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
        <span>{t('privacyAgree')}</span>
      </label>
      {error === 'ack' && <p className="field-error">{t('ackRequired')}</p>}
      {error && error !== 'invalid' && error !== 'ack' && <p className="banner banner-demo">{errorText(t, error)}</p>}
      <div className="actions">
        <button type="button" className="btn btn-sun btn-block" disabled={busy} onClick={() => void submit()}>
          {busy ? t('creating') : t('createFamily')}
        </button>
      </div>
    </main>
  )
}

export function CodeHelp() {
  const { t } = useApp()
  return (
    <main className="screen">
      <TopBar backTo="/login" />
      <h1 className="title">{t('noPasswordTitle')}</h1>
      <p className="lead">{t('lostCodeBody')}</p>
      <div className="actions">
        <Link className="btn btn-sun btn-block" to="/login">
          {t('signIn')}
        </Link>
      </div>
    </main>
  )
}

function useCodeForm() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AccountError | null>(null)
  return { code, setCode, busy, setBusy, error, setError }
}

export function Login() {
  const { t, setSession } = useApp()
  const navigate = useNavigate()
  const [role, setRole] = useState<'parent' | 'child'>('parent')
  const form = useCodeForm()
  const [children, setChildren] = useState<ChildRecord[] | null>(null)
  const [family, setFamily] = useState<FamilyRecord | null>(null)
  const [origin, setOrigin] = useState<DataOrigin>('server')

  const lookup = async () => {
    form.setBusy(true)
    form.setError(null)
    const result = await api.lookupFamily(form.code)
    form.setBusy(false)
    if (!result.ok) {
      form.setError(result.error)
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
    <main className="screen">
      <TopBar backTo="/">
        <LanguageSwitcher />
      </TopBar>
      <div>
        <h1 className="title">{t('loginTitle')}</h1>
        <p className="lead">{t('loginLead')}</p>
      </div>
      <div className="choices">
        <button type="button" className={role === 'parent' ? 'choice is-on' : 'choice'} onClick={() => setRole('parent')}>
          {t('roleParent')}
        </button>
        <button type="button" className={role === 'child' ? 'choice is-on' : 'choice'} onClick={() => setRole('child')}>
          {t('roleChild')}
        </button>
      </div>
      <TextField
        name="familyCode"
        label={t('familyCode')}
        hint={t('familyCodeHint')}
        value={form.code}
        autoCapitalize="characters"
        autoComplete="off"
        onChange={(event) => form.setCode(event.target.value)}
      />
      {form.error && <p className="banner banner-demo">{errorText(t, form.error)}</p>}
      {form.error === 'expired_demo' || form.error === 'used_demo' ? (
        <p className="hint">{t('demoCodeNote')}</p>
      ) : null}
      <button type="button" className="btn btn-sun btn-block" disabled={form.busy} onClick={() => void lookup()}>
        {form.busy ? t('loading') : role === 'parent' ? t('signInParent') : t('signInChild')}
      </button>
      <Link className="hint" to="/help/code">
        {t('lostCode')}
      </Link>

      {children && family && (
        <Panel>
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
        </Panel>
      )}
    </main>
  )
}

export function ChildJoin() {
  const { t, language, setLanguage, setSession } = useApp()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [age, setAge] = useState(8)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AccountError | null>(null)
  const [family, setFamily] = useState<{ record: FamilyRecord; origin: DataOrigin } | null>(null)

  const lookup = async () => {
    setBusy(true)
    setError(null)
    const result = await api.lookupFamily(code)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      setFamily(null)
      return
    }
    setFamily({ record: result.data.family, origin: result.origin })
  }

  const create = async () => {
    if (!family) return
    setBusy(true)
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
    <main className="screen">
      <TopBar backTo="/start">
        <LanguageSwitcher />
      </TopBar>
      <div>
        <h1 className="title">{t('joinTitle')}</h1>
        <p className="lead">{t('pathChildLead')}</p>
      </div>
      <TextField
        name="familyCode"
        label={t('familyCode')}
        value={code}
        autoCapitalize="characters"
        onChange={(event) => setCode(event.target.value)}
      />
      {error && <p className="banner banner-demo">{errorText(t, error)}</p>}
      {(error === 'expired_demo' || error === 'used_demo') && <p className="hint">{t('demoCodeNote')}</p>}
      {!family ? (
        <button type="button" className="btn btn-sun btn-block" disabled={busy} onClick={() => void lookup()}>
          {busy ? t('loading') : t('joinFamily')}
        </button>
      ) : (
        <>
          {family.origin === 'demo' && <p className="banner banner-demo">{t('demoBanner')}</p>}
          <p className="lead">{family.record.name}</p>
          <TextField
            name="nickname"
            label={t('nickname')}
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
                  onClick={() => setLanguage(item.code as AppLanguage)}
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
                  onClick={() => setAge(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="hint">{t('ageNote13')}</p>
          </fieldset>
          <button type="button" className="btn btn-sun btn-block" disabled={busy} onClick={() => void create()}>
            {busy ? t('saving') : t('saveChild')}
          </button>
        </>
      )}
    </main>
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
          label={t('nickname')}
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
