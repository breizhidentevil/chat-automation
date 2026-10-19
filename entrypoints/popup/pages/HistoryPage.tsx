import React from 'react';
import { Alert, Badge, Button, Paper } from '@mantine/core';
import type { ConversationMessage } from '../../../lib/history';
import { translate } from '../../../lib/i18n';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;

interface HistoryPageProps {
  t: Translate;
  historyConversationId: string;
  historyOrigin: string;
  historyError: string;
  historyMessages: ConversationMessage[];
  refreshHistory: () => void;
  clearSiteHistory: () => void;
}

export default function HistoryPage({
  t, historyConversationId, historyOrigin, historyError, historyMessages,
  refreshHistory, clearSiteHistory,
}: HistoryPageProps) {
  return <>

      <div className="page-heading"><h2>{t('conversationHistory')}</h2><p>{t('historyIntro')}</p></div>
      <div className="history-toolbar"><span className="history-origin">{historyConversationId || t('noConversation')}</span><div className="history-actions"><Button variant="default" size="compact-sm" onClick={() => void refreshHistory()}>{t('refresh')}</Button><Button color="red" variant="light" size="compact-sm" disabled={!historyOrigin} onClick={() => void clearSiteHistory()}>{t('clearSiteHistory')}</Button></div></div>
      {historyError ? <Alert color="red" variant="light">{historyError}</Alert> : historyMessages.length === 0 ? <p className="empty history-empty">{t('noCapturedMessages')}</p> : <div className="history-list">{historyMessages.map(item => <Paper component="article" withBorder padding="sm" className={`history-message role-${item.role} status-${item.status}`} key={item.id}>
        <div className="history-message-head"><strong>{item.role === 'user' ? t('you') : item.role === 'assistant' ? 'Assistant' : item.role === 'system' ? t('system') : t('unknownAuthor')}</strong><span>{new Date(item.firstSeenAt).toLocaleString()}</span><Badge size="xs" variant="light" color={item.status === 'streaming' ? 'yellow' : item.status === 'incomplete' ? 'red' : 'green'}>{item.status === 'streaming' ? t('inProgress') : item.status === 'incomplete' ? t('interrupted') : t('completed')}</Badge></div>
        <p>{item.content}</p>{item.contentTruncated ? <small className="history-truncated">{t('truncated')}</small> : null}
      </Paper>)}</div>}
      <Alert variant="light" color="gray">{t('historyNotice')}</Alert>
    
  </>;
}
