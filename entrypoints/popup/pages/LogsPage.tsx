import React from 'react';
import type { DiagnosticEvent } from '../../../lib/contracts';
import { translate } from '../../../lib/i18n';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface LogsPageProps {
  t: Translate;
  logs: DiagnosticEvent[];
  refreshLogs: () => void;
  clearLogs: () => void;
  exportLogs: () => void;
}

export default function LogsPage({ t, logs, refreshLogs, clearLogs, exportLogs }: LogsPageProps) {
  return <>

      <div className="page-heading"><h2>{t('eventLog')}</h2><p>{t('logIntro')}</p></div>
      <section className="logs-section logs-page-section">
        <div className="section-head"><h2>{t('recentEvents')}</h2><div className="logs-actions"><button className="secondary" onClick={() => void refreshLogs()}>{t('refresh')}</button><button className="secondary danger-action" onClick={() => void clearLogs()}>{t('clearLogs')}</button></div></div>
        <div className="logs">{logs.length === 0 ? <p className="empty">{t('noEvents')}</p> : logs.map((log, index) => <article key={`${log.timestamp}-${index}`}><strong>{log.level}</strong><span>{new Date(log.timestamp).toLocaleString()} · {log.site}</span><p>{log.event}{log.details ? ` — ${log.details}` : ''}</p></article>)}</div>
      </section>
      <p className="notice">{t('logNotice')}</p>
    
  </>;
}
