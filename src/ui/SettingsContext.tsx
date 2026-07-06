import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  DEFAULT_DEVICE_PREFS,
  DevicePrefs,
  getDevicePrefs,
  getSettings,
  saveDevicePrefs,
  saveSettings,
} from '../api/settings';

interface SettingsContextValue {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  prefs: DevicePrefs;
  updatePrefs: (patch: Partial<DevicePrefs>) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_APP_SETTINGS,
  update: () => {},
  prefs: DEFAULT_DEVICE_PREFS,
  updatePrefs: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [prefs, setPrefs] = useState<DevicePrefs>(DEFAULT_DEVICE_PREFS);

  useEffect(() => {
    void getSettings().then(setSettings);
    void getDevicePrefs().then(setPrefs);
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  const updatePrefs = useCallback((patch: Partial<DevicePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void saveDevicePrefs(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update, prefs, updatePrefs }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
