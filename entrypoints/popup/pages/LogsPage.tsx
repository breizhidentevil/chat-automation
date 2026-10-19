import React from 'react';
import { Badge, Button, Paper } from '@mantine/core';
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

      <div className="page-heading"><h2>{t('eventLog')}</h2></div>
      <section className="logs-section logs-page-section">
        <div className="section-head"><h2>{t('recentEvents')}</h2><div className="logs-actions"><Button variant="default" size="compact-sm" onClick={() => void refreshLogs()}>{t('refresh')}</Button><Button color="red" variant="light" size="compact-sm" onClick={() => void clearLogs()}>{t('clearLogs')}</Button></div></div>
        <div className="logs">{logs.length === 0 ? <p className="empty">{t('noEvents')}</p> : logs.map((log, index) => <Paper component="article" key={`${log.timestamp}-${index}`} p="xs" withBorder><Badge size="xs" variant="light" color={log.level === 'ERROR' ? 'red' : log.level === 'WARN' ? 'yellow' : 'gray'}>{log.level}</Badge><span>{new Date(log.timestamp).toLocaleString()} · {log.site}</span><p>{log.event}{log.details ? ` — ${log.details}` : ''}</p></Paper>)}</div>
      </section>

    
  </>;
}
