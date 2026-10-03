import { useMemo, useState } from 'react';
import type { Claim, PrescriptionView, SourceRef } from '@pran-rekha/contracts';
import {
  createSession,
  deleteSession,
  getDocumentPreview,
  getPrescriptions,
  getTimeline,
  type DocumentPreview,
  type Prescriptions,
  type Session,
  type Timeline
} from './api';

type Language = 'en' | 'ne';

const copy = {
  en: {
    records: 'Health records', medicines: 'Medicines', source: 'Source', date: 'Date',
    signIn: 'Open synthetic workspace', signOut: 'Sign out', loading: 'Loading record…',
    evidence: 'Recorded claim', active: 'Documented active prescription', demo: 'Synthetic fixture',
    review: 'Native-language copy is a draft pending review.', sourceLink: 'Inspect exact source',
    sourceClose: 'Close source', prescribed: 'Prescription status', limitations: 'Demonstration boundary',
    limitationText: 'This view presents attributed synthetic records. It does not diagnose, recommend treatment, or establish current medication use.'
  },
  ne: {
    records: 'स्वास्थ्य अभिलेख', medicines: 'औषधि', source: 'स्रोत', date: 'मिति',
    signIn: 'कृत्रिम कार्यस्थान खोल्नुहोस्', signOut: 'साइन आउट', loading: 'अभिलेख लोड हुँदैछ…',
    evidence: 'अभिलेख गरिएको दाबी', active: 'अभिलेखमा सक्रिय औषधि', demo: 'कृत्रिम नमुना',
    review: 'नेपाली पाठको समीक्षा बाँकी छ।', sourceLink: 'ठ्याक्कै स्रोत हेर्नुहोस्',
    sourceClose: 'स्रोत बन्द गर्नुहोस्', prescribed: 'प्रिस्क्रिप्शन स्थिति', limitations: 'प्रदर्शनको सीमा',
    limitationText: 'यो दृश्यले स्रोतसहितका कृत्रिम अभिलेख मात्र देखाउँछ। यसले निदान वा उपचार सिफारिस गर्दैन।'
  }
} as const;

const DEMO_AS_OF = '2026-10-03T04:30:00.000Z';

function claimDisplay(claim: Claim): string {
  switch (claim.value.kind) {
    case 'allergy': return `${claim.value.substanceText}${claim.value.reactionText ? ` — ${claim.value.reactionText}` : ''}`;
    case 'lab_result': return `${claim.value.testText}: ${claim.value.valueText}${claim.value.unitText ? ` ${claim.value.unitText}` : ''}`;
    case 'contact': return `${claim.value.name} — ${claim.value.relationshipText}`;
    default: return claim.value.text;
  }
}

function firstTextSource(claim: Claim): Extract<SourceRef, { kind: 'text' }> | undefined {
  return claim.sourceRefs.find((source): source is Extract<SourceRef, { kind: 'text' }> => source.kind === 'text');
}

function Login({ language, onLogin, busy, error }: {
  language: Language;
  onLogin: (username: string, password: string) => Promise<void>;
  busy: boolean;
  error: string | null;
}) {
  const [username, setUsername] = useState('maya.patient');
  const [password, setPassword] = useState('pran-demo-patient');
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="eyebrow">G0 · {copy[language].demo}</div>
        <h1 id="login-title">Pran Rekha</h1>
        <p className="lede">A source-linked patient record prototype built with fictional health data.</p>
        <form onSubmit={(event) => { event.preventDefault(); void onLogin(username, password); }}>
          <label>Demo username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label>Demo password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? copy[language].loading : copy[language].signIn}</button>
        </form>
        <p className="review-note">{copy[language].review}</p>
      </section>
    </main>
  );
}

function MedicationCard({ prescription, language }: { prescription: PrescriptionView; language: Language }) {
  return (
    <article className="med-card">
      <div className="card-topline"><span className="status-dot" aria-hidden="true" /><span>{copy[language].active}</span></div>
      <h3>{prescription.drug.rawText}</h3>
      <div className="med-grid">
        <div><span>Dose as written</span><strong>{prescription.doseText}</strong></div>
        <div><span>Frequency as written</span><strong>{prescription.frequencyText}</strong></div>
      </div>
      <p className="basis">{prescription.basis}</p>
      <p className="caution">Documented prescription status does not establish current use.</p>
    </article>
  );
}

function SourceDrawer({ preview, reference, language, onClose }: {
  preview: DocumentPreview;
  reference: Extract<SourceRef, { kind: 'text' }>;
  language: Language;
  onClose: () => void;
}) {
  const { content } = preview.document;
  return (
    <aside className="source-drawer" aria-label="Source evidence">
      <div className="drawer-header">
        <div><span className="eyebrow">{copy[language].source} · v{preview.document.version}</span><h2>{preview.document.title}</h2></div>
        <button className="ghost" onClick={onClose}>{copy[language].sourceClose}</button>
      </div>
      <pre>{content.slice(0, reference.start)}<mark>{content.slice(reference.start, reference.end)}</mark>{content.slice(reference.end)}</pre>
      <dl className="source-meta">
        <div><dt>SHA-256</dt><dd>{preview.document.sha256}</dd></div>
        <div><dt>Text span</dt><dd>{reference.start}–{reference.end}</dd></div>
      </dl>
    </aside>
  );
}

export function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [session, setSession] = useState<Session | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescriptions | null>(null);
  const [source, setSource] = useState<{ preview: DocumentPreview; reference: Extract<SourceRef, { kind: 'text' }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = copy[language];

  const claim = timeline?.claims[0];
  const reference = useMemo(() => claim ? firstTextSource(claim) : undefined, [claim]);

  async function login(username: string, password: string) {
    setBusy(true); setError(null);
    try {
      const newSession = await createSession(username, password);
      const patientId = newSession.patientIds[0];
      setSession(newSession);
      if (patientId) {
        const [nextTimeline, nextPrescriptions] = await Promise.all([
          getTimeline(patientId), getPrescriptions(patientId, DEMO_AS_OF)
        ]);
        setTimeline(nextTimeline); setPrescriptions(nextPrescriptions);
      }
    } catch (caught) {
      setSession(null);
      setError(caught instanceof Error ? caught.message : 'Unable to open the workspace.');
    } finally { setBusy(false); }
  }

  async function logout() {
    await deleteSession();
    setSession(null); setTimeline(null); setPrescriptions(null); setSource(null);
  }

  async function openSource() {
    if (!reference) return;
    try { setSource({ preview: await getDocumentPreview(reference.sourceId), reference }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Source unavailable.'); }
  }

  if (!session) {
    return <><LanguageControl language={language} setLanguage={setLanguage} /><Login language={language} onLogin={login} busy={busy} error={error} /></>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><span className="brand-mark">PR</span><span className="brand-name">Pran Rekha</span><span className="demo-chip">{text.demo}</span></div>
        <div className="header-actions"><LanguageControl language={language} setLanguage={setLanguage} inline /><button className="ghost" onClick={() => void logout()}>{text.signOut}</button></div>
      </header>
      <main className="dashboard">
        <section className="patient-banner">
          <div><span className="eyebrow">Patient workspace · source-linked</span><h1>{timeline?.patient.displayName ?? text.loading}</h1><p>{timeline?.patient.alternateName}</p></div>
          <div className="identity-badge"><span>Patient ID</span><strong>{timeline?.patient.id}</strong></div>
        </section>

        <section className="grid">
          <div className="main-column">
            <section className="panel">
              <div className="section-heading"><div><span className="section-number">01</span><h2>{text.records}</h2></div><span className="count">{timeline?.claims.length ?? 0} item</span></div>
              {claim && <article className="claim-card">
                <div className="claim-icon" aria-hidden="true">A</div>
                <div className="claim-body"><span className="eyebrow">Allergy · {timeline.evidenceLabels[claim.id] ?? text.evidence}</span><h3>{claimDisplay(claim)}</h3>
                  <div className="metadata"><span>{text.date}: {claim.clinicalDate.rawText}</span><span>Issuer as stated: {claim.origin.statedOrganisation}</span><span>Manual confirmation</span></div>
                  {reference && <button className="source-link" onClick={() => void openSource()}>{text.sourceLink} <span aria-hidden="true">↗</span></button>}
                </div>
              </article>}
            </section>

            <section className="panel">
              <div className="section-heading"><div><span className="section-number">02</span><h2>{text.medicines}</h2></div><span className="count">As of 3 Oct 2026</span></div>
              {prescriptions?.prescriptions.map((prescription) => <MedicationCard key={prescription.recordId} prescription={prescription} language={language} />)}
            </section>
          </div>

          <aside className="side-column">
            <section className="boundary-card"><span className="eyebrow">{text.limitations}</span><h2>Evidence, not advice.</h2><p>{text.limitationText}</p></section>
            <section className="facts-card"><h3>G0 proof</h3><ul><li>Exact source span</li><li>Immutable prescription evidence</li><li>Server-owned patient access</li><li>Similar-name record isolation</li></ul></section>
            <p className="review-note">{text.review}</p>
          </aside>
        </section>
      </main>
      {source && <SourceDrawer preview={source.preview} reference={source.reference} language={language} onClose={() => setSource(null)} />}
    </div>
  );
}

function LanguageControl({ language, setLanguage, inline = false }: { language: Language; setLanguage: (value: Language) => void; inline?: boolean }) {
  return <div className={inline ? 'language-control inline' : 'language-control'} aria-label="Language">
    <button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
    <button aria-pressed={language === 'ne'} onClick={() => setLanguage('ne')}>ने</button>
  </div>;
}

