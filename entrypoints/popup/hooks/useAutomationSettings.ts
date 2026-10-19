import { useEffect, useRef, useState } from 'react';
import type { SavedAutomationSettings } from '../../../lib/automation-validation';
import { loadAutomationSettings, saveAutomationSettings } from '../../../services/automation-settings';
import { translate } from '../../../lib/i18n';

type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;
type SettingsErrorHandler = () => void;

export function useAutomationSettings(
  onReadError: SettingsErrorHandler,
  onSaveError: SettingsErrorHandler,
  t: Translate,
) {
  const [message, setMessage] = useState('');
  const [automationMessages, setAutomationMessages] = useState<string[]>(['']);
  const [interval, setIntervalValue] = useState('30');
  const [unit, setUnit] = useState<'seconds' | 'minutes'>('seconds');
  const [repeatCount, setRepeatCount] = useState('0');
  const [timeWindowEnabled, setTimeWindowEnabled] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const readErrorRef = useRef(onReadError);
  const saveErrorRef = useRef(onSaveError);

  useEffect(() => { readErrorRef.current = onReadError; }, [onReadError]);
  useEffect(() => { saveErrorRef.current = onSaveError; }, [onSaveError]);

  useEffect(() => {
    let mounted = true;
    void loadAutomationSettings(key => browser.storage.local.get(key))
      .then(saved => {
        if (!mounted || !saved) return;
        setMessage(saved.message);
        setAutomationMessages(saved.messages);
        setIntervalValue(saved.interval);
        setUnit(saved.unit);
        setRepeatCount(saved.repeatCount);
        setTimeWindowEnabled(saved.timeWindowEnabled);
        setStartTime(saved.startTime);
        setEndTime(saved.endTime);
      })
      .catch(() => {
        if (mounted) readErrorRef.current();
      });
    return () => { mounted = false; };
  }, []);

  async function persistSettings(): Promise<boolean> {
    try {
      const settings: Omit<SavedAutomationSettings, 'repeatMode'> = {
        message, messages: automationMessages, interval, unit, repeatCount,
        timeWindowEnabled, startTime, endTime,
      };
      await saveAutomationSettings(items => browser.storage.local.set(items), settings);
      return true;
    } catch (error) {
      console.error('[Chat Automation] Écriture des paramètres échouée.', error);
      saveErrorRef.current();
      return false;
    }
  }

  return {
    message, setMessage, automationMessages, setAutomationMessages,
    interval, setIntervalValue, unit, setUnit, repeatCount, setRepeatCount,
    timeWindowEnabled, setTimeWindowEnabled, startTime, setStartTime,
    endTime, setEndTime, persistSettings,
  };
}
