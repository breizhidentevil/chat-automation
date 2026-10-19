import React from 'react';
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
      <div className="history-toolbar"><span className="history-origin">{historyConversationId || t('noConversation')}</span><div className="history-actions"><button className="secondary" onClick={() => void refreshHistory()}>{t('refresh')}</button><button className="secondary danger-action" disabled={!historyOrigin} onClick={() => void clearSiteHistory()}>{t('clearSiteHistory')}</button></div></div>
      {historyError ? <p className="notice">{historyError}</p> : historyMessages.length === 0 ? <p className="empty history-empty">{t('noCapturedMessages')}</p> : <div className="history-list">{historyMessages.map(item => <article className={`history-message role-${item.role} status-${item.status}`} key={item.id}>
        <div className="history-message-head"><strong>{item.role === 'user' ? t('you') : item.role === 'assistant' ? 'Assistant' : item.role === 'system' ? t('system') : t('unknownAuthor')}</strong><span>{new Date(item.firstSeenAt).toLocaleString()}</span><em>{item.status === 'streaming' ? t('inProgress') : item.status === 'incomplete' ? t('interrupted') : t('completed')}</em></div>
        <p>{item.content}</p>{item.contentTruncated ? <small className="history-truncated">{t('truncated')}</small> : null}
      </article>)}</div>}
      <p className="notice">{t('historyNotice')}</p>
    
  </>;
}
